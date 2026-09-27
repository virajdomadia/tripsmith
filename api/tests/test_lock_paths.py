"""v2's lock paths under real contention (docs/17 v2, P0): a coupon's last use at hold, and the
owner approving a cancellation while a late capture lands on the same booking.

Each race is made certain, not lucky: a third session holds the contested row lock, both
contenders start and are seen waiting on it in `pg_stat_activity`, then the lock is released.
Needs TEST_DATABASE_URL."""

import asyncio
import json
from collections.abc import Awaitable, Callable, Sequence
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.errors import ApiError
from app.models import Booking, Coupon, Departure, Payment, Refund
from app.models.enums import BookingStatus, CancelReason
from app.schemas.admin_bookings import ResolveCancellationInput
from app.schemas.bookings import BookingOrder
from app.services.booking.orders import create_booking_order
from app.services.booking.payments import capture_razorpay_payment
from app.services.booking.resolve import resolve_cancellation
from app.services.booking.settled import Settled
from tests.razorpay_fake import FakeRazorpay
from tests.test_booking_orders import order, seeded
from tests.test_booking_payments import booking, payments, rzp
from tests.test_cancellation_resolve import NOTE, asked
from tests.test_coupons import add_coupon

__all__ = ["rzp"]

pytestmark = pytest.mark.db


async def lock_waiters(db: AsyncSession) -> int:
    return int(
        (
            await db.execute(
                text(
                    "select count(*) from pg_stat_activity"
                    " where datname = current_database() and wait_event_type = 'Lock'"
                )
            )
        ).scalar_one()
    )


async def until_waiting(db: AsyncSession, n: int) -> None:
    """Until `n` sessions are queued on a row lock — the contenders have collided."""
    for _ in range(200):
        waiting = await lock_waiters(db)
        await db.rollback()  # pg_stat_activity is a snapshot per transaction
        if waiting >= n:
            return
        await asyncio.sleep(0.025)
    raise AssertionError(f"expected {n} sessions waiting on a lock")


async def race(
    engine: AsyncEngine,
    lock: Callable[[AsyncSession], Awaitable[object]],
    contenders: Sequence[Callable[[AsyncSession], Awaitable[Any]]],
) -> list[Any]:
    """Hold `lock` in one session, start each contender in its own session — in list order, each
    seen waiting before the next starts, so Postgres queues them in that order — then release."""
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def run(fn: Callable[[AsyncSession], Awaitable[Any]]) -> Any:
        async with factory() as session:
            try:
                return await fn(session)
            except ApiError as exc:
                return exc

    async with factory() as blocker, factory() as watcher:
        await lock(blocker)
        tasks = []
        for i, fn in enumerate(contenders, start=1):
            tasks.append(asyncio.create_task(run(fn)))
            await until_waiting(watcher, i)
        await blocker.rollback()
        return await asyncio.gather(*tasks)


# --- a coupon's last use at hold ------------------------------------------------------------------


async def test_the_last_use_of_a_coupon_goes_to_one_of_two_holds_on_different_dates(
    db: AsyncSession, db_engine: AsyncEngine
) -> None:
    """Different departures, so the departure lock does not serialise them: only the coupon row
    lock (taken last — contact → departure → coupon) stands between two holds and one use."""
    pkg, first = await seeded(db, seats=4)
    dates = [first.id, next(d.id for d in pkg.departures if d.id != first.id)]
    await add_coupon(db, code="LASTONE", use_limit=1)

    def hold(n: int) -> Callable[[AsyncSession], Awaitable[BookingOrder]]:
        async def go(session: AsyncSession) -> BookingOrder:
            body = order(dates[n], 1, email=f"race{n}@customer.in", phone=f"900000000{n}")
            body = body.model_copy(update={"coupon_code": "LASTONE"})
            return await create_booking_order(session, body, FakeRazorpay())

        return go

    async def lock_coupon(session: AsyncSession) -> None:
        await session.execute(select(Coupon).where(Coupon.code == "LASTONE").with_for_update())

    results = await race(db_engine, lock_coupon, [hold(0), hold(1)])

    won = [r for r in results if isinstance(r, BookingOrder)]
    lost = [r for r in results if isinstance(r, ApiError)]
    assert len(won) == 1 and len(lost) == 1, results
    assert (lost[0].status, lost[0].reason) == (409, "coupon_used_up")
    holds = (
        (await db.execute(select(Booking).where(Booking.coupon_code == "LASTONE"))).scalars().all()
    )
    assert [b.ref for b in holds] == [won[0].booking_ref], "one hold carries the code"


