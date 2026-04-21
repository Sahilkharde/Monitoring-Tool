from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime


class LoginFlowConfig(BaseModel):
    """Optional Playwright login before scanning the target URL."""

    enabled: bool = False
    login_url: Optional[str] = None
    username: Optional[str] = Field(None, description="Email or username for the login form")
    password: Optional[str] = None
    email_selector: Optional[str] = None
    password_selector: Optional[str] = None
    submit_selector: Optional[str] = None
    post_login_wait_ms: int = 2000


class BrowserScanOptions(BaseModel):
    """Chromium (Playwright) capture: real paint timing, transfer sizes, optional login."""

    use_browser: bool = True
    headless: bool = True
    viewport_width: int = 1365
    viewport_height: int = 900
    user_agent: Optional[str] = None
    navigation_timeout_ms: Optional[int] = None
    login: Optional[LoginFlowConfig] = None
    #: When True, skip Google PageSpeed Insights (can take 60–120s) and use local snapshot/HTTP analysis.
    fast_scan: bool = False


class ScanRequest(BaseModel):
    target_url: str
    platform: str = "both"
    agents: List[str] = ["security", "performance", "code-quality"]
    browser_options: Optional[BrowserScanOptions] = None


class ScanResponse(BaseModel):
    scan_id: str
    target_url: str
    platform: str
    scan_group_id: Optional[str] = None
    agents: List[str]
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    security_score: Optional[float] = None
    performance_score: Optional[float] = None
    code_quality_score: Optional[float] = None
    overall_score: Optional[float] = None
    security_results: Optional[dict] = None
    performance_results: Optional[dict] = None
    code_quality_results: Optional[dict] = None
    findings: Optional[List[dict]] = None
    recommendations: Optional[List[dict]] = None
    regressions: Optional[List[dict]] = None

    class Config:
        from_attributes = True


class ScanListResponse(BaseModel):
    scans: List[ScanResponse]
    total: int


class ScanStartResponse(BaseModel):
    """POST /scans returns one or two rows when platform is ``both`` (desktop + mweb)."""

    scans: List[ScanResponse]


class ScheduleRequest(BaseModel):
    target_url: str
    cron_expression: str = "0 2 * * *"
    timezone: str = "Asia/Kolkata"
    enabled: bool = True
    agents: List[str] = ["security", "performance", "code-quality"]
    platform: str = "both"


class ThresholdRequest(BaseModel):
    overall: float = 95.0
    security: float = 90.0
    performance: float = 95.0
    code_quality: float = 85.0


class NotificationRequest(BaseModel):
    slack_enabled: bool = False
    email_enabled: bool = False
    jira_enabled: bool = False
    slack_webhook: Optional[str] = None
    email_recipients: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    mode: str = "developer"
    session_id: Optional[str] = None
    context_url: Optional[str] = None
    context_score: Optional[float] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
