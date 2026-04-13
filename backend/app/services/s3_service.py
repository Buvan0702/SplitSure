"""
Storage service — local filesystem in dev, AWS S3 in production.

Switch via config:
  USE_LOCAL_STORAGE=true   → saves files under LOCAL_UPLOAD_DIR, serves via /uploads/...
  USE_LOCAL_STORAGE=false  → uses AWS S3 with pre-signed URLs (production)
"""
import hashlib
import uuid
import os
import shutil
from pathlib import Path
from typing import Tuple

from fastapi import UploadFile, HTTPException
from fastapi.staticfiles import StaticFiles

from app.core.config import settings

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "application/pdf"}
MAX_FILE_SIZE = settings.MAX_FILE_SIZE_MB * 1024 * 1024

# Ensure local upload directory exists at startup
_upload_root = Path(settings.LOCAL_UPLOAD_DIR)
_upload_root.mkdir(parents=True, exist_ok=True)


# ── Local Storage ─────────────────────────────────────────────────────────────

async def _local_upload(content: bytes, s3_key: str, mime_type: str) -> str:
    """Save file to local disk. Returns the s3_key (used as relative path)."""
    dest = _upload_root / s3_key
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)
    return s3_key


def _local_url(s3_key: str) -> str:
    """Build a direct URL for a locally stored file."""
    return f"{settings.LOCAL_BASE_URL.rstrip('/')}/uploads/{s3_key}"


def _local_delete(s3_key: str):
    path = _upload_root / s3_key
    if path.exists():
        path.unlink()


# ── S3 Storage (production) ───────────────────────────────────────────────────

def _get_s3_client():
    import boto3
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )


async def _s3_upload(content: bytes, s3_key: str, mime_type: str) -> str:
    from botocore.exceptions import ClientError
    try:
        _get_s3_client().put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=s3_key,
            Body=content,
            ContentType=mime_type,
            ServerSideEncryption="AES256",
        )
    except ClientError as e:
        raise HTTPException(500, f"S3 upload failed: {e.response['Error']['Message']}")
    return s3_key


def _s3_presigned_url(s3_key: str) -> str:
    from botocore.exceptions import ClientError
    try:
        return _get_s3_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET_NAME, "Key": s3_key},
            ExpiresIn=settings.S3_PRESIGNED_URL_EXPIRY,
        )
    except ClientError:
        return ""


# ── Public API (used by expenses.py) ─────────────────────────────────────────

async def upload_proof(
    file: UploadFile,
    expense_id: int,
    uploader_id: int,
) -> Tuple[str, str, int]:
    """
    Upload a proof attachment. Returns (storage_key, file_hash).
    storage_key is a relative path used in both local and S3 modes.
    """
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}. Allowed: JPEG, PNG, PDF")

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"File size {len(content)//1024}KB exceeds {settings.MAX_FILE_SIZE_MB}MB limit")

    # Hash computed server-side to prevent tampering
    file_hash = hashlib.sha256(content).hexdigest()

    ext = (file.filename or "file").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    s3_key = f"proofs/expense_{expense_id}/{uuid.uuid4().hex}.{ext}"

    if settings.USE_LOCAL_STORAGE:
        await _local_upload(content, s3_key, file.content_type or "application/octet-stream")
    else:
        await _s3_upload(content, s3_key, file.content_type or "application/octet-stream")

    return s3_key, file_hash, len(content)


def generate_presigned_url(s3_key: str) -> str:
    """
    Return a URL to view the stored file.
    Local: direct static file URL.
    S3: time-limited pre-signed URL.
    """
    if settings.USE_LOCAL_STORAGE:
        return _local_url(s3_key)
    return _s3_presigned_url(s3_key)


def delete_proof(s3_key: str):
    """
    Soft-delete is the default (files are retained for audit).
    Hard delete only called explicitly if needed.
    """
    if settings.USE_LOCAL_STORAGE:
        _local_delete(s3_key)
    # S3: no-op — retain files per audit policy
