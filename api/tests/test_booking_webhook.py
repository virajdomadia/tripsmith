"""B6 — Razorpay's webhook (04 v2 §5 step 4, R16): a forged signature, a 5× replay, a failed
attempt, a late capture with no seats, and events that are not ours. The db tests need
TEST_DATABASE_URL."""

import hashlib
import hmac
import json
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import SecretStr
from sqlalchemy import text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.razorpay import verify_webhook_signature
from app.models import Booking
from app.models.enums import BookingStatus, CancelReason, PaymentStatus
from app.services.booking import after_capture
from tests.razorpay_fake import FakeRazorpay
from tests.test_booking_orders import seats_left, seeded
from tests.test_booking_payments import booking, booking_body, callback, payments, rzp
from tests.test_email_send import FakeSender

__all__ = ["rzp"]  # the fixture, shared with test_booking_payments

WEBHOOK_SECRET = "fake-webhook-secret"
SECRET = "session-secret-for-tests"
OWNER_INBOX = "owner@example.com"


def event(kind: str, order_id: str, payment_id: str, amount: int = 100) -> bytes:
    """The shape Razorpay posts: the payment entity under `payload.payment.entity`."""
    status = {"payment.captured": "captured", "payment.failed": "failed"}.get(kind, "created")
    entity = {
        "id": payment_id,
        "entity": "payment",
        "amount": amount,
        "currency": "INR",
        "status": status,
        "order_id": order_id,
        "method": "upi",
    }
    return json.dumps(
        {
            "entity": "event",
            "event": kind,
            "contains": ["payment"],
            "payload": {"payment": {"entity": entity}},
            "created_at": 1_790_000_000,
        }
    ).encode()


async def deliver(
    client: AsyncClient, body: bytes, *, secret: str = WEBHOOK_SECRET, signature: str | None = None
) -> Any:
    if signature is None:
        signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    headers = {"content-type": "application/json"}
    if signature:
        headers["x-razorpay-signature"] = signature
    return await client.post("/webhooks/razorpay", content=body, headers=headers)


def with_webhook_secret(app: FastAPI) -> None:
    app.state.settings = app.state.settings.model_copy(
        update={"razorpay_webhook_secret": SecretStr(WEBHOOK_SECRET)}
    )


def mailing(app: FastAPI) -> FakeSender:
    """B7: live-mode email settings, a fake sender and a session secret on the running app."""
    sender = FakeSender()
    app.state.email_sender = sender
    app.state.settings = app.state.settings.model_copy(
        update={
            "email_from": "Tripsmith <hello@tripsmith.in>",
            "owner_notify_email": OWNER_INBOX,
            "site_url": "https://tripsmith.vercel.app",
            "session_secret": SecretStr(SECRET),
        }
    )
    return sender


def roles(sender: FakeSender) -> list[str]:
    return sorted("owner" if m.to == OWNER_INBOX else "customer" for m in sender.sent)


def test_webhook_signature_is_the_raw_body_under_the_webhook_secret() -> None:
    body = event("payment.captured", "order_A", "pay_B")
    good = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    assert verify_webhook_signature(WEBHOOK_SECRET, body, good)
    assert not verify_webhook_signature(WEBHOOK_SECRET, body + b" ", good)  # re-serialised
    assert not verify_webhook_signature("key-secret", body, good)
    assert not verify_webhook_signature(WEBHOOK_SECRET, body, "é")  # non-ASCII: False, not 500


async def test_forged_unsigned_or_unconfigured_never_reaches_the_database(
    app: FastAPI, client: AsyncClient
) -> None:
    body = event("payment.captured", "order_A", "pay_B")
    # No secret on this deployment: 503, so Razorpay retries once it is set.
    res = await deliver(client, body)
    assert res.status_code == 503 and res.json()["error"]["code"] == "internal"
    # Blank (`RAZORPAY_WEBHOOK_SECRET=` as in .env.example) is unset too, never an empty HMAC key.
    app.state.settings = app.state.settings.model_copy(
        update={"razorpay_webhook_secret": SecretStr("")}
    )
    res = await deliver(client, body, secret="")
    assert res.status_code == 503

    with_webhook_secret(app)
    # (No database here: a request that got past the signature would fail with a 500.)
    for res in (
        await deliver(client, body, secret="guessed"),
        await deliver(client, body, signature=""),
    ):
        assert res.status_code == 400, res.text
        assert res.json()["error"]["code"] == "validation"
    res = await deliver(client, b"[1, 2]")  # signed, but not an event
    assert res.status_code == 400
    assert "/webhooks/razorpay" not in app.openapi()["paths"]


