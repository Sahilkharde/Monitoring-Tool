import asyncio
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.agents.browser_runner import capture_page_snapshot
from app.agents.security_agent import SecurityAgent
from app.agents.performance_agent import PerformanceAgent
from app.agents.code_quality_agent import CodeQualityAgent
from app.config import settings
from app.models.scan import Scan
from app.services.scoring import calculate_overall_score, detect_regressions, generate_recommendations
from app.services.websocket import update_progress

AGENT_MAP = {
    "security": SecurityAgent,
    "performance": PerformanceAgent,
    "code-quality": CodeQualityAgent,
    "code_quality": CodeQualityAgent,
}


def _redact_browser_options(opts: dict[str, Any] | None) -> dict[str, Any] | None:
    if not opts:
        return None
    out = dict(opts)
    login = out.get("login")
    if isinstance(login, dict):
        lg = {**login}
        if lg.get("password") is not None:
            lg["password"] = None
        if lg.get("username") or lg.get("email"):
            lg["username"] = "***"
            lg.pop("email", None)
        out["login"] = lg
    return out


async def run_scan(scan_id: str, db: Session) -> None:
    scan = db.query(Scan).filter(Scan.scan_id == scan_id).first()
    if not scan:
        return

    scan.status = "running"
    scan.started_at = datetime.now(timezone.utc)
    db.commit()

    start_time = time.monotonic()
    agents_to_run = scan.agents or ["security", "performance", "code-quality"]
    all_findings: list[dict[str, Any]] = []
    total_steps = len(agents_to_run)

    update_progress(scan_id, {
        "status": "running",
        "progress": 0,
        "current_agent": None,
        "completed_agents": [],
    })

    completed_agents: list[str] = []
    snapshot: dict[str, Any] | None = None
    browser_opts: dict[str, Any] = dict(scan.browser_options or {})

    try:
        if settings.USE_BROWSER_SCAN and browser_opts.get("use_browser", True):
            update_progress(scan_id, {
                "status": "running",
                "progress": 0,
                "current_agent": "browser",
                "completed_agents": [],
            })
            snap = await capture_page_snapshot(scan.target_url, browser_opts)
            if snap.get("ok"):
                snapshot = snap

        for idx, agent_name in enumerate(agents_to_run):
            if scan.status == "aborted":
                break

            update_progress(scan_id, {
                "status": "running",
                "progress": int((idx / total_steps) * 100),
                "current_agent": agent_name,
                "completed_agents": completed_agents,
            })

            agent_cls = AGENT_MAP.get(agent_name)
            if not agent_cls:
                continue

            try:
                agent = agent_cls()
                if agent_name == "performance":
                    result = await agent.analyze(
                        scan.target_url,
                        scan.platform or "both",
                        snapshot=snapshot,
                    )
                elif agent_name in ("code-quality", "code_quality"):
                    result = await agent.analyze(scan.target_url, snapshot=snapshot)
                else:
                    result = await agent.analyze(scan.target_url, snapshot=snapshot)

                score = result.get("score", 0)
                findings = result.get("findings", [])
                all_findings.extend(findings)

                if agent_name == "security":
                    scan.security_score = score
                    scan.security_results = result
                elif agent_name == "performance":
                    scan.performance_score = score
                    scan.performance_results = result
                elif agent_name in ("code-quality", "code_quality"):
                    scan.code_quality_score = score
                    scan.code_quality_results = result

                completed_agents.append(agent_name)
                db.commit()

            except Exception as exc:
                all_findings.append({
                    "severity": "CRITICAL",
                    "title": f"{agent_name} agent failed",
                    "description": str(exc),
                    "category": agent_name,
                    "remediation": "Check agent logs for details.",
                })

        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        scan.overall_score = calculate_overall_score(
            scan.security_score, scan.performance_score, scan.code_quality_score
        )
        scan.findings = all_findings
        scan.recommendations = generate_recommendations(all_findings)

        prev_q = db.query(Scan).filter(
            Scan.target_url == scan.target_url,
            Scan.scan_id != scan_id,
            Scan.status == "completed",
            Scan.is_competition == scan.is_competition,
        )
        if scan.user_id is not None:
            prev_q = prev_q.filter(Scan.user_id == scan.user_id)
        previous = prev_q.order_by(Scan.completed_at.desc()).first()
        if previous:
            prev_data = {
                "security_score": previous.security_score,
                "performance_score": previous.performance_score,
                "code_quality_score": previous.code_quality_score,
                "overall_score": previous.overall_score,
                "findings": previous.findings or [],
            }
            scan.regressions = detect_regressions(
                {
                    "security_score": scan.security_score,
                    "performance_score": scan.performance_score,
                    "code_quality_score": scan.code_quality_score,
                    "overall_score": scan.overall_score,
                    "findings": all_findings,
                },
                prev_data,
            )

        scan.status = "completed" if scan.status != "aborted" else "aborted"
        scan.completed_at = datetime.now(timezone.utc)
        scan.duration_ms = elapsed_ms
        db.commit()

    except Exception as exc:
        scan.status = "failed"
        scan.completed_at = datetime.now(timezone.utc)
        scan.duration_ms = int((time.monotonic() - start_time) * 1000)
        scan.findings = all_findings + [{
            "severity": "CRITICAL",
            "title": "Scan failed",
            "description": str(exc),
            "category": "system",
            "remediation": "Check server logs.",
        }]
        scan.browser_options = _redact_browser_options(scan.browser_options)
        db.commit()

    update_progress(scan_id, {
        "status": scan.status,
        "progress": 100,
        "current_agent": None,
        "completed_agents": completed_agents,
    })
