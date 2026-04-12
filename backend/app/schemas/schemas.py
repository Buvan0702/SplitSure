from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List
from datetime import datetime
from app.models.user import SplitType, MemberRole, SettlementStatus, ExpenseCategory, AuditEventType


# ─── Auth ───────────────────────────────────────────────────────────────────

class OTPRequest(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        v = v.strip().replace(" ", "")
        if not v.startswith("+"):
            v = "+91" + v
        if len(v) < 10:
            raise ValueError("Invalid phone number")
        return v


class OTPVerify(BaseModel):
    phone: str
    otp: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserOut"


class RefreshRequest(BaseModel):
    refresh_token: str


# ─── User ────────────────────────────────────────────────────────────────────

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    upi_id: Optional[str] = None


class UserOut(BaseModel):
    id: int
    phone: str
    name: Optional[str]
    email: Optional[str]
    upi_id: Optional[str]
    avatar_url: Optional[str]
    is_paid_tier: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Group ───────────────────────────────────────────────────────────────────

class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        v = v.strip()
        if not (2 <= len(v) <= 50):
            raise ValueError("Group name must be 2-50 characters")
        return v


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class GroupMemberOut(BaseModel):
    id: int
    user: UserOut
    role: MemberRole
    joined_at: datetime

    class Config:
        from_attributes = True


class GroupOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_by: int
    is_archived: bool
    created_at: datetime
    members: List[GroupMemberOut] = []

    class Config:
        from_attributes = True


class AddMemberRequest(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        v = v.strip().replace(" ", "")
        if not v.startswith("+"):
            v = "+91" + v
        if len(v) < 10:
            raise ValueError("Invalid phone number")
        return v


class InviteLinkOut(BaseModel):
    token: str
    expires_at: datetime
    use_count: int
    max_uses: int


# ─── Expense ─────────────────────────────────────────────────────────────────

class SplitInput(BaseModel):
    user_id: int
    amount: Optional[int] = None       # in paise, for EXACT
    percentage: Optional[float] = None  # for PERCENTAGE


class ExpenseCreate(BaseModel):
    amount: int  # in paise
    description: str
    category: ExpenseCategory = ExpenseCategory.MISC
    split_type: SplitType
    splits: List[SplitInput]

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError("Amount must be greater than 0")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Description is required")
        return v

    @model_validator(mode="after")
    def validate_splits(self):
        if self.split_type == SplitType.EXACT:
            total = sum(s.amount or 0 for s in self.splits)
            if total != self.amount:
                raise ValueError(f"Split amounts ({total}) must sum to total ({self.amount})")
        elif self.split_type == SplitType.PERCENTAGE:
            total_pct = sum(s.percentage or 0 for s in self.splits)
            if abs(total_pct - 100.0) > 0.01:
                raise ValueError(f"Percentages must sum to 100 (got {total_pct})")
        return self


class ExpenseUpdate(BaseModel):
    amount: Optional[int] = None
    description: Optional[str] = None
    category: Optional[ExpenseCategory] = None
    split_type: Optional[SplitType] = None
    splits: Optional[List[SplitInput]] = None


class SplitOut(BaseModel):
    id: int
    user: UserOut
    split_type: SplitType
    amount: int
    percentage: Optional[float]

    class Config:
        from_attributes = True


class ProofAttachmentOut(BaseModel):
    id: int
    file_name: str
    file_size: int
    mime_type: str
    uploader: UserOut
    uploaded_at: datetime
    presigned_url: Optional[str] = None

    class Config:
        from_attributes = True


class ExpenseOut(BaseModel):
    id: int
    group_id: int
    paid_by_user: UserOut
    amount: int
    description: str
    category: ExpenseCategory
    split_type: SplitType
    is_deleted: bool
    is_disputed: bool
    is_settled: bool
    dispute_note: Optional[str]
    splits: List[SplitOut] = []
    proof_attachments: List[ProofAttachmentOut] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DisputeRequest(BaseModel):
    note: str

    @field_validator("note")
    @classmethod
    def validate_note(cls, v):
        if len(v.strip()) < 10:
            raise ValueError("Dispute note must be at least 10 characters")
        return v.strip()


# ─── Settlement ──────────────────────────────────────────────────────────────

class SettlementInstruction(BaseModel):
    payer_id: int
    payer_name: str
    receiver_id: int
    receiver_name: str
    amount: int  # in paise
    receiver_upi_id: Optional[str]
    upi_deep_link: Optional[str]


class BalanceSummary(BaseModel):
    user: UserOut
    net_balance: int  # positive = owed, negative = owes
    settlement_instructions: List[SettlementInstruction] = []


class GroupBalancesOut(BaseModel):
    group_id: int
    balances: List[BalanceSummary]
    total_expenses: int
    optimized_settlements: List[SettlementInstruction]


class SettlementCreate(BaseModel):
    receiver_id: int
    amount: int

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError("Amount must be greater than 0")
        return v


class SettlementOut(BaseModel):
    id: int
    group_id: int
    payer: UserOut
    receiver: UserOut
    amount: int
    status: SettlementStatus
    dispute_note: Optional[str]
    resolution_note: Optional[str]
    created_at: datetime
    confirmed_at: Optional[datetime]

    class Config:
        from_attributes = True


class DisputeSettlementRequest(BaseModel):
    note: str

    @field_validator("note")
    @classmethod
    def validate_note(cls, v):
        if len(v.strip()) < 10:
            raise ValueError("Dispute note must be at least 10 characters")
        return v.strip()


class ResolveDisputeRequest(BaseModel):
    resolution_note: str

    @field_validator("resolution_note")
    @classmethod
    def validate_resolution_note(cls, v):
        value = v.strip()
        if len(value) < 5:
            raise ValueError("Resolution note must be at least 5 characters")
        return value


# ─── Audit ───────────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: int
    event_type: AuditEventType
    entity_id: Optional[int]
    actor: UserOut
    before_json: Optional[dict]
    after_json: Optional[dict]
    metadata_json: Optional[dict]
    created_at: datetime

    class Config:
        from_attributes = True
