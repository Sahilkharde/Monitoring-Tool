from pathlib import Path
from typing import Any, Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Always load backend/.env first so `uvicorn` can be started from repo root or backend/.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
# Single SQLite file under backend/, independent of shell cwd (avoids duplicate DBs).
_DEFAULT_SQLITE_URL = "sqlite:///" + (_BACKEND_DIR / "vzy_agent.db").resolve().as_posix()


class Settings(BaseSettings):
    APP_NAME: str = "Horizon Verification Agent"
    DEBUG: bool = True

    # Public POST /api/auth/signup is allowed when this is True OR DEBUG is True.
    ALLOW_PUBLIC_REGISTRATION: bool = False

    DATABASE_URL: str = _DEFAULT_SQLITE_URL
    REDIS_URL: str = "redis://localhost:6379/0"

    SECRET_KEY: str = "vzy-ott-agent-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # AI Chat: Gemini (Google). Use GEMINI_API_KEY or GOOGLE_API_KEY (Google accepts both names).
    GEMINI_API_KEY: Optional[str] = None
    GOOGLE_API_KEY: Optional[str] = None
    # Consumer API: unversioned gemini-1.5-flash often 404s; 2.x flash is widely available.
    GEMINI_MODEL: str = "gemini-2.0-flash"

    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o"

    # Real Lighthouse in Google cloud: PageSpeed Insights API v5 (see services/pagespeed_insights.py).
    # Create a key in Google Cloud Console and enable "PageSpeed Insights API".
    GOOGLE_PAGESPEED_API_KEY: Optional[str] = None
    # When True (default), performance scans use PageSpeed first if GOOGLE_PAGESPEED_API_KEY is set.
    USE_PAGESPEED_INSIGHTS: bool = True

    @field_validator("GEMINI_API_KEY", "GOOGLE_API_KEY", mode="before")
    @classmethod
    def normalize_google_api_keys(cls, v: Any) -> Optional[str]:
        if v is None or not isinstance(v, str):
            return v
        k = v.strip()
        if k.lower().startswith("gemini:"):
            k = k.split(":", 1)[-1].strip()
        return k.lstrip("-").strip() or None

    SCAN_TIMEOUT_SECONDS: int = 300
    MAX_CONCURRENT_SCANS: int = 3

    LIGHTHOUSE_CHROMIUM_PATH: Optional[str] = None

    # Playwright (Chromium) for real navigation, Core Web Vitals, optional login
    USE_BROWSER_SCAN: bool = True
    PLAYWRIGHT_TIMEOUT_MS: int = 45000

    model_config = SettingsConfigDict(
        env_file=(str(_BACKEND_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
