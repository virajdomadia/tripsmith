"""P18b — the counter's Razorpay Payment Links (R56): a link booking holds its seats for 24 hours
(capped at 00:00 IST on the departure day) and its link ends with them; a paid link settles
through the one capture function whichever way the money is heard of — the webhook (for an order
Razorpay opened, named by the link's notes), the signed redirect back, or the desk's Check
payment — and a replayed webhook confirms once; Cancel link releases the seats unless the link
was paid; the daily tidy logs an expired link and hands its departure on (P6); test mode's
₹15,000 cap and links too close to departure are refused up front; a link Razorpay can't make
releases the seats. Needs TEST_DATABASE_URL."""

import datetime as dt
import json
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingEvent, Departure, Enquiry, Payment
from app.models.enums import BookingStatus, CancelReason, EnquiryStatus, PaymentStatus
from app.services.analytics import ist_today
from app.services.booking.links import link_until
from app.services.booking.pricing import start_of_ist_day
from tests.razorpay_fake import FakeRazorpay, sign_link
from tests.test_admin_enquiries import make_enquiry
from tests.test_booking_orders import SOON, seats_left, seeded
from tests.test_booking_payments import booking_body, rzp
from tests.test_booking_webhook import deliver, mailing, with_webhook_secret
from tests.test_bookings_desk import cron, owner_cookie, run_daily
from tests.test_counter import MANUAL, counter_body, later_date, post_booking

__all__ = ["cron", "rzp"]
pytestmark = pytest.mark.db

UNDER_CAP = {**MANUAL, "value": 30_000}  # ₹40,000 for two on the cheap date → ₹10,000


def link_body(departure_id: str, **over: Any) -> dict[str, Any]:
    fields: dict[str, Any] = {"settle": "link", "method": None, "reference": None}
    return counter_body(departure_id, **{**fields, "manual": UNDER_CAP, **over})


async def link_booking(
    db: AsyncSession, db_app: FastAPI, client: AsyncClient, **over: Any
) -> tuple[dict[str, Any], dict[str, str], str]:
    """A counter booking held by a ₹10,000 link. Returns (the desk's booking, owner, dep id)."""
    mailing(db_app)
    with_webhook_secret(db_app)
    _, dep = await seeded(db, seats=6)
    dep_id = dep.id
    owner = await owner_cookie(db)
    res = await post_booking(client, owner, link_body(dep_id, **over))
    assert res.status_code == 201, res.text
    return res.json(), owner, dep_id


def link_event(kind: str, order_id: str, payment_id: str, amount: int, row_id: str) -> bytes:
    """Razorpay's payment event for a link payment: an order we never made, the link's notes."""
    entity = {
        "id": payment_id,
        "entity": "payment",
        "amount": amount,
        "currency": "INR",
        "status": "captured" if kind == "payment.captured" else "failed",
        "order_id": order_id,
        "method": "upi",
        "description": "#link",
        "notes": {"booking_ref": "TB-XXXXXX", "payment_row": row_id},
    }
    return json.dumps(
        {"entity": "event", "event": kind, "payload": {"payment": {"entity": entity}}}
    ).encode()


async def row_of(db: AsyncSession, ref: str) -> tuple[Booking, Payment]:
    db.expire_all()
    b = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one()
    p = (
        await db.execute(
            select(Payment).where(Payment.booking_id == b.id, Payment.razorpay_link_id.is_not(None))
        )
    ).scalar_one()
    return b, p


# --- the hold -----------------------------------------------------------------------------------


def test_a_link_runs_24_hours_but_never_into_the_departure_day() -> None:
    now = dt.datetime(2026, 10, 1, 6, 0, tzinfo=dt.UTC)  # 11:30 IST
    far = dt.date(2026, 11, 13)
    assert link_until(far, now) == now + dt.timedelta(hours=24)
    tomorrow = dt.date(2026, 10, 2)
    assert link_until(tomorrow, now) == start_of_ist_day(tomorrow)  # 00:00 IST tomorrow
    late = dt.datetime(2026, 10, 1, 18, 0, tzinfo=dt.UTC)  # 23:30 IST: 30 min left
    assert link_until(tomorrow, late) is None


