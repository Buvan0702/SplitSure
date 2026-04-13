import pytest
from pydantic import ValidationError

from app.schemas.schemas import ExpenseUpdate, OTPVerify, UserUpdate


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
