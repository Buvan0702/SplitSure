from fastapi import APIRouter
from app.api.v1.endpoints import auth, users, groups, expenses, settlements, audit, reports, invitations

router = APIRouter()
router.include_router(auth.router)
router.include_router(users.router)
router.include_router(groups.router)
router.include_router(invitations.router)
router.include_router(expenses.router)
router.include_router(settlements.router)
router.include_router(audit.router)
router.include_router(reports.router)
