"""P5 — deposit now, balance later (R43): 25 % rounded up to the rupee, offered only while the
balance would not yet be due; the deposit confirms the booking (`partially_paid`) and holds the
seats; the balance is paid in parts through the same capture path, replays apply once, and the
deposit plus every part equals the quote to the paisa; two parts at once refund the surplus; the
daily tidy reminds once per stage and cancels an unpaid booking after the grace, refunding per
the policy tier and freeing its seats. Unit tests need nothing; the rest need TEST_DATABASE_URL."""

import datetime as dt
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingCancellation, BookingEvent, Departure, Payment, Refund
from app.models.enums import BookingStatus, CancellationStatus, CancelReason, PaymentStatus
from app.services.analytics import ist_today
from app.services.booking import deposit
from tests.razorpay_fake import FakeRazorpay, sign
from tests.test_addons import addon_ids, with_addons
from tests.test_auth import with_cookie
from tests.test_booking_orders import SOON, seats_left, seeded
from tests.test_booking_payments import booking_body, rzp
from tests.test_booking_webhook import deliver, event, mailing, with_webhook_secret
from tests.test_bookings_desk import cron, owner_cookie, run_daily
from tests.test_customer_accounts import EMAIL, signed_in

__all__ = ["cron", "rzp"]

TOTAL = 34_000_00  # the later seeded date: ₹25,000 double + ₹9,000 supplement, one traveller
DEPOSIT = 8_500_00
BALANCE = TOTAL - DEPOSIT
FAR = SOON + dt.timedelta(days=7)  # 37 days out: the balance is not due yet


# --- units ---------------------------------------------------------------------------------------


def test_the_deposit_is_a_quarter_rounded_up_to_the_rupee() -> None:
    assert deposit.deposit_paise(34_000_00) == 8_500_00
    assert deposit.deposit_paise(34_001_00) == 8_501_00  # ₹8,500.25 → ₹8,501
    assert deposit.deposit_paise(10_998_00) == 2_750_00  # ₹2,749.50 → ₹2,750
    assert deposit.deposit_paise(4_00) == 1_00


def test_the_deposit_is_offered_only_before_the_balance_falls_due() -> None:
    today = dt.date(2026, 10, 1)
    departs = today + dt.timedelta(days=31)
    offer = deposit.offered(TOTAL, departs, today, on=True)
    assert offer is not None
    assert (offer.amount_paise, offer.balance_paise) == (DEPOSIT, BALANCE)
    assert offer.due_on == today + dt.timedelta(days=1)
    assert deposit.offered(TOTAL, today + dt.timedelta(days=30), today, on=True) is None
    assert deposit.offered(TOTAL, departs, today, on=False) is None  # switched off
    assert deposit.offered(1_00, departs, today, on=True) is None  # nothing left to split


def test_one_reminder_per_stage_and_a_missed_run_catches_up_with_the_latest() -> None:
    due = dt.date(2026, 11, 14)
    stage = {n: deposit.reminder_stage(due, due - dt.timedelta(days=n)) for n in range(9, -4, -1)}
    assert stage == {
        9: None,
        8: None,
        7: 7,
        6: 7,
        5: 7,
        4: 7,
        3: 3,
        2: 3,
        1: 3,
        0: 0,
        -1: 0,
        -2: 0,  # the last day of grace
        -3: None,  # cancelled that night instead
    }


def test_a_part_is_at_least_a_thousand_rupees_unless_less_is_left() -> None:
    assert deposit.min_part(25_500_00) == 1_000_00
    assert deposit.min_part(640_00) == 640_00


# --- helpers ------------------------------------------------------------------------------------


def far_body(pay: str = "deposit") -> dict[str, object]:
    return {**booking_body("", 1, email=EMAIL, phone="9000000051"), "pay": pay}


async def book(client: AsyncClient, departure_id: str, pay: str = "deposit") -> Any:
    res = await client.post("/bookings", json={**far_body(pay), "departureId": departure_id})
    assert res.status_code == 201, res.text
    return res.json()


async def capture(client: AsyncClient, order: dict[str, Any], payment_id: str) -> None:
    body = event("payment.captured", order["orderId"], payment_id, order["amountPaise"])
    assert (await deliver(client, body)).status_code == 200


