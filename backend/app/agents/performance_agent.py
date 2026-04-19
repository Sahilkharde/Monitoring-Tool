import re
import time
from typing import Any
from urllib.parse import urljoin

import httpx

from app.config import settings
from app.services.pagespeed_insights import (
    build_performance_result_from_pagespeed,
    fetch_pagespeed_report,
)


class PerformanceAgent:
    async def analyze(
        self,
        url: str,
        platform: str = "both",
        snapshot: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        findings: list[dict[str, Any]] = []

        # Real Lighthouse: Google PageSpeed Insights API (remote Chrome + Lighthouse in Google cloud).
        api_key = (settings.GOOGLE_PAGESPEED_API_KEY or "").strip()
        if settings.USE_PAGESPEED_INSIGHTS and api_key:
            psi = await fetch_pagespeed_report(url, api_key, platform)
            if psi:
                built = build_performance_result_from_pagespeed(psi, url, platform)
                if built is not None:
                    return built

        if snapshot and snapshot.get("ok") and snapshot.get("html"):
            return self._build_from_snapshot(url, platform, snapshot, findings)

        return await self._analyze_httpx(url, platform, findings)

    def _build_from_snapshot(
        self,
        url: str,
        platform: str,
        snapshot: dict[str, Any],
        findings: list[dict[str, Any]],
    ) -> dict[str, Any]:
        html = snapshot.get("html") or ""
        vitals = snapshot.get("vitals") or {}
        rb = snapshot.get("resource_bytes") or {}

        resources: dict[str, int] = {
            "html": len(html.encode("utf-8", errors="ignore")),
            "css": int(rb.get("css") or 0),
            "js": int(rb.get("js") or 0),
            "images": int(rb.get("images") or 0),
            "fonts": int(rb.get("fonts") or 0),
            "other": int(rb.get("other") or 0),
        }
        render_blocking = self._count_render_blocking(html)
        total_weight = sum(resources.values())

        ttfb_ms = float(vitals.get("ttfb_ms") or 0)
        fcp_ms = float(vitals.get("fcp_ms") or ttfb_ms or 0)
        lcp_ms = float(vitals.get("lcp_ms") or fcp_ms * 1.15)
        cls_val = float(vitals.get("cls") or 0)
        js_kb = resources["js"] / 1024
        tbt = max(0.0, js_kb * 1.5 - 200)
        fid = min(300.0, js_kb * 0.5)
        inp = min(500.0, js_kb * 0.8)
        si = fcp_ms * 0.6 + lcp_ms * 0.4

        cwv = {
            "lcp": self._metric_ms(lcp_ms, 2500, 4000),
            "fcp": self._metric_ms(fcp_ms, 1800, 3000),
            "cls": self._metric_cls(cls_val, 0.1, 0.25),
            "fid": self._metric_ms(fid, 100, 300),
            "ttfb": self._metric_ms(ttfb_ms, 800, 1800),
            "inp": self._metric_ms(inp, 200, 500),
            "si": self._metric_ms(si, 3400, 5800),
            "tbt": self._metric_ms(tbt, 200, 600),
        }

        cwv_upper = {
            "LCP": {**cwv["lcp"], "rating": cwv["lcp"]["status"]},
            "FCP": {**cwv["fcp"], "rating": cwv["fcp"]["status"]},
            "CLS": {**cwv["cls"], "rating": cwv["cls"]["status"]},
            "FID": {**cwv["fid"], "rating": cwv["fid"]["status"]},
            "TTFB": {**cwv["ttfb"], "rating": cwv["ttfb"]["status"]},
            "INP": {**cwv["inp"], "rating": cwv["inp"]["status"]},
            "SI": {**cwv["si"], "rating": cwv["si"]["status"]},
            "TBT": {**cwv["tbt"], "rating": cwv["tbt"]["status"]},
        }

        lighthouse = self._estimate_lighthouse(cwv_upper, findings, html, render_blocking)
        self._generate_findings(findings, cwv_upper, resources, render_blocking, total_weight)

        perf_score = lighthouse["performance"]
        res_count = int(vitals.get("resource_count") or 0)

        return self._result_dict(
            perf_score,
            lighthouse,
            cwv,
            findings,
            resources,
            total_weight,
            render_blocking,
            platform,
            round(ttfb_ms, 1),
            res_count,
            source="chromium",
        )

    async def _analyze_httpx(
        self,
        url: str,
        platform: str,
        findings: list[dict[str, Any]],
    ) -> dict[str, Any]:
        ttfb_ms = 0.0
        page_size = 0
        resources: dict[str, Any] = {"html": 0, "css": 0, "js": 0, "images": 0, "fonts": 0, "other": 0}
        render_blocking = 0
        resource_list: list[dict[str, Any]] = []
        html = ""

        try:
            async with httpx.AsyncClient(
                timeout=30, follow_redirects=True, verify=False
            ) as client:
                t0 = time.monotonic()
                resp = await client.get(url)
                ttfb_ms = (time.monotonic() - t0) * 1000
                html = resp.text
                page_size = len(resp.content)
                resources["html"] = page_size

                css_urls, js_urls, img_urls, font_urls = self._parse_resources(html, url)

                render_blocking = self._count_render_blocking(html)

                for css_url in css_urls[:15]:
                    size = await self._fetch_size(client, css_url)
                    resources["css"] += size
                    resource_list.append({"url": css_url, "type": "css", "size": size})

                for js_url in js_urls[:15]:
                    size = await self._fetch_size(client, js_url)
                    resources["js"] += size
                    resource_list.append({"url": js_url, "type": "js", "size": size})

                for img_url in img_urls[:10]:
                    size = await self._fetch_size(client, img_url)
                    resources["images"] += size
                    resource_list.append({"url": img_url, "type": "image", "size": size})

        except Exception as exc:
            findings.append({
                "severity": "CRITICAL",
                "title": "Page load failed",
                "description": str(exc),
                "category": "connectivity",
                "remediation": "Ensure the URL is reachable.",
            })
            return self._empty_result(findings)

        total_weight = sum(resources.values())

        cwv_upper = self._estimate_core_web_vitals(
            ttfb_ms, resources, render_blocking, html, total_weight
        )
        lighthouse = self._estimate_lighthouse(cwv_upper, findings, html, render_blocking)
        self._generate_findings(findings, cwv_upper, resources, render_blocking, total_weight)

        perf_score = lighthouse["performance"]
        cwv_lower = self._cwv_to_frontend(cwv_upper)
        resource_summary = {
            "total_weight": total_weight,
            "js": resources["js"],
            "css": resources["css"],
            "images": resources["images"],
            "fonts": resources["fonts"],
            "other": resources["other"],
        }

        return self._result_dict(
            perf_score,
            lighthouse,
            cwv_lower,
            findings,
            resources,
            total_weight,
            render_blocking,
            platform,
            round(ttfb_ms, 1),
            len(resource_list),
            source="httpx",
        )

    def _result_dict(
        self,
        perf_score: float,
        lighthouse: dict[str, int],
        core_web_vitals: dict[str, Any],
        findings: list[dict[str, Any]],
        resources: dict[str, int],
        total_weight: int,
        render_blocking: int,
        platform: str,
        ttfb_ms: float,
        resource_count: int,
        source: str,
    ) -> dict[str, Any]:
        resource_summary = {
            "total_weight": total_weight,
            "js": resources["js"],
            "css": resources["css"],
            "images": resources["images"],
            "fonts": resources["fonts"],
            "other": resources.get("other", 0),
        }
        return {
            "score": perf_score,
            "lighthouse": lighthouse,
            "lighthouse_scores": lighthouse,
            "core_web_vitals": core_web_vitals,
            "findings": findings,
            "resource_summary": resource_summary,
            "cdn_analysis": {
                "total_page_weight": total_weight,
                "total_page_weight_kb": round(total_weight / 1024, 1),
                "breakdown": {k: round(v / 1024, 1) for k, v in resources.items()},
            },
            "ttfb_ms": ttfb_ms,
            "render_blocking_resources": render_blocking,
            "resource_count": resource_count,
            "platform": platform,
            "measurement_source": source,
        }

    @staticmethod
    def _metric_ms(value: float, good: float, poor: float) -> dict[str, Any]:
        st = PerformanceAgent._rate(value, good, poor)
        return {
            "value": round(value, 0),
            "unit": "ms",
            "target": good,
            "status": st,
        }

    @staticmethod
    def _metric_cls(value: float, good: float, poor: float) -> dict[str, Any]:
        st = PerformanceAgent._rate(value, good, poor)
        return {
            "value": round(value, 3),
            "unit": "",
            "target": good,
            "status": st,
        }

    @staticmethod
    def _cwv_to_frontend(cwv_upper: dict[str, Any]) -> dict[str, Any]:
        m = {"LCP": "lcp", "FCP": "fcp", "CLS": "cls", "FID": "fid", "TTFB": "ttfb", "INP": "inp", "SI": "si", "TBT": "tbt"}
        out: dict[str, Any] = {}
        for uk, lk in m.items():
            if uk in cwv_upper:
                d = dict(cwv_upper[uk])
                d["status"] = d.get("status") or d.get("rating", "good")
                d.pop("rating", None)
                out[lk] = d
        return out

    def _parse_resources(self, html: str, base_url: str):
        css_urls: list[str] = []
        js_urls: list[str] = []
        img_urls: list[str] = []
        font_urls: list[str] = []

        for m in re.finditer(r'<link[^>]+href=["\']([^"\']+)["\']', html, re.I):
            tag = m.group(0)
            href = m.group(1)
            if 'rel="stylesheet"' in tag or "rel='stylesheet'" in tag or href.endswith(".css"):
                css_urls.append(urljoin(base_url, href))

        for m in re.finditer(r'<script[^>]+src=["\']([^"\']+)["\']', html, re.I):
            js_urls.append(urljoin(base_url, m.group(1)))

        for m in re.finditer(r'<img[^>]+src=["\']([^"\']+)["\']', html, re.I):
            img_urls.append(urljoin(base_url, m.group(1)))

        return css_urls, js_urls, img_urls, font_urls

    async def _fetch_size(self, client: httpx.AsyncClient, url: str) -> int:
        try:
            resp = await client.head(url, timeout=5)
            cl = resp.headers.get("content-length")
            if cl and cl.isdigit():
                return int(cl)
            resp = await client.get(url, timeout=10)
            return len(resp.content)
        except Exception:
            return 0

    def _count_render_blocking(self, html: str) -> int:
        count = 0
        head_match = re.search(r"<head[^>]*>(.*?)</head>", html, re.I | re.DOTALL)
        if not head_match:
            return 0
        head = head_match.group(1)

        for m in re.finditer(r"<link[^>]+>", head, re.I):
            tag = m.group(0)
            if "stylesheet" in tag and "media=" not in tag:
                count += 1

        for m in re.finditer(r"<script[^>]*>", head, re.I):
            tag = m.group(0)
            if "async" not in tag and "defer" not in tag and "src=" in tag:
                count += 1

        return count

    def _estimate_core_web_vitals(
        self,
        ttfb_ms: float,
        resources: dict[str, int],
        render_blocking: int,
        html: str,
        total_weight: int,
    ) -> dict[str, Any]:
        fcp = ttfb_ms + render_blocking * 50 + resources["css"] / 1024 * 5
        lcp = fcp + resources["images"] / 1024 * 3
        js_kb = resources["js"] / 1024
        tbt = max(0, js_kb * 1.5 - 200)

        imgs_without_dim = len(re.findall(
            r"<img(?![^>]*width=)(?![^>]*style=)[^>]*>", html, re.I
        ))
        cls = min(0.5, imgs_without_dim * 0.05)

        si = fcp * 0.6 + lcp * 0.4
        fid = min(300, js_kb * 0.5)
        inp = min(500, js_kb * 0.8)

        def m(name: str, value: float, unit: str, good: float, poor: float) -> dict[str, Any]:
            st = self._rate(value, good, poor)
            return {"value": round(value, 3 if unit == "" else 0), "unit": unit, "target": good, "status": st, "rating": st}

        return {
            "LCP": m("LCP", lcp, "ms", 2500, 4000),
            "FCP": m("FCP", fcp, "ms", 1800, 3000),
            "CLS": m("CLS", cls, "", 0.1, 0.25),
            "FID": m("FID", fid, "ms", 100, 300),
            "TTFB": m("TTFB", ttfb_ms, "ms", 800, 1800),
            "INP": m("INP", inp, "ms", 200, 500),
            "SI": m("SI", si, "ms", 3400, 5800),
            "TBT": m("TBT", tbt, "ms", 200, 600),
        }

    @staticmethod
    def _rate(value: float, good: float, poor: float) -> str:
        if value <= good:
            return "good"
        if value <= poor:
            return "needs-improvement"
        return "poor"

    def _estimate_lighthouse(
        self,
        cwv: dict[str, Any],
        findings: list[dict[str, Any]],
        html: str,
        render_blocking: int,
    ) -> dict[str, int]:
        perf = 100
        metric_weights = {"LCP": 25, "FCP": 10, "CLS": 25, "TBT": 30, "SI": 10}
        for metric, weight in metric_weights.items():
            block = cwv.get(metric, {}) or {}
            rating = block.get("rating") or block.get("status", "good")
            if rating == "poor":
                perf -= weight
            elif rating == "needs-improvement":
                perf -= weight // 2

        accessibility = 90
        if not re.search(r'<html[^>]+lang=', html, re.I):
            accessibility -= 10
        if not re.search(r"<title[^>]*>.+</title>", html, re.I | re.DOTALL):
            accessibility -= 5
        imgs = re.findall(r"<img[^>]*>", html, re.I)
        imgs_no_alt = [i for i in imgs if "alt=" not in i.lower()]
        if imgs_no_alt:
            accessibility -= min(20, len(imgs_no_alt) * 3)

        best_practices = 100 - render_blocking * 3
        if not re.search(r'<meta[^>]+charset', html, re.I):
            best_practices -= 5
        if not re.search(r'<meta[^>]+viewport', html, re.I):
            best_practices -= 10

        seo = 90
        if not re.search(r'<meta[^>]+name=["\']description', html, re.I):
            seo -= 15
        if not re.search(r"<h1[^>]*>", html, re.I):
            seo -= 10

        pwa = 30

        return {
            "performance": max(0, min(100, perf)),
            "accessibility": max(0, min(100, accessibility)),
            "best_practices": max(0, min(100, best_practices)),
            "seo": max(0, min(100, seo)),
            "pwa": max(0, min(100, pwa)),
        }

    def _generate_findings(
        self,
        findings: list[dict[str, Any]],
        cwv: dict[str, Any],
        resources: dict[str, int],
        render_blocking: int,
        total_weight: int,
    ) -> None:
        def grade(metric: str) -> str:
            b = cwv.get(metric, {}) or {}
            return b.get("rating") or b.get("status", "good")

        if grade("LCP") == "poor":
            findings.append({
                "severity": "CRITICAL",
                "title": "Poor Largest Contentful Paint",
                "description": f"LCP is {cwv['LCP']['value']}ms (target < 2500ms).",
                "category": "performance",
                "remediation": "Optimize largest images, use preload for critical resources.",
            })
        if grade("CLS") == "poor":
            findings.append({
                "severity": "HIGH",
                "title": "High Cumulative Layout Shift",
                "description": f"CLS is {cwv['CLS']['value']} (target < 0.1).",
                "category": "performance",
                "remediation": "Add width/height attributes to images and ads.",
            })
        if grade("TBT") == "poor":
            findings.append({
                "severity": "HIGH",
                "title": "High Total Blocking Time",
                "description": f"TBT is {cwv['TBT']['value']}ms (target < 200ms).",
                "category": "performance",
                "remediation": "Reduce JavaScript bundle size, defer non-critical scripts.",
            })
        if render_blocking > 3:
            findings.append({
                "severity": "MEDIUM",
                "title": "Too many render-blocking resources",
                "description": f"{render_blocking} render-blocking resources in <head>.",
                "category": "performance",
                "remediation": "Use async/defer for scripts, inline critical CSS.",
            })
        if total_weight > 3_000_000:
            findings.append({
                "severity": "HIGH",
                "title": "Excessive page weight",
                "description": f"Total page weight is {round(total_weight/1024/1024, 1)}MB.",
                "category": "performance",
                "remediation": "Compress images, minify CSS/JS, enable gzip.",
            })
        if resources["js"] > 1_000_000:
            findings.append({
                "severity": "MEDIUM",
                "title": "Large JavaScript payload",
                "description": f"Total JS is {round(resources['js']/1024, 0)}KB.",
                "category": "performance",
                "remediation": "Code-split, tree-shake, and lazy-load JavaScript.",
            })

    def _empty_result(self, findings: list[dict[str, Any]]) -> dict[str, Any]:
        z = {"performance": 0, "accessibility": 0, "best_practices": 0, "seo": 0, "pwa": 0}
        return {
            "score": 0,
            "lighthouse": z,
            "lighthouse_scores": z,
            "core_web_vitals": {},
            "findings": findings,
            "resource_summary": None,
            "cdn_analysis": {"total_page_weight": 0, "breakdown": {}},
            "measurement_source": "none",
        }
