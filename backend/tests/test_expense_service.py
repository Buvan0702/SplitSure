import pytest
from fastapi import HTTPException

from app.models.user import SplitType
from app.schemas.schemas import SplitInput
from app.services.expense_service import build_split_payloads, validate_split_users


def test_validate_split_users_rejects_duplicates():
    splits = [SplitInput(user_id=1), SplitInput(user_id=1)]

    with pytest.raises(HTTPException) as exc:
        validate_split_users(splits, {1, 2})

    assert exc.value.status_code == 400
    assert "Duplicate users" in exc.value.detail


def test_build_equal_split_payloads_distributes_remainder():
    payloads = build_split_payloads(
        1001,
        SplitType.EQUAL,
        [SplitInput(user_id=1), SplitInput(user_id=2), SplitInput(user_id=3)],
    )

    assert [payload["amount"] for payload in payloads] == [334, 334, 333]


def test_build_percentage_split_payloads_match_total():
    payloads = build_split_payloads(
        1000,
        SplitType.PERCENTAGE,
        [
            SplitInput(user_id=1, percentage=33.33),
            SplitInput(user_id=2, percentage=33.33),
            SplitInput(user_id=3, percentage=33.34),
        ],
    )

    assert sum(payload["amount"] for payload in payloads) == 1000


def test_build_exact_split_payloads_require_full_total():
    with pytest.raises(HTTPException) as exc:
        build_split_payloads(
            1000,
            SplitType.EXACT,
            [SplitInput(user_id=1, amount=200), SplitInput(user_id=2, amount=300)],
        )

    assert exc.value.status_code == 400
    assert "expense total" in exc.value.detail
