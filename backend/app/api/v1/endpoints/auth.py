from datetime import datetime, timedelta, timezone
import secrets
import hashlib
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.security import (
    create_access_token, create_refresh_token, decode_token,
    blacklist_token, get_current_user, bearer_scheme
)
from app.core.config import settings
from app.models.user import User, OTPRecord
from app.schemas.schemas import OTPRequest, OTPVerify, TokenResponse, UserOut, RefreshRequest, RegisterRequest

router = APIRouter(prefix="/auth", tags=["auth"])


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


def _is_registered_user(user: User) -> bool:
    return bool(user.name and user.email)


async def _check_rate_limit(db: AsyncSession, phone: str):
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    result = await db.execute(
        select(func.count(OTPRecord.id))
        .where(OTPRecord.phone == phone)
        .where(OTPRecord.created_at >= one_hour_ago)
    )
    count = result.scalar() or 0
    if count >= settings.OTP_MAX_REQUESTS_PER_HOUR:
        raise HTTPException(429, "Too many OTP requests. Try again in an hour.")


logger = logging.getLogger("splitsure.auth")


async def _send_sms_otp(phone: str, otp: str):
    import httpx
    from app.core.config import settings
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "https://api.msg91.com/api/v5/otp",
                json={
                    "template_id": settings.MSG91_TEMPLATE_ID,
                    "mobile": phone.lstrip("+"),
                    "authkey": settings.MSG91_AUTH_KEY,
                    "otp": otp,
                },
                timeout=10.0,
            )
    except httpx.RequestError as e:
        logger.error(f"SMS delivery failed for phone {phone[-4:]}: {e}")


@router.post("/register", response_model=UserOut, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing_email_q = await db.execute(select(User).where(User.email == body.email))
    existing_email_user = existing_email_q.scalar_one_or_none()

    existing_phone_q = await db.execute(select(User).where(User.phone == body.phone))
    existing_phone_user = existing_phone_q.scalar_one_or_none()

    if existing_phone_user and _is_registered_user(existing_phone_user):
        raise HTTPException(409, "Phone number is already registered")

    if existing_email_user:
        if not existing_phone_user or existing_email_user.id != existing_phone_user.id:
            raise HTTPException(409, "Email is already in use")

    if existing_phone_user:
        existing_phone_user.name = body.name
        existing_phone_user.email = body.email
        await db.commit()
        await db.refresh(existing_phone_user)
        return UserOut.model_validate(existing_phone_user)

    user = User(phone=body.phone, name=body.name, email=body.email)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/send-otp")
async def send_otp(body: OTPRequest, db: AsyncSession = Depends(get_db)):
    user_result = await db.execute(select(User).where(User.phone == body.phone))
    user = user_result.scalar_one_or_none()
    if not user or not _is_registered_user(user):
        raise HTTPException(404, "Phone number not registered. Please sign up first.")

    await _check_rate_limit(db, body.phone)

    otp = f"{secrets.randbelow(900000) + 100000}"
    otp_hash = _hash_otp(otp)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    record = OTPRecord(phone=body.phone, otp_hash=otp_hash, expires_at=expires_at)
    db.add(record)
    await db.commit()

    if not settings.USE_DEV_OTP:
        return {
            "message": "OTP generated",
        }

    return {
        "message": "OTP generated (dev mode — no SMS sent)",
        "dev_otp": otp,
        "dev_note": "Development mode returns OTP directly in the API response.",
    }


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(body: OTPVerify, db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(OTPRecord)
        .where(OTPRecord.phone == body.phone)
        .where(OTPRecord.otp_hash == _hash_otp(body.otp))
        .where(OTPRecord.is_used == False)
        .where(OTPRecord.expires_at > now)
        .order_by(OTPRecord.created_at.desc())
    )
    record = result.scalars().first()
    if not record:
        raise HTTPException(400, "Invalid or expired OTP")

    record.is_used = True

    result = await db.execute(select(User).where(User.phone == body.phone))
    user = result.scalar_one_or_none()
    if not user or not _is_registered_user(user):
        raise HTTPException(404, "Phone number not registered. Please sign up first.")

    await db.commit()
    await db.refresh(user)

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(401, "Invalid token type")

    result = await db.execute(select(User).where(User.id == int(payload["sub"])))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "User not found")

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


@router.post("/logout")
async def logout(
    credentials=Depends(bearer_scheme),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await blacklist_token(credentials.credentials, db)
    return {"message": "Logged out successfully"}
