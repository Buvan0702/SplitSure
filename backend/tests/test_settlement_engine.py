from app.services.settlement_engine import (
    Transaction,
    apply_confirmed_settlements,
    compute_net_balances,
    minimize_transactions,
    transaction_lookup,
)


def test_compute_net_balances_tracks_creditors_and_debtors():
    balances = compute_net_balances(
        [
            (1, [(1, 2000), (2, 1000), (3, 1000)]),
            (2, [(1, 500), (2, 500)]),
        ]
    )

    assert balances == {1: 1500, 2: -500, 3: -1000}


def test_apply_confirmed_settlements_reduces_outstanding_balances():
    adjusted = apply_confirmed_settlements(
        {1: 1500, 2: -500, 3: -1000},
        [Transaction(payer_id=3, receiver_id=1, amount=500)],
    )

    assert adjusted == {1: 1000, 2: -500, 3: -500}


def test_minimize_transactions_and_lookup_are_consistent():
    transactions = minimize_transactions({1: 1000, 2: -400, 3: -600})
    lookup = transaction_lookup(transactions)

    assert lookup == {(3, 1): 600, (2, 1): 400}
