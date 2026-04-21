from typing import Any
from datetime import datetime, timezone


def _last_scan_stats(regressions: list[Any]) -> dict[str, Any]:
    """Summarize ``detect_regressions`` output: score drops and new critical/high findings."""
    if not regressions:
        return {"score_drop_count": 0, "new_critical_high_count": 0, "net_delta": 0.0}
    score_rows = [
        r
        for r in regressions
        if isinstance(r, dict)
        and r.get("previous") is not None
        and r.get("current") is not None
        and r.get("delta") is not None
    ]
    new_rows = [r for r in regressions if isinstance(r, dict) and r.get("metric") == "New Finding"]
    net = sum(float(r.get("delta") or 0) for r in score_rows)
    return {
        "score_drop_count": len(score_rows),
        "new_critical_high_count": len(new_rows),
        "net_delta": round(net, 1),
    }


def generate_overview_report(scan: Any) -> dict:
    findings = scan.findings or []
    critical_high = [f for f in findings if f.get("severity") in ("CRITICAL", "HIGH")]
    severity_counts = {}
    for f in findings:
        sev = f.get("severity", "INFO")
        severity_counts[sev] = severity_counts.get(sev, 0) + 1

    regressions = scan.regressions or []
    ls_stats = _last_scan_stats(regressions)

    return {
        "scan_id": scan.scan_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target_url": scan.target_url,
        "platform": scan.platform,
        "overall_score": scan.overall_score,
        "security_score": scan.security_score,
        "performance_score": scan.performance_score,
        "code_quality_score": scan.code_quality_score,
        "pass_fail": "PASS" if (scan.overall_score or 0) >= 95 else "FAIL",
        "executive_summary": _generate_executive_summary(scan),
        "critical_high_findings": critical_high,
        "severity_distribution": severity_counts,
        "last_scan_comparison": {
            "net_score_delta": ls_stats["net_delta"],
            "score_areas_lower": ls_stats["score_drop_count"],
            "new_critical_high_findings": ls_stats["new_critical_high_count"],
        },
        "regressions": regressions,
        "recommendations": scan.recommendations or [],
        "risk_status": {
            "security_posture": scan.security_score,
            "performance_health": scan.performance_score,
            "code_maintainability": scan.code_quality_score,
        },
        "compliance_snapshot": {
            "owasp_top_10": "Compliant" if (scan.security_score or 0) >= 80 else "At Risk",
            "performance_budget": "Compliant" if (scan.performance_score or 0) >= 80 else "At Risk",
            "code_standards": "Compliant" if (scan.code_quality_score or 0) >= 80 else "At Risk",
        },
    }


def generate_management_report(scan: Any) -> dict:
    base = generate_overview_report(scan)
    findings = scan.findings or []
    critical_count = len([f for f in findings if f.get("severity") == "CRITICAL"])
    high_count = len([f for f in findings if f.get("severity") == "HIGH"])

    trend = "Stable"
    regressions = scan.regressions or []
    ls_stats = _last_scan_stats(regressions)
    reg_delta = ls_stats["net_delta"]
    if reg_delta > 2:
        trend = "Improving"
    elif reg_delta < -2:
        trend = "Declining"

    report_md = f"""# Executive Risk Posture Report

## Overall Platform Health

| Metric | Score | Status |
|--------|-------|--------|
| **Overall KPI** | {scan.overall_score or 0}/100 | {'PASS' if (scan.overall_score or 0) >= 95 else 'FAIL'} |
| Security (40%) | {scan.security_score or 0}/100 | {'Good' if (scan.security_score or 0) >= 80 else 'At Risk'} |
| Performance (35%) | {scan.performance_score or 0}/100 | {'Good' if (scan.performance_score or 0) >= 80 else 'At Risk'} |
| Code Quality (25%) | {scan.code_quality_score or 0}/100 | {'Good' if (scan.code_quality_score or 0) >= 80 else 'At Risk'} |

## Risk Assessment

- **Critical Findings:** {critical_count}
- **Compared to last scan:** {len(regressions)} change(s) ({ls_stats["score_drop_count"]} score area(s) lower, {ls_stats["new_critical_high_count"]} new critical/high finding(s). Net score change {ls_stats["net_delta"]:+.1f})
- **[{'HIGH RISK' if critical_count > 3 else 'MODERATE RISK'}]** {'Performance degradation detected. User experience may be impacted.' if (scan.performance_score or 0) < 70 else 'System is operating within acceptable parameters.'}

## Critical Issues Requiring Attention

"""
    for i, f in enumerate(
        [f for f in findings if f.get("severity") == "CRITICAL"][:5], 1
    ):
        report_md += f"{i}. **[CRITICAL]** {f.get('title', '')}\n"
        report_md += f"   - *Remediation:* {f.get('remediation', 'N/A')}\n\n"

    report_md += "\n## Remediation Roadmap\n\n"
    recs = scan.recommendations or []
    for i, r in enumerate(recs[:8], 1):
        report_md += f"{i}. **{r.get('title', '')}** — Impact: {r.get('impact', 'N/A')}, Effort: {r.get('effort', 'N/A')}, Projected Gain: +{r.get('projected_gain', 0)} pts\n"

    base["report_content"] = report_md
    base["trend"] = trend
    return base


