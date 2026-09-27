"""P20 · Dashboard C — `GET /admin/money`: the month's cash equation, cash by day and the
coming-in / going-out / at-risk columns, reconciled with the desk's own numbers. The db tests
need TEST_DATABASE_URL."""

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.analytics import ist_today
from tests.razorpay_fake import FakeRazorpay
from tests.test_booking_history import hold
from tests.test_booking_orders import seeded
from tests.test_booking_payments import callback, rzp
from tests.test_bookings_desk import lapse, owner_cookie
from tests.test_cancellation_resolve import asked

__all__ = ["rzp"]

pytestmark = pytest.mark.db


async def test_the_money_desk_is_owner_only(db: AsyncSession, db_client: AsyncClient) -> None:
    assert (await db_client.get("/admin/money")).status_code == 401
    owner = await owner_cookie(db)
    assert (await db_client.get("/admin/money?days=3", headers=owner)).status_code == 400


async def test_collected_refunded_and_owed_reconcile_with_the_desk(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=8)

    paid = await hold(db_client, departure.id, 1)
    await db_client.post(
        f"/bookings/{paid['bookingRef']}/confirm", json=callback(paid["orderId"], "pay_Money0001")
    )
    released = await hold(db_client, departure.id, 2)
    await db_client.post(f"/admin/bookings/{released['bookingRef']}/release", headers=owner)
    # Its automatic refund (P13) is refused, so the money is owed until the owner sends it.
    rzp.refuse_refunds = "The payment has been fully refunded already"
    await db_client.post(
        f"/bookings/{released['bookingRef']}/confirm",
        json=callback(released["orderId"], "pay_Money0002"),
    )
    live = await hold(db_client, departure.id, 3)

    money = (await db_client.get("/admin/money", headers=owner)).json()
    first, second = int(paid["amountPaise"]), int(released["amountPaise"])
    assert money["today"] == ist_today().isoformat()
    assert (money["collectedPaise"], money["collectedCount"]) == (first + second, 2)
    assert (money["refundedPaise"], money["toRecordPaise"]) == (0, second)
    [owed] = money["owed"]
    assert (owed["ref"], owed["amountPaise"]) == (released["bookingRef"], second)
    assert owed["why"] == "Money arrived on a cancelled booking"
    [held] = money["holds"]
    assert (held["ref"], held["totalPaise"]) == (live["bookingRef"], money["holdsPaise"])
    assert len(money["days"]) == 40 and money["days"][-1]["date"] == money["today"]
    today = money["days"][-1]
    assert (today["inPaise"], today["outPaise"], today["owePaise"]) == (first + second, 0, second)
    assert {(x["kind"], x["label"]) for x in today["lines"]} == {
        ("in", "Razorpay"),
        ("owe", "Refund to send"),
    }

    # Send refund: the same amount moves from "to send" to "refunded", dated today; the failed
    # try never counts as money out.
    rzp.refuse_refunds = None
    res = await db_client.post(
        f"/admin/bookings/{released['bookingRef']}/refund", json={}, headers=owner
    )
    assert res.status_code == 200, res.text
    money = (await db_client.get("/admin/money?days=7", headers=owner)).json()
    assert (money["refundedPaise"], money["toRecordPaise"], money["owed"]) == (second, 0, [])
    assert money["collectedPaise"] == first + second  # collected stays gross
    assert [r["amountPaise"] for r in money["refunded"]] == [second]
    today = money["days"][-1]
    assert (today["inPaise"], today["outPaise"], today["owePaise"]) == (first + second, second, 0)
    assert ("out", "Refund") in {(x["kind"], x["label"]) for x in today["lines"]}


async def test_at_risk_lists_open_requests_and_recently_lapsed_holds(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, ref, owner, _ = await asked(db, db_app, db_client, days_out=20)
    money = (await db_client.get("/admin/money", headers=owner)).json()
    [risk] = money["atRisk"]
    assert (risk["ref"], risk["kind"]) == (ref, "cancellation")
    assert "20 days out" in risk["text"] and risk["amountPaise"] > 0


async def test_a_lapsed_unpaid_hold_is_at_risk_until_three_days_pass(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=8)
    fresh = (await hold(db_client, departure.id, 4))["bookingRef"]
    old = (await hold(db_client, departure.id, 5))["bookingRef"]
    await lapse(db, fresh, "2 hours")
    await lapse(db, old, "5 days")
    money = (await db_client.get("/admin/money", headers=owner)).json()
    assert [(r["ref"], r["kind"]) for r in money["atRisk"]] == [(fresh, "lapsed")]
    assert money["holds"] == []
