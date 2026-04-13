from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.models.user import (
    Expense, Split, SplitType, GroupMember, User,
    ProofAttachment, AuditEventType, ExpenseCategory
)
from app.schemas.schemas import (
    ExpenseCreate, ExpenseUpdate, ExpenseOut, DisputeRequest, ProofAttachmentOut, SplitInput
)
from app.services.audit_service import log_event
from app.services.expense_service import build_split_payloads, validate_split_users
from app.services.s3_service import upload_proof, generate_presigned_url

router = APIRouter(prefix="/groups/{group_id}/expenses", tags=["expenses"])


async def _require_membership(db: AsyncSession, group_id: int, user_id: int):
    result = await db.execute(
        select(GroupMember)
        .where(GroupMember.group_id == group_id)
        .where(GroupMember.user_id == user_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(403, "Not a member of this group")
    return member


async def _get_group_member_ids(db: AsyncSession, group_id: int) -> set[int]:
    result = await db.execute(
        select(GroupMember.user_id).where(GroupMember.group_id == group_id)
    )
    return set(result.scalars().all())


async def _replace_splits(db: AsyncSession, expense: Expense, split_payloads: list[dict]) -> None:
    for split in list(expense.splits):
        await db.delete(split)
    await db.flush()

    for payload in split_payloads:
        db.add(
            Split(
                expense_id=expense.id,
                user_id=payload["user_id"],
                split_type=payload["split_type"],
                amount=payload["amount"],
                percentage=payload["percentage"],
            )
        )


async def _load_expense(db: AsyncSession, expense_id: int, group_id: int) -> Expense:
    result = await db.execute(
        select(Expense)
        .options(
            selectinload(Expense.paid_by_user),
            selectinload(Expense.splits).selectinload(Split.user),
            selectinload(Expense.proof_attachments).selectinload(ProofAttachment.uploader),
        )
        .where(Expense.id == expense_id)
        .where(Expense.group_id == group_id)
        .where(Expense.is_deleted == False)
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(404, "Expense not found")
    return expense


def _expense_to_dict(expense: Expense) -> dict:
    return {
        "id": expense.id,
        "amount": expense.amount,
        "description": expense.description,
        "category": expense.category.value,
        "split_type": expense.split_type.value,
        "paid_by": expense.paid_by,
        "splits": [
            {
                "user_id": split.user_id,
                "amount": split.amount,
                "percentage": float(split.percentage) if split.percentage is not None else None,
                "split_type": split.split_type.value,
            }
            for split in expense.splits
        ],
    }


def _build_expense_out(expense: Expense) -> dict:
    """Attach presigned URLs to proof attachments."""
    expense_dict = ExpenseOut.model_validate(expense).model_dump()
    for proof in expense_dict.get("proof_attachments", []):
        # Look up s3_key from original model
        for att in expense.proof_attachments:
            if att.id == proof["id"]:
                proof["presigned_url"] = generate_presigned_url(att.s3_key)
    return expense_dict


async def _rebuild_splits_for_update(
    db: AsyncSession,
    group_id: int,
    expense: Expense,
    body: ExpenseUpdate,
) -> None:
    split_inputs = body.splits
    next_split_type = body.split_type or expense.split_type

    if split_inputs is None and body.amount is None and body.split_type is None:
        return

    if split_inputs is None:
        if next_split_type == SplitType.EXACT:
            raise HTTPException(400, "Exact split updates require split amounts")
        split_inputs = [
            SplitInput(
                user_id=split.user_id,
                percentage=float(split.percentage) if split.percentage is not None else None,
            )
            for split in expense.splits
        ]

    member_ids = await _get_group_member_ids(db, group_id)
    validate_split_users(split_inputs, member_ids)
    split_payloads = build_split_payloads(
        expense.amount,
        next_split_type,
        split_inputs,
        paid_by_user_id=expense.paid_by,
    )
    expense.split_type = next_split_type
    await _replace_splits(db, expense, split_payloads)


@router.post("", response_model=ExpenseOut, status_code=201)
async def create_expense(
    group_id: int,
    body: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(db, group_id, current_user.id)
    member_ids = await _get_group_member_ids(db, group_id)
    validate_split_users(body.splits, member_ids)
    split_payloads = build_split_payloads(
        body.amount,
        body.split_type,
        body.splits,
        paid_by_user_id=current_user.id,
    )

    expense = Expense(
        group_id=group_id,
        paid_by=current_user.id,
        amount=body.amount,
        description=body.description,
        category=body.category,
        split_type=body.split_type,
    )
    db.add(expense)
    await db.flush()
    await _replace_splits(db, expense, split_payloads)

    await log_event(
        db, group_id, AuditEventType.EXPENSE_CREATED, current_user.id,
        entity_id=expense.id,
        after_json=_expense_to_dict(expense),
    )

    await db.commit()
    return _build_expense_out(await _load_expense(db, expense.id, group_id))


@router.get("", response_model=list[ExpenseOut])
async def list_expenses(
    group_id: int,
    category: Optional[ExpenseCategory] = None,
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(db, group_id, current_user.id)

    query = (
        select(Expense)
        .options(
            selectinload(Expense.paid_by_user),
            selectinload(Expense.splits).selectinload(Split.user),
            selectinload(Expense.proof_attachments).selectinload(ProofAttachment.uploader),
        )
        .where(Expense.group_id == group_id)
        .where(Expense.is_deleted == False)
        .order_by(Expense.created_at.desc())
    )

    if category:
        query = query.where(Expense.category == category)
    if search:
        query = query.where(Expense.description.ilike(f"%{search}%"))

    result = await db.execute(query)
    return [_build_expense_out(expense) for expense in result.scalars().all()]


@router.get("/{expense_id}", response_model=ExpenseOut)
async def get_expense(
    group_id: int,
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(db, group_id, current_user.id)
    return _build_expense_out(await _load_expense(db, expense_id, group_id))


@router.patch("/{expense_id}", response_model=ExpenseOut)
async def update_expense(
    group_id: int,
    expense_id: int,
    body: ExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(db, group_id, current_user.id)
    expense = await _load_expense(db, expense_id, group_id)

    if expense.is_settled:
        raise HTTPException(400, "Cannot edit a settled expense")
    if expense.is_disputed:
        raise HTTPException(400, "Cannot edit a disputed expense")

    before = _expense_to_dict(expense)

    if body.amount is not None:
        expense.amount = body.amount
    if body.description is not None:
        expense.description = body.description
    if body.category is not None:
        expense.category = body.category
    await _rebuild_splits_for_update(db, group_id, expense, body)

    await log_event(
        db, group_id, AuditEventType.EXPENSE_EDITED, current_user.id,
        entity_id=expense_id, before_json=before,
        after_json=_expense_to_dict(expense),
    )

    await db.commit()
    return _build_expense_out(await _load_expense(db, expense_id, group_id))


@router.delete("/{expense_id}", status_code=204)
async def delete_expense(
    group_id: int,
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(db, group_id, current_user.id)
    expense = await _load_expense(db, expense_id, group_id)

    if expense.is_settled:
        raise HTTPException(400, "Cannot delete a settled expense")
    if expense.is_disputed:
        raise HTTPException(400, "Cannot delete a disputed expense")

    before = _expense_to_dict(expense)
    expense.is_deleted = True

    await log_event(
        db, group_id, AuditEventType.EXPENSE_DELETED, current_user.id,
        entity_id=expense_id,
        before_json=before,
    )

    await db.commit()


@router.post("/{expense_id}/dispute", response_model=ExpenseOut)
async def dispute_expense(
    group_id: int,
    expense_id: int,
    body: DisputeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(db, group_id, current_user.id)
    expense = await _load_expense(db, expense_id, group_id)

    if expense.is_settled:
        raise HTTPException(400, "Cannot dispute a settled expense")

    expense.is_disputed = True
    expense.dispute_note = body.note
    expense.dispute_raised_by = current_user.id

    await log_event(
        db, group_id, AuditEventType.EXPENSE_EDITED, current_user.id,
        entity_id=expense_id,
        metadata_json={"dispute_note": body.note},
    )

    await db.commit()
    return _build_expense_out(await _load_expense(db, expense_id, group_id))


@router.post("/{expense_id}/resolve-dispute", response_model=ExpenseOut)
async def resolve_dispute(
    group_id: int,
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.user import MemberRole
    result = await db.execute(
        select(GroupMember)
        .where(GroupMember.group_id == group_id)
        .where(GroupMember.user_id == current_user.id)
    )
    member = result.scalar_one_or_none()
    if not member or member.role != MemberRole.ADMIN:
        raise HTTPException(403, "Only admins can resolve disputes")

    expense = await _load_expense(db, expense_id, group_id)
    expense.is_disputed = False
    expense.dispute_note = None
    expense.dispute_raised_by = None

    await log_event(
        db, group_id, AuditEventType.DISPUTE_RESOLVED, current_user.id,
        entity_id=expense_id,
    )

    await db.commit()
    return _build_expense_out(await _load_expense(db, expense_id, group_id))


@router.post("/{expense_id}/attachments", response_model=ProofAttachmentOut, status_code=201)
async def upload_attachment(
    group_id: int,
    expense_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(db, group_id, current_user.id)
    expense = await _load_expense(db, expense_id, group_id)

    # Count existing attachments
    result = await db.execute(
        select(ProofAttachment).where(ProofAttachment.expense_id == expense_id)
    )
    existing_count = len(result.scalars().all())
    if existing_count >= settings.MAX_ATTACHMENTS_PER_EXPENSE:
        raise HTTPException(400, f"Maximum {settings.MAX_ATTACHMENTS_PER_EXPENSE} attachments per expense")

    s3_key, file_hash, file_size = await upload_proof(file, expense_id, current_user.id)

    attachment = ProofAttachment(
        expense_id=expense_id,
        s3_key=s3_key,
        file_hash=file_hash,
        file_name=file.filename or "attachment",
        file_size=file_size,
        mime_type=file.content_type or "application/octet-stream",
        uploader_id=current_user.id,
    )
    db.add(attachment)
    await db.commit()

    result = await db.execute(
        select(ProofAttachment)
        .options(selectinload(ProofAttachment.uploader))
        .where(ProofAttachment.id == attachment.id)
    )
    attachment = result.scalar_one()

    result_out = ProofAttachmentOut.model_validate(attachment)
    result_out.presigned_url = generate_presigned_url(s3_key)
    return result_out
