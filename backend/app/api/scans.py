import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db, SessionLocal
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.scan import Scan
from app.schemas.scan import ScanRequest, ScanResponse, ScanListResponse, ScanStartResponse
from app.agents.scanner import run_scan
from app.services.scan_url import normalize_scan_url
from app.services.websocket import get_progress

router = APIRouter(prefix="/api/scans", tags=["scans"])

logger = logging.getLogger(__name__)

_TERMINAL_SCAN_STATUSES = frozenset({"completed", "failed", "aborted"})


async def _run_scan_background(scan_id: str) -> None:
    db = SessionLocal()
    try:
        await run_scan(scan_id, db)
    except Exception:
        logger.exception("Background scan failed (scan_id=%s)", scan_id)
    finally:
        db.close()


async def _run_desktop_mweb_scans(scan_ids: list[str]) -> None:
    """Run desktop + mWeb scans one after another (SQLite-safe; avoids missing symbol + DB lock races)."""
    for sid in scan_ids:
        await _run_scan_background(sid)


def _normalize_agents(agents: list[str] | None) -> list[str]:
    if not agents:
        return ["security", "performance", "code-quality"]
    out: list[str] = []
    for a in agents:
        if a == "code_quality":
            out.append("code-quality")
        else:
            out.append(a)
    return out


@router.post("", response_model=ScanStartResponse, status_code=status.HTTP_201_CREATED)
async def start_scan(
    body: ScanRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    browser_opts: dict | None = None
    if body.browser_options is not None:
        browser_opts = body.browser_options.model_dump(exclude_none=True)

    raw_platform = (body.platform or "both").lower().strip()
    agents = _normalize_agents(body.agents)
    target = normalize_scan_url(body.target_url)

    if raw_platform == "both":
        group_id = uuid.uuid4().hex
        created: list[Scan] = []
        for pl in ("desktop", "mweb"):
            scan_id = f"scan-{uuid.uuid4().hex[:12]}"
            scan = Scan(
                scan_id=scan_id,
                target_url=target,
                platform=pl,
                scan_group_id=group_id,
                agents=agents,
                browser_options=browser_opts,
                status="pending",
                user_id=user.id,
            )
            db.add(scan)
            created.append(scan)
        db.commit()
        for s in created:
            db.refresh(s)
        background_tasks.add_task(_run_desktop_mweb_scans, [s.scan_id for s in created])
        return ScanStartResponse(scans=[ScanResponse.model_validate(s) for s in created])

    pl_single = raw_platform if raw_platform in ("desktop", "mweb") else "desktop"

    scan_id = f"scan-{uuid.uuid4().hex[:12]}"
    scan = Scan(
        scan_id=scan_id,
        target_url=target,
        platform=pl_single,
        scan_group_id=None,
        agents=agents,
        browser_options=browser_opts,
        status="pending",
        user_id=user.id,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    background_tasks.add_task(_run_scan_background, scan_id)

    return ScanStartResponse(scans=[ScanResponse.model_validate(scan)])


@router.get("", response_model=ScanListResponse)
async def list_scans(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    total = db.query(Scan).filter(Scan.is_competition == False).count()
    scans = (
        db.query(Scan)
        .filter(Scan.is_competition == False)
        .order_by(Scan.started_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return ScanListResponse(
        scans=[ScanResponse.model_validate(s) for s in scans],
        total=total,
    )


@router.get("/{scan_id}", response_model=ScanResponse)
async def get_scan(
    scan_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    scan = db.query(Scan).filter(Scan.scan_id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    resp = ScanResponse.model_validate(scan)
    progress = get_progress(scan_id)
    # In-memory progress can briefly lag the DB right after commit; never regress terminal states.
    if progress and scan.status not in _TERMINAL_SCAN_STATUSES:
        resp.status = progress.get("status", resp.status)
    return resp


@router.get("/{scan_id}/progress")
async def get_scan_progress(
    scan_id: str,
    user: User = Depends(get_current_user),
):
    progress = get_progress(scan_id)
    if not progress:
        return {"status": "unknown", "progress": 0}
    return progress


@router.post("/{scan_id}/abort")
async def abort_scan(
    scan_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    scan = db.query(Scan).filter(Scan.scan_id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status not in ("pending", "running"):
        raise HTTPException(status_code=400, detail="Scan cannot be aborted")

    scan.status = "aborted"
    db.commit()
    return {"message": "Scan abort requested", "scan_id": scan_id}
