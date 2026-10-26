"""P20 · Dashboard C — `GET /admin/money`: the month's cash equation, cash by day and the
coming-in / going-out / at-risk columns, reconciled with the desk's own numbers. The db tests
need TEST_DATABASE_URL."""

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import event, select, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models import Booking, BookingCancellation
from app.models.enums import CancellationStatus, CancelReason
from app.services.analytics import ist_today
from app.services.booking.refunds import refund_owed
from app.services.money import money_desk
from tests.razorpay_fake import FakeRazorpay
from tests.test_booking_history import hold
from tests.test_booking_orders import seeded
from tests.test_booking_payments import callback, rzp
from tests.test_bookings_desk import lapse, owner_cookie
from tests.test_cancellation_resolve import asked
from tests.test_refunds import REFUSED, released_and_paid

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


@contextmanager
def counted(engine: AsyncEngine) -> Iterator[list[str]]:
    """Every SQL statement the engine sends inside the block."""
    sent: list[str] = []

    def note(_conn: Any, _cursor: Any, statement: str, *_: Any) -> None:
        sent.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", note)
    try:
        yield sent
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", note)


async def test_the_money_desk_query_count_is_constant_in_the_number_of_bookings(
    db: AsyncSession, db_engine: AsyncEngine, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    """V7 (Q-3), the row's done-when: two flagged bookings or four, the desk sends the same
    number of statements, and every amount it owes is what `refund_owed` says one at a time.
    The first two take the paths that read more than the booking: an approval decided before
    0025 (the agreed refund and the captured total) and an unpaid balance (the total)."""
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=8)
    dep = departure.id
    rzp.refuse_refunds = REFUSED  # every automatic refund fails, so each booking stays owed

    approved, amount = await released_and_paid(db_client, owner, dep, 21, "pay_Count0001")
    unpaid, _ = await released_and_paid(db_client, owner, dep, 22, "pay_Count0002")
    a, u = await refs_to_ids(db, approved, unpaid)
    db.add(
        BookingCancellation(
            booking_id=a,
            reason="Plans changed",
            status=CancellationStatus.APPROVED,
            refund_paise=amount // 2,
        )
    )
    await db.execute(
        update(Booking)
        .where(Booking.id == a)
        .values(cancel_reason=CancelReason.CANCELLATION_APPROVED, kept_paise=None)
    )
    await db.execute(
        update(Booking)
        .where(Booking.id == u)
        .values(cancel_reason=CancelReason.BALANCE_UNPAID, balance_refund_paise=amount // 4)
    )
    await db.commit()

    async def desk() -> tuple[int, dict[str, int]]:
        db.expire_all()
        with counted(db_engine) as sent:
            out = await money_desk(db)
        await db.rollback()
        return len(sent), {o.ref: o.amount_paise for o in out.owed}

    few, owed = await desk()
    assert owed == {approved: amount // 2, unpaid: amount // 4}

    for n in (23, 24):
        await released_and_paid(db_client, owner, dep, n, f"pay_Count00{n}")
    more, owed = await desk()
    assert len(owed) == 4
    assert more == few, f"{few} statements for 2 bookings, {more} for 4"

    for b in (await db.execute(select(Booking).where(Booking.ref.in_(owed)))).scalars():
        assert owed[b.ref] == await refund_owed(db, b)


async def refs_to_ids(db: AsyncSession, *refs: str) -> list[str]:
    rows = await db.execute(select(Booking.ref, Booking.id).where(Booking.ref.in_(refs)))
    ids = {ref: id for ref, id in rows.all()}
    return [ids[r] for r in refs]
