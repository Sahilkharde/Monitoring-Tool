from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def migrate_sqlite_schema() -> None:
    """SQLite `create_all` does not add new columns to existing tables; patch older DB files."""
    if "sqlite" not in settings.DATABASE_URL.lower():
        return
    with engine.begin() as conn:
        try:
            rows = conn.execute(text("PRAGMA table_info(scans)")).fetchall()
        except Exception:
            return
        col_names = {row[1] for row in rows}
        if not col_names:
            return
        if "browser_options" not in col_names:
            conn.execute(text("ALTER TABLE scans ADD COLUMN browser_options TEXT"))
        if "scan_group_id" not in col_names:
            conn.execute(text("ALTER TABLE scans ADD COLUMN scan_group_id VARCHAR(64)"))


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
