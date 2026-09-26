"""B11 — the owner answers a cancellation request (R19): approve frees the seats at once and
flags the agreed refund, which 'Refund made' then records to the rupee; reject leaves the booking
as it was; the customer is emailed either way; and the daily sweep leaves a booking with an open
request alone. The db tests need TEST_DATABASE_URL."""

import asyncio
import datetime as dt
import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.business import suggested_refund_paise
from app.models import Booking, Departure, Payment, User
from app.models.enums import BookingStatus, PaymentProvider, PaymentStatus, UserRole
from app.schemas.admin_bookings import ResolveCancellationInput
from app.services.analytics import ist_today
from app.services.auth.sessions import open_session
from app.services.format import inr
from tests.razorpay_fake import FakeRazorpay
from tests.test_auth import with_cookie
from tests.test_booking_orders import seats_left
from tests.test_booking_payments import booking, rzp
from tests.test_bookings_desk import cron, owner_cookie, run_daily
from tests.test_customer_accounts import EMAIL, signed_in
from tests.test_email_send import FakeSender
from tests.test_my_trips import REASON, setup
from tests.test_session_migration import API_DIR, _sql

__all__ = ["cron", "rzp"]

NOTE = "Refund of the full amount to your card within 5–7 working days."


# --- units --------------------------------------------------------------------------------------


def test_the_suggested_refund_applies_the_tier_to_what_was_paid() -> None:
    assert suggested_refund_paise(45, paid_paise=29_000_00, total_paise=29_000_00) == 29_000_00
    assert suggested_refund_paise(30, paid_paise=29_000_00, total_paise=29_000_00) == 29_000_00
    assert suggested_refund_paise(29, paid_paise=29_000_00, total_paise=29_000_00) == 14_500_00
    assert suggested_refund_paise(15, paid_paise=10_000_00, total_paise=29_000_00) == 0  # < half
    assert suggested_refund_paise(14, paid_paise=29_000_00, total_paise=29_000_00) == 0


def test_the_resolve_input_pairs_the_refund_with_approve() -> None:
    ok = ResolveCancellationInput.model_validate(
        {"decision": "approve", "note": "  " + NOTE + "  ", "refundPaise": 0}
    )
    assert ok.note == NOTE and ok.refund_paise == 0
    assert (
        ResolveCancellationInput.model_validate(
            {"decision": "reject", "note": "Too close to departure."}
        ).refund_paise
        is None
    )
    for bad in (
        {"decision": "approve", "note": NOTE},  # the refund is required, ₹0 included
        {"decision": "reject", "note": NOTE, "refundPaise": 100},
        {"decision": "approve", "note": "ok", "refundPaise": 0},  # too short
        {"decision": "approve", "note": NOTE, "refundPaise": -1},
        {"decision": "maybe", "note": NOTE},
        {"decision": "reject", "note": "Bad\x07bell in here"},
    ):
        with pytest.raises(ValidationError):
            ResolveCancellationInput.model_validate(bad)


# --- db -----------------------------------------------------------------------------------------


