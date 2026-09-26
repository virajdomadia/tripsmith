"""B9 — My trips (R18, R19): one booking's detail, and the customer's cancellation request —
who may ask, the emails it sends, and that it changes nothing about the booking's seats until
the owner decides (B11). The db tests need TEST_DATABASE_URL."""

import datetime as dt

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.business import refund_tier
from app.models import Booking, Departure
from app.models.enums import BookingStatus
from app.services.analytics import ist_today
from tests.razorpay_fake import FakeRazorpay
from tests.test_auth import with_cookie
from tests.test_booking_orders import SOON, seeded
from tests.test_booking_payments import booking_body, rzp
from tests.test_booking_webhook import OWNER_INBOX, mailing, with_webhook_secret
from tests.test_customer_accounts import EMAIL, paid_booking, signed_in
from tests.test_email_send import FakeSender

__all__ = ["rzp"]

REASON = "My mother is unwell and we can't travel that week."


def test_the_refund_tier_follows_the_policy_schedule() -> None:
    assert refund_tier(45).startswith("full refund")
    assert refund_tier(30).startswith("full refund")
    assert refund_tier(29) == "50% of the package price is retained"
    assert refund_tier(15) == "50% of the package price is retained"
    assert refund_tier(14) == "no refund"
    assert refund_tier(0) == refund_tier(-3) == "no refund"


async def setup(db: AsyncSession, db_app: FastAPI, client: AsyncClient) -> tuple[FakeSender, str]:
    """A seeded catalog, demo-mode email (customer copies land in the owner's inbox) and one
    paid booking for EMAIL; returns the sender and the booking ref."""
    with_webhook_secret(db_app)
    sender = mailing(db_app)
    db_app.state.settings = db_app.state.settings.model_copy(
        update={"email_from": "Tripsmith <onboarding@resend.dev>"}
    )
    _, departure = await seeded(db, seats=8)
    ref = await paid_booking(client, departure.id, EMAIL, "9000000071", "pay_B9Trip0001")
    sender.sent.clear()
    return sender, ref


