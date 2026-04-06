from datetime import datetime, timedelta, timezone
import random
import hashlib
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import (
    create_access_token, create_refresh_token, decode_token,
    blacklist_token, get_current_user, bearer_scheme
)
from app.core.config import settings
from app.models.user import User, OTPRecord
from app.schemas.schemas import OTPRequest, OTPVerify, TokenResponse, UserOut, RefreshRequest

router = APIRouter(prefix="/auth", tags=["auth"])


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


async def _check_rate_limit(db: AsyncSession, phone: str):
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    result = await db.execute(
        select(OTPRecord)
        .where(OTPRecord.phone == phone)
        .where(OTPRecord.created_at >= one_hour_ago)
    )
    count = len(result.scalars().all())
    if count >= settings.OTP_MAX_REQUESTS_PER_HOUR:
        raise HTTPException(429, "Too many OTP requests. Try again in an hour.")


def _send_otp_sms(phone: str, otp: str):
    """Send OTP via Twilio. Only called when USE_DEV_OTP=false."""
    if not all([
        settings.TWILIO_ACCOUNT_SID,
        settings.TWILIO_AUTH_TOKEN,
        settings.TWILIO_PHONE_NUMBER,
    ]):
        raise HTTPException(500, "Twilio SMS is not configured")

    from twilio.rest import Client
    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    client.messages.create(
        to=phone,
        from_=settings.TWILIO_PHONE_NUMBER,
        body=f"Your SplitSure OTP is {otp}. Valid for {settings.OTP_EXPIRE_MINUTES} minutes.",
    )


@router.post("/send-otp")
async def send_otp(body: OTPRequest, db: AsyncSession = Depends(get_db)):
    await _check_rate_limit(db, body.phone)

    otp = str(random.randint(100000, 999999))
    otp_hash = _hash_otp(otp)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    record = OTPRecord(phone=body.phone, otp_hash=otp_hash, expires_at=expires_at)
    db.add(record)
    await db.commit()

    if settings.USE_DEV_OTP:
        # ── DEV MODE ─────────────────────────────────────────────────
        # OTP returned directly in response. No SMS sent.
        # Remove / set USE_DEV_OTP=false in production.
        return {
            "message": "OTP generated (dev mode — no SMS sent)",
            "dev_otp": otp,
            "dev_note": "Set USE_DEV_OTP=false and configure Twilio to enable real SMS",
        }
    else:
        # ── PRODUCTION MODE ───────────────────────────────────────────
        try:
            _send_otp_sms(body.phone, otp)
        except Exception as e:
            raise HTTPException(500, f"Failed to send SMS: {str(e)}")
        return {"message": "OTP sent via SMS"}


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
    if not user:
        user = User(phone=body.phone)
        db.add(user)

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
):
    blacklist_token(credentials.credentials)
    return {"message": "Logged out successfully"}
