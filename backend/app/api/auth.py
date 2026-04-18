from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_roles
from app.core.security import verify_password, get_password_hash, create_access_token
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserResponse, UserCreate, UserSignupRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _public_signup_allowed() -> bool:
    return settings.ALLOW_PUBLIC_REGISTRATION or settings.DEBUG


@router.get("/registration-status")
async def registration_status():
    """Frontend can show Sign up only when registration is open."""
    return {"open": _public_signup_allowed()}


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: Session = Depends(get_db)):
    email = _normalize_email(body.email)
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Use a seeded account from the README, or sign up if your server allows it.",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    user.last_login = datetime.now(timezone.utc)
    db.commit()

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: UserSignupRequest, db: Session = Depends(get_db)):
    if not _public_signup_allowed():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public signup is disabled. Set ALLOW_PUBLIC_REGISTRATION=true or DEBUG=true, or ask an admin to create your account.",
        )
    email = _normalize_email(body.email)
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=email,
        name=body.name.strip() or email.split("@")[0],
        hashed_password=get_password_hash(body.password),
        role="developer",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    email = _normalize_email(body.email)
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=email,
        name=body.name,
        hashed_password=get_password_hash(body.password),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)
