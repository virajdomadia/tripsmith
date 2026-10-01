"""P7 — change date (R45): the fee by days before departure; only the base fare re-prices, the
earned discounts stay in ₹; a price-up holds the new date's seats and moves the booking only
when the difference is captured, once under replay, with a supplementary tax invoice; a
price-down moves at once and refunds the gap with a credit note; a late payment for seats that
went is refunded in full; a deposit booking is re-based; the old date's freed seats go to its
waitlist; and seat counts on both dates stay exact under concurrency. Needs TEST_DATABASE_URL
for the db tests."""

import asyncio
import datetime as dt
from collections import Counter
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.errors import ApiError
from app.models import (
    Booking,
    BookingEvent,
    DateChange,
    Departure,
    GstDocument,
    Payment,
    Refund,
    User,
    WaitlistEntry,
)
from app.models.enums import (
    BookingStatus,
    DateChangeState,
    Occupancy,
    PackageStatus,
    WaitlistState,
)
from app.schemas.bookings import (
    Quote,
    QuoteCoupon,
    QuoteLine,
    QuoteLineKind,
    QuoteManual,
)
from app.services.analytics import ist_today
from app.services.booking import changes
from app.services.booking.changes import (
    FEE_PER_TRAVELLER_PAISE,
    fee_per_traveller,
    outcome,
    reprice,
    start_change,
)
from tests.razorpay_fake import FakeRazorpay, sign
from tests.test_auth import with_cookie
from tests.test_booking_orders import dep, seats_left
from tests.test_booking_payments import booking, rzp
from tests.test_booking_webhook import deliver, event, mailing, with_webhook_secret
from tests.test_customer_accounts import EMAIL, paid_booking, signed_in
from tests.test_db import goa, package

__all__ = ["rzp"]

SINGLE_LOW = 20_000_00 + 9_000_00  # a single room on the ₹20,000 date
SINGLE_HIGH = 25_000_00 + 9_000_00  # on the ₹25,000 date
UP = SINGLE_HIGH - SINGLE_LOW


# --- units -------------------------------------------------------------------------------------


def test_the_fee_goes_by_days_before_the_bookings_own_departure() -> None:
    today = dt.date(2026, 10, 1)
    assert fee_per_traveller(today + dt.timedelta(days=30), today) == 0
    assert fee_per_traveller(today + dt.timedelta(days=29), today) == FEE_PER_TRAVELLER_PAISE
    assert fee_per_traveller(today + dt.timedelta(days=15), today) == FEE_PER_TRAVELLER_PAISE
    assert fee_per_traveller(today + dt.timedelta(days=14), today) is None


def _quote(double: int, *, deal: int = 0, eb: int = 0, coupon: int = 0, manual: int = 0) -> Quote:
    lines = [
        QuoteLine(
            kind=QuoteLineKind.DOUBLE,
            occupancy=Occupancy.DOUBLE,
            count=2,
            unit_paise=double,
            amount_paise=2 * double,
        )
    ]
    for kind, off in ((QuoteLineKind.DEAL, deal), (QuoteLineKind.EARLY_BIRD, eb)):
        if off:
            lines.append(
                QuoteLine(
                    kind=kind,
                    occupancy=Occupancy.DOUBLE,
                    count=2,
                    unit_paise=-off,
                    amount_paise=-2 * off,
                )
            )
    discount = 2 * (deal + eb) + coupon + manual
    return Quote(
        departure_id="old",
        package_slug="p",
        date=dt.date(2026, 12, 1),
        seats_left=4,
        lines=lines,
        deal=None,
        early_bird=None,
        coupon=QuoteCoupon(code="WELCOME10", off_paise=coupon) if coupon else None,
        manual=QuoteManual(off_paise=manual, percent=None, reason="Regular") if manual else None,
        addons=[],
        ladder=[],
        subtotal_paise=2 * double,
        discount_paise=discount,
        addons_paise=0,
        total_paise=2 * double - discount,
    )


def _dep(double: int) -> Departure:
    d = dep(dt.date(2026, 12, 20), 10, double)
    d.id = "new"
    return d


