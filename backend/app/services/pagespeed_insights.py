"""
Google PageSpeed Insights API v5 — remote Lighthouse in Google's cloud.

Docs: https://developers.google.com/speed/docs/insights/v5/get-started
Requires: GOOGLE_PAGESPEED_API_KEY + PageSpeed Insights API enabled for the key's GCP project.
"""
from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

PAGESPEED_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"


def _strategy_for_platform(platform: str) -> str:
    """PageSpeed `strategy`: mobile vs desktop lab run (one request per scan)."""
    p = (platform or "both").lower().strip()
    # OTT / "both" → mobile lab (typical user); explicit desktop → desktop lab.
    if p in ("mweb", "mobile", "both"):
        return "mobile"
    return "desktop"


def _audit(audits: dict[str, Any], key: str) -> dict[str, Any]:
    a = audits.get(key)
    return a if isinstance(a, dict) else {}


def _audit_score(audit: dict[str, Any]) -> float | None:
    s = audit.get("score")
    if s is None:
        return None
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def _category_scores(lighthouse: dict[str, Any]) -> dict[str, int]:
    """Lighthouse category scores 0–100 (same keys the frontend Performance page expects)."""
    cats = lighthouse.get("categories") or {}

    def cat(api_key: str) -> int:
        c = cats.get(api_key)
        if not isinstance(c, dict):
            return 0
        s = c.get("score")
        if s is None:
            return 0
        try:
            return int(round(float(s) * 100))
        except (TypeError, ValueError):
            return 0

    return {
        "performance": cat("performance"),
        "accessibility": cat("accessibility"),
        "best_practices": cat("best-practices"),
        "seo": cat("seo"),
        "pwa": cat("pwa"),
    }


# Display targets aligned with PerformanceAgent / CrUX-style good thresholds
_CWV_TARGETS: dict[str, float] = {
    "lcp": 2500,
    "fcp": 1800,
    "cls": 0.1,
    "tbt": 200,
    "fid": 100,
    "ttfb": 800,
    "inp": 200,
    "si": 3400,
}


def _audits_to_core_web_vitals(audits: dict[str, Any]) -> dict[str, Any]:
    """Map key Lighthouse audits to the app's core_web_vitals shape (lowercase keys + target)."""
    mapping = [
        ("largest-contentful-paint", "lcp", "ms"),
        ("first-contentful-paint", "fcp", "ms"),
        ("cumulative-layout-shift", "cls", ""),
        ("total-blocking-time", "tbt", "ms"),
        ("max-potential-fid", "fid", "ms"),
        ("server-response-time", "ttfb", "ms"),
        ("interaction-to-next-paint", "inp", "ms"),
        ("speed-index", "si", "ms"),
    ]
    out: dict[str, Any] = {}

    for audit_id, short_key, unit in mapping:
        a = _audit(audits, audit_id)
        nv = a.get("numericValue")
        score = _audit_score(a)
        if nv is None and score is None:
            continue
        try:
            val = float(nv) if nv is not None else 0.0
        except (TypeError, ValueError):
            val = 0.0
        status = "good"
        if score is not None:
            if score < 0.5:
                status = "poor"
            elif score < 0.9:
                status = "needs-improvement"
        disp = a.get("displayValue") or ""
        tgt = _CWV_TARGETS.get(short_key, 0)
        out[short_key] = {
            "value": round(val, 3 if unit == "" else 1),
            "unit": unit,
            "target": tgt,
            "status": status,
            "displayValue": disp,
        }
    return out


def _total_weight_kb(audits: dict[str, Any]) -> tuple[int, dict[str, float]]:
    """Total transfer size from Lighthouse 'total-byte-weight' audit if present."""
    a = _audit(audits, "total-byte-weight")
    details = a.get("details") or {}
    items = details.get("items") or []
    by_type: dict[str, float] = {}
    total = 0
    for it in items:
        if not isinstance(it, dict):
            continue
        kb = float(it.get("transferSize") or 0)
        total += int(kb)
        label = str(it.get("resourceType") or "Other")
        by_type[label] = by_type.get(label, 0) + kb / 1024.0
    return total, {k: round(v, 1) for k, v in by_type.items()}


