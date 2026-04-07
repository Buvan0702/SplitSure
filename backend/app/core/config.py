from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://splitsure:splitsure_dev@localhost:5432/splitsure"

    # Security
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440   # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── Local File Storage (replaces AWS S3 for development) ──────────
    # Files are saved to LOCAL_UPLOAD_DIR on disk.
    # Set USE_LOCAL_STORAGE=false and fill AWS_* vars when ready for production.
    USE_LOCAL_STORAGE: bool = True
    LOCAL_UPLOAD_DIR: str = "uploads"          # relative to backend root
    LOCAL_BASE_URL: str = "http://localhost:8000"  # used to build download URLs

    # AWS S3 (leave empty while using local storage)
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"
    S3_BUCKET_NAME: str = "splitsure-proofs"
    S3_PRESIGNED_URL_EXPIRY: int = 900         # 15 minutes

    # OTP
    # Dev mode returns OTP in the API response instead of sending SMS.
    USE_DEV_OTP: bool = True
    OTP_EXPIRE_MINUTES: int = 10
    OTP_MAX_REQUESTS_PER_HOUR: int = 20

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:19006",
        "http://10.0.2.2:8000",   # Android emulator → host machine
    ]

    # App limits
    MAX_GROUP_MEMBERS: int = 50
    MAX_ATTACHMENTS_PER_EXPENSE: int = 5
    MAX_FILE_SIZE_MB: int = 5
    INVITE_LINK_EXPIRE_HOURS: int = 72
    INVITE_LINK_MAX_USES: int = 10

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
