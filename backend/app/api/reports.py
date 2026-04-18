from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.scan import Scan

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _get_scan(scan_id: str, db: Session) -> Scan:
    scan = db.query(Scan).filter(Scan.scan_id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.get("/{scan_id}/overview")
async def report_overview(
    scan_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    scan = _get_scan(scan_id, db)
    return {
        "scan_id": scan.scan_id,
        "target_url": scan.target_url,
        "status": scan.status,
        "overall_score": scan.overall_score,
        "security_score": scan.security_score,
        "performance_score": scan.performance_score,
        "code_quality_score": scan.code_quality_score,
        "started_at": scan.started_at.isoformat() if scan.started_at else None,
        "completed_at": scan.completed_at.isoformat() if scan.completed_at else None,
        "duration_ms": scan.duration_ms,
        "findings_count": len(scan.findings or []),
        "critical_count": sum(1 for f in (scan.findings or []) if f.get("severity") == "CRITICAL"),
        "high_count": sum(1 for f in (scan.findings or []) if f.get("severity") == "HIGH"),
        "recommendations": (scan.recommendations or [])[:5],
        "regressions": scan.regressions or [],
    }


@router.get("/{scan_id}/management")
async def management_report(
    scan_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    scan = _get_scan(scan_id, db)
    findings = scan.findings or []

    severity_dist = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    category_dist: dict[str, int] = {}
    for f in findings:
        sev = f.get("severity", "LOW")
        severity_dist[sev] = severity_dist.get(sev, 0) + 1
        cat = f.get("category", "other")
        category_dist[cat] = category_dist.get(cat, 0) + 1

    risk_level = "LOW"
    if severity_dist["CRITICAL"] > 0:
        risk_level = "CRITICAL"
    elif severity_dist["HIGH"] > 2:
        risk_level = "HIGH"
    elif severity_dist["HIGH"] > 0 or severity_dist["MEDIUM"] > 3:
        risk_level = "MEDIUM"

    return {
        "scan_id": scan.scan_id,
        "target_url": scan.target_url,
        "executive_summary": {
            "overall_score": scan.overall_score,
            "risk_level": risk_level,
            "total_findings": len(findings),
            "severity_distribution": severity_dist,
            "category_distribution": category_dist,
        },
        "scores": {
            "security": scan.security_score,
            "performance": scan.performance_score,
            "code_quality": scan.code_quality_score,
        },
        "top_risks": [f for f in findings if f.get("severity") in ("CRITICAL", "HIGH")][:10],
        "recommendations": (scan.recommendations or [])[:10],
        "regressions": scan.regressions or [],
        "compliance": _build_compliance(scan),
    }


@router.get("/{scan_id}/developer")
async def developer_report(
    scan_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    scan = _get_scan(scan_id, db)
    return {
        "scan_id": scan.scan_id,
        "target_url": scan.target_url,
        "security": scan.security_results or {},
        "performance": scan.performance_results or {},
        "code_quality": scan.code_quality_results or {},
        "all_findings": scan.findings or [],
        "recommendations": scan.recommendations or [],
    }


@router.get("/{scan_id}/mindmap")
async def mindmap_data(
    scan_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    scan = _get_scan(scan_id, db)
    findings = scan.findings or []

    categories: dict[str, list[dict[str, Any]]] = {}
    for f in findings:
        cat = f.get("category", "other")
        categories.setdefault(cat, []).append(f)

    children = []
    for cat, items in categories.items():
        children.append({
            "name": cat.replace("_", " ").title(),
            "count": len(items),
            "children": [
                {
                    "name": item.get("title", ""),
                    "severity": item.get("severity", "LOW"),
                    "description": item.get("description", ""),
                }
                for item in items[:10]
            ],
        })

    return {
        "name": scan.target_url,
        "overall_score": scan.overall_score,
        "children": [
            {
                "name": "Security",
                "score": scan.security_score,
                "children": [c for c in children if "security" in c["name"].lower() or "ssl" in c["name"].lower() or "header" in c["name"].lower() or "cors" in c["name"].lower() or "cookie" in c["name"].lower() or "token" in c["name"].lower() or "api" in c["name"].lower()],
            },
            {
                "name": "Performance",
                "score": scan.performance_score,
                "children": [c for c in children if "performance" in c["name"].lower() or "connectivity" in c["name"].lower()],
            },
            {
                "name": "Code Quality",
                "score": scan.code_quality_score,
                "children": [c for c in children if "code" in c["name"].lower() or "quality" in c["name"].lower()],
            },
        ],
    }


@router.post("/{scan_id}/generate")
async def generate_pdf(
    scan_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    scan = _get_scan(scan_id, db)
    return {
        "message": "PDF generation is not yet implemented. Use the overview/management/developer endpoints for report data.",
        "scan_id": scan.scan_id,
        "status": "not_implemented",
    }


def _build_compliance(scan: Scan) -> dict[str, Any]:
    sec = scan.security_results or {}
    return {
        "owasp_top_10": sec.get("owasp_mapping", {}),
        "ssl_grade": sec.get("ssl_grade", "N/A"),
        "headers_score": sec.get("headers_score", 0),
        "drm_status": sec.get("drm_status", {}),
    }