async def test_a_link_holds_the_seats_24_hours_and_a_replayed_webhook_confirms_once(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    body, owner, dep_id = await link_booking(db, db_app, db_client)
    ref = body["ref"]
    assert body["status"] == "pending" and body["paidPaise"] == 0
    link = body["paymentLink"]
    assert link["status"] == "open" and link["amountPaise"] == 10_000_00
    assert link["url"].startswith("https://rzp.io/") and link["canCancel"] is True
    held = dt.datetime.fromisoformat(link["expiresAt"]) - dt.datetime.now(dt.UTC)
    assert dt.timedelta(hours=23, minutes=58) < held <= dt.timedelta(hours=24)
    assert await seats_left(db, dep_id) == 4  # the two seats are held

    b, row = await row_of(db, ref)
    made: dict[str, Any] = rzp.links[row.razorpay_link_id or ""]
    assert made["reference_id"] == row.id and made["notes"]["payment_row"] == row.id
    assert made["expire_by"] == int(b.hold_expires_at.timestamp())
    assert made["callback_url"] == f"https://tripsmith.vercel.app/pay/{ref}"
    assert row.status == PaymentStatus.CREATED and row.razorpay_order_id is None

    order_id, pay_id = rzp.pay_link(made["id"])  # type: ignore[arg-type]
    event = link_event("payment.captured", order_id, pay_id, 10_000_00, row.id)
    first = await deliver(db_client, event)
    assert first.status_code == 200, first.text
    again = await deliver(db_client, event)
    assert again.status_code == 200
    b, row = await row_of(db, ref)
    assert b.status == BookingStatus.CONFIRMED and b.paid_paise == b.total_paise == 10_000_00
    assert row.razorpay_order_id == order_id and row.razorpay_payment_id == pay_id
    captured = (
        (
            await db.execute(
                select(Payment).where(
                    Payment.booking_id == b.id, Payment.status == PaymentStatus.CAPTURED
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(captured) == 1  # once, however often Razorpay replays it
    kinds = [
        k
        for (k,) in (
            await db.execute(
                select(BookingEvent.kind)
                .where(BookingEvent.booking_id == b.id)
                .order_by(BookingEvent.id)
            )
        ).all()
    ]
    assert kinds[:3] == ["booked.counter", "discount.manual", "link.created"]
    assert kinds.count("payment.captured") == 1
    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert detail["paymentLink"]["status"] == "paid" and detail["paymentLink"]["url"] is None


async def test_the_signed_redirect_back_confirms_and_a_forged_one_is_refused(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    body, _, _ = await link_booking(db, db_app, db_client)
    ref = body["ref"]
    _, row = await row_of(db, ref)
    link_id = row.razorpay_link_id or ""
    _, pay_id = rzp.pay_link(link_id)
    back = {
        "razorpayPaymentId": pay_id,
        "razorpayPaymentLinkId": link_id,
        "razorpayPaymentLinkReferenceId": row.id,
        "razorpayPaymentLinkStatus": "paid",
        "razorpaySignature": sign_link(link_id, row.id, "paid", pay_id),
    }
    forged = await db_client.post(
        f"/bookings/{ref}/link-callback", json={**back, "razorpaySignature": "0" * 64}
    )
    assert forged.status_code == 400
    ok = await db_client.post(f"/bookings/{ref}/link-callback", json=back)
    assert ok.status_code == 200, ok.text
    assert ok.json()["status"] == "confirmed" and ok.json()["voucherUrl"]
    replay = await db_client.post(f"/bookings/{ref}/link-callback", json=back)
    assert replay.status_code == 200 and replay.json()["status"] == "confirmed"
    b, _ = await row_of(db, ref)
    assert b.paid_paise == 10_000_00


async def test_check_payment_on_the_desk_applies_a_paid_link(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    body, owner, _ = await link_booking(db, db_app, db_client)
    ref = body["ref"]
    unpaid = await db_client.post(f"/admin/bookings/{ref}/link/check", headers=owner)
    assert unpaid.status_code == 200 and unpaid.json()["status"] == "pending"
    _, row = await row_of(db, ref)
    rzp.pay_link(row.razorpay_link_id or "")
    paid = await db_client.post(f"/admin/bookings/{ref}/link/check", headers=owner)
    assert paid.status_code == 200, paid.text
    assert paid.json()["status"] == "confirmed"
    assert [d["kind"] for d in paid.json()["documents"]] == ["receipt", "invoice"]


async def test_cancel_link_releases_the_seats_unless_it_was_paid(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    body, owner, dep_id = await link_booking(db, db_app, db_client)
    ref = body["ref"]
    res = await db_client.post(f"/admin/bookings/{ref}/link/cancel", headers=owner)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "cancelled"
    assert res.json()["paymentLink"]["status"] == "cancelled"
    _, row = await row_of(db, ref)
    assert rzp.links[row.razorpay_link_id or ""]["status"] == "cancelled"
    assert await seats_left(db, dep_id) == 6
    again = await db_client.post(f"/admin/bookings/{ref}/link/cancel", headers=owner)
    assert again.status_code == 409 and again.json()["error"]["reason"] == "no_link"

    second = await post_booking(
        db_client, owner, link_body(dep_id, contact={**counter_body(dep_id)["contact"]})
    )
    ref2 = second.json()["ref"]
    _, row2 = await row_of(db, ref2)
    rzp.pay_link(row2.razorpay_link_id or "")  # paid a moment before the owner cancels
    late = await db_client.post(f"/admin/bookings/{ref2}/link/cancel", headers=owner)
    assert late.status_code == 409 and late.json()["error"]["reason"] == "link_paid"
    b2, _ = await row_of(db, ref2)
    assert b2.status == BookingStatus.CONFIRMED


async def test_the_link_is_emailed_to_the_customer(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    body, owner, _ = await link_booking(db, db_app, db_client)
    sender = db_app.state.email_sender
    sender.sent.clear()
    res = await db_client.post(f"/admin/bookings/{body['ref']}/link/email", headers=owner)
    assert res.status_code == 200, res.text
    [mail] = sender.sent
    assert mail.to == "priya.nair@customer.in"
    assert body["paymentLink"]["url"] in mail.text and "₹10,000" in mail.subject
    assert any(e["kind"] == "email.sent" for e in res.json()["history"]["entries"])


async def test_links_over_the_test_cap_or_too_close_to_departure_are_refused(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    mailing(db_app)
    pkg, dep = await seeded(db, seats=6)
    dep_id, pkg_id = dep.id, pkg.id
    owner = await owner_cookie(db)
    full = await post_booking(db_client, owner, link_body(dep_id, manual=None))  # ₹40,000
    assert full.status_code == 409 and full.json()["error"]["reason"] == "link_over_cap"
    far = await later_date(db, pkg_id)  # ₹50,000 for two, 37 days out: a ₹12,500 deposit link
    deposit = await post_booking(db_client, owner, link_body(far, manual=None, linkPay="deposit"))
    assert deposit.status_code == 201, deposit.text
    assert deposit.json()["paymentLink"]["amountPaise"] == 12_500_00
    assert deposit.json()["quote"]["deposit"]["amountPaise"] == 12_500_00

    await db.execute(update(Departure).where(Departure.id == dep_id).values(date=ist_today()))
    await db.commit()
    today = await post_booking(db_client, owner, link_body(dep_id))
    assert today.status_code == 409 and today.json()["error"]["reason"] == "link_unavailable"
    trips = (await db_client.get("/admin/counter/trips", headers=owner)).json()
    assert trips["linkMaxPaise"] == 15_000_00
    by_id = {d["id"]: d for p in trips["packages"] for d in p["departures"]}
    assert by_id[dep_id]["linkUntil"] is None and by_id[far]["linkUntil"]


async def test_a_link_razorpay_cannot_make_releases_the_seats_and_the_enquiry(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    mailing(db_app)
    _, dep = await seeded(db, seats=6)
    dep_id = dep.id
    enq = await make_enquiry(db, ref="TS-LINK01", status=EnquiryStatus.CONTACTED)
    enq_id = enq.id
    await db.commit()
    owner = await owner_cookie(db)
    rzp.links_down = True
    res = await post_booking(db_client, owner, link_body(dep_id, enquiryId=enq_id))
    assert res.status_code == 502
    db.expire_all()
    b = (await db.execute(select(Booking))).scalar_one()
    assert (b.status, b.cancel_reason) == (BookingStatus.CANCELLED, CancelReason.OWNER_RELEASED)
    assert await seats_left(db, dep_id) == 6
    e = (await db.execute(select(Enquiry).where(Enquiry.id == enq_id))).scalar_one()
    assert e.status == EnquiryStatus.CONTACTED  # put back
    rzp.links_down = False
    retry = await post_booking(db_client, owner, link_body(dep_id, enquiryId=enq_id))
    assert retry.status_code == 201, retry.text  # a cancelled booking doesn't block converting


async def test_web_and_counter_holds_leave_each_other_alone(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    body, _, dep_id = await link_booking(db, db_app, db_client)
    web = await db_client.post(
        "/bookings",
        json=booking_body(dep_id, 1, email="priya.nair@customer.in", phone="9845011223"),
    )
    assert web.status_code == 201, web.text  # the same customer starts a web checkout
    b, _ = await row_of(db, body["ref"])
    assert b.status == BookingStatus.PENDING and b.hold_expires_at > dt.datetime.now(dt.UTC)
    assert await seats_left(db, dep_id) == 3  # both holds count


async def test_the_tidy_logs_an_expired_link_and_a_late_payment_still_confirms(
    db: AsyncSession,
    db_app: FastAPI,
    db_client: AsyncClient,
    rzp: FakeRazorpay,
    cron: None,
) -> None:
    body, owner, dep_id = await link_booking(db, db_app, db_client)
    ref = body["ref"]
    await db.execute(
        update(Booking)
        .where(Booking.ref == ref)
        .values(hold_expires_at=dt.datetime.now(dt.UTC) - dt.timedelta(hours=2))
    )
    await db.commit()
    assert await seats_left(db, dep_id) == 6  # the view stopped counting it at expiry
    report = await run_daily(db_client, db_app)
    assert report["linksExpired"] == 1 and report["holdsExpired"] == 1
    b, row = await row_of(db, ref)
    assert (b.status, b.cancel_reason) == (BookingStatus.CANCELLED, CancelReason.HOLD_EXPIRED)
    expired = (
        await db.execute(
            select(BookingEvent).where(
                BookingEvent.booking_id == b.id, BookingEvent.kind == "link.expired"
            )
        )
    ).scalar_one()
    assert "Payment link expired unpaid at" in expired.text
    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert detail["paymentLink"]["status"] == "expired" and detail["paymentLink"]["canCheck"]

    rzp.pay_link(row.razorpay_link_id or "")  # paid late anyway: the seats are still free
    late = await db_client.post(f"/admin/bookings/{ref}/link/check", headers=owner)
    assert late.status_code == 200 and late.json()["status"] == "confirmed"


async def test_sweep_hands_the_freed_departures_on(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    from app.services.booking.sweep import sweep_bookings

    body, _, dep_id = await link_booking(db, db_app, db_client)
    await db.execute(
        update(Booking)
        .where(Booking.ref == body["ref"])
        .values(hold_expires_at=dt.datetime.now(dt.UTC) - dt.timedelta(hours=2))
    )
    await db.commit()
    swept = await sweep_bookings(db, today=SOON - dt.timedelta(days=30))
    assert swept.freed_departures == (dep_id,)
