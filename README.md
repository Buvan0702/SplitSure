# SplitSure 🔐

**Smart Expense Split with Proof & Accountability**

> Every expense traceable. Every settlement mutually confirmed. Every modification permanently logged.

---

## Architecture Overview

```
SplitSure/
├── backend/           # FastAPI + PostgreSQL
│   ├── app/
│   │   ├── api/v1/endpoints/
│   │   │   ├── auth.py          # OTP send/verify, JWT, refresh, logout
│   │   │   ├── users.py         # Profile CRUD
│   │   │   ├── groups.py        # Group + member management, invite links
│   │   │   ├── expenses.py      # Expense CRUD + proof attachments
│   │   │   ├── settlements.py   # Balance engine, initiate/confirm/dispute
│   │   │   ├── audit.py         # Immutable audit log viewer
│   │   │   └── reports.py       # PDF generation (Pro tier)
│   │   ├── core/
│   │   │   ├── config.py        # Settings (DB, JWT, S3, Twilio)
│   │   │   ├── database.py      # Async SQLAlchemy
│   │   │   └── security.py      # JWT utils, get_current_user
│   │   ├── models/user.py       # All 9 SQLAlchemy models
│   │   ├── schemas/schemas.py   # All Pydantic v2 schemas
│   │   └── services/
│   │       ├── settlement_engine.py  # Greedy algorithm (paise arithmetic)
│   │       ├── audit_service.py      # Append-only audit logger
│   │       └── s3_service.py         # Upload, hash, presigned URLs
│   ├── alembic/versions/001_initial.py  # Full schema + audit trigger
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/          # React Native (Expo Router)
│   ├── app/
│   │   ├── _layout.tsx           # Root layout, QueryClient, Toast
│   │   ├── login.tsx             # Auth screen
│   │   ├── (tabs)/               # Bottom tab navigator
│   │   │   ├── index.tsx         # Groups home
│   │   │   └── profile.tsx       # User profile
│   │   ├── group/[id].tsx        # Group detail (tabbed)
│   │   ├── expense/[id].tsx      # Expense detail + proof
│   │   ├── add-expense.tsx       # Add expense modal
│   │   ├── balances.tsx          # Balance summary + UPI pay
│   │   ├── settlements.tsx       # Settlement history + confirm
│   │   └── audit.tsx             # Audit trail timeline
│   └── src/
│       ├── screens/              # All screen components
│       ├── components/ui.tsx     # Button, Card, Input, Avatar, Badge
│       ├── services/api.ts       # Axios client + all API calls
│       ├── store/authStore.ts    # Zustand auth store
│       ├── types/index.ts        # TypeScript types
│       └── utils/
│           ├── theme.ts          # Colors, Typography, Spacing
│           └── helpers.ts        # formatRupees, timeAgo, etc.
└── docker-compose.yml
```

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ and npm
- Expo CLI (`npm install -g expo-cli`)

### 1. Backend

```bash
cd splitsure

# Copy and configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your AWS, Twilio keys

# Start services
docker-compose up -d

# Run database migrations (includes audit log immutability trigger)
docker-compose exec api alembic upgrade head

# API available at: http://localhost:8000
# Swagger docs at:  http://localhost:8000/docs
```

### 2. Frontend

```bash
cd splitsure/frontend

# Install dependencies
npm install

# Set API URL (create .env file)
echo "EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1" > .env

# Start Expo
npx expo start

# Press 'a' for Android emulator, 'i' for iOS simulator
# Or scan QR code with Expo Go app
```

---

## Environment Variables

### Backend (`backend/.env`)

```env
DATABASE_URL=postgresql+asyncpg://splitsure:splitsure_dev@localhost:5432/splitsure
SECRET_KEY=your-very-long-random-secret-key
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_REGION=ap-south-1
S3_BUCKET_NAME=splitsure-proofs
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890
```

### Frontend (`frontend/.env`)

```env
EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1
```

---

## Key Design Decisions

### 💰 Amounts in Paise
All monetary values are stored and computed as integers (paise) to avoid floating point errors. Display layer converts: `paise / 100`.

### 🔒 Immutable Audit Log
```sql
-- PostgreSQL trigger enforced at DB level
CREATE TRIGGER audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
```

### ⚖️ Settlement Algorithm
Greedy O(n log n) — matches largest debtor with largest creditor:
```python
# See: backend/app/services/settlement_engine.py
minimize_transactions(balances: dict[int, int]) -> List[Transaction]
```

### 📎 Proof Integrity
- Files hashed with SHA-256 **server-side** after upload
- Metadata (uploader ID, timestamp) written at upload time and immutable
- Stored in private S3 bucket with SSE-AES256
- Access via 15-minute presigned URLs only

### 🔐 JWT + OTP Auth
- OTP hashed with SHA-256 before DB storage
- JWT blacklisted on logout (in-memory; swap for Redis in production)
- Rate limit: max 5 OTP requests/phone/hour

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/send-otp` | Send OTP to phone |
| POST | `/api/v1/auth/verify-otp` | Verify OTP → get JWT |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Blacklist token |
| GET/PATCH | `/api/v1/users/me` | Profile |
| GET/POST | `/api/v1/groups` | List/create groups |
| GET/PATCH | `/api/v1/groups/{id}` | Group detail/update |
| POST | `/api/v1/groups/{id}/members` | Add member |
| POST | `/api/v1/groups/{id}/invite` | Create invite link |
| POST | `/api/v1/groups/join/{token}` | Join via invite |
| GET/POST | `/api/v1/groups/{id}/expenses` | List/create expenses |
| GET/PATCH | `/api/v1/groups/{id}/expenses/{eid}` | Expense detail/edit |
| POST | `/api/v1/groups/{id}/expenses/{eid}/dispute` | Raise dispute |
| POST | `/api/v1/groups/{id}/expenses/{eid}/attachments` | Upload proof |
| GET | `/api/v1/groups/{id}/settlements/balances` | Balance + settlements |
| POST | `/api/v1/groups/{id}/settlements` | Initiate settlement |
| POST | `/api/v1/groups/{id}/settlements/{sid}/confirm` | Confirm payment |
| POST | `/api/v1/groups/{id}/settlements/{sid}/dispute` | Dispute payment |
| POST | `/api/v1/groups/{id}/settlements/{sid}/resolve` | Resolve (admin) |
| GET | `/api/v1/groups/{id}/audit` | Audit log |
| GET | `/api/v1/groups/{id}/report` | PDF report (Pro only) |

---

## Production Checklist

- [ ] Replace in-memory JWT blacklist with Redis
- [ ] Enable Twilio OTP delivery (remove `dev_otp` from response)
- [ ] Set strong `SECRET_KEY` in production
- [ ] Configure S3 bucket policy (private, SSE-KMS)
- [ ] Set up HTTPS with valid TLS certificate
- [ ] Add rate limiting middleware (slowapi)
- [ ] Configure push notifications (Expo Push / FCM)
- [ ] Set up monitoring (Sentry, Datadog)
- [ ] Implement payment gateway for Pro tier subscriptions

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile App | React Native + Expo Router |
| State Management | Zustand + React Query |
| Backend API | FastAPI (Python) |
| Database | PostgreSQL 16 (async via asyncpg) |
| ORM | SQLAlchemy 2.0 async |
| Auth | JWT (HS256) + OTP via Twilio |
| File Storage | AWS S3 (SSE-AES256) |
| PDF Generation | ReportLab |
| Migrations | Alembic |
| Containerization | Docker + Docker Compose |
