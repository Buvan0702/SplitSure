from datetime import datetime, timedelta, timezone
import random
import hashlib
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
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


def _phone_without_plus(phone: str) -> str:
    return phone.lstrip("+").replace(" ", "")


async def _send_otp_via_msg91(phone: str, otp: str):
    """Send OTP via MSG91 SendOTP."""
    if not all([settings.MSG91_AUTHKEY, settings.MSG91_TEMPLATE_ID]):
        raise HTTPException(500, "MSG91 SMS is not configured")

    params = {
        "template_id": settings.MSG91_TEMPLATE_ID,
        "mobile": _phone_without_plus(phone),
        "authkey": settings.MSG91_AUTHKEY,
        "otp": otp,
        "otp_expiry": settings.OTP_EXPIRE_MINUTES,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://control.msg91.com/api/v5/otp",
            params=params,
            json={},
        )

    try:
        payload = response.json()
    except ValueError:
        payload = {"message": response.text}

    if response.status_code >= 400 or payload.get("type") != "success":
        message = payload.get("message") or payload.get("error") or response.text
        status_code = response.status_code if response.status_code >= 400 else status.HTTP_502_BAD_GATEWAY
        raise HTTPException(status_code, f"MSG91 SMS failed: {message}")


async def _send_otp_sms(phone: str, otp: str):
    provider = settings.SMS_PROVIDER.lower().strip()
    if provider == "msg91":
        await _send_otp_via_msg91(phone, otp)
        return
    raise HTTPException(500, f"Unsupported SMS provider: {settings.SMS_PROVIDER}")


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
            "dev_note": "Set USE_DEV_OTP=false and configure MSG91 to enable real SMS",
        }
    else:
        # ── PRODUCTION MODE ───────────────────────────────────────────
        try:
            await _send_otp_sms(body.phone, otp)
        except HTTPException:
            raise
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