async def asked(
    db: AsyncSession, db_app: FastAPI, client: AsyncClient, *, days_out: int = 30
) -> tuple[FakeSender, str, dict[str, str], str]:
    """A paid booking `days_out` days before departure, a cancellation request on it, and the
    owner signed in; returns the sender (cleared), the ref, the owner's cookie and the request
    id."""
    sender, ref = await setup(db, db_app, client)
    b = await booking(db, ref)
    await db.execute(
        update(Departure)
        .where(Departure.id == b.departure_id)
        .values(date=ist_today() + dt.timedelta(days=days_out))
    )
    await db.commit()
    token = await signed_in(client)
    res = await client.post(
        f"/account/bookings/{ref}/cancellation", json={"reason": REASON}, headers=with_cookie(token)
    )
    assert res.status_code == 201, res.text
    owner = await owner_cookie(db)
    detail = (await client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    sender.sent.clear()
    return sender, ref, owner, detail["cancellation"]["id"]


def resolve(client: AsyncClient, id: str, owner: dict[str, str], **body: object):  # noqa: ANN201
    return client.post(f"/admin/cancellations/{id}/resolve", json=body, headers=owner)


@pytest.mark.db
async def test_approve_frees_the_seats_flags_the_refund_and_emails_only_the_customer(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    sender, ref, owner, id = await asked(db, db_app, db_client)
    b = await booking(db, ref)
    departure_id, paid = b.departure_id, b.paid_paise
    before = await seats_left(db, departure_id)

    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    c = detail["cancellation"]
    assert (c["status"], c["daysOut"], c["canApprove"]) == ("requested", 30, True)
    assert c["tier"].startswith("full refund") and c["suggestedRefundPaise"] == paid

    res = await resolve(db_client, id, owner, decision="approve", note=NOTE, refundPaise=paid)
    assert res.status_code == 200, res.text
    out = res.json()
    assert (out["status"], out["cancelReason"], out["refundNeeded"]) == (
        "cancelled",
        "cancellation_approved",
        True,
    )
    c = out["cancellation"]
    assert (c["status"], c["refundNote"], c["refundPaise"]) == ("approved", NOTE, paid)
    assert c["resolvedAt"] and c["canApprove"] is False
    kinds = [e["kind"] for e in out["timeline"]]
    assert kinds[-1] == "resolved" and "cancelled" not in kinds

    await db.rollback()  # now() is frozen at the transaction start
    assert await seats_left(db, departure_id) == before + 1

    # Demo mode: the customer's copy lands in the owner's inbox; the owner gets nothing else.
    [mail] = sender.sent
    assert mail.subject.startswith(f"[Test → {EMAIL}] Booking {ref} cancelled")
    assert NOTE in mail.text and "₹" in mail.text and "Your seats are released" in mail.text

    # The customer's booking page shows the decision.
    token = await signed_in(db_client)
    mine = (await db_client.get(f"/account/bookings/{ref}", headers=with_cookie(token))).json()
    assert mine["cancellation"]["status"] == "approved"
    assert (mine["cancellation"]["refundNote"], mine["cancellation"]["refundPaise"]) == (NOTE, paid)

    # It lands in the refund tab until the owner records it.
    session = (await db_client.get("/auth/session", headers=owner)).json()
    assert session["bookingsAttention"] == 1
    again = await resolve(db_client, id, owner, decision="reject", note="Changed my mind.")
    assert again.status_code == 409 and again.json()["error"]["reason"] == "resolved"

    done = await db_client.post(f"/admin/bookings/{ref}/refund-made", json={}, headers=owner)
    assert done.status_code == 200, done.text
    assert (done.json()["paidPaise"], done.json()["refundNeeded"]) == (0, False)
    [p] = done.json()["payments"]
    assert (p["status"], p["refundedPaise"]) == ("refunded", paid)
    assert (await db_client.get("/auth/session", headers=owner)).json()["bookingsAttention"] == 0


@pytest.mark.db
async def test_a_part_refund_is_recorded_to_the_rupee(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, ref, owner, id = await asked(db, db_app, db_client, days_out=20)
    b = await booking(db, ref)
    paid, total = b.paid_paise, b.total_paise
    half = paid - total // 2
    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert detail["cancellation"]["suggestedRefundPaise"] == half
    assert detail["cancellation"]["tier"] == "50% of the package price is retained"

    too_much = await resolve(
        db_client, id, owner, decision="approve", note=NOTE, refundPaise=paid + 100
    )
    assert too_much.status_code == 400
    assert "refundPaise" in too_much.json()["error"]["fieldErrors"]
    assert (await booking(db, ref)).status == BookingStatus.CONFIRMED  # nothing changed

    res = await resolve(db_client, id, owner, decision="approve", note=NOTE, refundPaise=half)
    assert res.status_code == 200, res.text
    done = await db_client.post(
        f"/admin/bookings/{ref}/refund-made", json={"note": "rfnd_half"}, headers=owner
    )
    out = done.json()
    assert out["paidPaise"] == total // 2  # what the policy keeps
    [p] = out["payments"]
    assert (p["status"], p["amountPaise"], p["refundedPaise"]) == ("refunded", paid, half)
    refunded = next(e for e in out["timeline"] if e["kind"] == "refunded")
    assert refunded["text"].startswith(f"Refund of {inr(half // 100)} recorded")


@pytest.mark.db
async def test_approving_with_no_refund_raises_no_flag(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    sender, ref, owner, id = await asked(db, db_app, db_client, days_out=5)
    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert detail["cancellation"]["suggestedRefundPaise"] == 0
    note = "Under the policy there is no refund this close to departure, sorry."
    res = await resolve(db_client, id, owner, decision="approve", note=note, refundPaise=0)
    assert res.status_code == 200, res.text
    assert (res.json()["status"], res.json()["refundNeeded"]) == ("cancelled", False)
    assert (await db_client.get("/auth/session", headers=owner)).json()["bookingsAttention"] == 0
    [mail] = sender.sent
    assert "no refund at this stage" in mail.text


@pytest.mark.db
async def test_reject_keeps_the_booking_and_its_seats_and_tells_the_customer_why(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    sender, ref, owner, id = await asked(db, db_app, db_client)
    departure_id = (await booking(db, ref)).departure_id
    before = await seats_left(db, departure_id)
    why = "The hotel has already been paid for these dates; we can move you to a later date."
    res = await resolve(db_client, id, owner, decision="reject", note=why)
    assert res.status_code == 200, res.text
    out = res.json()
    assert (out["status"], out["refundNeeded"]) == ("confirmed", False)
    assert (out["cancellation"]["status"], out["cancellation"]["refundNote"]) == ("rejected", why)
    assert out["cancellation"]["refundPaise"] is None
    assert any(e["kind"] == "resolved" and "rejected" in e["text"] for e in out["timeline"])
    await db.rollback()
    assert await seats_left(db, departure_id) == before
    [mail] = sender.sent
    assert "About your cancellation request" in mail.subject and why in mail.text
    assert "your booking stands" in mail.text
    late = await resolve(db_client, id, owner, decision="approve", note=NOTE, refundPaise=0)
    assert late.status_code == 409
    # Reject is the end of it: no second request.
    token = await signed_in(db_client)
    res = await db_client.post(
        f"/account/bookings/{ref}/cancellation", json={"reason": REASON}, headers=with_cookie(token)
    )
    assert res.status_code == 409


@pytest.mark.db
async def test_the_sweep_waits_for_the_owner_to_decide(
    db: AsyncSession,
    db_app: FastAPI,
    db_client: AsyncClient,
    rzp: FakeRazorpay,
    cron: None,
) -> None:
    _, ref, owner, id = await asked(db, db_app, db_client)
    b = await booking(db, ref)
    await db.execute(
        update(Departure)
        .where(Departure.id == b.departure_id)
        .values(date=ist_today() - dt.timedelta(days=2))
    )
    await db.commit()
    assert (await run_daily(db_client, db_app))["bookingsCompleted"] == 0
    assert (await booking(db, ref)).status == BookingStatus.CONFIRMED
    # Late, but the customer asked in time: approving still works after the date.
    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert detail["cancellation"]["canApprove"] is True
    res = await resolve(db_client, id, owner, decision="reject", note="The trip has already run.")
    assert res.status_code == 200
    assert (await run_daily(db_client, db_app))["bookingsCompleted"] == 1
    assert (await booking(db, ref)).status == BookingStatus.COMPLETED


@pytest.mark.db
async def test_a_completed_booking_can_only_be_rejected(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    """A request left open on a booking the sweep completed before B11 shipped."""
    _, ref, owner, id = await asked(db, db_app, db_client)
    await db.execute(
        update(Booking).where(Booking.ref == ref).values(status=BookingStatus.COMPLETED)
    )
    await db.commit()
    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert detail["cancellation"]["canApprove"] is False
    res = await resolve(db_client, id, owner, decision="approve", note=NOTE, refundPaise=0)
    assert res.status_code == 409 and res.json()["error"]["reason"] == "not_active"
    res = await resolve(db_client, id, owner, decision="reject", note="The trip has already run.")
    assert res.status_code == 200 and res.json()["status"] == "completed"


@pytest.mark.db
async def test_resolve_is_owner_only_and_404s_an_unknown_request(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    body = {"decision": "reject", "note": "Not possible, sorry."}
    assert (await db_client.post("/admin/cancellations/x/resolve", json=body)).status_code == 401
    customer = User(name="Asha", email="asha2@example.test", role=UserRole.CUSTOMER)
    db.add(customer)
    await db.commit()
    _, token = await open_session(db, customer, ip=None, user_agent=None)
    res = await db_client.post(
        "/admin/cancellations/x/resolve", json=body, headers=with_cookie(token)
    )
    assert res.status_code == 403
    owner = await owner_cookie(db)
    res = await resolve(db_client, "nope", owner, **body)
    assert res.status_code == 404


def test_0007_adds_only_nullable_columns_old_inserts_still_work(
    migrated_database_url: str,
) -> None:
    cfg = Config(os.path.join(API_DIR, "alembic.ini"))
    url = migrated_database_url
    try:
        command.downgrade(cfg, "0006")
        command.upgrade(cfg, "0007")
        # The deployed api (before this code merges) never names the new columns.
        asyncio.run(
            _sql(
                url,
                "truncate table bookings, enquiries, departures, packages, destinations cascade",
                "insert into enquiries (id, ref, type, name, phone, email, adults, status, "
                "email_status) values ('enq', 'TS-MIGRAT', 'contact', 'A', '9000000000', "
                "'a@x.test', 1, 'new', 'skipped')",
                "insert into enquiry_messages (id, enquiry_id, direction, subject, body) "
                "values ('msg', 'enq', 'outbound', 'S', 'B')",
            )
        )
        rows = asyncio.run(_sql(url, "select package_id, error from enquiry_messages"))
        assert rows == [(None, None)]
        command.downgrade(cfg, "0006")
    finally:
        command.upgrade(cfg, "head")
        asyncio.run(
            _sql(
                url,
                "truncate table bookings, enquiries, departures, packages, destinations cascade",
            )
        )


@pytest.mark.db
async def test_money_arriving_after_approval_is_refunded_in_full_not_the_agreed_amount_again(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    _, ref, owner, id = await asked(db, db_app, db_client, days_out=20)
    b = await booking(db, ref)
    paid, total = b.paid_paise, b.total_paise
    half = paid - total // 2
    await resolve(db_client, id, owner, decision="approve", note=NOTE, refundPaise=half)
    done = await db_client.post(f"/admin/bookings/{ref}/refund-made", json={}, headers=owner)
    assert done.json()["paidPaise"] == total // 2

    # A second capture lands on the cancelled booking (settle_capture's not-pending path).
    booking_id = b.id
    await db.rollback()  # a fresh transaction: now() must be later than the approval
    late = 5_000_00
    db.add(
        Payment(
            booking_id=booking_id,
            provider=PaymentProvider.RAZORPAY,
            razorpay_order_id="order_Late0B11",
            razorpay_payment_id="pay_Late0B11",
            amount_paise=late,
            status=PaymentStatus.CAPTURED,
        )
    )
    await db.execute(
        update(Booking)
        .where(Booking.id == booking_id)
        .values(paid_paise=Booking.paid_paise + late, refund_needed=True)
    )
    await db.commit()
    again = await db_client.post(f"/admin/bookings/{ref}/refund-made", json={}, headers=owner)
    assert again.status_code == 200, again.text
    out = again.json()
    assert (out["paidPaise"], out["refundNeeded"]) == (total // 2, False)
    late_row = next(p for p in out["payments"] if p["paymentId"] == "pay_Late0B11")
    assert (late_row["status"], late_row["refundedPaise"]) == ("refunded", late)
