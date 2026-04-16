import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.models.user import (
    Group,
    GroupMember,
    MemberRole,
    User,
    AuditEventType,
    Invitation,
    InvitationStatus,
)
from app.schemas.schemas import (
    GroupCreate, GroupUpdate, GroupOut, AddMemberRequest,
    InviteLinkOut, GroupMemberOut
)
from app.services.audit_service import log_event
from app.services.push_service import notify_group_invite

router = APIRouter(prefix="/groups", tags=["groups"])


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _normalize_datetime(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _is_registered_user(user: User) -> bool:
    return bool(user.name and user.email)


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
    include_archived: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Group)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(GroupMember.user_id == current_user.id)
        .options(selectinload(Group.members).selectinload(GroupMember.user))
    )
    if not include_archived:
        query = query.where(Group.is_archived == False)
    result = await db.execute(query)
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

    if body.user_id is not None:
        result = await db.execute(select(User).where(User.id == body.user_id))
        lookup_value = str(body.user_id)
    else:
        result = await db.execute(select(User).where(User.phone == body.phone))
        lookup_value = body.phone or "unknown"

    new_user = result.scalar_one_or_none()
    if not new_user:
        raise HTTPException(404, f"Registered user not found for identifier: {lookup_value}")

    if not _is_registered_user(new_user):
        raise HTTPException(400, "User exists but has not completed registration")

    existing = await _get_member(db, group_id, new_user.id)
    if existing:
        raise HTTPException(400, "User is already a member")

    member = GroupMember(group_id=group_id, user_id=new_user.id, role=MemberRole.MEMBER)
    db.add(member)

    # Get group info for notification
    group = await _load_group(db, group_id)

    await log_event(
        db, group_id, AuditEventType.MEMBER_ADDED, current_user.id,
        entity_id=new_user.id,
        metadata_json={"phone": new_user.phone, "user_name": new_user.name},
    )

    await db.commit()
    result = await db.execute(
        select(GroupMember)
        .options(selectinload(GroupMember.user))
        .where(GroupMember.group_id == group_id)
        .where(GroupMember.user_id == new_user.id)
    )
    member_record = result.scalar_one()

    # Send push notification to the added user (fire-and-forget)
    inviter_name = current_user.name or current_user.phone
    await notify_group_invite(db, new_user.id, group.name, inviter_name)

    return GroupMemberOut(
        id=member_record.id,
        user=member_record.user,
        role=member_record.role,
        joined_at=member_record.joined_at,
        is_registered=True,
    )


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

    invite = Invitation(
        group_id=group_id,
        inviter_id=current_user.id,
        token_hash=_hash_token(token),
        token_expires_at=expires_at,
        status=InvitationStatus.PENDING,
    )
    db.add(invite)
    await db.commit()

    return InviteLinkOut(token=token, expires_at=expires_at, use_count=0, max_uses=1)


@router.post("/join/{token}", response_model=GroupMemberOut)
async def join_via_invite(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Invitation)
        .where(Invitation.token_hash == _hash_token(token))
        .options(selectinload(Invitation.group))
    )
    invite = result.scalar_one_or_none()

    if not invite:
        raise HTTPException(404, "Invalid invite link")

    if invite.status == InvitationStatus.ACCEPTED:
        raise HTTPException(400, "Invite link has already been used")
    if invite.status == InvitationStatus.REJECTED:
        raise HTTPException(400, "Invite link has already been rejected")
    if invite.status == InvitationStatus.EXPIRED:
        raise HTTPException(400, "Invite link has expired")
    expires_at = _normalize_datetime(invite.token_expires_at)
    if expires_at and expires_at <= now:
        invite.status = InvitationStatus.EXPIRED
        invite.responded_at = now
        await db.commit()
        raise HTTPException(400, "Invite link has expired")

    if invite.invitee_user_id is not None and invite.invitee_user_id != current_user.id:
        raise HTTPException(403, "This invite link is not for your account")
    if invite.invitee_phone and invite.invitee_phone != current_user.phone:
        raise HTTPException(403, "This invite link is not for your account")
    if invite.invitee_email:
        if not current_user.email or current_user.email.lower() != invite.invitee_email:
            raise HTTPException(403, "This invite link is not for your account")

    existing = await _get_member(db, invite.group_id, current_user.id)
    if existing:
        invite.status = InvitationStatus.ACCEPTED
        invite.responded_at = now
        if invite.invitee_user_id is None:
            invite.invitee_user_id = current_user.id
        await db.commit()

        return GroupMemberOut(
            id=existing.id,
            user=current_user,
            role=existing.role,
            joined_at=existing.joined_at,
            is_registered=_is_registered_user(current_user),
        )

    member = GroupMember(group_id=invite.group_id, user_id=current_user.id, role=MemberRole.MEMBER)
    db.add(member)
    invite.status = InvitationStatus.ACCEPTED
    invite.responded_at = now
    if invite.invitee_user_id is None:
        invite.invitee_user_id = current_user.id

    await log_event(
        db, invite.group_id, AuditEventType.MEMBER_ADDED, current_user.id,
        entity_id=current_user.id,
        metadata_json={"via": "invite_link", "invitation_id": invite.id},
    )

    await db.commit()
    result = await db.execute(
        select(GroupMember)
        .options(selectinload(GroupMember.user))
        .where(GroupMember.group_id == invite.group_id)
        .where(GroupMember.user_id == current_user.id)
    )
    member_record = result.scalar_one()

    # Notify group admins about the new member (fire-and-forget)
    group = await _load_group(db, invite.group_id)
    joiner_name = current_user.name or current_user.phone
    for m in group.members:
        if m.role == MemberRole.ADMIN and m.user_id != current_user.id:
            await notify_group_invite(
                db, m.user_id, group.name, f"{joiner_name} joined"
            )

    # Determine if the joining user is registered
    is_registered = _is_registered_user(current_user)

    return GroupMemberOut(
        id=member_record.id,
        user=member_record.user,
        role=member_record.role,
        joined_at=member_record.joined_at,
        is_registered=is_registered,
    )


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


@router.post("/{group_id}/unarchive", response_model=GroupOut)
async def unarchive_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, group_id, current_user.id)
    result = await db.execute(
        select(Group)
        .options(selectinload(Group.members).selectinload(GroupMember.user))
        .where(Group.id == group_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "Group not found")
    group.is_archived = False
    await db.commit()
    return group
