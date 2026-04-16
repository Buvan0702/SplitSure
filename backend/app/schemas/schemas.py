import re
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from typing import Optional, List, Literal
from datetime import datetime
from app.models.user import SplitType, MemberRole, SettlementStatus, ExpenseCategory, AuditEventType, InvitationStatus


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


class RegisterRequest(BaseModel):
    name: str
    email: str
    phone: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str):
        value = v.strip()
        if not value:
            raise ValueError("Name is required")
        if len(value) > 100:
            raise ValueError("Name must be 100 characters or fewer")
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str):
        value = v.strip().lower()
        if not value:
            raise ValueError("Email is required")
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Enter a valid email address")
        return value

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

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        v = v.strip().replace(" ", "")
        if not v.startswith("+"):
            v = "+91" + v
        if len(v) < 10:
            raise ValueError("Invalid phone number")
        return v

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v):
        value = v.strip()
        if not (len(value) == 6 and value.isdigit()):
            raise ValueError("OTP must be a 6-digit code")
        return value


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

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]):
        if v is None:
            return v
        value = v.strip()
        if not value:
            return None
        if len(value) > 100:
            raise ValueError("Name must be 100 characters or fewer")
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: Optional[str]):
        if v is None:
            return v
        value = v.strip().lower()
        if not value:
            return None
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Enter a valid email address")
        return value

    @field_validator("upi_id")
    @classmethod
    def validate_upi_id(cls, v: Optional[str]):
        if v is None:
            return v
        value = v.strip().lower()
        if not value:
            return None
        if not re.fullmatch(r"[a-z0-9.\-_]{2,256}@[a-z]{2,64}", value):
            raise ValueError("Enter a valid UPI ID")
        return value


class UserOut(BaseModel):
    id: int
    phone: str
    name: Optional[str]
    email: Optional[str]
    upi_id: Optional[str]
    avatar_url: Optional[str]
    is_paid_tier: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PhoneCheckRequest(BaseModel):
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


class PhoneCheckResponse(BaseModel):
    registered: bool
    user_id: Optional[int] = None
    phone: Optional[str] = None
    user_name: Optional[str] = None


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

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]):
        if v is None:
            return v
        value = v.strip()
        if not (2 <= len(value) <= 50):
            raise ValueError("Group name must be 2-50 characters")
        return value

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: Optional[str]):
        if v is None:
            return v
        value = v.strip()
        return value or None


class GroupMemberOut(BaseModel):
    id: int
    user: UserOut
    role: MemberRole
    joined_at: datetime
    is_registered: bool = True

    model_config = ConfigDict(from_attributes=True)


class GroupOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_by: int
    is_archived: bool
    created_at: datetime
    members: List[GroupMemberOut] = []

    model_config = ConfigDict(from_attributes=True)


class AddMemberRequest(BaseModel):
    phone: Optional[str] = None
    user_id: Optional[int] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]):
        if v is None:
            return v
        v = v.strip().replace(" ", "")
        if not v.startswith("+"):
            v = "+91" + v
        if len(v) < 10:
            raise ValueError("Invalid phone number")
        return v

    @field_validator("user_id")
    @classmethod
    def validate_user_id(cls, v: Optional[int]):
        if v is None:
            return v
        if v <= 0:
            raise ValueError("user_id must be a positive integer")
        return v

    @model_validator(mode="after")
    def validate_identifier(self):
        if not self.phone and self.user_id is None:
            raise ValueError("Provide either phone or user_id")
        if self.phone and self.user_id is not None:
            raise ValueError("Provide only one identifier: phone or user_id")
        return self


class InviteLinkOut(BaseModel):
    token: str
    expires_at: datetime
    use_count: int
    max_uses: int


class InvitationCreateRequest(BaseModel):
    invitee_user_id: Optional[int] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    message: Optional[str] = None

    @field_validator("invitee_user_id")
    @classmethod
    def validate_invitee_user_id(cls, v: Optional[int]):
        if v is None:
            return v
        if v <= 0:
            raise ValueError("invitee_user_id must be a positive integer")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]):
        if v is None:
            return v
        value = v.strip().replace(" ", "")
        if not value:
            return None
        if not value.startswith("+"):
            value = "+91" + value
        if len(value) < 10:
            raise ValueError("Invalid phone number")
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: Optional[str]):
        if v is None:
            return v
        value = v.strip().lower()
        if not value:
            return None
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Enter a valid email address")
        return value

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: Optional[str]):
        if v is None:
            return v
        value = v.strip()
        if not value:
            return None
        if len(value) > 500:
            raise ValueError("Message must be 500 characters or fewer")
        return value

    @model_validator(mode="after")
    def validate_identifier(self):
        provided = [
            self.invitee_user_id is not None,
            bool(self.phone),
            bool(self.email),
        ]
        if sum(provided) != 1:
            raise ValueError("Provide exactly one identifier: invitee_user_id, phone, or email")
        return self


class InvitationOut(BaseModel):
    id: int
    group_id: int
    group_name: str
    inviter_id: int
    inviter_name: str
    inviter_phone: str
    invitee_user_id: Optional[int]
    invitee_phone: Optional[str]
    invitee_email: Optional[str]
    status: InvitationStatus
    message: Optional[str]
    created_at: datetime
    responded_at: Optional[datetime]
    token_expires_at: Optional[datetime]
    is_link_invite: bool


class InvitationCreateResponse(BaseModel):
    invitation: InvitationOut
    delivery_channel: Literal["in_app", "link"]
    invite_url: Optional[str] = None


class InvitationActionResponse(BaseModel):
    invitation: InvitationOut
    group: Optional[GroupOut] = None


class InvitationLinkValidationOut(BaseModel):
    invitation: InvitationOut
    is_valid: bool
    reason: Optional[str] = None


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

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Optional[int]):
        if v is None:
            return v
        if v <= 0:
            raise ValueError("Amount must be greater than 0")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: Optional[str]):
        if v is None:
            return v
        value = v.strip()
        if not value:
            raise ValueError("Description is required")
        return value

    @model_validator(mode="after")
    def validate_split_update(self):
        if self.split_type is not None and not self.splits:
            raise ValueError("Splits are required when changing split type")
        return self


class SplitOut(BaseModel):
    id: int
    user: UserOut
    split_type: SplitType
    amount: int
    percentage: Optional[float]

    model_config = ConfigDict(from_attributes=True)


class ProofAttachmentOut(BaseModel):
    id: int
    file_name: str
    file_size: int
    mime_type: str
    uploader: UserOut
    uploaded_at: datetime
    presigned_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)
