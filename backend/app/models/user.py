import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Integer, Numeric, Boolean, DateTime, Text, Enum, JSON,
    ForeignKey, UniqueConstraint, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class SplitType(str, enum.Enum):
    EQUAL = "equal"
    EXACT = "exact"
    PERCENTAGE = "percentage"


class MemberRole(str, enum.Enum):
    ADMIN = "admin"
    MEMBER = "member"


class SettlementStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    DISPUTED = "disputed"


class ExpenseCategory(str, enum.Enum):
    FOOD = "food"
    TRANSPORT = "transport"
    ACCOMMODATION = "accommodation"
    UTILITIES = "utilities"
    MISC = "misc"


class AuditEventType(str, enum.Enum):
    EXPENSE_CREATED = "expense_created"
    EXPENSE_EDITED = "expense_edited"
    EXPENSE_DELETED = "expense_deleted"
    SETTLEMENT_INITIATED = "settlement_initiated"
    SETTLEMENT_CONFIRMED = "settlement_confirmed"
    SETTLEMENT_DISPUTED = "settlement_disputed"
    DISPUTE_RESOLVED = "dispute_resolved"
    MEMBER_ADDED = "member_added"
    MEMBER_REMOVED = "member_removed"
    GROUP_CREATED = "group_created"
    GROUP_UPDATED = "group_updated"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    phone: Mapped[str] = mapped_column(String(15), unique=True, index=True, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    upi_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_paid_tier: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    group_memberships: Mapped[list["GroupMember"]] = relationship("GroupMember", back_populates="user")
    expenses_paid: Mapped[list["Expense"]] = relationship("Expense", back_populates="paid_by_user", foreign_keys="Expense.paid_by")


class OTPRecord(Base):
    __tablename__ = "otp_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone: Mapped[str] = mapped_column(String(15), index=True)
    otp_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    members: Mapped[list["GroupMember"]] = relationship("GroupMember", back_populates="group")
    expenses: Mapped[list["Expense"]] = relationship("Expense", back_populates="group")
    settlements: Mapped[list["Settlement"]] = relationship("Settlement", back_populates="group")
    audit_logs: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="group")
    invite_links: Mapped[list["InviteLink"]] = relationship("InviteLink", back_populates="group")


class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = (UniqueConstraint("group_id", "user_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    role: Mapped[MemberRole] = mapped_column(Enum(MemberRole), default=MemberRole.MEMBER)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    group: Mapped["Group"] = relationship("Group", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="group_memberships")


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"), nullable=False)
    paid_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # Stored in paise
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[ExpenseCategory] = mapped_column(Enum(ExpenseCategory), default=ExpenseCategory.MISC)
    split_type: Mapped[SplitType] = mapped_column(Enum(SplitType), nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    is_disputed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_settled: Mapped[bool] = mapped_column(Boolean, default=False)
    dispute_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dispute_raised_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    group: Mapped["Group"] = relationship("Group", back_populates="expenses")
    paid_by_user: Mapped["User"] = relationship("User", back_populates="expenses_paid", foreign_keys=[paid_by])
    splits: Mapped[list["Split"]] = relationship("Split", back_populates="expense", cascade="all, delete-orphan")
    proof_attachments: Mapped[list["ProofAttachment"]] = relationship("ProofAttachment", back_populates="expense")


class Split(Base):
    __tablename__ = "splits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    expense_id: Mapped[int] = mapped_column(ForeignKey("expenses.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    split_type: Mapped[SplitType] = mapped_column(Enum(SplitType), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # in paise
    percentage: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)

    # Relationships
    expense: Mapped["Expense"] = relationship("Expense", back_populates="splits")
    user: Mapped["User"] = relationship("User")


class Settlement(Base):
    __tablename__ = "settlements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"), nullable=False)
    payer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    receiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # in paise
    status: Mapped[SettlementStatus] = mapped_column(Enum(SettlementStatus), default=SettlementStatus.PENDING)
    dispute_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolution_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    group: Mapped["Group"] = relationship("Group", back_populates="settlements")
    payer: Mapped["User"] = relationship("User", foreign_keys=[payer_id])
    receiver: Mapped["User"] = relationship("User", foreign_keys=[receiver_id])


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"), nullable=False, index=True)
    event_type: Mapped[AuditEventType] = mapped_column(Enum(AuditEventType), nullable=False)
    entity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    before_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    after_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    group: Mapped["Group"] = relationship("Group", back_populates="audit_logs")
    actor: Mapped["User"] = relationship("User", foreign_keys=[actor_id])


class ProofAttachment(Base):
    __tablename__ = "proof_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    expense_id: Mapped[int] = mapped_column(ForeignKey("expenses.id"), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(500), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)  # bytes
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    expense: Mapped["Expense"] = relationship("Expense", back_populates="proof_attachments")
    uploader: Mapped["User"] = relationship("User", foreign_keys=[uploader_id])


class InviteLink(Base):
    __tablename__ = "invite_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    max_uses: Mapped[int] = mapped_column(Integer, default=10)
    use_count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    group: Mapped["Group"] = relationship("Group", back_populates="invite_links")
