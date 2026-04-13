from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import (
    Expense, Split, Settlement, SettlementStatus,
    GroupMember, MemberRole, User, AuditEventType
)
from app.schemas.schemas import (
    GroupBalancesOut, BalanceSummary, SettlementInstruction,
    SettlementCreate, SettlementOut, DisputeSettlementRequest, ResolveDisputeRequest
)
from app.services.settlement_engine import (
    apply_confirmed_settlements,
    build_upi_deep_link,
    compute_net_balances,
    minimize_transactions,
    transaction_lookup,
    Transaction,
)
from app.services.audit_service import log_event

router = APIRouter(prefix="/groups/{group_id}/settlements", tags=["settlements"])


async def _require_membership(db, group_id, user_id):
    result = await db.execute(
        select(GroupMember)
        .where(GroupMember.group_id == group_id)
        .where(GroupMember.user_id == user_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(403, "Not a member of this group")
    return member


async def _get_user_ids_for_group(db: AsyncSession, group_id: int) -> set[int]:
    result = await db.execute(
        select(GroupMember.user_id).where(GroupMember.group_id == group_id)
    )
    return set(result.scalars().all())


async def _optimized_settlement_lookup(db: AsyncSession, group_id: int) -> dict[tuple[int, int], int]:
    result = await db.execute(
        select(Expense)
        .options(selectinload(Expense.splits))
        .where(Expense.group_id == group_id)
        .where(Expense.is_deleted == False)
        .where(Expense.is_settled == False)
    )
    expenses = result.scalars().all()
    expense_data = [(expense.paid_by, [(split.user_id, split.amount) for split in expense.splits]) for expense in expenses]
    balances = compute_net_balances(expense_data)

    confirmed_result = await db.execute(
        select(Settlement)
        .where(Settlement.group_id == group_id)
        .where(Settlement.status == SettlementStatus.CONFIRMED)
    )
    confirmed_settlements = confirmed_result.scalars().all()
    adjusted_balances = apply_confirmed_settlements(
        balances,
        (
            Transaction(
                payer_id=settlement.payer_id,
                receiver_id=settlement.receiver_id,
                amount=settlement.amount,
            )
            for settlement in confirmed_settlements
        ),
    )
    return transaction_lookup(minimize_transactions(adjusted_balances))


async def _mark_related_expenses_as_settled(
    db: AsyncSession,
    group_id: int,
    payer_id: int,
    receiver_id: int,
    amount: int,
) -> list[int]:
    result = await db.execute(
        select(Expense)
        .options(selectinload(Expense.splits))
        .where(Expense.group_id == group_id)
        .where(Expense.is_deleted == False)
        .where(Expense.is_settled == False)
        .order_by(Expense.created_at.asc())
    )
    expenses = result.scalars().all()

    remaining = amount
    settled_ids: list[int] = []

    for expense in expenses:
        if remaining <= 0:
            break

        participants = {split.user_id for split in expense.splits}
        if participants | {expense.paid_by} != {payer_id, receiver_id}:
            continue

        if expense.paid_by == receiver_id:
            owed_share = sum(split.amount for split in expense.splits if split.user_id == payer_id)
        elif expense.paid_by == payer_id:
            owed_share = sum(split.amount for split in expense.splits if split.user_id == receiver_id)
        else:
            continue

        if owed_share <= 0 or remaining < owed_share:
            continue

        expense.is_settled = True
        settled_ids.append(expense.id)
        remaining -= owed_share

    return settled_ids


@router.get("/balances", response_model=GroupBalancesOut)
async def get_balances(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(db, group_id, current_user.id)

    # Load all non-deleted, non-settled expenses with their splits
    result = await db.execute(
        select(Expense)
        .options(selectinload(Expense.splits))
        .where(Expense.group_id == group_id)
        .where(Expense.is_deleted == False)
        .where(Expense.is_settled == False)
    )
    expenses = result.scalars().all()

    # Build raw balance data for engine
    expense_data = []
    for exp in expenses:
        splits_list = [(s.user_id, s.amount) for s in exp.splits]
        expense_data.append((exp.paid_by, splits_list))

    balances = compute_net_balances(expense_data)

    confirmed_result = await db.execute(
        select(Settlement)
        .where(Settlement.group_id == group_id)
        .where(Settlement.status == SettlementStatus.CONFIRMED)
    )
    confirmed_settlements = confirmed_result.scalars().all()
    transactions = minimize_transactions(
        apply_confirmed_settlements(
            balances,
            (
                Transaction(
                    payer_id=settlement.payer_id,
                    receiver_id=settlement.receiver_id,
                    amount=settlement.amount,
                )
                for settlement in confirmed_settlements
            ),
        )
    )

    # Load all members to map user details
    result = await db.execute(
        select(GroupMember)
        .options(selectinload(GroupMember.user))
        .where(GroupMember.group_id == group_id)
    )
    members = result.scalars().all()
    user_map = {m.user_id: m.user for m in members}

    # Build settlement instructions
    instructions = []
    for txn in transactions:
        payer = user_map.get(txn.payer_id)
        receiver = user_map.get(txn.receiver_id)
        if not payer or not receiver:
            continue

        upi_link = None
        if receiver.upi_id:
            upi_link = build_upi_deep_link(
                receiver.upi_id,
                receiver.name or receiver.phone,
                txn.amount,
                f"SplitSure settlement",
            )

        instructions.append(SettlementInstruction(
            payer_id=txn.payer_id,
            payer_name=payer.name or payer.phone,
            receiver_id=txn.receiver_id,
            receiver_name=receiver.name or receiver.phone,
            amount=txn.amount,
            receiver_upi_id=receiver.upi_id,
            upi_deep_link=upi_link,
        ))

    # Build per-member balance summary
    from app.schemas.schemas import UserOut
    balance_summaries = []
    for member_obj in members:
        uid = member_obj.user_id
        net = balances.get(uid, 0)
        member_instructions = [i for i in instructions if i.payer_id == uid]
        balance_summaries.append(BalanceSummary(
            user=UserOut.model_validate(member_obj.user),
            net_balance=net,
            settlement_instructions=member_instructions,
        ))

    total_expenses = sum(e.amount for e in expenses)

    return GroupBalancesOut(
        group_id=group_id,
        balances=balance_summaries,
        total_expenses=total_expenses,
        optimized_settlements=instructions,
    )


@router.post("", response_model=SettlementOut, status_code=201)
async def initiate_settlement(
    group_id: int,
    body: SettlementCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(db, group_id, current_user.id)
    member_ids = await _get_user_ids_for_group(db, group_id)

    if body.receiver_id == current_user.id:
        raise HTTPException(400, "Cannot settle with yourself")
    if body.receiver_id not in member_ids:
        raise HTTPException(400, "Receiver must be a member of this group")

    settlement_map = await _optimized_settlement_lookup(db, group_id)
    expected_amount = settlement_map.get((current_user.id, body.receiver_id))
    if expected_amount is None:
        raise HTTPException(400, "No outstanding balance exists for this settlement")
    if body.amount != expected_amount:
        raise HTTPException(400, f"Settlement amount must match the outstanding balance of {expected_amount}")

    existing_result = await db.execute(
        select(Settlement)
        .where(Settlement.group_id == group_id)
        .where(Settlement.payer_id == current_user.id)
        .where(Settlement.receiver_id == body.receiver_id)
        .where(Settlement.status == SettlementStatus.PENDING)
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(409, "A pending settlement already exists for this receiver")

    settlement = Settlement(
        group_id=group_id,
        payer_id=current_user.id,
        receiver_id=body.receiver_id,
        amount=body.amount,
        status=SettlementStatus.PENDING,
    )
    db.add(settlement)
    await db.flush()

    await log_event(
        db, group_id, AuditEventType.SETTLEMENT_INITIATED, current_user.id,
        entity_id=settlement.id,
        after_json={"payer": current_user.id, "receiver": body.receiver_id, "amount": body.amount},
    )

    await db.commit()

    result = await db.execute(
        select(Settlement)
        .options(
            selectinload(Settlement.payer),
            selectinload(Settlement.receiver),
        )
        .where(Settlement.id == settlement.id)
    )
    return result.scalar_one()


@router.post("/{settlement_id}/confirm", response_model=SettlementOut)
async def confirm_settlement(
    group_id: int,
    settlement_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(db, group_id, current_user.id)

    result = await db.execute(
        select(Settlement)
        .options(selectinload(Settlement.payer), selectinload(Settlement.receiver))
        .where(Settlement.id == settlement_id)
        .where(Settlement.group_id == group_id)
    )
    settlement = result.scalar_one_or_none()
    if not settlement:
        raise HTTPException(404, "Settlement not found")

    if settlement.receiver_id != current_user.id:
        raise HTTPException(403, "Only the receiver can confirm a settlement")

    if settlement.status != SettlementStatus.PENDING:
        raise HTTPException(400, f"Settlement is already {settlement.status.value}")

    settlement.status = SettlementStatus.CONFIRMED
    settlement.confirmed_at = datetime.now(timezone.utc)
    settled_expense_ids = await _mark_related_expenses_as_settled(
        db,
        group_id,
        settlement.payer_id,
        settlement.receiver_id,
        settlement.amount,
    )

    await log_event(
        db, group_id, AuditEventType.SETTLEMENT_CONFIRMED, current_user.id,
        entity_id=settlement_id,
        metadata_json={"settled_expense_ids": settled_expense_ids},
    )

    await db.commit()
    await db.refresh(settlement)
    return settlement


@router.post("/{settlement_id}/dispute", response_model=SettlementOut)
async def dispute_settlement(
    group_id: int,
    settlement_id: int,
    body: DisputeSettlementRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(db, group_id, current_user.id)

    result = await db.execute(
        select(Settlement)
        .options(selectinload(Settlement.payer), selectinload(Settlement.receiver))
        .where(Settlement.id == settlement_id)
        .where(Settlement.group_id == group_id)
    )
    settlement = result.scalar_one_or_none()
    if not settlement:
        raise HTTPException(404, "Settlement not found")

    if settlement.receiver_id != current_user.id:
        raise HTTPException(403, "Only the receiver can dispute a settlement")

    if settlement.status != SettlementStatus.PENDING:
        raise HTTPException(400, f"Settlement is already {settlement.status.value}")

    settlement.status = SettlementStatus.DISPUTED
    settlement.dispute_note = body.note

    await log_event(
        db, group_id, AuditEventType.SETTLEMENT_DISPUTED, current_user.id,
        entity_id=settlement_id,
        metadata_json={"note": body.note},
    )

    await db.commit()
    await db.refresh(settlement)
    return settlement


@router.post("/{settlement_id}/resolve", response_model=SettlementOut)
async def resolve_settlement_dispute(
    group_id: int,
    settlement_id: int,
    body: ResolveDisputeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await _require_membership(db, group_id, current_user.id)
    if member.role != MemberRole.ADMIN:
        raise HTTPException(403, "Only admins can resolve disputes")

    result = await db.execute(
        select(Settlement)
        .options(selectinload(Settlement.payer), selectinload(Settlement.receiver))
        .where(Settlement.id == settlement_id)
        .where(Settlement.group_id == group_id)
    )
    settlement = result.scalar_one_or_none()
    if not settlement:
        raise HTTPException(404, "Settlement not found")
    if settlement.status != SettlementStatus.DISPUTED:
        raise HTTPException(400, "Only disputed settlements can be resolved")

    settlement.status = SettlementStatus.CONFIRMED
    settlement.resolution_note = body.resolution_note
    settlement.confirmed_at = datetime.now(timezone.utc)
    settled_expense_ids = await _mark_related_expenses_as_settled(
        db,
        group_id,
        settlement.payer_id,
        settlement.receiver_id,
        settlement.amount,
    )

    await log_event(
        db, group_id, AuditEventType.DISPUTE_RESOLVED, current_user.id,
        entity_id=settlement_id,
        metadata_json={"resolution_note": body.resolution_note, "settled_expense_ids": settled_expense_ids},
    )

    await db.commit()
    await db.refresh(settlement)
    return settlement


@router.get("", response_model=list[SettlementOut])
async def list_settlements(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(db, group_id, current_user.id)

    result = await db.execute(
        select(Settlement)
        .options(selectinload(Settlement.payer), selectinload(Settlement.receiver))
        .where(Settlement.group_id == group_id)
        .order_by(Settlement.created_at.desc())
    )
    return result.scalars().all()
