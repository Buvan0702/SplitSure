import hashlib
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.v1.endpoints.invitations import (
    accept_invitation,
    create_group_invitation,
    reject_invitation,
    validate_invitation_link,
)
from app.core.database import Base
from app.models.user import Group, GroupMember, Invitation, InvitationStatus, MemberRole, User
from app.schemas.schemas import InvitationCreateRequest


@pytest_asyncio.fixture
async def db_session(tmp_path) -> AsyncSession:
    db_file = tmp_path / "invitation_flow.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_file}")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    await engine.dispose()


async def _seed_group_with_admin(db: AsyncSession):
    admin = User(phone="+911111111111", name="Admin", email="admin@example.com")
    db.add(admin)
    await db.flush()

    group = Group(name="Trip Group", description="Summer trip", created_by=admin.id)
    db.add(group)
    await db.flush()

    db.add(GroupMember(group_id=group.id, user_id=admin.id, role=MemberRole.ADMIN))
    await db.commit()

    return admin, group


@pytest.mark.asyncio
async def test_registered_user_invite_creates_in_app_invitation(db_session: AsyncSession):
    admin, group = await _seed_group_with_admin(db_session)
    invitee = User(phone="+922222222222", name="Member", email="member@example.com")
    db_session.add(invitee)
    await db_session.commit()

    result = await create_group_invitation(
        group_id=group.id,
        body=InvitationCreateRequest(invitee_user_id=invitee.id),
        current_user=admin,
        db=db_session,
    )

    assert result.delivery_channel == "in_app"
    assert result.invite_url is None
    assert result.invitation.invitee_user_id == invitee.id
    assert result.invitation.status == InvitationStatus.PENDING


@pytest.mark.asyncio
async def test_unregistered_contact_invite_returns_link(db_session: AsyncSession):
    admin, group = await _seed_group_with_admin(db_session)

    result = await create_group_invitation(
        group_id=group.id,
        body=InvitationCreateRequest(phone="9876543210"),
        current_user=admin,
        db=db_session,
    )

    assert result.delivery_channel == "link"
    assert result.invite_url is not None
    assert result.invitation.invitee_phone == "+919876543210"
    assert result.invitation.token_expires_at is not None


@pytest.mark.asyncio
async def test_duplicate_pending_invite_is_blocked(db_session: AsyncSession):
    admin, group = await _seed_group_with_admin(db_session)

    await create_group_invitation(
        group_id=group.id,
        body=InvitationCreateRequest(phone="9999999999"),
        current_user=admin,
        db=db_session,
    )

    with pytest.raises(HTTPException) as exc:
        await create_group_invitation(
            group_id=group.id,
            body=InvitationCreateRequest(phone="9999999999"),
            current_user=admin,
            db=db_session,
        )

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_accept_invitation_adds_group_member(db_session: AsyncSession):
    admin, group = await _seed_group_with_admin(db_session)
    invitee = User(phone="+933333333333", name="Invitee", email="invitee@example.com")
    db_session.add(invitee)
    await db_session.commit()

    invitation_result = await create_group_invitation(
        group_id=group.id,
        body=InvitationCreateRequest(invitee_user_id=invitee.id),
        current_user=admin,
        db=db_session,
    )

    accept_result = await accept_invitation(
        invitation_id=invitation_result.invitation.id,
        current_user=invitee,
        db=db_session,
    )

    assert accept_result.invitation.status == InvitationStatus.ACCEPTED

    member_query = await db_session.execute(
        select(GroupMember)
        .where(GroupMember.group_id == group.id)
        .where(GroupMember.user_id == invitee.id)
    )
    assert member_query.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_reject_invitation_does_not_add_member(db_session: AsyncSession):
    admin, group = await _seed_group_with_admin(db_session)
    invitee = User(phone="+944444444444", name="Rejector", email="rejector@example.com")
    db_session.add(invitee)
    await db_session.commit()

    invitation_result = await create_group_invitation(
        group_id=group.id,
        body=InvitationCreateRequest(invitee_user_id=invitee.id),
        current_user=admin,
        db=db_session,
    )

    reject_result = await reject_invitation(
        invitation_id=invitation_result.invitation.id,
        current_user=invitee,
        db=db_session,
    )

    assert reject_result.invitation.status == InvitationStatus.REJECTED

    member_query = await db_session.execute(
        select(GroupMember)
        .where(GroupMember.group_id == group.id)
        .where(GroupMember.user_id == invitee.id)
    )
    assert member_query.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_validate_expired_link_marks_invitation_expired(db_session: AsyncSession):
    admin, group = await _seed_group_with_admin(db_session)
    invitee = User(phone="+955555555555", name="Late User", email="late@example.com")
    db_session.add(invitee)
    await db_session.flush()

    token = "expired-token"
    invitation = Invitation(
        group_id=group.id,
        inviter_id=admin.id,
        invitee_user_id=invitee.id,
        token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
        token_expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        status=InvitationStatus.PENDING,
    )
    db_session.add(invitation)
    await db_session.commit()

    validation = await validate_invitation_link(token=token, current_user=invitee, db=db_session)

    assert validation.is_valid is False
    assert validation.reason == "expired"

    refreshed = await db_session.get(Invitation, invitation.id)
    assert refreshed is not None
    assert refreshed.status == InvitationStatus.EXPIRED
