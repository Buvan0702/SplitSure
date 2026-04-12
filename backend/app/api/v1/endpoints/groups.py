import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.models.user import Group, GroupMember, MemberRole, User, AuditEventType, InviteLink
from app.schemas.schemas import (
    GroupCreate, GroupUpdate, GroupOut, AddMemberRequest,
    InviteLinkOut, GroupMemberOut
)
from app.services.audit_service import log_event

router = APIRouter(prefix="/groups", tags=["groups"])


async def _get_member(db: AsyncSession, group_id: int, user_id: int) -> GroupMember | None:
    result = await db.execute(
        select(GroupMember)
        .where(GroupMember.group_id == group_id)
        .where(GroupMember.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def _require_membership(db: AsyncSession, group_id: int, user_id: int) -> GroupMember:
    member = await _get_member(db, group_id, user_id)
    if not member:
        raise HTTPException(403, "Not a member of this group")
    return member


async def _require_admin(db: AsyncSession, group_id: int, user_id: int) -> GroupMember:
    member = await _require_membership(db, group_id, user_id)
    if member.role != MemberRole.ADMIN:
        raise HTTPException(403, "Admin access required")
    return member


async def _load_group(db: AsyncSession, group_id: int) -> Group:
    result = await db.execute(
        select(Group)
        .options(
            selectinload(Group.members).selectinload(GroupMember.user)
        )
        .where(Group.id == group_id)
        .where(Group.is_archived == False)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "Group not found")
    return group


@router.post("", response_model=GroupOut, status_code=201)
async def create_group(
    body: GroupCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = Group(
        name=body.name,
        description=body.description,
        created_by=current_user.id,
    )
    db.add(group)
    await db.flush()

    # Creator becomes admin
    member = GroupMember(group_id=group.id, user_id=current_user.id, role=MemberRole.ADMIN)
    db.add(member)

    await log_event(
        db, group.id, AuditEventType.GROUP_CREATED, current_user.id,
        entity_id=group.id,
        after_json={"name": group.name, "description": group.description},
    )

    await db.commit()
    return await _load_group(db, group.id)


@router.get("", response_model=list[GroupOut])
async def list_my_groups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Group)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(GroupMember.user_id == current_user.id)
        .where(Group.is_archived == False)
        .options(selectinload(Group.members).selectinload(GroupMember.user))
    )
    return result.scalars().all()


@router.get("/{group_id}", response_model=GroupOut)
async def get_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(db, group_id, current_user.id)
    return await _load_group(db, group_id)


@router.patch("/{group_id}", response_model=GroupOut)
async def update_group(
    group_id: int,
    body: GroupUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, group_id, current_user.id)
    group = await _load_group(db, group_id)

    before = {"name": group.name, "description": group.description}
    if body.name:
        group.name = body.name
    if body.description is not None:
        group.description = body.description

    await log_event(
        db, group_id, AuditEventType.GROUP_UPDATED, current_user.id,
        entity_id=group_id, before_json=before,
        after_json={"name": group.name, "description": group.description},
    )

    await db.commit()
    return await _load_group(db, group_id)


@router.post("/{group_id}/members", response_model=GroupMemberOut, status_code=201)
async def add_member(
    group_id: int,
    body: AddMemberRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, group_id, current_user.id)

    # Check member count
    result = await db.execute(
        select(GroupMember).where(GroupMember.group_id == group_id)
    )
    if len(result.scalars().all()) >= settings.MAX_GROUP_MEMBERS:
        raise HTTPException(400, f"Group has reached the maximum of {settings.MAX_GROUP_MEMBERS} members")

    # Find user by phone
    result = await db.execute(select(User).where(User.phone == body.phone))
    new_user = result.scalar_one_or_none()
    if not new_user:
        if not settings.USE_DEV_OTP:
            raise HTTPException(404, "User with this phone number not found")
        new_user = User(phone=body.phone)
        db.add(new_user)
        await db.flush()

    existing = await _get_member(db, group_id, new_user.id)
    if existing:
        raise HTTPException(400, "User is already a member")

    member = GroupMember(group_id=group_id, user_id=new_user.id, role=MemberRole.MEMBER)
    db.add(member)

    await log_event(
        db, group_id, AuditEventType.MEMBER_ADDED, current_user.id,
        entity_id=new_user.id,
        metadata_json={"phone": body.phone, "user_name": new_user.name},
    )

    await db.commit()
    result = await db.execute(
        select(GroupMember)
        .options(selectinload(GroupMember.user))
        .where(GroupMember.group_id == group_id)
        .where(GroupMember.user_id == new_user.id)
    )
    return result.scalar_one()


@router.delete("/{group_id}/members/{user_id}", status_code=204)
async def remove_member(
    group_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, group_id, current_user.id)
    if user_id == current_user.id:
        raise HTTPException(400, "Cannot remove yourself. Transfer admin role first.")

    member = await _get_member(db, group_id, user_id)
    if not member:
        raise HTTPException(404, "Member not found")

    await db.delete(member)

    await log_event(
        db, group_id, AuditEventType.MEMBER_REMOVED, current_user.id,
        entity_id=user_id,
    )

    await db.commit()


@router.post("/{group_id}/invite", response_model=InviteLinkOut)
async def create_invite_link(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, group_id, current_user.id)

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.INVITE_LINK_EXPIRE_HOURS)

    invite = InviteLink(
        group_id=group_id,
        token=token,
        created_by=current_user.id,
        max_uses=settings.INVITE_LINK_MAX_USES,
        expires_at=expires_at,
    )
    db.add(invite)
    await db.commit()

    return InviteLinkOut(token=token, expires_at=expires_at, use_count=0, max_uses=invite.max_uses)


@router.post("/join/{token}", response_model=GroupMemberOut)
async def join_via_invite(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    result = await db.execute(select(InviteLink).where(InviteLink.token == token))
    invite = result.scalar_one_or_none()

    if not invite:
        raise HTTPException(404, "Invalid invite link")
    if invite.expires_at < now:
        raise HTTPException(400, "Invite link has expired")
    if invite.use_count >= invite.max_uses:
        raise HTTPException(400, "Invite link has reached its usage limit")

    existing = await _get_member(db, invite.group_id, current_user.id)
    if existing:
        raise HTTPException(400, "Already a member of this group")

    member = GroupMember(group_id=invite.group_id, user_id=current_user.id, role=MemberRole.MEMBER)
    db.add(member)
    invite.use_count += 1

    await log_event(
        db, invite.group_id, AuditEventType.MEMBER_ADDED, current_user.id,
        entity_id=current_user.id,
        metadata_json={"via": "invite_link"},
    )

    await db.commit()
    result = await db.execute(
        select(GroupMember)
        .options(selectinload(GroupMember.user))
        .where(GroupMember.group_id == invite.group_id)
        .where(GroupMember.user_id == current_user.id)
    )
    return result.scalar_one()


@router.delete("/{group_id}", status_code=204)
async def archive_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, group_id, current_user.id)
    group = await _load_group(db, group_id)
    group.is_archived = True
    await db.commit()
