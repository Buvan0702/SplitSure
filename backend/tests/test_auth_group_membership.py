from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.v1.endpoints.auth import register, send_otp, verify_otp, _hash_otp
from app.api.v1.endpoints.groups import add_member
from app.core.database import Base
from app.models.user import Group, GroupMember, MemberRole, OTPRecord, User
from app.schemas.schemas import AddMemberRequest, OTPRequest, OTPVerify, RegisterRequest


@pytest_asyncio.fixture
async def db_session(tmp_path) -> AsyncSession:
    db_file = tmp_path / "auth_group_membership.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_file}")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.mark.asyncio
async def test_duplicate_registration_is_prevented(db_session: AsyncSession):
    payload = RegisterRequest(name="Jane Doe", email="jane@example.com", phone="9876543210")

    created = await register(payload, db_session)
    assert created.phone == "+919876543210"

    with pytest.raises(HTTPException) as exc:
        await register(payload, db_session)

    assert exc.value.status_code == 409
    assert "already registered" in exc.value.detail


@pytest.mark.asyncio
async def test_invalid_login_attempts_are_handled(db_session: AsyncSession):
    payload = RegisterRequest(name="John Doe", email="john@example.com", phone="9999999999")
    await register(payload, db_session)

    with pytest.raises(HTTPException) as unregistered_exc:
        await send_otp(OTPRequest(phone="8888888888"), db_session)

    assert unregistered_exc.value.status_code == 404

    now = datetime.now(timezone.utc)
    record = OTPRecord(
        phone=payload.phone,
        otp_hash=_hash_otp("123456"),
        expires_at=now + timedelta(minutes=5),
        is_used=False,
    )
    db_session.add(record)
    await db_session.commit()

    with pytest.raises(HTTPException) as invalid_otp_exc:
        await verify_otp(OTPVerify(phone=payload.phone, otp="654321"), db_session)

    assert invalid_otp_exc.value.status_code == 400
    assert "Invalid or expired OTP" in invalid_otp_exc.value.detail


@pytest.mark.asyncio
async def test_group_add_member_requires_registered_user(db_session: AsyncSession):
    admin = User(phone="+911111111111", name="Admin", email="admin@example.com")
    unregistered = User(phone="+922222222222", name=None, email=None)
    registered_user = User(phone="+933333333333", name="Member", email="member@example.com")

    db_session.add_all([admin, unregistered, registered_user])
    await db_session.flush()

    group = Group(name="Test Group", description="", created_by=admin.id)
    db_session.add(group)
    await db_session.flush()

    db_session.add(GroupMember(group_id=group.id, user_id=admin.id, role=MemberRole.ADMIN))
    await db_session.commit()

    with pytest.raises(HTTPException) as unregistered_exc:
        await add_member(
            group.id,
            AddMemberRequest(phone=unregistered.phone),
            current_user=admin,
            db=db_session,
        )

    assert unregistered_exc.value.status_code == 400
    assert "has not completed registration" in unregistered_exc.value.detail

    added = await add_member(
        group.id,
        AddMemberRequest(user_id=registered_user.id),
        current_user=admin,
        db=db_session,
    )

    assert added.user.id == registered_user.id
    assert added.is_registered is True