def build_performance_result_from_pagespeed(
    psi_json: dict[str, Any],
    url: str,
    platform: str,
) -> dict[str, Any] | None:
    """Turn PageSpeed API JSON into the same shape as PerformanceAgent._result_dict."""
    lr = psi_json.get("lighthouseResult")
    if not isinstance(lr, dict):
        return None

    audits = lr.get("audits") or {}
    if not isinstance(audits, dict):
        audits = {}

    lh_scores = _category_scores(lr)
    perf = lh_scores.get("performance", 0)

    cwv = _audits_to_core_web_vitals(audits)
    total_bytes, breakdown_kb = _total_weight_kb(audits)

    findings: list[dict[str, Any]] = []
    if perf < 50:
        findings.append({
            "severity": "HIGH",
            "title": "Low Lighthouse performance score",
            "description": f"Google PageSpeed Insights (Lighthouse) performance category is {perf}/100 for {url}.",
            "category": "performance",
            "remediation": "Open PageSpeed Insights or Chrome DevTools Lighthouse for full audit details.",
        })

    # Opportunities (top-level)
    for opp_id in ("render-blocking-resources", "unused-javascript", "uses-long-cache-ttl"):
        o = _audit(audits, opp_id)
        sc = _audit_score(o)
        if sc is not None and sc < 0.9:
            title = o.get("title") or opp_id
            findings.append({
                "severity": "MEDIUM",
                "title": title,
                "description": (o.get("description") or "")[:500],
                "category": "performance",
                "remediation": "Review this audit in Google PageSpeed Insights or Chrome Lighthouse.",
            })

    def kb_sum(*needles: str) -> float:
        t = 0.0
        nl = {n.lower() for n in needles}
        for k, v in breakdown_kb.items():
            if str(k).lower() in nl:
                t += float(v)
        return t

    js_kb = kb_sum("script")
    css_kb = kb_sum("stylesheet")
    img_kb = kb_sum("image", "media")
    font_kb = kb_sum("font")
    js_b = int(js_kb * 1024)
    css_b = int(css_kb * 1024)
    img_b = int(img_kb * 1024)
    font_b = int(font_kb * 1024)
    other_b = max(0, total_bytes - js_b - css_b - img_b - font_b)

    resource_summary = {
        "total_weight": total_bytes,
        "js": js_b,
        "css": css_b,
        "images": img_b,
        "fonts": font_b,
        "other": other_b,
    }

    lh_version = lr.get("lighthouseVersion") or ""
    fetch_time = psi_json.get("analysisUTCTimestamp")

    return {
        "score": float(perf),
        "lighthouse": lh_scores,
        "lighthouse_scores": lh_scores,
        "core_web_vitals": cwv,
        "findings": findings,
        "resource_summary": resource_summary,
        "cdn_analysis": {
            "total_page_weight": total_bytes,
            "total_page_weight_kb": round(total_bytes / 1024, 1) if total_bytes else 0,
            "breakdown": breakdown_kb,
        },
        "ttfb_ms": float(cwv.get("ttfb", {}).get("value") or 0),
        "render_blocking_resources": 0,
        "resource_count": 0,
        "platform": platform,
        "measurement_source": "pagespeed_insights",
        "lighthouse_version": lh_version,
        "pagespeed_analysis_time": fetch_time,
    }


async def fetch_pagespeed_report(url: str, api_key: str, platform: str) -> dict[str, Any] | None:
    """Call Google PageSpeed Insights v5. Returns full JSON or None on failure."""
    strategy = _strategy_for_platform(platform)
    # Repeated category= is required by the API
    q: list[tuple[str, str]] = [
        ("url", url),
        ("key", api_key),
        ("strategy", strategy),
        ("category", "performance"),
        ("category", "accessibility"),
        ("category", "best-practices"),
        ("category", "seo"),
    ]
    query = urlencode(q)
    full_url = f"{PAGESPEED_ENDPOINT}?{query}"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.get(full_url)
            if resp.status_code == 400:
                logger.warning("PageSpeed Insights 400: %s", resp.text[:300])
                return None
            if resp.status_code == 403:
                logger.warning("PageSpeed Insights 403: check API key and PageSpeed Insights API enabled.")
                return None
            if resp.status_code == 429:
                logger.warning("PageSpeed Insights rate limited (429).")
                return None
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as e:
        logger.warning("PageSpeed Insights HTTP error: %s", e)
        return None
    except Exception as e:
        logger.warning("PageSpeed Insights error: %s", e)
        return None
