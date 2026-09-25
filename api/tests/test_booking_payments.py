"""B4 — Razorpay (04 v2 §5): the order request, a forged signature, a replayed confirm, and a
late capture that finds no seats. The db tests need TEST_DATABASE_URL."""

import base64
import json

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.razorpay import ORDERS_URL, RazorpayError
from app.models import Booking, Payment
from app.models.enums import BookingStatus, CancelReason, PaymentStatus
from tests.razorpay_fake import KEY_ID, KEY_SECRET, FakeRazorpay, sign
from tests.test_booking_orders import seats_left, seeded
from tests.test_enquiries import CountingLimiter


async def test_order_request_is_basic_auth_json_from_the_server_amount() -> None:
    rzp = FakeRazorpay()
    order_id = await rzp.create_order(amount_paise=58_000_00, receipt="TB-7F3K2Q")

    assert order_id.startswith("order_")
    [req] = rzp.requests
    assert (req.method, str(req.url)) == ("POST", ORDERS_URL)
    creds = base64.b64encode(f"{KEY_ID}:{KEY_SECRET}".encode()).decode()
    assert req.headers["authorization"] == f"Basic {creds}"
    assert json.loads(req.content) == {
        "amount": 58_000_00,
        "currency": "INR",
        "receipt": "TB-7F3K2Q",
        "notes": {"booking_ref": "TB-7F3K2Q"},
    }

    with pytest.raises(RazorpayError):
        await FakeRazorpay(down=True).create_order(amount_paise=100, receipt="TB-7F3K2Q")


def test_signature_verifies_only_under_the_key_secret() -> None:
    rzp = FakeRazorpay()
    good = sign("order_A", "pay_B")
    assert rzp.verify_payment_signature(order_id="order_A", payment_id="pay_B", signature=good)
    assert not rzp.verify_payment_signature(order_id="order_A", payment_id="pay_C", signature=good)
    forged = sign("order_A", "pay_B", secret="guessed")
    assert not rzp.verify_payment_signature(
        order_id="order_A", payment_id="pay_B", signature=forged
    )


async def test_no_keys_is_a_clear_503(client: AsyncClient) -> None:
    body = {
        "departureId": "d",
        "travellers": [{"name": "A B", "age": 30, "occupancy": "single"}],
        "contact": {"name": "Asha Rao", "phone": "9876543210", "email": "a@example.test"},
    }
    res = await client.post("/bookings", json=body)
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "internal"
    assert "switched off" in res.json()["error"]["message"]


# --- db ----------------------------------------------------------------------------------------


def booking_body(departure_id: str, party: int, *, email: str, phone: str) -> dict[str, object]:
    return {
        "departureId": departure_id,
        "travellers": [{"name": f"T {i}", "age": 30, "occupancy": "single"} for i in range(party)],
        "contact": {"name": "Asha Rao", "phone": phone, "email": email},
    }


def callback(order_id: str, payment_id: str, signature: str | None = None) -> dict[str, str]:
    return {
        "razorpayOrderId": order_id,
        "razorpayPaymentId": payment_id,
        "razorpaySignature": signature or sign(order_id, payment_id),
    }


@pytest.fixture
def rzp(db_app: FastAPI) -> FakeRazorpay:
    fake = FakeRazorpay()
    db_app.state.razorpay = fake
    db_app.state.rate_limiter = CountingLimiter(limit=100)
    return fake


async def payments(db: AsyncSession, ref: str) -> list[Payment]:
    db.expire_all()
    return list(
        (
            await db.execute(
                select(Payment).join(Booking).where(Booking.ref == ref).order_by(Payment.created_at)
            )
        )
        .scalars()
        .all()
    )


