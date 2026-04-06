from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api.v1 import router as api_router
from app.core.config import settings

app = FastAPI(
    title="SplitSure API",
    description="Smart Expense Split with Proof & Accountability",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Local file serving (dev only) ─────────────────────────────────────────────
# When USE_LOCAL_STORAGE=true, uploaded proof files are served from /uploads/...
# In production (USE_LOCAL_STORAGE=false) this route is skipped and S3 is used.
if settings.USE_LOCAL_STORAGE:
    upload_dir = Path(settings.LOCAL_UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "version": "1.0.0",
        "storage": "local" if settings.USE_LOCAL_STORAGE else "s3",
        "otp_mode": "dev (returned in response)" if settings.USE_DEV_OTP else "sms (twilio)",
    }