def test_only_the_base_fare_reprices_and_earned_discounts_stay_in_rupees() -> None:
    old = _quote(20_000_00, deal=1_000_00, eb=500_00, coupon=1_000_00, manual=200_00)
    new = reprice(old, _dep(25_000_00), fee_paise=2_000_00, seats_left=8)
    assert new.subtotal_paise == 50_000_00
    assert new.discount_paise == old.discount_paise  # the same ₹, though the fare rose
    assert new.coupon and new.coupon.off_paise == 1_000_00
    assert new.change_fee_paise == 2_000_00
    assert new.total_paise == 50_000_00 - old.discount_paise + 2_000_00
    assert new.total_paise - old.total_paise == 10_000_00 + 2_000_00  # net = fare diff + fee
    assert new.fare_paise == 50_000_00 - old.discount_paise  # the fee is not fare
    assert (new.departure_id, new.date) == ("new", dt.date(2026, 12, 20))


def test_a_much_cheaper_date_cuts_the_discounts_so_each_traveller_pays_one_rupee() -> None:
    old = _quote(20_000_00, deal=3_000_00, eb=1_000_00, coupon=5_000_00)
    new = reprice(old, _dep(3_500_00), fee_paise=0, seats_left=8)
    deal = next(li for li in new.lines if li.kind == QuoteLineKind.DEAL)
    eb = next(li for li in new.lines if li.kind == QuoteLineKind.EARLY_BIRD)
    assert deal.unit_paise == -3_000_00 and eb.unit_paise == -499_00  # ₹1 left a head
    # The coupon keeps what the fare still has room for, down to ₹1 for the whole fare.
    assert new.coupon and new.coupon.off_paise == 100
    assert new.total_paise == 100


def test_a_deposit_booking_is_re_based_and_pays_the_top_up_only() -> None:
    today = dt.date(2026, 10, 1)
    far = today + dt.timedelta(days=90)
    o = outcome(
        status=BookingStatus.PARTIALLY_PAID,
        total_paise=40_000_00,
        paid_paise=10_000_00,
        deposit_paise=10_000_00,
        due_on=far - dt.timedelta(days=30),
        net_paise=8_000_00,
        departs=far,
        today=today,
    )
    assert o.status == BookingStatus.PARTIALLY_PAID
    assert o.deposit_paise == 12_000_00 and o.pay_now_paise == 2_000_00
    assert o.due_on == far - dt.timedelta(days=30)
    # Inside 30 days of the new date: everything still owed.
    near = today + dt.timedelta(days=20)
    o = outcome(
        status=BookingStatus.PARTIALLY_PAID,
        total_paise=40_000_00,
        paid_paise=10_000_00,
        deposit_paise=10_000_00,
        due_on=far,
        net_paise=0,
        departs=near,
        today=today,
    )
    assert (o.status, o.pay_now_paise) == (BookingStatus.CONFIRMED, 30_000_00)
    # A fall comes off the balance first: nothing back.
    o = outcome(
        status=BookingStatus.PARTIALLY_PAID,
        total_paise=40_000_00,
        paid_paise=10_000_00,
        deposit_paise=10_000_00,
        due_on=far,
        net_paise=-5_000_00,
        departs=far,
        today=today,
    )
    assert (o.pay_now_paise, o.refund_paise, o.total_paise) == (0, 0, 35_000_00)


def test_party_counts_come_off_the_fare_lines() -> None:
    assert changes.party_of(_quote(20_000_00, deal=100_00)) == Counter({Occupancy.DOUBLE: 2})


# --- db helpers --------------------------------------------------------------------------------


async def trip(db: AsyncSession, *dates: tuple[int, int, int]) -> list[str]:
    """A live package with a departure per (days from today, seats, double price)."""
    pkg = package(goa(), status=PackageStatus.LIVE, starting_price_paise=20_000_00)
    pkg.departures = [
        dep(ist_today() + dt.timedelta(days=d), seats, price) for d, seats, price in dates
    ]
    db.add(pkg)
    await db.commit()
    return [d.id for d in pkg.departures]


async def setup(
    db: AsyncSession, db_app: FastAPI, client: AsyncClient, *dates: tuple[int, int, int]
) -> tuple[list[str], str, dict[str, str], Any]:
    """The trip, one paid single-traveller booking for EMAIL on its first date, and a signed-in
    customer. Returns the departure ids, the ref, the cookie and the email sender."""
    with_webhook_secret(db_app)
    sender = mailing(db_app)
    db_app.state.settings = db_app.state.settings.model_copy(
        update={"email_from": "Tripsmith <onboarding@resend.dev>"}
    )
    ids = await trip(db, *dates)
    ref = await paid_booking(client, ids[0], EMAIL, "9000000071", "pay_Change00001")
    cookie = with_cookie(await signed_in(client))
    sender.sent.clear()
    return ids, ref, cookie, sender