# --- db ----------------------------------------------------------------------------------------


@pytest.fixture
def refreshes(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Each call of the after-a-new-capture hook's first step (revalidation; the emails follow
    it in the same hook, B7)."""
    calls: list[str] = []

    async def fake(db: AsyncSession, package_ids: object, *, after: str) -> None:
        calls.append(after)

    monkeypatch.setattr(after_capture, "refresh_quietly", fake)
    return calls


async def hold(client: AsyncClient, departure_id: str, party: int, n: int = 1) -> dict[str, Any]:
    res = await client.post(
        "/bookings",
        json=booking_body(departure_id, party, email=f"w{n}@example.test", phone=f"900000010{n}"),
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.db
async def test_five_replays_record_one_payment_and_confirm_once(
    db: AsyncSession,
    db_app: FastAPI,
    db_client: AsyncClient,
    rzp: FakeRazorpay,
    refreshes: list[str],
) -> None:
    with_webhook_secret(db_app)
    sender = mailing(db_app)
    _, departure = await seeded(db, seats=4)
    dep_id = departure.id
    order = await hold(db_client, dep_id, 2)
    ref, order_id = order["bookingRef"], order["orderId"]

    body = event("payment.captured", order_id, "pay_Hook0001", order["amountPaise"])
    outcomes = []
    for _ in range(5):  # Razorpay's retries, or "Resend" in its dashboard
        res = await deliver(db_client, body)
        assert res.status_code == 200, res.text
        outcomes.append(res.json()["status"])
    assert outcomes == ["captured"] + ["replayed"] * 4

    [paid] = await payments(db, ref)
    assert (paid.status, paid.razorpay_payment_id) == (PaymentStatus.CAPTURED, "pay_Hook0001")
    assert paid.raw is not None and paid.raw["event"] == "payment.captured"  # the whole event
    confirmed = await booking(db, ref)
    assert confirmed.status == BookingStatus.CONFIRMED
    assert confirmed.paid_paise == confirmed.total_paise  # counted once, not five times
    assert refreshes == [f"webhook payment on {ref}"]  # the confirm hook fired once
    assert roles(sender) == ["customer", "owner"]  # R16: one confirmation email (+ the owner's)
    assert len(sender.sent[0].attachments + sender.sent[1].attachments) == 1  # the voucher
    await db.rollback()  # a fresh transaction: `now()` is fixed at a transaction's start
    assert await seats_left(db, dep_id) == 2

    # Checkout's success handler arriving after the webhook is a no-op too.
    res = await db_client.post(f"/bookings/{ref}/confirm", json=callback(order_id, "pay_Hook0001"))
    assert res.status_code == 200 and res.json()["status"] == "confirmed"
    assert len(await payments(db, ref)) == 1
    assert len(sender.sent) == 2


@pytest.mark.db
async def test_a_failed_attempt_keeps_the_booking_pending_until_a_retry_pays(
    db: AsyncSession,
    db_app: FastAPI,
    db_client: AsyncClient,
    rzp: FakeRazorpay,
    refreshes: list[str],
) -> None:
    with_webhook_secret(db_app)
    _, departure = await seeded(db, seats=4)
    dep_id = departure.id
    order = await hold(db_client, dep_id, 2)
    ref, order_id = order["bookingRef"], order["orderId"]

    failed = event("payment.failed", order_id, "pay_Declined1", order["amountPaise"])
    for _ in range(2):  # recorded once, replayed once
        res = await deliver(db_client, failed)
        assert res.status_code == 200 and res.json() == {"status": "failed"}
    [attempt] = await payments(db, ref)
    assert (attempt.status, attempt.razorpay_payment_id) == (PaymentStatus.FAILED, "pay_Declined1")
    assert attempt.raw is not None and attempt.raw["event"] == "payment.failed"
    pending = await booking(db, ref)
    assert (pending.status, pending.paid_paise) == (BookingStatus.PENDING, 0)
    await db.rollback()
    assert await seats_left(db, dep_id) == 2  # the hold still counts
    assert refreshes == []

    # The visitor retries in the same Checkout and the second card works.
    paid = event("payment.captured", order_id, "pay_Retry0001", order["amountPaise"])
    res = await deliver(db_client, paid)
    assert res.status_code == 200 and res.json() == {"status": "captured"}
    rows = await payments(db, ref)
    assert [(p.razorpay_payment_id, p.status) for p in rows] == [
        ("pay_Declined1", PaymentStatus.FAILED),
        ("pay_Retry0001", PaymentStatus.CAPTURED),
    ]
    assert rows[1].amount_paise == order["amountPaise"]
    assert (await booking(db, ref)).status == BookingStatus.CONFIRMED

    # A stray failure for the captured payment never undoes it.
    res = await deliver(db_client, event("payment.failed", order_id, "pay_Retry0001"))
    assert res.status_code == 200
    assert [p.status for p in await payments(db, ref)] == [
        PaymentStatus.FAILED,
        PaymentStatus.CAPTURED,
    ]
    assert (await booking(db, ref)).status == BookingStatus.CONFIRMED


@pytest.mark.db
async def test_a_late_capture_by_webhook_with_no_seats_cancels_for_a_refund(
    db: AsyncSession,
    db_app: FastAPI,
    db_client: AsyncClient,
    rzp: FakeRazorpay,
    refreshes: list[str],
) -> None:
    with_webhook_secret(db_app)
    sender = mailing(db_app)
    _, departure = await seeded(db, seats=2)
    dep_id = departure.id
    first = await hold(db_client, dep_id, 2, n=1)
    # Checkout's 10 minutes run out; someone else takes both seats.
    await db.execute(
        update(Booking)
        .where(Booking.ref == first["bookingRef"])
        .values(hold_expires_at=text("now() - interval '1 minute'"))
    )
    await db.commit()
    second = await hold(db_client, dep_id, 2, n=2)

    body = event("payment.captured", first["orderId"], "pay_LateHook1", first["amountPaise"])
    res = await deliver(db_client, body)
    assert res.status_code == 200 and res.json() == {"status": "captured"}
    late = await booking(db, first["bookingRef"])
    assert (late.status, late.cancel_reason, late.refund_needed) == (
        BookingStatus.CANCELLED,
        CancelReason.SEATS_GONE,
        True,
    )
    [captured] = await payments(db, first["bookingRef"])
    assert captured.status == PaymentStatus.CAPTURED  # the money is on record for the refund
    assert (await booking(db, second["bookingRef"])).status == BookingStatus.PENDING
    await db.rollback()
    assert await seats_left(db, dep_id) == 0
    # R16: both hear about the refund; neither email says "confirmed", and no voucher goes out.
    assert roles(sender) == ["customer", "owner"]
    for m in sender.sent:
        assert "refund" in m.text.lower() and m.attachments == ()
        assert all("confirmed" not in part.lower() for part in (m.subject, m.html, m.text))


@pytest.mark.db
async def test_events_that_are_not_ours_are_acknowledged_and_ignored(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    _, departure = await seeded(db, seats=4)
    order = await hold(db_client, departure.id, 1)

    for body in (
        event("order.paid", order["orderId"], "pay_Other0001"),  # not subscribed to
        event("refund.processed", order["orderId"], "pay_Other0001"),
        event("payment.captured", "order_MadeByDev01", "pay_Dev0000001"),  # not this database's
        json.dumps({"event": "payment.captured", "payload": {}}).encode(),  # no entity
    ):
        res = await deliver(db_client, body)
        assert res.status_code == 200 and res.json() == {"status": "ignored"}, res.text
    assert [p.status for p in await payments(db, order["bookingRef"])] == [PaymentStatus.CREATED]
    assert (await booking(db, order["bookingRef"])).status == BookingStatus.PENDING