# --- cancellation approval racing a late capture -------------------------------------------------


@pytest.mark.parametrize("first", ["approve", "capture"])
async def test_approval_and_a_late_capture_on_the_same_booking_settle_the_same_either_way(
    db: AsyncSession,
    db_engine: AsyncEngine,
    db_app: FastAPI,
    db_client: AsyncClient,
    rzp: FakeRazorpay,
    first: str,
) -> None:
    """A paid booking with a cancellation request; the owner approves a half refund while a
    second payment on its Razorpay order is captured. Both take departure → booking, so they
    run one after the other — in either order the booking ends cancelled with the approval, and
    the refunds planned (P13; `notify=None`, so no Razorpay client: each stays queued with a
    "not set up" error) are the agreed half from the
    first payment plus every rupee of the late payment from the late one — never more, never a
    second copy. "Send refund" then sends exactly those two."""
    _, ref, owner, request_id = await asked(db, db_app, db_client, days_out=20)
    b = await booking(db, ref)
    paid, total, departure_id = b.paid_paise, b.total_paise, b.departure_id
    agreed = paid - total // 2
    [first_payment] = await payments(db, ref)
    order_id, b_payment_id = first_payment.razorpay_order_id, first_payment.razorpay_payment_id
    assert order_id is not None
    await db.rollback()

    async def approve(session: AsyncSession) -> object:
        payload = ResolveCancellationInput.model_validate(
            {"decision": "approve", "note": NOTE, "refundPaise": agreed}
        )
        return await resolve_cancellation(session, request_id, payload, notify=None)

    async def capture(session: AsyncSession) -> object:
        _, done = await capture_razorpay_payment(
            session, ref, order_id=order_id, payment_id="pay_RaceLate01", via="webhook"
        )
        await session.commit()
        return done

    async def lock_departure(session: AsyncSession) -> None:
        await session.execute(
            select(Departure.id).where(Departure.id == departure_id).with_for_update()
        )

    order_of = [approve, capture] if first == "approve" else [capture, approve]
    results = dict(
        zip(
            [f.__name__ for f in order_of],
            await race(db_engine, lock_departure, order_of),
            strict=True,
        )
    )

    assert not isinstance(results["approve"], ApiError), results["approve"]
    assert results["capture"] is not None and results["capture"].settled is Settled.NOT_PENDING
    late = results["capture"].amount_paise

    after = await booking(db, ref)
    assert (after.status, after.cancel_reason) == (
        BookingStatus.CANCELLED,
        CancelReason.CANCELLATION_APPROVED,
    )
    assert after.paid_paise == paid - agreed, "neither update lost the other"
    assert after.refund_needed  # planned, not sent: notify=None
    planned = {
        pid: amount
        for pid, amount in (
            await db.execute(
                select(Payment.razorpay_payment_id, Refund.amount_paise)
                .join(Payment, Payment.id == Refund.payment_id)
                .where(Refund.booking_id == after.id)
            )
        ).all()
    }
    assert planned == {"pay_RaceLate01": late, b_payment_id: agreed}

    done = await db_client.post(f"/admin/bookings/{ref}/refund", json={}, headers=owner)
    assert done.status_code == 200, done.text
    out = done.json()
    assert (out["paidPaise"], out["refundNeeded"]) == (paid - agreed, False)
    assert sorted(json.loads(c.content)["amount"] for c in rzp.refund_calls()) == sorted(
        [agreed, late]
    )
    late_row = next(p for p in out["payments"] if p["paymentId"] == "pay_RaceLate01")
    assert (late_row["status"], late_row["refundedPaise"]) == ("captured", late)