async def fresh(db: AsyncSession, ref: str) -> Booking:
    db.expire_all()
    return await booking(db, ref)


async def options(client: AsyncClient, ref: str, cookie: dict[str, str]) -> dict[str, Any]:
    res = await client.get(f"/account/bookings/{ref}/change", headers=cookie)
    assert res.status_code == 200, res.text
    return res.json()


async def move(
    client: AsyncClient, ref: str, cookie: dict[str, str], departure_id: str, net: int
) -> Any:
    return await client.post(
        f"/account/bookings/{ref}/change",
        json={"departureId": departure_id, "expectedNetPaise": net},
        headers=cookie,
    )


# --- db: price up ------------------------------------------------------------------------------


@pytest.mark.db
async def test_a_price_up_holds_the_seats_and_moves_only_once_the_difference_is_captured(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    (low, high), ref, cookie, sender = await setup(
        db, db_app, db_client, (40, 8, 20_000_00), (47, 12, 25_000_00)
    )
    page = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()
    assert page["change"]["open"] is True and page["change"]["feePaise"] == 0
    listed = await options(db_client, ref, cookie)
    assert [o["departureId"] for o in listed["options"]] == [high]
    option = listed["options"][0]
    assert (option["netPaise"], option["payNowPaise"], option["refundPaise"]) == (UP, UP, 0)

    stale = await move(db_client, ref, cookie, high, UP - 100)
    assert stale.json()["error"]["reason"] == "price_changed", stale.text
    res = await move(db_client, ref, cookie, high, UP)
    assert res.status_code == 201, res.text
    started = res.json()
    assert started["state"] == "pay" and started["payNowPaise"] == UP
    assert await seats_left(db, high) == 11  # held for the party while paying
    assert await seats_left(db, low) == 7
    held = await fresh(db, ref)
    assert held.departure_id == low and held.total_paise == SINGLE_LOW  # nothing moved yet

    # Checkout's callback, then the webhook five times: moved once.
    pay = "pay_Change00002"
    confirmed = await db_client.post(
        f"/bookings/{ref}/confirm",
        json={
            "razorpayOrderId": started["orderId"],
            "razorpayPaymentId": pay,
            "razorpaySignature": sign(started["orderId"], pay),
        },
    )
    assert confirmed.status_code == 200, confirmed.text
    for _ in range(5):
        body = event("payment.captured", started["orderId"], pay, UP)
        assert (await deliver(db_client, body)).status_code == 200

    moved = await fresh(db, ref)
    assert moved.departure_id == high and moved.status == BookingStatus.CONFIRMED
    assert (moved.total_paise, moved.paid_paise) == (SINGLE_HIGH, SINGLE_HIGH)
    assert Quote.model_validate(moved.quote).date == ist_today() + dt.timedelta(days=47)
    assert await seats_left(db, high) == 11 and await seats_left(db, low) == 8
    states = (await db.execute(select(DateChange.state))).scalars().all()
    assert states == [DateChangeState.DONE]

    # The first invoice keeps its price; the rise has its own supplementary invoice.
    docs = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()["documents"]
    invoices = sorted(d["amountPaise"] for d in docs if d["kind"] == "invoice")
    assert invoices == [UP, SINGLE_LOW]
    numbered = (
        await db.execute(select(GstDocument.amount_paise).where(GstDocument.kind == "invoice"))
    ).scalars()
    assert sorted(numbered) == [UP, SINGLE_LOW]

    kinds = (
        await db.execute(select(BookingEvent.kind).where(BookingEvent.booking_id == moved.id))
    ).scalars()
    assert list(kinds).count("date.changed") == 1
    subjects = [m.subject for m in sender.sent]
    assert sum("Your trip has moved" in s for s in subjects) == 1
    assert sum(s.startswith("Date changed on") for s in subjects) == 1

    # One self-serve change per booking.
    again = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()["change"]
    assert again["open"] is False and again["used"] is True
    refused = await move(db_client, ref, cookie, low, -UP)
    assert (refused.status_code, refused.json()["error"]["reason"]) == (409, "change_closed")


@pytest.mark.db
async def test_a_payment_after_the_hold_lapsed_and_the_seats_went_is_refunded_in_full(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    (low, high), ref, cookie, _ = await setup(
        db, db_app, db_client, (40, 8, 20_000_00), (47, 1, 25_000_00)
    )
    started = (await move(db_client, ref, cookie, high, UP)).json()
    await db.execute(
        update(DateChange).values(hold_expires_at=dt.datetime.now(dt.UTC) - dt.timedelta(minutes=1))
    )
    await db.commit()
    other = await db_client.post(
        "/bookings",
        json={
            "departureId": high,
            "travellers": [{"name": "Ravi", "age": 30, "occupancy": "single"}],
            "contact": {"name": "Ravi", "phone": "9000000072", "email": "ravi@example.test"},
        },
    )
    assert other.status_code == 201, other.text  # took the last seat
    pay = "pay_Change00003"
    body = event("payment.captured", started["orderId"], pay, UP)
    assert (await deliver(db_client, body)).status_code == 200

    stayed = await fresh(db, ref)
    assert stayed.departure_id == low and stayed.total_paise == SINGLE_LOW
    assert stayed.paid_paise == SINGLE_LOW  # the payment went back
    change = (await db.execute(select(DateChange))).scalar_one()
    assert change.state == DateChangeState.LAPSED
    refund = (await db.execute(select(Refund))).scalar_one()
    assert (refund.amount_paise, refund.reason) == (UP, "surplus")
    assert await seats_left(db, high) == 0 and await seats_left(db, low) == 7


@pytest.mark.db
async def test_a_payment_long_after_the_change_goes_back_even_with_seats_free(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    """A Razorpay order never expires: a capture hours later must not move the booking at a
    stale quote."""
    (low, high), ref, cookie, sender = await setup(
        db, db_app, db_client, (40, 8, 20_000_00), (47, 12, 25_000_00)
    )
    started = (await move(db_client, ref, cookie, high, UP)).json()
    long_ago = dt.datetime.now(dt.UTC) - dt.timedelta(hours=3)
    await db.execute(update(DateChange).values(hold_expires_at=long_ago, created_at=long_ago))
    await db.commit()
    body = event("payment.captured", started["orderId"], "pay_Change00006", UP)
    assert (await deliver(db_client, body)).status_code == 200
    stayed = await fresh(db, ref)
    assert stayed.departure_id == low and stayed.paid_paise == SINGLE_LOW
    assert (await db.execute(select(DateChange.state))).scalar_one() == DateChangeState.LAPSED
    assert any("your payment is coming back" in m.subject for m in sender.sent)
    assert not any("Your trip has moved" in m.subject for m in sender.sent)


@pytest.mark.db
async def test_a_late_authorisation_after_a_failed_attempt_still_moves_the_booking(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    (low, high), ref, cookie, _ = await setup(
        db, db_app, db_client, (40, 8, 20_000_00), (47, 12, 25_000_00)
    )
    started = (await move(db_client, ref, cookie, high, UP)).json()
    for pay in ("pay_Change00007", "pay_Change00008"):  # two failed attempts on the order
        body = event("payment.failed", started["orderId"], pay, UP)
        assert (await deliver(db_client, body)).status_code == 200
    rows = await db.execute(select(Payment.date_change_id).where(Payment.amount_paise == UP))
    assert all(r is not None for r in rows.scalars())
    body = event("payment.captured", started["orderId"], "pay_Change00008", UP)
    assert (await deliver(db_client, body)).status_code == 200
    assert (await fresh(db, ref)).departure_id == high


# --- db: price down ----------------------------------------------------------------------------


@pytest.mark.db
async def test_a_price_down_moves_at_once_and_refunds_the_gap_with_a_credit_note(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    (high, low), ref, cookie, sender = await setup(
        db, db_app, db_client, (47, 12, 25_000_00), (40, 8, 20_000_00)
    )
    res = await move(db_client, ref, cookie, low, -UP)
    assert res.status_code == 201, res.text
    assert res.json() | {"date": None} == {
        "bookingRef": ref,
        "state": "done",
        "date": None,
        "payNowPaise": 0,
        "refundPaise": UP,
        "orderId": None,
        "keyId": None,
        "holdExpiresAt": None,
    }
    moved = await fresh(db, ref)
    assert moved.departure_id == low
    assert (moved.total_paise, moved.paid_paise) == (SINGLE_LOW, SINGLE_LOW)
    refund = (await db.execute(select(Refund))).scalar_one()
    assert (refund.amount_paise, refund.reason) == (UP, "date_change")
    assert len(rzp.refund_calls()) == 1
    credit = (
        await db.execute(select(GstDocument).where(GstDocument.kind == "credit_note"))
    ).scalar_one()
    assert credit.amount_paise == UP
    assert await seats_left(db, high) == 12 and await seats_left(db, low) == 7
    assert any("Your trip has moved" in m.subject for m in sender.sent)


# --- db: the fee and the door ------------------------------------------------------------------


@pytest.mark.db
async def test_the_fee_applies_from_29_days_and_online_changes_close_at_14(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    (near, other), ref, cookie, _ = await setup(
        db, db_app, db_client, (20, 8, 20_000_00), (27, 8, 20_000_00)
    )
    listed = await options(db_client, ref, cookie)
    assert listed["feePaise"] == FEE_PER_TRAVELLER_PAISE
    assert listed["options"][0]["netPaise"] == FEE_PER_TRAVELLER_PAISE
    res = await move(db_client, ref, cookie, other, FEE_PER_TRAVELLER_PAISE)
    assert res.json()["state"] == "pay" and res.json()["payNowPaise"] == FEE_PER_TRAVELLER_PAISE

    await db.execute(
        update(Departure)
        .where(Departure.id == near)
        .values(date=ist_today() + dt.timedelta(days=14))
    )
    await db.commit()
    page = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()["change"]
    assert page["open"] is False and page["feePaise"] is None
    closed = await db_client.get(f"/account/bookings/{ref}/change", headers=cookie)
    assert (closed.status_code, closed.json()["error"]["reason"]) == (409, "change_closed")


# --- db: deposit -------------------------------------------------------------------------------


@pytest.mark.db
async def test_a_deposit_booking_moves_with_its_deposit_and_due_day_re_based(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    mailing(db_app)
    db_app.state.settings = db_app.state.settings.model_copy(
        update={"email_from": "Tripsmith <onboarding@resend.dev>"}
    )
    low, high = await trip(db, (60, 8, 20_000_00), (90, 8, 25_000_00))
    res = await db_client.post(
        "/bookings",
        json={
            "departureId": low,
            "travellers": [{"name": "Asha", "age": 30, "occupancy": "single"}],
            "contact": {"name": "Asha Rao", "phone": "9000000073", "email": EMAIL},
            "pay": "deposit",
        },
    )
    assert res.status_code == 201, res.text
    order = res.json()
    body = event("payment.captured", order["orderId"], "pay_Change00004", order["amountPaise"])
    assert (await deliver(db_client, body)).status_code == 200
    cookie = with_cookie(await signed_in(db_client))
    paid = (await fresh(db, order["bookingRef"])).paid_paise

    listed = await options(db_client, order["bookingRef"], cookie)
    option = listed["options"][0]
    new_deposit = -(-SINGLE_HIGH * 25 // 10000) * 100
    assert option["payNowPaise"] == new_deposit - paid
    assert option["dueOn"] == (ist_today() + dt.timedelta(days=60)).isoformat()
    started = (await move(db_client, order["bookingRef"], cookie, high, UP)).json()
    assert started["state"] == "pay"
    pay = "pay_Change00005"
    body = event("payment.captured", started["orderId"], pay, started["payNowPaise"])
    assert (await deliver(db_client, body)).status_code == 200

    moved = await fresh(db, order["bookingRef"])
    assert moved.departure_id == high and moved.status == BookingStatus.PARTIALLY_PAID
    assert moved.deposit_paise == new_deposit
    assert moved.balance_due_on == ist_today() + dt.timedelta(days=60)
    assert moved.paid_paise == new_deposit and moved.total_paise == SINGLE_HIGH
    # Still on its deposit: no invoice yet, so no supplementary one either.
    assert (
        await db.execute(select(GstDocument).where(GstDocument.kind == "invoice"))
    ).first() is None


# --- db: the waitlist ---------------------------------------------------------------------------


@pytest.mark.db
async def test_seats_the_move_frees_go_to_the_old_dates_waitlist(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    (low, other), ref, cookie, _ = await setup(
        db, db_app, db_client, (40, 1, 20_000_00), (47, 8, 20_000_00)
    )
    joined = await db_client.post(
        "/waitlist",
        json={"departureId": low, "name": "Mira", "email": "mira@example.test", "party": 1},
    )
    assert joined.status_code == 201, joined.text
    res = await move(db_client, ref, cookie, other, 0)
    assert res.json()["state"] == "done"
    entry = (await db.execute(select(WaitlistEntry))).scalar_one()
    await db.refresh(entry)
    assert entry.state == WaitlistState.OFFERED  # in the swap's own transaction
    assert await seats_left(db, low) == 0  # the offer holds the freed seat


# --- db: concurrency ---------------------------------------------------------------------------


async def _user(db: AsyncSession, email: str) -> User:
    return (await db.execute(select(User).where(User.email == email))).scalar_one()


async def _signed_users(db: AsyncSession, client: AsyncClient, emails: list[str]) -> list[str]:
    for e in emails:
        await signed_in(client, e)
    ids = [(await _user(db, e)).id for e in emails]
    await db.commit()
    return ids


async def _exact(db: AsyncSession, *departure_ids: str) -> None:
    """The view agrees with the truth: seats_total − travellers booked or held, never oversold."""
    db.expire_all()
    for d in departure_ids:
        total = (await db.execute(select(Departure.seats_total).where(Departure.id == d))).scalar()
        on = (
            await db.execute(
                select(Booking.id).where(
                    Booking.departure_id == d,
                    Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.PENDING]),
                )
            )
        ).all()
        assert total is not None and len(on) <= total
        assert await seats_left(db, d) == total - len(on)


def _mover(engine: AsyncEngine):  # noqa: ANN202 — a local test helper
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def change(user_id: str, ref: str, to: str) -> str | ApiError:
        async with factory() as session:
            user = await session.get(User, user_id)
            assert user is not None
            try:
                return (await start_change(session, user, ref, to, 0, FakeRazorpay())).result.state
            except ApiError as exc:
                return exc

    return change


async def _ready(db_app: FastAPI) -> None:
    with_webhook_secret(db_app)
    mailing(db_app)
    db_app.state.settings = db_app.state.settings.model_copy(
        update={"email_from": "Tripsmith <onboarding@resend.dev>"}
    )


@pytest.mark.db
async def test_the_last_seat_on_the_new_date_goes_to_exactly_one_of_a_move_and_an_order(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, db_engine: AsyncEngine, rzp: Any
) -> None:
    await _ready(db_app)
    a_date, b_date = await trip(db, (40, 3, 20_000_00), (47, 1, 20_000_00))
    a = await paid_booking(db_client, a_date, EMAIL, "9000000074", "pay_ChangeA0001")
    (user_id,) = await _signed_users(db, db_client, [EMAIL])
    change = _mover(db_engine)

    async def new_order() -> int:
        res = await db_client.post(
            "/bookings",
            json={
                "departureId": b_date,
                "travellers": [{"name": "Dev", "age": 30, "occupancy": "single"}],
                "contact": {"name": "Dev", "phone": "9000000077", "email": "d@example.test"},
            },
        )
        return res.status_code

    moved, order = await asyncio.gather(change(user_id, a, b_date), new_order())
    assert (moved == "done") + (order == 201) == 1, (moved, order)
    if moved != "done":
        assert isinstance(moved, ApiError) and moved.reason == "sold_out"
    await _exact(db, a_date, b_date)


@pytest.mark.db
async def test_two_bookings_swapping_dates_in_opposite_directions_both_move(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, db_engine: AsyncEngine, rzp: Any
) -> None:
    """Both departures are locked in id order, so two opposite swaps never deadlock."""
    await _ready(db_app)
    a_date, b_date = await trip(db, (40, 2, 20_000_00), (47, 2, 20_000_00))
    emails = ["a@example.test", "b@example.test"]
    a = await paid_booking(db_client, a_date, emails[0], "9000000074", "pay_ChangeA0001")
    b = await paid_booking(db_client, b_date, emails[1], "9000000075", "pay_ChangeB0001")
    users = await _signed_users(db, db_client, emails)
    change = _mover(db_engine)
    for _ in range(3):  # there and back, three times
        results = await asyncio.gather(change(users[0], a, b_date), change(users[1], b, a_date))
        assert results == ["done", "done"]
        await _exact(db, a_date, b_date)
        await db.execute(update(DateChange).values(actor="owner"))  # lift the one-change rule
        await db.commit()
        a_date, b_date = b_date, a_date
    no_orders = select(Payment).where(Payment.date_change_id.is_not(None))
    assert (await db.execute(no_orders)).first() is None  # same price: nothing to pay
