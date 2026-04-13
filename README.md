# SplitSure

SplitSure is a mobile-first shared-expense system with OTP auth, group ledgers, proof attachments, optimized settlements, and immutable audit history.

## What’s in the repo

```text
backend/   FastAPI + SQLAlchemy + PostgreSQL
frontend/  Expo Router + React Native + React Query + Zustand
uploads/   Local proof storage for development
```

## Core production flows

- OTP login with access and refresh tokens
- Profile management with validated email and UPI ID
- Group creation, invites, member management, and archival
- Expense creation, update, deletion, dispute handling, and proof uploads
- Balance computation and optimized settlement suggestions
- Settlement initiation, confirmation, dispute, and admin resolution
- Immutable audit log browsing
- Paid-tier PDF report export

## Local setup

### Prerequisites

- Docker Desktop
- Node.js 18+
- Python 3.13+ recommended

### 1. Backend

```bash
copy backend\.env.example backend\.env
docker compose up -d
docker compose exec api alembic upgrade head
```

API endpoints:

- App API: `http://localhost:8000/api/v1`
- Health check: `http://localhost:8000/health`
- Swagger: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1
```

Start the app:

```bash
npx expo start
```

Notes:

- Android emulators automatically rewrite `localhost` to `10.0.2.2`.
- Development uses local proof storage by default, not S3.
- Development OTP mode can return the OTP in the API response when `USE_DEV_OTP=true`.

## Environment variables

### Backend

See [`backend/.env.example`](backend/.env.example) for the full local template.

Important variables:

- `DATABASE_URL`
- `SECRET_KEY`
- `USE_LOCAL_STORAGE`
- `LOCAL_UPLOAD_DIR`
- `LOCAL_BASE_URL`
- `USE_DEV_OTP`
- `ALLOWED_ORIGINS`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME` when using S3

### Frontend

- `EXPO_PUBLIC_API_URL`

## Quality gates

### Frontend typecheck

```bash
cd frontend
npx tsc --noEmit
```

### Backend tests

```bash
cd backend
..\.venv\Scripts\python.exe -m pytest
```

If you need a fresh dev install for backend tooling:

```bash
pip install -r backend/requirements-dev.txt
```

## API shape

Base path: `/api/v1`

Main route groups:

- `/auth`
- `/users`
- `/groups`
- `/groups/{group_id}/expenses`
- `/groups/{group_id}/settlements`
- `/groups/{group_id}/audit`
- `/groups/{group_id}/report`

Conventions:

- Auth is enforced at the route boundary with bearer tokens.
- Validation errors and business-rule failures return explicit FastAPI `detail` messages.
- Settlement creation is restricted to real outstanding optimized balances.
- Expense updates support split changes instead of silently ignoring them.

## Storage and security notes

- Money is stored as integer paise.
- Proof files are validated server-side and hashed with SHA-256.
- Audit logs are append-only and protected by a database trigger.
- Local development uses disk-backed file storage; production should use private S3.
- OTPs are generated with `secrets`, not `random`.
- Refresh failure clears the client session instead of leaving stale auth state behind.

## Production checklist

- Set a strong `SECRET_KEY`
- Disable `USE_DEV_OTP`
- Configure Twilio or another OTP provider
- Switch `USE_LOCAL_STORAGE=false` and provide S3 credentials
- Serve the API behind HTTPS
- Run Alembic migrations as part of deploy
- Add CI steps for `npx tsc --noEmit` and backend `pytest`
- Add Redis-backed token revocation if logout invalidation must survive process restarts

## Recent audit fixes

- Completed the previously partial expense update flow so split changes are persisted correctly
- Prevented invalid settlement initiation against non-existent balances
- Tightened user profile, OTP, and group update validation
- Added backend unit tests for split logic, settlement calculations, and schema validation
- Connected auth refresh failure handling to client session cleanup