async def booking(db: AsyncSession, ref: str) -> Booking:
    db.expire_all()
    return (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one()


@pytest.mark.db
async def test_forged_signature_is_400_and_a_replayed_confirm_applies_once(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, departure = await seeded(db, seats=4)
    dep_id = departure.id  # `payments()` expires the test session's objects
    held = await db_client.post(
        "/bookings", json=booking_body(dep_id, 2, email="a@example.test", phone="9000000001")
    )
    assert held.status_code == 201, held.text
    order = held.json()
    assert order["keyId"] == KEY_ID and order["orderId"].startswith("order_")
    assert json.loads(rzp.requests[0].content)["amount"] == order["amountPaise"]
    ref, order_id = order["bookingRef"], order["orderId"]
    [created] = await payments(db, ref)
    assert (created.status, created.razorpay_order_id) == (PaymentStatus.CREATED, order_id)

    # Signed with the wrong secret: refused, nothing recorded.
    forged = callback(order_id, "pay_Forged01", sign(order_id, "pay_Forged01", secret="guess"))
    res = await db_client.post(f"/bookings/{ref}/confirm", json=forged)
    assert res.status_code == 400 and res.json()["error"]["code"] == "validation"
    # A genuine signature for an order that is not this booking's: refused too.
    res = await db_client.post(f"/bookings/{ref}/confirm", json=callback("order_Other", "pay_X1"))
    assert res.status_code == 400
    assert (await booking(db, ref)).status == BookingStatus.PENDING
    assert [p.status for p in await payments(db, ref)] == [PaymentStatus.CREATED]

    good = callback(order_id, "pay_Good0001")
    for _ in range(3):  # the success handler, a double click, a retry
        res = await db_client.post(f"/bookings/{ref}/confirm", json=good)
        assert res.status_code == 200, res.text
        assert res.json() == {"bookingRef": ref, "status": "confirmed", "refundNeeded": False}

    [paid] = await payments(db, ref)
    assert (paid.status, paid.razorpay_payment_id) == (PaymentStatus.CAPTURED, "pay_Good0001")
    confirmed = await booking(db, ref)
    assert confirmed.paid_paise == confirmed.total_paise  # counted once
    assert await seats_left(db, dep_id) == 2


@pytest.mark.db
async def test_late_capture_with_no_seats_left_never_confirms(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, departure = await seeded(db, seats=2)
    dep_id = departure.id
    first = (
        await db_client.post(
            "/bookings", json=booking_body(dep_id, 2, email="a@example.test", phone="9000000001")
        )
    ).json()
    # Checkout's 10 minutes run out; someone else takes both seats.
    await db.execute(
        update(Booking)
        .where(Booking.ref == first["bookingRef"])
        .values(hold_expires_at=text("now() - interval '1 minute'"))
    )
    await db.commit()
    second = await db_client.post(
        "/bookings", json=booking_body(dep_id, 2, email="b@example.test", phone="9000000002")
    )
    assert second.status_code == 201, second.text

    # The first visitor's payment lands anyway.
    res = await db_client.post(
        f"/bookings/{first['bookingRef']}/confirm", json=callback(first["orderId"], "pay_Late0001")
    )
    assert res.status_code == 200, res.text
    assert res.json() == {
        "bookingRef": first["bookingRef"],
        "status": "cancelled",
        "refundNeeded": True,
    }
    late = await booking(db, first["bookingRef"])
    assert late.cancel_reason == CancelReason.SEATS_GONE and late.paid_paise == late.total_paise
    [captured] = await payments(db, first["bookingRef"])
    assert captured.status == PaymentStatus.CAPTURED  # the money is on record for the refund
    # The second party keeps its seats.
    assert (await booking(db, second.json()["bookingRef"])).status == BookingStatus.PENDING
    assert await seats_left(db, dep_id) == 0


@pytest.mark.db
async def test_razorpay_down_answers_502_and_gives_back_the_replaced_hold(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, departure = await seeded(db, seats=4)
    dep_id = departure.id
    body = booking_body(dep_id, 1, email="a@example.test", phone="9000000001")
    first = await db_client.post("/bookings", json=body)
    assert first.status_code == 201 and await seats_left(db, dep_id) == 3

    # The same visitor tries again for a bigger party while Razorpay is down.
    rzp.down = True
    res = await db_client.post(
        "/bookings", json=booking_body(dep_id, 3, email="a@example.test", phone="9000000001")
    )
    assert res.status_code == 502 and res.json()["error"]["code"] == "internal"
    # The unpayable hold is gone and the first one is back, so Checkout in the other tab still
    # pays for a held seat. (A fresh transaction: `now()` is fixed at a transaction's start.)
    await db.rollback()
    assert await seats_left(db, dep_id) == 3
    now = (await db.execute(text("select now()"))).scalar_one()
    assert (await booking(db, first.json()["bookingRef"])).hold_expires_at > now


@pytest.mark.db
async def test_sync_applies_a_payment_checkout_never_reported_once(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    """B5: Checkout closed without its success handler; Razorpay has the payment anyway."""
    _, departure = await seeded(db, seats=4)
    held = await db_client.post(
        "/bookings",
        json=booking_body(departure.id, 2, email="s@example.test", phone="9000000003"),
    )
    assert held.status_code == 201, held.text
    ref, order_id = held.json()["bookingRef"], held.json()["orderId"]

    # Nothing paid yet: still pending, and Razorpay was asked.
    res = await db_client.post(f"/bookings/{ref}/sync")
    assert res.status_code == 200, res.text
    assert res.json() == {"bookingRef": ref, "status": "pending", "refundNeeded": False}
    assert rzp.requests[-1].method == "GET"
    assert rzp.requests[-1].url.path == f"/v1/orders/{order_id}/payments"

    rzp.payments[order_id] = [
        {"id": "pay_Failed0001", "status": "failed"},
        # Paid a moment ago: authorized, not yet captured — sync captures it itself.
        {"id": "pay_Synced0001", "status": "authorized", "amount": held.json()["amountPaise"]},
    ]
    for _ in range(2):
        res = await db_client.post(f"/bookings/{ref}/sync")
        assert res.status_code == 200, res.text
        assert res.json() == {"bookingRef": ref, "status": "confirmed", "refundNeeded": False}
    capture = next(r for r in rzp.requests if r.url.path.endswith("/capture"))
    assert capture.url.path == "/v1/payments/pay_Synced0001/capture"
    assert json.loads(capture.content) == {"amount": held.json()["amountPaise"], "currency": "INR"}
    [paid] = await payments(db, ref)
    assert (paid.status, paid.razorpay_payment_id) == (PaymentStatus.CAPTURED, "pay_Synced0001")
    calls = len(rzp.requests)

    # Confirmed: sync answers from the database, and the late success callback is a no-op.
    res = await db_client.post(f"/bookings/{ref}/sync")
    assert res.json()["status"] == "confirmed" and len(rzp.requests) == calls
    res = await db_client.post(
        f"/bookings/{ref}/confirm", json=callback(order_id, "pay_Synced0001")
    )
    assert res.status_code == 200 and res.json()["status"] == "confirmed"
    assert len(await payments(db, ref)) == 1

    assert (await db_client.post("/bookings/TB-ZZZZZZ/sync")).status_code == 404
