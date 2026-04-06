import uuid
from datetime import datetime, timezone
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import (
    Group, GroupMember, Expense, Split, Settlement,
    SettlementStatus, User
)
from app.services.settlement_engine import compute_net_balances, minimize_transactions, build_upi_deep_link

router = APIRouter(prefix="/groups/{group_id}/report", tags=["reports"])

# Brand colors
BRAND_PURPLE = colors.HexColor("#6C63FF")
BRAND_DARK = colors.HexColor("#1A1A2E")
BRAND_LIGHT = colors.HexColor("#F8F9FF")
BRAND_GREEN = colors.HexColor("#00C897")
BRAND_RED = colors.HexColor("#FF6B6B")
GRAY = colors.HexColor("#888888")


def rupees(paise: int) -> str:
    return f"₹{paise / 100:,.2f}"


async def _require_membership(db, group_id, user_id):
    result = await db.execute(
        select(GroupMember)
        .where(GroupMember.group_id == group_id)
        .where(GroupMember.user_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(403, "Not a member of this group")


@router.get("")
async def generate_report(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_paid_tier:
        raise HTTPException(403, "PDF reports are available on the Paid tier only")

    await _require_membership(db, group_id, current_user.id)

    # Load group
    result = await db.execute(
        select(Group)
        .options(selectinload(Group.members).selectinload(GroupMember.user))
        .where(Group.id == group_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "Group not found")

    # Load expenses
    result = await db.execute(
        select(Expense)
        .options(
            selectinload(Expense.paid_by_user),
            selectinload(Expense.splits).selectinload(Split.user),
        )
        .where(Expense.group_id == group_id)
        .where(Expense.is_deleted == False)
        .order_by(Expense.created_at)
    )
    expenses = result.scalars().all()

    # Compute balances
    expense_data = [(e.paid_by, [(s.user_id, s.amount) for s in e.splits]) for e in expenses]
    balances = compute_net_balances(expense_data)
    transactions = minimize_transactions(balances)
    user_map = {m.user_id: m.user for m in group.members}

    report_id = str(uuid.uuid4()).upper()
    generated_at = datetime.now(timezone.utc)

    # Build PDF
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()
    story = []

    # ─── Header ───────────────────────────────────────────────────────
    title_style = ParagraphStyle(
        "Title", parent=styles["Normal"],
        fontSize=28, textColor=BRAND_PURPLE,
        fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=2
    )
    sub_style = ParagraphStyle(
        "Sub", parent=styles["Normal"],
        fontSize=11, textColor=GRAY,
        alignment=TA_CENTER, spaceAfter=6
    )
    story.append(Paragraph("SplitSure", title_style))
    story.append(Paragraph("Settlement Report", sub_style))
    story.append(HRFlowable(width="100%", thickness=2, color=BRAND_PURPLE))
    story.append(Spacer(1, 6 * mm))

    # Group info
    info_style = ParagraphStyle("Info", fontSize=11, leading=16)
    story.append(Paragraph(f"<b>Group:</b> {group.name}", info_style))
    if group.description:
        story.append(Paragraph(f"<b>Description:</b> {group.description}", info_style))
    story.append(Paragraph(f"<b>Generated:</b> {generated_at.strftime('%d %B %Y, %H:%M UTC')}", info_style))
    story.append(Paragraph(f"<b>Report ID:</b> {report_id}", info_style))
    story.append(Spacer(1, 6 * mm))

    # ─── Members ──────────────────────────────────────────────────────
    section_style = ParagraphStyle(
        "Section", fontSize=13, fontName="Helvetica-Bold",
        textColor=BRAND_DARK, spaceBefore=4, spaceAfter=3
    )
    story.append(Paragraph("Members", section_style))
    member_data = [["Name", "Phone", "Role", "UPI ID"]]
    for m in group.members:
        u = m.user
        member_data.append([
            u.name or "—",
            u.phone,
            m.role.value.title(),
            u.upi_id or "—",
        ])

    member_table = Table(member_data, colWidths=[45 * mm, 40 * mm, 25 * mm, 55 * mm])
    member_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_PURPLE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BRAND_LIGHT, colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("PADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(member_table)
    story.append(Spacer(1, 6 * mm))

    # ─── Expenses ─────────────────────────────────────────────────────
    story.append(Paragraph(f"Expenses ({len(expenses)} total)", section_style))
    exp_data = [["Date", "Description", "Category", "Paid By", "Amount"]]
    total_amount = 0
    for e in expenses:
        exp_data.append([
            e.created_at.strftime("%d/%m/%y"),
            e.description[:35],
            e.category.value.title(),
            e.paid_by_user.name or e.paid_by_user.phone,
            rupees(e.amount),
        ])
        total_amount += e.amount

    exp_data.append(["", "", "", "TOTAL", rupees(total_amount)])

    exp_table = Table(exp_data, colWidths=[22 * mm, 60 * mm, 28 * mm, 35 * mm, 25 * mm])
    exp_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#EEF0FF")),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, BRAND_LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
        ("PADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(exp_table)
    story.append(Spacer(1, 6 * mm))

    # ─── Balances ─────────────────────────────────────────────────────
    story.append(Paragraph("Balance Summary", section_style))
    bal_data = [["Member", "Net Balance", "Status"]]
    for m in group.members:
        bal = balances.get(m.user_id, 0)
        status = "Settled" if bal == 0 else ("Gets Back" if bal > 0 else "Owes")
        bal_data.append([
            m.user.name or m.user.phone,
            rupees(abs(bal)),
            status,
        ])

    bal_table = Table(bal_data, colWidths=[70 * mm, 50 * mm, 50 * mm])
    bal_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_GREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BRAND_LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(bal_table)
    story.append(Spacer(1, 6 * mm))

    # ─── Optimized Settlements ────────────────────────────────────────
    if transactions:
        story.append(Paragraph("Optimized Settlement Instructions", section_style))
        settle_data = [["Payer", "Receiver", "Amount"]]
        for t in transactions:
            payer = user_map.get(t.payer_id)
            receiver = user_map.get(t.receiver_id)
            settle_data.append([
                (payer.name or payer.phone) if payer else str(t.payer_id),
                (receiver.name or receiver.phone) if receiver else str(t.receiver_id),
                rupees(t.amount),
            ])

        settle_table = Table(settle_data, colWidths=[65 * mm, 65 * mm, 40 * mm])
        settle_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_RED),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FFF5F5")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
            ("PADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(settle_table)

    # ─── Footer ───────────────────────────────────────────────────────
    story.append(Spacer(1, 10 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=GRAY))
    footer_style = ParagraphStyle("Footer", fontSize=8, textColor=GRAY, alignment=TA_CENTER)
    story.append(Paragraph(
        f"Generated by SplitSure | Report ID: {report_id} | {generated_at.strftime('%Y-%m-%dT%H:%M:%SZ')}",
        footer_style,
    ))

    doc.build(story)
    buffer.seek(0)

    filename = f"splitsure_{group.name.replace(' ', '_')}_{generated_at.strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
