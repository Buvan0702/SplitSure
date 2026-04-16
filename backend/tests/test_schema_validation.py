import pytest
from pydantic import ValidationError

from app.schemas.schemas import AddMemberRequest, ExpenseUpdate, InvitationCreateRequest, OTPVerify, RegisterRequest, UserUpdate


def test_otp_verify_normalizes_phone_and_requires_six_digits():
    payload = OTPVerify(phone="9876543210", otp="123456")

    assert payload.phone == "+919876543210"

    with pytest.raises(ValidationError):
        OTPVerify(phone="9876543210", otp="12345")


def test_user_update_trims_and_normalizes_optional_fields():
    payload = UserUpdate(name="  Jane Doe  ", email="  Jane@Example.com ", upi_id="  Jane.Doe@YBL ")

    assert payload.name == "Jane Doe"
    assert payload.email == "jane@example.com"
    assert payload.upi_id == "jane.doe@ybl"

    with pytest.raises(ValidationError):
        UserUpdate(email="not-an-email")


def test_expense_update_requires_splits_when_switching_modes():
    with pytest.raises(ValidationError):
        ExpenseUpdate(split_type="percentage")


def test_register_request_requires_valid_name_email_phone():
    payload = RegisterRequest(name="  Alice  ", email=" Alice@Example.com ", phone="9876501234")

    assert payload.name == "Alice"
    assert payload.email == "alice@example.com"
    assert payload.phone == "+919876501234"

    with pytest.raises(ValidationError):
        RegisterRequest(name="", email="alice@example.com", phone="9876501234")

    with pytest.raises(ValidationError):
        RegisterRequest(name="Alice", email="invalid-email", phone="9876501234")


def test_add_member_request_accepts_exactly_one_identifier():
    by_phone = AddMemberRequest(phone="9876501234")
    by_user_id = AddMemberRequest(user_id=42)

    assert by_phone.phone == "+919876501234"
    assert by_user_id.user_id == 42

    with pytest.raises(ValidationError):
        AddMemberRequest()

    with pytest.raises(ValidationError):
        AddMemberRequest(phone="9876501234", user_id=42)


def test_invitation_request_requires_exactly_one_identifier():
    by_phone = InvitationCreateRequest(phone="9876501234")
    by_email = InvitationCreateRequest(email="member@example.com")
    by_user_id = InvitationCreateRequest(invitee_user_id=24)

    assert by_phone.phone == "+919876501234"
    assert by_email.email == "member@example.com"
    assert by_user_id.invitee_user_id == 24

    with pytest.raises(ValidationError):
        InvitationCreateRequest(phone="9876501234", email="member@example.com")

    with pytest.raises(ValidationError):
        InvitationCreateRequest()
