from fastapi import HTTPException

from app.models.user import SplitType
from app.schemas.schemas import SplitInput


def validate_split_users(splits: list[SplitInput], member_ids: set[int]) -> None:
    split_user_ids = [split.user_id for split in splits]
    if not split_user_ids:
        raise HTTPException(400, "At least one split is required")
    if len(split_user_ids) != len(set(split_user_ids)):
        raise HTTPException(400, "Duplicate users in split are not allowed")

    invalid_user_ids = [user_id for user_id in split_user_ids if user_id not in member_ids]
    if invalid_user_ids:
        raise HTTPException(400, "All split users must be members of the group")


def build_split_payloads(
    amount: int,
    split_type: SplitType,
    splits: list[SplitInput],
) -> list[dict]:
    if split_type == SplitType.EXACT:
        total = sum(split.amount or 0 for split in splits)
        if total != amount:
            raise HTTPException(400, "Split amounts must add up to the expense total")
        return [
            {
                "user_id": split.user_id,
                "split_type": split_type,
                "amount": split.amount or 0,
                "percentage": split.percentage,
            }
            for split in splits
        ]

    if split_type == SplitType.PERCENTAGE:
        remaining = amount
        payloads: list[dict] = []
        for index, split in enumerate(splits):
            if index == len(splits) - 1:
                split_amount = remaining
            else:
                split_amount = round(amount * (float(split.percentage or 0) / 100))
                remaining -= split_amount

            if split_amount <= 0:
                raise HTTPException(400, "Split amount must be a positive value")

            payloads.append(
                {
                    "user_id": split.user_id,
                    "split_type": split_type,
                    "amount": split_amount,
                    "percentage": split.percentage,
                }
            )
        return payloads

    share_count = len(splits)
    base_share = amount // share_count
    remainder = amount % share_count
    return [
        {
            "user_id": split.user_id,
            "split_type": split_type,
            "amount": base_share + (1 if index < remainder else 0),
            "percentage": split.percentage,
        }
        for index, split in enumerate(splits)
    ]