async def row(db: AsyncSession, ref: str) -> Booking:
    db.expire_all()
    return (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one()


async def far_departure(db: AsyncSession) -> tuple[str, str]:
    """The seeded package's later date (37 days out); returns (package id, departure id)."""
    pkg, _ = await seeded(db, seats=8)
    dep = (
        await db.execute(
            select(Departure).where(Departure.package_id == pkg.id, Departure.date == FAR)
        )
    ).scalar_one()
    return pkg.id, dep.id


def demo_mail(app: FastAPI) -> Any:
    """Live-mode emails through a fake sender, with a resend.dev sender address: demo mode, so
    the sign-in answers with its code on screen (and customers' copies go to the owner)."""
    sender = mailing(app)
    app.state.settings = app.state.settings.model_copy(
        update={"email_from": "Tripsmith <onboarding@resend.dev>"}
    )
    return sender


async def on_deposit(
    db: AsyncSession, db_app: FastAPI, client: AsyncClient
) -> tuple[str, str, Any]:
    """A booking for EMAIL paid by its deposit (webhook). Returns (ref, departure id, sender)."""
    with_webhook_secret(db_app)
    sender = demo_mail(db_app)
    _, dep_id = await far_departure(db)
    order = await book(client, dep_id)
    await capture(client, order, "pay_Deposit00001")
    sender.sent.clear()
    return order["bookingRef"], dep_id, sender


async def balance_order(client: AsyncClient, ref: str, cookie: dict[str, str], amount: int) -> Any:
    return await client.post(
        f"/account/bookings/{ref}/balance", json={"amountPaise": amount}, headers=cookie
    )


async def set_due(db: AsyncSession, ref: str, due: dt.date) -> None:
    await db.execute(update(Booking).where(Booking.ref == ref).values(balance_due_on=due))
    await db.commit()


pytestmark = pytest.mark.db


# --- checkout -----------------------------------------------------------------------------------


async def test_the_quote_offers_the_deposit_only_on_a_date_whose_balance_is_not_due(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, far = await far_departure(db)
    near = (await db.execute(select(Departure.id).where(Departure.date == SOON))).scalar_one()
    travellers = [{"occupancy": "single"}]
    far_q = (
        await db_client.post("/bookings/quote", json={"departureId": far, "travellers": travellers})
    ).json()
    assert far_q["deposit"] == {
        "percent": 25,
        "amountPaise": DEPOSIT,
        "balancePaise": BALANCE,
        "dueOn": (FAR - dt.timedelta(days=30)).isoformat(),
    }
    near_q = (
        await db_client.post(
            "/bookings/quote", json={"departureId": near, "travellers": travellers}
        )
    ).json()
    assert near_q["deposit"] is None

    refused = await db_client.post("/bookings", json={**far_body(), "departureId": near})
    assert refused.status_code == 409
    assert refused.json()["error"]["reason"] == "deposit_unavailable"


async def test_deposit_then_parts_equal_the_quote_and_replays_apply_once(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    sender = demo_mail(db_app)
    _, dep_id = await far_departure(db)
    before = await seats_left(db, dep_id)
    order = await book(db_client, dep_id)
    assert order["amountPaise"] == DEPOSIT
    assert order["quote"]["deposit"]["amountPaise"] == DEPOSIT  # the offer, both choices kept
    ref = order["bookingRef"]
    held = await row(db, ref)
    assert (held.deposit_paise, held.balance_due_on) == (DEPOSIT, FAR - dt.timedelta(days=30))
    assert held.quote["deposit"]["amountPaise"] == DEPOSIT  # the snapshot: what it was made on

    # The deposit: Checkout's callback, then the webhook three times — applied once.
    res = await db_client.post(
        f"/bookings/{ref}/confirm",
        json={
            "razorpayOrderId": order["orderId"],
            "razorpayPaymentId": "pay_Deposit00001",
            "razorpaySignature": sign(order["orderId"], "pay_Deposit00001"),
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "partially_paid"
    voucher = await db_client.get(res.json()["voucherUrl"])  # printing "Balance due"
    assert voucher.status_code == 200 and voucher.content.startswith(b"%PDF")
    for _ in range(3):
        await capture(db_client, order, "pay_Deposit00001")
    b = await row(db, ref)
    assert (b.status, b.paid_paise) == (BookingStatus.PARTIALLY_PAID, DEPOSIT)
    assert await seats_left(db, dep_id) == before - 1  # the deposit holds the seat
    confirmed = [m for m in sender.sent if "confirmed" in m.subject]
    assert len(confirmed) == 1 and "₹25,500" in confirmed[0].text
    new = [m for m in sender.sent if m.subject.startswith("New booking")]
    assert len(new) == 1 and "deposit" in new[0].subject

    # My trips: the balance card, and the rules on a part.
    cookie = with_cookie(await signed_in(db_client))
    page = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()
    assert page["status"] == "partially_paid" and page["hasVoucher"] is True
    assert page["balance"] == {
        "depositPaise": DEPOSIT,
        "balancePaise": BALANCE,
        "dueOn": (FAR - dt.timedelta(days=30)).isoformat(),
        "lastDayOn": (FAR - dt.timedelta(days=28)).isoformat(),
        "minPartPaise": 1_000_00,
        "open": True,
        "reason": None,
    }
    listed = (await db_client.get("/account/bookings", headers=cookie)).json()["bookings"]
    assert listed[0]["balanceDueOn"] == (FAR - dt.timedelta(days=30)).isoformat()
    assert (
        await db_client.post(f"/account/bookings/{ref}/balance", json={"amountPaise": 1_000_00})
    ).status_code == 401
    for amount, field in ((999_00, "at least"), (BALANCE + 100, "more than"), (1_000_50, "whole")):
        bad = await balance_order(db_client, ref, cookie, amount)
        assert bad.status_code == 400, bad.text
        assert field in bad.json()["error"]["fieldErrors"]["amountPaise"]

    # Part 1 (₹15,000, the test-mode cap) by Checkout, replayed by the webhook.
    part = (await balance_order(db_client, ref, cookie, 15_000_00)).json()
    assert part["amountPaise"] == 15_000_00 and part["balancePaise"] == BALANCE
    res = await db_client.post(
        f"/bookings/{ref}/confirm",
        json={
            "razorpayOrderId": part["orderId"],
            "razorpayPaymentId": "pay_Balance00001",
            "razorpaySignature": sign(part["orderId"], "pay_Balance00001"),
        },
    )
    assert res.json()["status"] == "partially_paid"
    await capture(db_client, part, "pay_Balance00001")
    b = await row(db, ref)
    assert (b.status, b.paid_paise) == (BookingStatus.PARTIALLY_PAID, DEPOSIT + 15_000_00)
    received = [m for m in sender.sent if "Payment received" in m.subject]
    assert len(received) == 1 and "₹10,500 left" in received[0].subject

    # Part 2 clears it: confirmed, the invoice, a fresh voucher.
    last = (await balance_order(db_client, ref, cookie, 10_500_00)).json()
    await capture(db_client, last, "pay_Balance00002")
    await capture(db_client, last, "pay_Balance00002")
    b = await row(db, ref)
    assert (b.status, b.paid_paise, b.total_paise) == (BookingStatus.CONFIRMED, TOTAL, TOTAL)
    captured = (
        (
            await db.execute(
                select(Payment.amount_paise).where(
                    Payment.booking_id == b.id, Payment.status == PaymentStatus.CAPTURED
                )
            )
        )
        .scalars()
        .all()
    )
    assert sorted(captured) == [DEPOSIT, 10_500_00, 15_000_00] and sum(captured) == TOTAL
    full = [m for m in sender.sent if "paid in full" in m.subject]
    assert len(full) == 1 and len(full[0].attachments) == 2  # the voucher and the tax invoice
    page = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()
    assert page["balance"]["balancePaise"] == 0 and page["balance"]["open"] is False
    kinds = [d["kind"] for d in page["documents"]]
    assert kinds.count("receipt") == 3 and kinds.count("invoice") == 1
    assert (await balance_order(db_client, ref, cookie, 1_000_00)).json()["error"]["reason"] == (
        "balance_closed"
    )


async def test_two_parts_paid_at_once_refund_what_went_beyond_the_total(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, _, _ = await on_deposit(db, db_app, db_client)
    cookie = with_cookie(await signed_in(db_client))
    a = (await balance_order(db_client, ref, cookie, 20_000_00)).json()
    b_ = (await balance_order(db_client, ref, cookie, 20_000_00)).json()
    for order, pay in ((a, "pay_TwinPart0001"), (b_, "pay_TwinPart0002")):
        rzp.captured[pay] = order["amountPaise"]
        await capture(db_client, order, pay)
    b = await row(db, ref)
    assert (b.status, b.paid_paise) == (BookingStatus.CONFIRMED, TOTAL)
    refunds = (await db.execute(select(Refund).where(Refund.booking_id == b.id))).scalars().all()
    assert [(r.amount_paise, r.reason) for r in refunds] == [
        (DEPOSIT + 40_000_00 - TOTAL, "surplus")
    ]


async def test_a_part_paid_while_checkout_closed_is_found_by_the_sync(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, _, _ = await on_deposit(db, db_app, db_client)
    cookie = with_cookie(await signed_in(db_client))
    part = (await balance_order(db_client, ref, cookie, 5_000_00)).json()
    rzp.payments[part["orderId"]] = [
        {"id": "pay_SyncPart0001", "status": "captured", "amount": 5_000_00}
    ]
    res = await db_client.post(f"/bookings/{ref}/sync", json={"orderId": part["orderId"]})
    assert res.status_code == 200, res.text
    assert (await row(db, ref)).paid_paise == DEPOSIT + 5_000_00


# --- the daily tidy ------------------------------------------------------------------------------


async def test_reminders_go_once_per_stage_and_again_after_the_due_day_moves(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    ref, _, sender = await on_deposit(db, db_app, db_client)
    today = ist_today()
    await set_due(db, ref, today + dt.timedelta(days=7))
    assert (await run_daily(db_client, db_app))["balanceReminders"] == 1
    assert (await run_daily(db_client, db_app))["balanceReminders"] == 0  # a re-run sends nothing
    mails = [m for m in sender.sent if "due in 7 days" in m.subject]
    assert len(mails) == 1 and "₹25,500" in mails[0].text
    # An extension (P5b) moves the due day: the claim names the day, so the −7 stage goes again.
    await set_due(db, ref, today + dt.timedelta(days=5))
    assert (await run_daily(db_client, db_app))["balanceReminders"] == 1
    await set_due(db, ref, today)
    assert (await run_daily(db_client, db_app))["balanceReminders"] == 1
    assert any("due today" in m.subject for m in sender.sent)
    b = await row(db, ref)
    claims = (
        (
            await db.execute(
                select(BookingEvent.after)
                .where(BookingEvent.booking_id == b.id, BookingEvent.kind == "balance.reminder")
                .order_by(BookingEvent.at)
            )
        )
        .scalars()
        .all()
    )
    assert [(c or {}).get("stage") for c in claims] == [7, 7, 0]


async def test_the_tidy_cancels_after_the_grace_refunds_per_tier_and_frees_the_seats(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    ref, dep_id, sender = await on_deposit(db, db_app, db_client)
    rzp.captured["pay_Deposit00001"] = DEPOSIT
    today = ist_today()
    held = await seats_left(db, dep_id)
    await set_due(db, ref, today - dt.timedelta(days=2))  # the last day of grace: not yet
    report = await run_daily(db_client, db_app)
    assert report["balancesCancelled"] == 0
    assert (await row(db, ref)).status == BookingStatus.PARTIALLY_PAID

    await set_due(db, ref, today - dt.timedelta(days=3))
    report = await run_daily(db_client, db_app)
    assert report["balancesCancelled"] == 1 and report["balanceReminders"] == 0
    b = await row(db, ref)
    assert (b.status, b.cancel_reason) == (BookingStatus.CANCELLED, CancelReason.BALANCE_UNPAID)
    # 37 days before departure is the full-refund tier: the whole deposit goes back.
    assert b.balance_refund_paise == DEPOSIT and b.paid_paise == 0
    refunds = (await db.execute(select(Refund).where(Refund.booking_id == b.id))).scalars().all()
    assert [(r.amount_paise, r.reason, r.status.value) for r in refunds] == [
        (DEPOSIT, "balance", "processed")
    ]
    assert await seats_left(db, dep_id) == held + 1
    subjects = [m.subject for m in sender.sent]
    assert sum("cancelled — the balance" in s for s in subjects) == 1
    assert sum(s.startswith("Cancelled for an unpaid balance") for s in subjects) == 1
    assert (await run_daily(db_client, db_app))["balancesCancelled"] == 0


async def test_inside_the_half_tier_the_deposit_is_kept(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    ref, dep_id, _ = await on_deposit(db, db_app, db_client)
    today = ist_today()
    await db.execute(
        update(Departure).where(Departure.id == dep_id).values(date=today + dt.timedelta(days=28))
    )
    await db.commit()
    await set_due(db, ref, today - dt.timedelta(days=3))
    assert (await run_daily(db_client, db_app))["balancesCancelled"] == 1
    b = await row(db, ref)
    assert (b.cancel_reason, b.balance_refund_paise, b.paid_paise) == (
        CancelReason.BALANCE_UNPAID,
        0,
        DEPOSIT,
    )
    assert (await db.execute(select(Refund).where(Refund.booking_id == b.id))).first() is None
    # The desk has nothing to send: what is kept is not owed.
    from app.services.booking.refunds import refund_owed

    assert await refund_owed(db, b) == 0


async def test_an_open_cancellation_request_waits_for_the_owner(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    ref, _, sender = await on_deposit(db, db_app, db_client)
    b = await row(db, ref)
    db.add(BookingCancellation(booking_id=b.id, reason="Plans changed, sorry about this"))
    await db.commit()
    await set_due(db, ref, ist_today() - dt.timedelta(days=5))
    report = await run_daily(db_client, db_app)
    assert (report["balancesCancelled"], report["balanceReminders"]) == (0, 0)
    assert (await row(db, ref)).status == BookingStatus.PARTIALLY_PAID
    cookie = with_cookie(await signed_in(db_client))
    page = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()
    assert page["balance"]["open"] is False and "asked to cancel" in page["balance"]["reason"]
    refused = await balance_order(db_client, ref, cookie, 1_000_00)
    assert refused.status_code == 409 and refused.json()["error"]["reason"] == "balance_closed"
    asked = (
        await db.execute(
            select(BookingCancellation.status).where(BookingCancellation.booking_id == b.id)
        )
    ).scalar_one()
    assert asked == CancellationStatus.REQUESTED  # left for the owner


async def test_an_add_on_taken_off_a_deposit_booking_comes_off_the_balance_first(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    demo_mail(db_app)
    pkg_id, dep_id = await far_departure(db)
    await with_addons(db, pkg_id)
    ids = await addon_ids(db, pkg_id)
    body = {
        **far_body(),
        "departureId": dep_id,
        "addons": [
            {"addonId": ids["Airport transfers"]},
            {"addonId": ids["Rafting"], "travellers": 1},
        ],
    }
    res = await db_client.post("/bookings", json=body)
    assert res.status_code == 201, res.text
    order = res.json()
    total = TOTAL + 1_800_00 + 900_00
    assert order["amountPaise"] == deposit.deposit_paise(total) == 9_175_00
    await capture(db_client, order, "pay_AddonDep0001")
    ref = order["bookingRef"]
    owner = await owner_cookie(db)
    lines = {
        a["name"]: a["id"]
        for a in (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()["addons"]
    }

    # On the deposit alone: the price comes off the balance, nothing goes back.
    gone = await db_client.post(
        f"/admin/bookings/{ref}/addons/{lines['Rafting']}/remove", json={}, headers=owner
    )
    assert gone.status_code == 200, gone.text
    b = await row(db, ref)
    assert (b.status, b.total_paise, b.paid_paise) == (
        BookingStatus.PARTIALLY_PAID,
        total - 900_00,
        9_175_00,
    )
    assert (await db.execute(select(Refund).where(Refund.booking_id == b.id))).first() is None

    # Paid to within ₹1,300 of the total: taking ₹1,800 off clears it and ₹500 goes back.
    cookie = with_cookie(await signed_in(db_client))
    part = (await balance_order(db_client, ref, cookie, 25_325_00)).json()
    rzp.captured["pay_AddonPart001"] = 25_325_00
    await capture(db_client, part, "pay_AddonPart001")
    await db_client.post(
        f"/admin/bookings/{ref}/addons/{lines['Airport transfers']}/remove", json={}, headers=owner
    )
    b = await row(db, ref)
    assert (b.status, b.total_paise, b.paid_paise) == (BookingStatus.CONFIRMED, TOTAL, TOTAL)
    refunds = (await db.execute(select(Refund).where(Refund.booking_id == b.id))).scalars().all()
    # Money the booking no longer needs, not a credit: no invoice ever had the transfers.
    assert [(r.amount_paise, r.reason) for r in refunds] == [(500_00, "surplus")]
    page = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()
    assert [d["kind"] for d in page["documents"]].count("invoice") == 1


async def test_a_part_that_lands_after_the_cancel_goes_back_in_full(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    ref, dep_id, _ = await on_deposit(db, db_app, db_client)
    today = ist_today()
    await db.execute(
        update(Departure).where(Departure.id == dep_id).values(date=today + dt.timedelta(days=28))
    )
    await db.commit()
    cookie = with_cookie(await signed_in(db_client))
    part = (await balance_order(db_client, ref, cookie, 5_000_00)).json()  # Checkout left open
    await set_due(db, ref, today - dt.timedelta(days=3))
    assert (await run_daily(db_client, db_app))["balancesCancelled"] == 1  # deposit kept
    rzp.captured["pay_LatePart0001"] = 5_000_00
    await capture(db_client, part, "pay_LatePart0001")
    b = await row(db, ref)
    assert (b.balance_refund_paise, b.paid_paise, b.refund_needed) == (5_000_00, DEPOSIT, False)
    refunds = (await db.execute(select(Refund).where(Refund.booking_id == b.id))).scalars().all()
    assert [(r.amount_paise, r.status.value) for r in refunds] == [(5_000_00, "processed")]
