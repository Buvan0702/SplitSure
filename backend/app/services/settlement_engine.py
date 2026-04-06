"""
Settlement Engine — Greedy balance optimization.
Amounts are stored in paise (integer arithmetic to avoid float errors).
"""
from typing import List, Tuple
from dataclasses import dataclass


@dataclass
class BalanceEntry:
    user_id: int
    balance: int  # positive = creditor, negative = debtor


@dataclass
class Transaction:
    payer_id: int
    receiver_id: int
    amount: int  # in paise


def compute_net_balances(
    expenses: list,   # list of (paid_by, splits: [(user_id, amount)])
) -> dict[int, int]:
    """
    Returns {user_id: net_balance} where positive means owed, negative means owes.
    """
    balances: dict[int, int] = {}

    for paid_by, splits in expenses:
        total_paid = sum(amt for _, amt in splits)
        balances[paid_by] = balances.get(paid_by, 0) + total_paid
        for user_id, amount in splits:
            balances[user_id] = balances.get(user_id, 0) - amount

    return balances


def minimize_transactions(balances: dict[int, int]) -> List[Transaction]:
    """
    Greedy algorithm to minimize number of transactions.
    O(n log n) time complexity.
    """
    creditors: List[Tuple[int, int]] = []  # (balance, user_id)
    debtors: List[Tuple[int, int]] = []    # (balance, user_id) — stored as positive

    for user_id, balance in balances.items():
        if balance > 0:
            creditors.append((balance, user_id))
        elif balance < 0:
            debtors.append((-balance, user_id))

    creditors.sort(reverse=True)
    debtors.sort(reverse=True)

    transactions: List[Transaction] = []

    ci, di = 0, 0
    while ci < len(creditors) and di < len(debtors):
        cred_bal, cred_id = creditors[ci]
        debt_bal, debt_id = debtors[di]

        transfer = min(cred_bal, debt_bal)
        transactions.append(Transaction(
            payer_id=debt_id,
            receiver_id=cred_id,
            amount=transfer,
        ))

        creditors[ci] = (cred_bal - transfer, cred_id)
        debtors[di] = (debt_bal - transfer, debt_id)

        if creditors[ci][0] == 0:
            ci += 1
        if debtors[di][0] == 0:
            di += 1

    return transactions


def build_upi_deep_link(upi_id: str, name: str, amount_paise: int, note: str) -> str:
    """Generates a standard UPI deep link URI."""
    amount_rupees = amount_paise / 100
    amount_str = f"{amount_rupees:.2f}"
    # URL-encode spaces
    note_encoded = note.replace(" ", "%20")
    name_encoded = name.replace(" ", "%20")
    return f"upi://pay?pa={upi_id}&pn={name_encoded}&am={amount_str}&tn={note_encoded}&cu=INR"
