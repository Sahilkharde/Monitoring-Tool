from sqlalchemy import Column, Integer, String, DateTime, Float, JSON, Boolean, Text
from datetime import datetime, timezone

from app.core.database import Base


class Scan(Base):
    __tablename__ = "scans"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(String(255), unique=True, index=True, nullable=False)
    target_url = Column(String(1024), nullable=False)
    platform = Column(String(50), default="both")
    agents = Column(JSON, default=list)
    browser_options = Column(JSON, nullable=True)
    status = Column(String(50), default="pending")
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)
    duration_ms = Column(Integer, nullable=True)

    security_score = Column(Float, nullable=True)
    performance_score = Column(Float, nullable=True)
    code_quality_score = Column(Float, nullable=True)
    overall_score = Column(Float, nullable=True)

    security_results = Column(JSON, nullable=True)
    performance_results = Column(JSON, nullable=True)
    code_quality_results = Column(JSON, nullable=True)

    findings = Column(JSON, default=list)
    recommendations = Column(JSON, default=list)
    regressions = Column(JSON, default=list)

    user_id = Column(Integer, nullable=True)
    is_competition = Column(Boolean, default=False)


class ScanSchedule(Base):
    __tablename__ = "scan_schedules"

    id = Column(Integer, primary_key=True, index=True)
    target_url = Column(String(1024), nullable=False)
    cron_expression = Column(String(100), default="0 2 * * *")
    timezone = Column(String(100), default="Asia/Kolkata")
    enabled = Column(Boolean, default=True)
    agents = Column(JSON, default=list)
    platform = Column(String(50), default="both")
    user_id = Column(Integer, nullable=True)


class KPIThreshold(Base):
    __tablename__ = "kpi_thresholds"

    id = Column(Integer, primary_key=True, index=True)
    overall = Column(Float, default=95.0)
    security = Column(Float, default=90.0)
    performance = Column(Float, default=95.0)
    code_quality = Column(Float, default=85.0)
    user_id = Column(Integer, nullable=True)


class NotificationSettings(Base):
    __tablename__ = "notification_settings"

    id = Column(Integer, primary_key=True, index=True)
    slack_enabled = Column(Boolean, default=False)
    email_enabled = Column(Boolean, default=False)
    jira_enabled = Column(Boolean, default=False)
    slack_webhook = Column(String(512), nullable=True)
    email_recipients = Column(String(1024), nullable=True)
    jira_config = Column(JSON, nullable=True)
    user_id = Column(Integer, nullable=True)


class WebhookLog(Base):
    __tablename__ = "webhook_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    event = Column(String(255), nullable=False)
    source = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False)
    payload = Column(JSON, nullable=True)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(255), index=True, nullable=False)
    role = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    mode = Column(String(50), default="developer")
    context_url = Column(String(1024), nullable=True)
    context_score = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    user_id = Column(Integer, nullable=True)
