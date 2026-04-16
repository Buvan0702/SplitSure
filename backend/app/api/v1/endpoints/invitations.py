import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import (
    AuditEventType,
    Group,
    GroupMember,
    Invitation,
    InvitationStatus,
    MemberRole,
    User,
)
from app.schemas.schemas import (
    GroupOut,
    InvitationActionResponse,
    InvitationCreateRequest,
    InvitationCreateResponse,
    InvitationLinkValidationOut,
    InvitationOut,
)
from app.services.audit_service import log_event
from app.services.push_service import notify_group_invitation

router = APIRouter(tags=["invitations"])


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_datetime(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _build_invite_url(token: str) -> str:
    return f"{settings.INVITE_DEEP_LINK_BASE.rstrip('/')}/{token}"


def _is_registered_user(user: User) -> bool:
    return bool(user.name and user.email)


async def _get_member(db: AsyncSession, group_id: int, user_id: int) -> Optional[GroupMember]:
    result = await db.execute(
        select(GroupMember)
        .where(GroupMember.group_id == group_id)
        .where(GroupMember.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def _require_admin(db: AsyncSession, group_id: int, user_id: int) -> GroupMember:
    member = await _get_member(db, group_id, user_id)
    if not member:
        raise HTTPException(403, "Not a member of this group")
    if member.role != MemberRole.ADMIN:
        raise HTTPException(403, "Admin access required")
    return member


async def _load_group(db: AsyncSession, group_id: int) -> Group:
    result = await db.execute(
        select(Group)
        .options(selectinload(Group.members).selectinload(GroupMember.user))
        .where(Group.id == group_id)
        .where(Group.is_archived == False)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "Group not found")
    return group


def _invitation_state_reason(invitation: Invitation) -> Optional[str]:
    if invitation.status == InvitationStatus.ACCEPTED:
        return "already_used"
    if invitation.status == InvitationStatus.REJECTED:
        return "rejected"
    if invitation.status == InvitationStatus.EXPIRED:
        return "expired"
    return None


def _to_invitation_out(invitation: Invitation) -> InvitationOut:
    inviter_name = invitation.inviter.name or invitation.inviter.phone
    return InvitationOut(
        id=invitation.id,
        group_id=invitation.group_id,
        group_name=invitation.group.name,
        inviter_id=invitation.inviter_id,
        inviter_name=inviter_name,
        inviter_phone=invitation.inviter.phone,
        invitee_user_id=invitation.invitee_user_id,
        invitee_phone=invitation.invitee_phone,
        invitee_email=invitation.invitee_email,
        status=invitation.status,
        message=invitation.message,
        created_at=invitation.created_at,
        responded_at=invitation.responded_at,
        token_expires_at=invitation.token_expires_at,
        is_link_invite=bool(invitation.token_hash),
    )


def _invitation_is_for_user(invitation: Invitation, user: User) -> bool:
    if invitation.invitee_user_id is not None:
        return invitation.invitee_user_id == user.id

    if invitation.invitee_phone and invitation.invitee_phone != user.phone:
        return False

    if invitation.invitee_email:
        if not user.email:
            return False
        return invitation.invitee_email == user.email.lower()

    return True


def _expire_if_needed(invitation: Invitation) -> bool:
    expires_at = _normalize_datetime(invitation.token_expires_at)
    if (
        invitation.status == InvitationStatus.PENDING
        and expires_at is not None
        and expires_at <= _now_utc()
    ):
        invitation.status = InvitationStatus.EXPIRED
        invitation.responded_at = _now_utc()
        return True
    return False


async def _get_invitation_by_id(db: AsyncSession, invitation_id: int) -> Invitation:
    result = await db.execute(
        select(Invitation)
        .options(
            selectinload(Invitation.group),
            selectinload(Invitation.inviter),
            selectinload(Invitation.invitee_user),
        )
        .where(Invitation.id == invitation_id)
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(404, "Invitation not found")
    return invitation


async def _get_invitation_by_token(db: AsyncSession, token: str) -> Invitation:
    token_hash = _hash_token(token)
    result = await db.execute(
        select(Invitation)
        .options(
            selectinload(Invitation.group),
            selectinload(Invitation.inviter),
            selectinload(Invitation.invitee_user),
        )
        .where(Invitation.token_hash == token_hash)
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(404, "Invalid invitation token")
    return invitation


async def _get_pending_duplicate(
    db: AsyncSession,
    group_id: int,
    invitee_user_id: Optional[int],
    invitee_phone: Optional[str],
    invitee_email: Optional[str],
) -> Optional[Invitation]:
    filters = []
    if invitee_user_id is not None:
        filters.append(Invitation.invitee_user_id == invitee_user_id)
    if invitee_phone:
        filters.append(Invitation.invitee_phone == invitee_phone)
    if invitee_email:
        filters.append(Invitation.invitee_email == invitee_email)

    if not filters:
        return None

    result = await db.execute(
        select(Invitation)
        .where(Invitation.group_id == group_id)
        .where(Invitation.status == InvitationStatus.PENDING)
        .where(or_(*filters))
        .order_by(Invitation.created_at.desc())
    )
    return result.scalar_one_or_none()


async def _respond_to_invitation(
    db: AsyncSession,
    invitation: Invitation,
    current_user: User,
    decision: Literal["accept", "reject"],
) -> InvitationActionResponse:
    if not _invitation_is_for_user(invitation, current_user):
        raise HTTPException(403, "This invitation is not for your account")

    if _expire_if_needed(invitation):
        await db.commit()
        raise HTTPException(400, "Invitation link has expired")

    if invitation.status != InvitationStatus.PENDING:
        reason = _invitation_state_reason(invitation)
        if reason == "already_used":
            raise HTTPException(400, "Invitation has already been accepted")
        if reason == "rejected":
            raise HTTPException(400, "Invitation has already been rejected")
        raise HTTPException(400, "Invitation is no longer valid")

    now = _now_utc()

    if decision == "reject":
        invitation.status = InvitationStatus.REJECTED
        invitation.responded_at = now
        if invitation.invitee_user_id is None:
            invitation.invitee_user_id = current_user.id
        await db.commit()
        await db.refresh(invitation)
        invitation = await _get_invitation_by_id(db, invitation.id)
        return InvitationActionResponse(invitation=_to_invitation_out(invitation), group=None)

    existing_member = await _get_member(db, invitation.group_id, current_user.id)
    if existing_member:
        invitation.status = InvitationStatus.ACCEPTED
        invitation.responded_at = now
        if invitation.invitee_user_id is None:
            invitation.invitee_user_id = current_user.id
        await db.commit()

        group = await _load_group(db, invitation.group_id)
        invitation = await _get_invitation_by_id(db, invitation.id)
        return InvitationActionResponse(
            invitation=_to_invitation_out(invitation),
            group=GroupOut.model_validate(group),
        )

    member_count_result = await db.execute(
        select(func.count(GroupMember.id)).where(GroupMember.group_id == invitation.group_id)
    )
    member_count = member_count_result.scalar() or 0
    if member_count >= settings.MAX_GROUP_MEMBERS:
        raise HTTPException(400, f"Group has reached the maximum of {settings.MAX_GROUP_MEMBERS} members")

    member = GroupMember(
        group_id=invitation.group_id,
        user_id=current_user.id,
        role=MemberRole.MEMBER,
    )
    db.add(member)

    invitation.status = InvitationStatus.ACCEPTED
    invitation.responded_at = now
    if invitation.invitee_user_id is None:
        invitation.invitee_user_id = current_user.id

    await log_event(
        db,
        invitation.group_id,
        AuditEventType.MEMBER_ADDED,
        current_user.id,
        entity_id=current_user.id,
        metadata_json={"via": "invitation", "invitation_id": invitation.id},
    )

    await db.commit()

    group = await _load_group(db, invitation.group_id)
    invitation = await _get_invitation_by_id(db, invitation.id)
    return InvitationActionResponse(
        invitation=_to_invitation_out(invitation),
        group=GroupOut.model_validate(group),
    )


@router.post("/groups/{group_id}/invitations", response_model=InvitationCreateResponse, status_code=201)
async def create_group_invitation(
    group_id: int,
    body: InvitationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, group_id, current_user.id)

    group = await _load_group(db, group_id)

    invitee_user: Optional[User] = None
    if body.invitee_user_id is not None:
        result = await db.execute(select(User).where(User.id == body.invitee_user_id))
        invitee_user = result.scalar_one_or_none()
    elif body.phone:
        result = await db.execute(select(User).where(User.phone == body.phone))
        invitee_user = result.scalar_one_or_none()
    elif body.email:
        result = await db.execute(select(User).where(User.email == body.email))
        invitee_user = result.scalar_one_or_none()

    invitee_phone = body.phone
    invitee_email = body.email
    invitee_user_id: Optional[int] = None
    delivery_channel: Literal["in_app", "link"] = "link"
    invite_url: Optional[str] = None

    if invitee_user and _is_registered_user(invitee_user):
        if invitee_user.id == current_user.id:
            raise HTTPException(400, "You cannot invite yourself")

        existing_member = await _get_member(db, group_id, invitee_user.id)
        if existing_member:
            raise HTTPException(400, "User is already a member")

        invitee_user_id = invitee_user.id
        invitee_phone = invitee_user.phone
        invitee_email = invitee_user.email
        delivery_channel = "in_app"

    duplicate = await _get_pending_duplicate(db, group_id, invitee_user_id, invitee_phone, invitee_email)
    if duplicate:
        if _expire_if_needed(duplicate):
            await db.commit()
        else:
            raise HTTPException(409, "A pending invitation already exists for this recipient")

    invitation = Invitation(
        group_id=group_id,
        inviter_id=current_user.id,
        invitee_user_id=invitee_user_id,
        invitee_phone=invitee_phone,
        invitee_email=invitee_email,
        status=InvitationStatus.PENDING,
        message=body.message,
    )

    if delivery_channel == "link":
        token = secrets.token_urlsafe(32)
        invitation.token_hash = _hash_token(token)
        invitation.token_expires_at = _now_utc() + timedelta(hours=settings.INVITE_LINK_EXPIRE_HOURS)
        invite_url = _build_invite_url(token)

    db.add(invitation)
    await db.commit()

    invitation = await _get_invitation_by_id(db, invitation.id)

    if delivery_channel == "in_app" and invitee_user_id is not None:
        inviter_name = current_user.name or current_user.phone
        await notify_group_invitation(
            db=db,
            user_id=invitee_user_id,
            group_name=group.name,
            inviter_name=inviter_name,
            invitation_id=invitation.id,
        )

    return InvitationCreateResponse(
        invitation=_to_invitation_out(invitation),
        delivery_channel=delivery_channel,
        invite_url=invite_url,
    )


@router.get("/invitations/pending", response_model=list[InvitationOut])
async def list_pending_invitations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    predicates = [Invitation.invitee_user_id == current_user.id]
    predicates.append(
        and_(
            Invitation.invitee_user_id.is_(None),
            Invitation.invitee_phone == current_user.phone,
        )
    )

    if current_user.email:
        predicates.append(
            and_(
                Invitation.invitee_user_id.is_(None),
                Invitation.invitee_email == current_user.email.lower(),
            )
        )

    result = await db.execute(
        select(Invitation)
        .options(
            selectinload(Invitation.group),
            selectinload(Invitation.inviter),
        )
        .where(Invitation.status == InvitationStatus.PENDING)
        .where(or_(*predicates))
        .order_by(Invitation.created_at.desc())
    )

    invitations = result.scalars().all()
    has_expired_updates = False
    for invitation in invitations:
        if _expire_if_needed(invitation):
            has_expired_updates = True

    if has_expired_updates:
        await db.commit()
        invitations = [item for item in invitations if item.status == InvitationStatus.PENDING]

    return [_to_invitation_out(invitation) for invitation in invitations]


@router.post("/invitations/{invitation_id}/accept", response_model=InvitationActionResponse)
async def accept_invitation(
    invitation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invitation = await _get_invitation_by_id(db, invitation_id)
    return await _respond_to_invitation(db, invitation, current_user, "accept")


@router.post("/invitations/{invitation_id}/reject", response_model=InvitationActionResponse)
async def reject_invitation(
    invitation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invitation = await _get_invitation_by_id(db, invitation_id)
    return await _respond_to_invitation(db, invitation, current_user, "reject")


@router.get("/invitations/link/{token}", response_model=InvitationLinkValidationOut)
async def validate_invitation_link(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invitation = await _get_invitation_by_token(db, token)

    if not _invitation_is_for_user(invitation, current_user):
        raise HTTPException(403, "This invitation link is not for your account")

    if _expire_if_needed(invitation):
        await db.commit()

    reason = _invitation_state_reason(invitation)
    return InvitationLinkValidationOut(
        invitation=_to_invitation_out(invitation),
        is_valid=invitation.status == InvitationStatus.PENDING,
        reason=reason,
    )


@router.post("/invitations/link/{token}/accept", response_model=InvitationActionResponse)
async def accept_invitation_via_link(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invitation = await _get_invitation_by_token(db, token)
    return await _respond_to_invitation(db, invitation, current_user, "accept")


@router.post("/invitations/link/{token}/reject", response_model=InvitationActionResponse)
async def reject_invitation_via_link(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    invitation = await _get_invitation_by_token(db, token)
    return await _respond_to_invitation(db, invitation, current_user, "reject")
