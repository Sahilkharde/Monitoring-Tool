from typing import Any

WEIGHTS = {"security": 0.40, "performance": 0.35, "code_quality": 0.25}

SEVERITY_IMPACT = {"CRITICAL": 10, "HIGH": 7, "MEDIUM": 4, "LOW": 1}


def calculate_overall_score(
    security: float | None,
    performance: float | None,
    code_quality: float | None,
) -> float:
    scores = {
        "security": security or 0,
        "performance": performance or 0,
        "code_quality": code_quality or 0,
    }
    total_weight = sum(
        WEIGHTS[k] for k, v in scores.items() if v is not None and v > 0
    ) or 1.0
    weighted = sum(scores[k] * WEIGHTS[k] for k in scores)
    return round(weighted / total_weight, 1)


def detect_regressions(
    current_scan: dict[str, Any],
    previous_scan: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if not previous_scan:
        return []

    regressions: list[dict[str, Any]] = []
    for key in ("security_score", "performance_score", "code_quality_score", "overall_score"):
        cur = current_scan.get(key)
        prev = previous_scan.get(key)
        if cur is not None and prev is not None and cur < prev:
            regressions.append({
                "metric": key.replace("_score", "").replace("_", " ").title(),
                "previous": prev,
                "current": cur,
                "delta": round(cur - prev, 1),
            })

    prev_findings = {f.get("title") for f in (previous_scan.get("findings") or [])}
    for finding in current_scan.get("findings") or []:
        if finding.get("title") not in prev_findings and finding.get("severity") in ("CRITICAL", "HIGH"):
            regressions.append({
                "metric": "New Finding",
                "title": finding.get("title"),
                "severity": finding.get("severity"),
            })

    return regressions


def generate_recommendations(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not findings:
        return []

    grouped: dict[str, list[dict]] = {}
    for f in findings:
        cat = f.get("category", "general")
        grouped.setdefault(cat, []).append(f)

    recommendations = []
    for cat, items in grouped.items():
        max_severity = max(items, key=lambda x: SEVERITY_IMPACT.get(x.get("severity", "LOW"), 1))
        severity = max_severity.get("severity", "LOW")
        impact = min(10, SEVERITY_IMPACT.get(severity, 1))
        risk = min(10, len(items) * 2)
        ease = 8 if severity in ("LOW",) else 3 if severity == "MEDIUM" else 1
        effort = "low" if ease >= 6 else "high"
        projected_gain = round(len(items) * 1.2 + impact * 0.5, 1)
        confidence = 85

        cat_label = _category_label(cat)
        title = f"Address {cat_label} issues ({len(items)} findings)"
        desc = items[0].get("description", "") if items else ""

        recommendations.append({
            "title": title,
            "description": desc,
            "category": cat_label,
            "severity": severity,
            "remediation": items[0].get("remediation", ""),
            "impact": impact,
            "risk": risk,
            "ease": ease,
            "effort": effort,
            "projected_gain": projected_gain,
            "confidence": confidence,
            "finding_count": len(items),
            "quick_win": effort == "low" and projected_gain > 1,
        })

    recommendations.sort(key=lambda x: x["impact"] * 2 + x["risk"], reverse=True)
    return recommendations[:20]


def _category_label(cat: str) -> str:
    labels = {
        "ssl": "SSL/TLS",
        "headers": "Security Headers",
        "cors": "CORS",
        "cookies": "Cookie Security",
        "token_leak": "Token Security",
        "api": "API Security",
        "drm": "DRM Protection",
        "performance": "Performance",
        "connectivity": "Connectivity",
        "code_quality": "Code Quality",
    }
    return labels.get(cat, cat.replace("_", " ").title())
