import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from app.api.v1 import router as api_router
from app.core.config import settings
from app.core.database import Base, engine
import app.models.user  # noqa: F401 - register models with SQLAlchemy metadata

logger = logging.getLogger("splitsure")

app = FastAPI(
    title="SplitSure API",
    description="Smart Expense Split with Proof & Accountability",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if not settings.USE_DEV_OTP:  # Only add HSTS in production
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


# Add security headers middleware BEFORE CORS middleware
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

# ── Local file serving (dev only) ─────────────────────────────────────────────
# When USE_LOCAL_STORAGE=true, uploaded proof files are served from /uploads/...
# In production (USE_LOCAL_STORAGE=false) this route is skipped and S3 is used.
if settings.USE_LOCAL_STORAGE:
    upload_dir = Path(settings.LOCAL_UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

app.include_router(api_router, prefix="/api/v1")


@app.on_event("startup")
async def _security_check():
    if settings.USE_DEV_OTP and settings.SECRET_KEY.startswith("dev-"):
        logger.warning(
            "⚠️  SECURITY WARNING: Running with dev OTP AND dev secret key. "
            "DO NOT use this configuration in production!"
        )


@app.on_event("startup")
async def create_database_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("""
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS push_token VARCHAR(500)
        """))
        await conn.execute(text("""
            CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'audit_logs is append-only and cannot be modified or deleted';
            END;
            $$ LANGUAGE plpgsql;
        """))
        await conn.execute(text("DROP TRIGGER IF EXISTS audit_log_immutable ON audit_logs"))
        await conn.execute(text("""
            CREATE TRIGGER audit_log_immutable
            BEFORE UPDATE OR DELETE ON audit_logs
            FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
        """))


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "version": "1.0.0",
        "storage": "local" if settings.USE_LOCAL_STORAGE else "s3",
        "otp_mode": "dev (returned in response)" if settings.USE_DEV_OTP else "provider",
    }