@pytest.mark.db
async def test_the_detail_page_has_the_trip_the_party_the_price_and_the_payment(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, ref = await setup(db, db_app, db_client)
    assert (await db_client.get(f"/account/bookings/{ref}")).status_code == 401
    token = await signed_in(db_client)

    res = await db_client.get(f"/account/bookings/{ref}", headers=with_cookie(token))
    assert res.status_code == 200, res.text
    assert res.headers["cache-control"].startswith("no-store")
    b = res.json()
    assert b["ref"] == ref and b["status"] == "confirmed" and b["hasVoucher"] is True
    assert b["today"] == ist_today().isoformat() and b["departs"] == SOON.isoformat()
    assert b["returns"] == (SOON + dt.timedelta(days=b["nights"])).isoformat()
    assert b["travellers"] == [{"name": "T 0", "age": 30, "occupancy": "single"}]
    assert b["quote"]["totalPaise"] == b["totalPaise"] == b["paidPaise"]
    assert [line["kind"] for line in b["quote"]["lines"]] == ["single", "single_supplement"]
    [payment] = b["payments"]
    assert payment["reference"] == "pay_B9Trip0001" and payment["provider"] == "razorpay"
    assert payment["amountPaise"] == b["paidPaise"]
    assert b["leadEmail"] == EMAIL and b["leadName"] == "Asha Rao"
    assert b["cancellation"] is None and b["canRequestCancellation"] is True

    # Not this customer's, or no such booking: the same 404.
    other = await signed_in(db_client, "ravi@example.test")
    for who, path in ((other, ref), (token, "TB-ZZZZZZ")):
        res = await db_client.get(f"/account/bookings/{path}", headers=with_cookie(who))
        assert res.status_code == 404


@pytest.mark.db
async def test_asking_to_cancel_records_it_emails_both_and_keeps_the_seats(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    sender, ref = await setup(db, db_app, db_client)
    token = await signed_in(db_client)
    res = await db_client.post(
        f"/account/bookings/{ref}/cancellation",
        json={"reason": f"  {REASON}  "},
        headers=with_cookie(token),
    )
    assert res.status_code == 201, res.text
    asked = res.json()
    assert asked["status"] == "requested" and asked["reason"] == REASON
    assert asked["refundNote"] is None and asked["resolvedAt"] is None

    # Both emails: the owner's request and the customer's acknowledgement (demo-redirected).
    by_subject = {m.subject: m for m in sender.sent}
    assert len(sender.sent) == 2 and all(m.to == OWNER_INBOX for m in sender.sent)
    owner = next(m for s, m in by_subject.items() if s.startswith("Cancellation requested"))
    ack = next(m for s, m in by_subject.items() if s.startswith(f"[Test → {EMAIL}]"))
    days_out = (SOON - ist_today()).days
    assert REASON in owner.text and f"Departs in {days_out} days" in owner.text
    assert refund_tier(days_out) in owner.text and owner.reply_to == EMAIL
    assert "Nothing is cancelled yet" in ack.text and refund_tier(days_out) in ack.text
    assert f"/account/bookings/{ref}" in ack.text and "/cancellation-policy" in ack.text

    # The booking is untouched until the owner decides (B11): still confirmed, still seated.
    await db.rollback()
    assert (
        await db.execute(select(Booking.status).where(Booking.ref == ref))
    ).scalar_one() == BookingStatus.CONFIRMED

    detail = (await db_client.get(f"/account/bookings/{ref}", headers=with_cookie(token))).json()
    assert detail["cancellation"]["status"] == "requested"
    assert detail["canRequestCancellation"] is False
    [row] = (await db_client.get("/account/bookings", headers=with_cookie(token))).json()[
        "bookings"
    ]
    assert row["cancellation"] == "requested"

    # Once only.
    again = await db_client.post(
        f"/account/bookings/{ref}/cancellation",
        json={"reason": REASON},
        headers=with_cookie(token),
    )
    assert again.status_code == 409 and again.json()["error"]["reason"] == "already_requested"
    assert len(sender.sent) == 2


@pytest.mark.db
async def test_who_may_not_ask(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    sender, ref = await setup(db, db_app, db_client)
    departure = (
        await db.execute(select(Booking.departure_id).where(Booking.ref == ref))
    ).scalar_one()
    token = await signed_in(db_client)

    def ask(which: str, reason: str = REASON, who: str = token):
        return db_client.post(
            f"/account/bookings/{which}/cancellation",
            json={"reason": reason},
            headers=with_cookie(who),
        )

    # Too short, or not signed in.
    assert (await ask(ref, "too short")).status_code == 400
    res = await db_client.post(f"/account/bookings/{ref}/cancellation", json={"reason": REASON})
    assert res.status_code == 401

    # An unpaid checkout.
    pending = await db_client.post(
        "/bookings", json=booking_body(departure, 1, email=EMAIL, phone="9000000072")
    )
    assert pending.status_code == 201
    res = await ask(pending.json()["bookingRef"])
    assert res.status_code == 409 and res.json()["error"]["reason"] == "not_paid"

    # Someone else's booking looks like no booking at all.
    other = await signed_in(db_client, "ravi@example.test")
    assert (await ask(ref, who=other)).status_code == 404

    # A trip that has left.
    await db.execute(
        update(Departure)
        .where(Departure.id == departure)
        .values(date=ist_today() - dt.timedelta(days=1))
    )
    await db.commit()
    res = await ask(ref)
    assert res.status_code == 409 and res.json()["error"]["reason"] == "departed"
    detail = (await db_client.get(f"/account/bookings/{ref}", headers=with_cookie(token))).json()
    assert detail["canRequestCancellation"] is False
    assert sender.sent == []