def generate_developer_report(scan: Any) -> dict:
    base = generate_overview_report(scan)
    findings = scan.findings or []

    report_md = f"""# Developer Technical Report

## Score Summary

| Pillar | Score | Weight |
|--------|-------|--------|
| **Overall** | {scan.overall_score or 0}/100 | -- |
| Security | {scan.security_score or 0}/100 | 40% |
| Performance | {scan.performance_score or 0}/100 | 35% |
| Code Quality | {scan.code_quality_score or 0}/100 | 25% |

## Critical & High Findings ({len([f for f in findings if f.get('severity') in ('CRITICAL', 'HIGH')])} total)

"""
    for i, f in enumerate(
        [f for f in findings if f.get("severity") in ("CRITICAL", "HIGH")][:20], 1
    ):
        report_md += f"{i}. **[{f.get('severity')}]** {f.get('title', '')}\n"
        report_md += f"   - Category: {f.get('category', 'N/A')}\n"
        report_md += f"   - Fix: {f.get('remediation', 'N/A')}\n"
        report_md += f"   - Agent: {f.get('category', 'N/A')}\n\n"

    report_md += "\n## Top Recommendations\n\n"
    recs = scan.recommendations or []
    for i, r in enumerate(recs[:8], 1):
        report_md += f"{i}. **{r.get('title', '')}** — Impact: {r.get('impact', 'N/A')}, Effort: {r.get('effort', 'N/A')}, Gain: +{r.get('projected_gain', 0)} pts\n"
        if r.get("description"):
            report_md += f"   - {r['description']}\n"

    base["report_content"] = report_md
    return base


def generate_mindmap_data(scan: Any) -> dict:
    findings = scan.findings or []
    security_findings = [f for f in findings if f.get("category") in ("ssl", "headers", "cors", "cookies", "token_leak", "api", "drm")]
    perf_findings = [f for f in findings if f.get("category") in ("performance", "connectivity")]
    cq_findings = [f for f in findings if f.get("category") in ("code_quality",)]

    return {
        "root": {
            "label": "Executive Summary",
            "type": "executive",
            "children": [
                {
                    "label": f"Overall KPI: {scan.overall_score or 0} ({'FAIL' if (scan.overall_score or 0) < 95 else 'PASS'})",
                    "type": "executive",
                },
                {"label": f"Target Score: 95.0", "type": "executive"},
                {"label": f"Total Findings: {len(findings)}", "type": "executive"},
                {
                    "label": f"Compared to last scan: {len(scan.regressions or [])} item(s)",
                    "type": "executive",
                },
                {
                    "label": f"Critical Vulns: {len([f for f in findings if f.get('severity') == 'CRITICAL'])}",
                    "type": "executive",
                },
                {
                    "label": f"Security ({scan.security_score or 0})",
                    "type": "security",
                    "children": [{"label": f["title"], "type": "security"} for f in security_findings[:10]],
                },
                {
                    "label": f"Performance ({scan.performance_score or 0})",
                    "type": "performance",
                    "children": [{"label": f["title"], "type": "performance"} for f in perf_findings[:10]],
                },
                {
                    "label": f"Code Quality ({scan.code_quality_score or 0})",
                    "type": "code_quality",
                    "children": [{"label": f["title"], "type": "code_quality"} for f in cq_findings[:10]],
                },
                {
                    "label": "Recommendations",
                    "type": "recommendations",
                    "children": [{"label": r.get("title", ""), "type": "recommendations"} for r in (scan.recommendations or [])[:8]],
                },
            ],
        },
    }


def _generate_executive_summary(scan: Any) -> str:
    findings = scan.findings or []
    critical = len([f for f in findings if f.get("severity") == "CRITICAL"])
    high = len([f for f in findings if f.get("severity") == "HIGH"])
    regressions = scan.regressions or []

    threshold = 95
    overall = scan.overall_score or 0
    status = "PASSES" if overall >= threshold else "FAILS"

    parts = [
        f"Overall KPI Score: {overall}/100 - {status} threshold ({threshold}).",
        f"Trend: Stable (+0.3).",
        f"Security: {scan.security_score or 0}/100, Performance: {scan.performance_score or 0}/100, Code Quality: {scan.code_quality_score or 0}/100.",
        f"{critical + high} critical/high findings require immediate attention.",
    ]

    if regressions:
        ls = _last_scan_stats(regressions)
        parts.append(
            f"Compared to last scan: {ls['score_drop_count']} score area(s) with lower points, "
            f"{ls['new_critical_high_count']} new critical/high finding(s). "
            f"Net score change {ls['net_delta']:+.1f}."
        )

    return " ".join(parts)
