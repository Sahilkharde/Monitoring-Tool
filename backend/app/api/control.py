import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.scan import ScanSchedule, KPIThreshold, NotificationSettings, WebhookLog
from app.schemas.scan import ScheduleRequest, ThresholdRequest, NotificationRequest

router = APIRouter(prefix="/api/control", tags=["control"])

_start_time = time.time()


@router.get("/schedule")
async def get_schedule(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    schedule = db.query(ScanSchedule).first()
    if not schedule:
        return {"data": None}
    return {
        "data": {
            "id": schedule.id,
            "target_url": schedule.target_url,
            "cron_expression": schedule.cron_expression,
            "timezone": schedule.timezone,
            "enabled": schedule.enabled,
            "agents": schedule.agents,
            "platform": schedule.platform,
        }
    }


@router.post("/schedule")
async def save_schedule(
    body: ScheduleRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    schedule = db.query(ScanSchedule).first()
    if schedule:
        schedule.target_url = body.target_url
        schedule.cron_expression = body.cron_expression
        schedule.timezone = body.timezone
        schedule.enabled = body.enabled
        schedule.agents = body.agents
        schedule.platform = body.platform
        schedule.user_id = user.id
    else:
        schedule = ScanSchedule(
            target_url=body.target_url,
            cron_expression=body.cron_expression,
            timezone=body.timezone,
            enabled=body.enabled,
            agents=body.agents,
            platform=body.platform,
            user_id=user.id,
        )
        db.add(schedule)
    db.commit()
    return {"message": "Schedule saved"}


@router.get("/thresholds")
async def get_thresholds(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    t = db.query(KPIThreshold).first()
    if not t:
        return {"data": {"overall": 95, "security": 90, "performance": 95, "code_quality": 85}}
    return {
        "data": {
            "overall": t.overall,
            "security": t.security,
            "performance": t.performance,
            "code_quality": t.code_quality,
        }
    }


@router.post("/thresholds")
async def save_thresholds(
    body: ThresholdRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    t = db.query(KPIThreshold).first()
    if t:
        t.overall = body.overall
        t.security = body.security
        t.performance = body.performance
        t.code_quality = body.code_quality
        t.user_id = user.id
    else:
        t = KPIThreshold(
            overall=body.overall,
            security=body.security,
            performance=body.performance,
            code_quality=body.code_quality,
            user_id=user.id,
        )
        db.add(t)
    db.commit()
    return {"message": "Thresholds saved"}


@router.get("/notifications")
async def get_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    n = db.query(NotificationSettings).first()
    if not n:
        return {"data": {"slack_enabled": False, "email_enabled": False, "jira_enabled": False}}
    return {
        "data": {
            "slack_enabled": n.slack_enabled,
            "email_enabled": n.email_enabled,
            "jira_enabled": n.jira_enabled,
            "slack_webhook": n.slack_webhook,
            "email_recipients": n.email_recipients,
        }
    }


@router.post("/notifications")
async def save_notifications(
    body: NotificationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    n = db.query(NotificationSettings).first()
    if n:
        n.slack_enabled = body.slack_enabled
        n.email_enabled = body.email_enabled
        n.jira_enabled = body.jira_enabled
        n.slack_webhook = body.slack_webhook
        n.email_recipients = body.email_recipients
        n.user_id = user.id
    else:
        n = NotificationSettings(
            slack_enabled=body.slack_enabled,
            email_enabled=body.email_enabled,
            jira_enabled=body.jira_enabled,
            slack_webhook=body.slack_webhook,
            email_recipients=body.email_recipients,
            user_id=user.id,
        )
        db.add(n)
    db.commit()
    return {"message": "Notification settings saved"}


@router.get("/webhooks")
async def list_webhooks(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    total = db.query(WebhookLog).count()
    logs = (
        db.query(WebhookLog)
        .order_by(WebhookLog.timestamp.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {
        "data": [
            {
                "id": l.id,
                "timestamp": l.timestamp.isoformat() if l.timestamp else None,
                "event": l.event,
                "source": l.source,
                "status": l.status,
                "payload": l.payload,
            }
            for l in logs
        ],
        "total": total,
    }


@router.get("/health")
async def health_check(db: Session = Depends(get_db)):
    uptime = int(time.time() - _start_time)
    try:
        db.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"

    return {
        "status": "healthy",
        "uptime_seconds": uptime,
        "database": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
