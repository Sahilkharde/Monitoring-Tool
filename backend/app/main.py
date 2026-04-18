from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.core.database import engine, Base, SessionLocal, migrate_sqlite_schema
from app.core.security import get_password_hash
from app.models.user import User
from app.models.scan import Scan, ScanSchedule, KPIThreshold, NotificationSettings, WebhookLog, ChatMessage

from app.api.auth import router as auth_router
from app.api.scans import router as scans_router
from app.api.control import router as control_router
from app.api.reports import router as reports_router
from app.api.competition import router as competition_router
from app.api.chat import router as chat_router


def _migrate_legacy_admin_email(db: Session, old_email: str, new_email: str) -> None:
    """One-time: rename seeded admin if DB still has the old address."""
    if db.query(User).filter(User.email == new_email).first():
        return
    legacy = db.query(User).filter(User.email == old_email).first()
    if legacy:
        legacy.email = new_email
        db.commit()


def _seed_users(db: Session) -> None:
    _migrate_legacy_admin_email(db, "admin@vzy.com", "amudha.kaliamoorthi@horizonind.org")

    defaults = [
        {
            "email": "amudha.kaliamoorthi@horizonind.org",
            "name": "Admin User",
            "password": "Admin@2026",
            "role": "admin",
        },
        {
            "email": "devops@vzy.com",
            "name": "DevOps Engineer",
            "password": "DevOps@2026",
            "role": "devops",
        },
        {
            "email": "dev@vzy.com",
            "name": "Developer",
            "password": "Dev@2026",
            "role": "developer",
        },
        {
            "email": "exec@vzy.com",
            "name": "Executive",
            "password": "Exec@2026",
            "role": "executive",
        },
    ]
    for u in defaults:
        if not db.query(User).filter(User.email == u["email"]).first():
            db.add(
                User(
                    email=u["email"],
                    name=u["name"],
                    hashed_password=get_password_hash(u["password"]),
                    role=u["role"],
                )
            )
    db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    migrate_sqlite_schema()
    db = SessionLocal()
    try:
        _seed_users(db)
    finally:
        db.close()
    print(f"\n  {settings.APP_NAME} backend running at http://0.0.0.0:8000\n")
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(scans_router)
app.include_router(control_router)
app.include_router(reports_router)
app.include_router(competition_router)
app.include_router(chat_router)


@app.get("/")
async def root():
    return {"name": settings.APP_NAME, "version": "1.0.0", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/api/ping")
async def api_ping():
    """Sanity check that the browser / proxy is talking to this API (not a static 404)."""
    return {"ok": True, "service": settings.APP_NAME}
