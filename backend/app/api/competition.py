import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.scans import _run_scan_background
from app.core.database import get_db, SessionLocal
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.scan import Scan

router = APIRouter(prefix="/api/competition", tags=["competition"])


@router.get("/urls")
async def list_competition_urls(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    scans = (
        db.query(Scan)
        .filter(Scan.is_competition == True)
        .order_by(Scan.completed_at.desc())
        .all()
    )

    seen: dict[str, dict] = {}
    for s in scans:
        if s.target_url not in seen:
            seen[s.target_url] = {
                "id": s.id,
                "scan_id": s.scan_id,
                "url": s.target_url,
                "overall_score": s.overall_score,
                "security_score": s.security_score,
                "performance_score": s.performance_score,
                "code_quality_score": s.code_quality_score,
                "status": s.status,
                "last_scanned": s.completed_at.isoformat() if s.completed_at else None,
            }

    return {"data": list(seen.values())}


@router.post("/scan")
async def scan_competitor(
    body: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    target_url = body.get("target_url")
    if not target_url:
        raise HTTPException(status_code=400, detail="target_url is required")

    scan_id = f"comp-{uuid.uuid4().hex[:12]}"
    scan = Scan(
        scan_id=scan_id,
        target_url=target_url,
        platform=body.get("platform", "both"),
        agents=body.get("agents", ["security", "performance", "code-quality"]),
        status="pending",
        user_id=user.id,
        is_competition=True,
    )
    db.add(scan)
    db.commit()

    background_tasks.add_task(_run_scan_background, scan_id)

    return {"message": "Competition scan started", "scan_id": scan_id}


@router.post("/rescan-all")
async def rescan_all(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    latest = (
        db.query(Scan)
        .filter(Scan.is_competition == True)
        .order_by(Scan.completed_at.desc())
        .all()
    )

    urls_seen: set[str] = set()
    scan_ids: list[str] = []

    for s in latest:
        if s.target_url in urls_seen:
            continue
        urls_seen.add(s.target_url)

        scan_id = f"comp-{uuid.uuid4().hex[:12]}"
        new_scan = Scan(
            scan_id=scan_id,
            target_url=s.target_url,
            platform=s.platform or "both",
            agents=s.agents or ["security", "performance", "code-quality"],
            status="pending",
            user_id=user.id,
            is_competition=True,
        )
        db.add(new_scan)
        scan_ids.append(scan_id)

    db.commit()

    for sid in scan_ids:
        background_tasks.add_task(_run_scan_background, sid)

    return {"message": f"Re-scanning {len(scan_ids)} URLs", "scan_ids": scan_ids}


@router.delete("/urls/{url_id}")
async def delete_competition_url(
    url_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    scan = db.query(Scan).filter(Scan.id == url_id, Scan.is_competition == True).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Competition URL not found")

    target_url = scan.target_url
    db.query(Scan).filter(Scan.target_url == target_url, Scan.is_competition == True).delete()
    db.commit()
    return {"message": f"Deleted all scans for {target_url}"}
