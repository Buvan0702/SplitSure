import hashlib
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.models.user import User
from app.schemas.schemas import UserOut, UserUpdate, PhoneCheckRequest, PhoneCheckResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.name is not None:
        current_user.name = body.name
    if body.email is not None:
        current_user.email = body.email
    if body.upi_id is not None:
        current_user.upi_id = body.upi_id

    logger = logging.getLogger("splitsure.users")

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Email is already in use")
    except SQLAlchemyError as e:
        await db.rollback()
        logger.error(f"Database error updating user {current_user.id}: {e}")
        raise HTTPException(500, "An unexpected database error occurred")

    await db.refresh(current_user)
    return current_user


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a profile avatar image (JPEG, PNG, or WebP, max 2MB)."""
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Avatar must be JPEG, PNG, or WebP")

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(400, "Avatar must be under 2MB")

    file_hash = hashlib.sha256(content).hexdigest()
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    s3_key = f"avatars/user_{current_user.id}/{file_hash[:12]}.{ext}"

    if settings.USE_LOCAL_STORAGE:
        dest = Path(settings.LOCAL_UPLOAD_DIR) / s3_key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
        avatar_url = f"{settings.LOCAL_BASE_URL.rstrip('/')}/uploads/{s3_key}"
    else:
        from app.services.s3_service import _s3_upload
        await _s3_upload(content, s3_key, file.content_type or "image/jpeg")
        avatar_url = f"https://{settings.S3_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}"

    current_user.avatar_url = avatar_url
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/me/push-token")
async def register_push_token(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register an Expo push notification token for the current user."""
    token = body.get("push_token")
    if not token:
        raise HTTPException(400, "push_token is required")

    current_user.push_token = token
    await db.commit()
    return {"status": "ok"}


@router.post("/check-phone", response_model=PhoneCheckResponse)
async def check_phone_registered(
    body: PhoneCheckRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if a phone number is registered in the system."""
    result = await db.execute(select(User).where(User.phone == body.phone))
    user = result.scalar_one_or_none()

    if user:
        return PhoneCheckResponse(registered=True, user_name=user.name)
    return PhoneCheckResponse(registered=False, user_name=None)
