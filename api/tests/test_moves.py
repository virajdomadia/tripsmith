"""P7b — the owner's move (R45): any confirmed or part-paid booking, to another date and/or
party, at any time. A rise is paid now offline (its own supplementary invoice once the first
exists) or added to the balance (the booking goes part paid; the later payment gets that
invoice); a fall is refunded with a credit note; a fee off the tier needs a reason; a party
change re-counts the seats and the add-ons; never onto a date without seats. Needs
TEST_DATABASE_URL."""

import datetime as dt
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    BookingAddon,
    BookingTraveller,
    DateChange,
    Departure,
    GstDocument,
    Refund,
)
from app.models.enums import BookingStatus
from app.services.analytics import ist_today
from app.services.booking.changes import FEE_PER_TRAVELLER_PAISE
from app.services.booking.deposit import due_on
from tests.razorpay_fake import FakeRazorpay
from tests.test_addons import addon_ids, with_addons
from tests.test_booking_orders import seats_left
from tests.test_booking_payments import booking, rzp
from tests.test_booking_webhook import deliver, event, mailing, with_webhook_secret
from tests.test_bookings_desk import owner_cookie
from tests.test_customer_accounts import EMAIL, paid_booking
from tests.test_date_changes import SINGLE_HIGH, SINGLE_LOW, UP, fresh, trip

__all__ = ["rzp"]
pytestmark = pytest.mark.db


async def ready(db: AsyncSession, db_app: FastAPI, client: AsyncClient, *dates: Any) -> Any:
    with_webhook_secret(db_app)
    sender = mailing(db_app)
    ids = await trip(db, *dates)
    ref = await paid_booking(client, ids[0], EMAIL, "9000000081", "pay_Move000001")
    owner = await owner_cookie(db)
    sender.sent.clear()
    return ids, ref, owner, sender


async def quote(client: AsyncClient, ref: str, owner: dict[str, str], **body: Any) -> Any:
    res = await client.post(f"/admin/bookings/{ref}/move/quote", json=body, headers=owner)
    assert res.status_code == 200, res.text
    return res.json()


async def move(client: AsyncClient, ref: str, owner: dict[str, str], **body: Any) -> Any:
    return await client.post(f"/admin/bookings/{ref}/move", json=body, headers=owner)


async def test_a_rise_paid_offline_moves_now_with_its_own_supplementary_invoice(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    (low, high), ref, owner, sender = await ready(
        db, db_app, db_client, (40, 8, 20_000_00), (47, 12, 25_000_00)
    )
    options = (await db_client.get(f"/admin/bookings/{ref}/move", headers=owner)).json()
    assert [d["current"] for d in options["dates"]] == [True, False]
    assert options["suggestedFeePaise"] == 0
    q = await quote(db_client, ref, owner, departureId=high)
    assert (q["netPaise"], q["owedPaise"], q["refundPaise"]) == (UP, UP, 0)

    missing = await move(db_client, ref, owner, departureId=high, expectedNetPaise=UP)
    assert missing.status_code == 400 and "settle" in missing.json()["error"]["fieldErrors"]
    res = await move(
        db_client,
        ref,
        owner,
        departureId=high,
        expectedNetPaise=UP,
        settle="offline",
        method="upi",
        reference="4271 9953",
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "confirmed" and body["totalPaise"] == SINGLE_HIGH
    moved = await fresh(db, ref)
    assert moved.departure_id == high and moved.paid_paise == SINGLE_HIGH
    invoices = sorted(
        (await db.execute(select(GstDocument.amount_paise).where(GstDocument.kind == "invoice")))
        .scalars()
        .all()
    )
    assert invoices == [UP, SINGLE_LOW]
    assert await seats_left(db, low) == 8 and await seats_left(db, high) == 11
    subjects = [m.subject for m in sender.sent]
    assert any("Your trip has moved" in s for s in subjects)
    assert not any(s.startswith("Date changed on") for s in subjects)  # the owner did it
    # An owner's move never spends the customer's one self-serve change.
    assert (await db.execute(select(DateChange.actor))).scalar_one() == "owner"


async def test_a_rise_added_to_the_balance_is_invoiced_when_the_balance_is_paid(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    (low, high), ref, owner, _ = await ready(
        db, db_app, db_client, (20, 8, 20_000_00), (60, 12, 25_000_00)
    )
    fee = FEE_PER_TRAVELLER_PAISE  # 20 days out: the 15–29-day tier
    q = await quote(db_client, ref, owner, departureId=high)
    assert q["feePaise"] == fee and q["netPaise"] == UP + fee
    assert q["dueOn"] == due_on(ist_today() + dt.timedelta(days=60)).isoformat()
    res = await move(
        db_client, ref, owner, departureId=high, expectedNetPaise=UP + fee, settle="balance"
    )
    assert res.status_code == 200, res.text
    moved = await fresh(db, ref)
    assert moved.status == BookingStatus.PARTIALLY_PAID
    assert moved.total_paise - moved.paid_paise == UP + fee
    assert moved.balance_due_on == due_on(ist_today() + dt.timedelta(days=60))

    paid = await db_client.post(
        f"/admin/bookings/{ref}/balance-paid", json={"reference": "Cash"}, headers=owner
    )
    assert paid.status_code == 200, paid.text
    assert (await fresh(db, ref)).status == BookingStatus.CONFIRMED
    docs = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()["documents"]
    assert sorted(d["amountPaise"] for d in docs if d["kind"] == "invoice") == [
        UP + fee,
        SINGLE_LOW,
    ]


async def test_a_fall_is_refunded_with_a_credit_note_and_a_fee_off_the_tier_needs_a_reason(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    (high, low), ref, owner, _ = await ready(
        db, db_app, db_client, (20, 8, 25_000_00), (47, 12, 20_000_00)
    )
    q = await quote(db_client, ref, owner, departureId=low, feePaise=0)
    assert q["refundPaise"] == UP
    no_reason = await move(db_client, ref, owner, departureId=low, feePaise=0, expectedNetPaise=-UP)
    assert no_reason.status_code == 400
    assert "feeReason" in no_reason.json()["error"]["fieldErrors"]
    res = await move(
        db_client,
        ref,
        owner,
        departureId=low,
        feePaise=0,
        feeReason="Our mistake on the dates",
        expectedNetPaise=-UP,
    )
    assert res.status_code == 200, res.text
    refund = (await db.execute(select(Refund))).scalar_one()
    assert (refund.amount_paise, refund.reason) == (UP, "date_change")
    credit = (
        await db.execute(select(GstDocument).where(GstDocument.kind == "credit_note"))
    ).scalar_one()
    assert credit.amount_paise == UP
    change = (await db.execute(select(DateChange))).scalar_one()
    assert change.reason == "Our mistake on the dates"


async def test_a_party_change_recounts_seats_and_per_night_add_ons(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    with_webhook_secret(db_app)
    mailing(db_app)
    (low,) = await trip(db, (40, 3, 20_000_00))
    package_id = (
        await db.execute(select(Departure.package_id).where(Departure.id == low))
    ).scalar_one()
    await with_addons(db, package_id)
    ids = await addon_ids(db, package_id)
    res = await db_client.post(
        "/bookings",
        json={
            "departureId": low,
            "travellers": [
                {"name": "Asha", "age": 34, "occupancy": "double"},
                {"name": "Ravi", "age": 36, "occupancy": "double"},
            ],
            "contact": {"name": "Asha Rao", "phone": "9000000082", "email": EMAIL},
            "addons": [{"addonId": ids["Extra night"], "nights": 1}],
        },
    )
    assert res.status_code == 201, res.text
    order = res.json()
    body = event("payment.captured", order["orderId"], "pay_Move000002", order["amountPaise"])
    assert (await deliver(db_client, body)).status_code == 200
    ref = order["bookingRef"]
    owner = await owner_cookie(db)
    assert await seats_left(db, low) == 1

    three = [
        {"name": "Asha", "age": 34, "occupancy": "triple"},
        {"name": "Ravi", "age": 36, "occupancy": "triple"},
        {"name": "Mira", "age": 30, "occupancy": "triple"},
    ]
    q = await quote(db_client, ref, owner, departureId=low, travellers=three, feePaise=0)
    triple = 3 * (20_000_00 - 2_000_00)
    extra_night = 2_200_00  # one more traveller × 1 night
    assert q["netPaise"] == triple - 2 * 20_000_00 + extra_night
    assert q["addonsChangePaise"] == extra_night and q["fits"] is True
    res = await move(
        db_client,
        ref,
        owner,
        departureId=low,
        travellers=three,
        feePaise=0,
        expectedNetPaise=q["netPaise"],
        settle="balance",
    )
    assert res.status_code == 200, res.text
    assert await seats_left(db, low) == 0
    b = await booking(db, ref)
    names = (
        await db.execute(select(BookingTraveller.name).where(BookingTraveller.booking_id == b.id))
    ).scalars()
    assert sorted(names) == ["Asha", "Mira", "Ravi"]
    night = (await db.execute(select(BookingAddon))).scalar_one()
    assert (night.travellers, night.amount_paise) == (3, 3 * 2_200_00)

    four = [*three, {"name": "Dev", "age": 30, "occupancy": "single"}]
    full = await quote(db_client, ref, owner, departureId=low, travellers=four, feePaise=0)
    assert full["fits"] is False
    refused = await move(
        db_client,
        ref,
        owner,
        departureId=low,
        travellers=four,
        feePaise=0,
        expectedNetPaise=full["netPaise"],
        settle="balance",
    )
    assert (refused.status_code, refused.json()["error"]["reason"]) == (409, "sold_out")


async def test_a_pending_booking_is_not_moved(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    (low, high) = await trip(db, (40, 8, 20_000_00), (47, 8, 25_000_00))
    owner = await owner_cookie(db)
    res = await db_client.post(
        "/bookings",
        json={
            "departureId": low,
            "travellers": [{"name": "Asha", "age": 34, "occupancy": "single"}],
            "contact": {"name": "Asha Rao", "phone": "9000000083", "email": EMAIL},
        },
    )
    ref = res.json()["bookingRef"]
    got = await db_client.get(f"/admin/bookings/{ref}/move", headers=owner)
    assert (got.status_code, got.json()["error"]["reason"]) == (409, "not_movable")
    assert (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()["canMove"] is False
    assert high


async def test_an_owner_move_overtakes_a_customer_change_still_waiting_for_payment(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    from tests.test_auth import with_cookie
    from tests.test_customer_accounts import signed_in

    (low, high, other), ref, owner, _ = await ready(
        db, db_app, db_client, (40, 8, 20_000_00), (47, 12, 25_000_00), (54, 12, 20_000_00)
    )
    db_app.state.settings = db_app.state.settings.model_copy(
        update={"email_from": "Tripsmith <onboarding@resend.dev>"}  # the code shows on screen
    )
    cookie = with_cookie(await signed_in(db_client))
    started = (
        await db_client.post(
            f"/account/bookings/{ref}/change",
            json={"departureId": high, "expectedNetPaise": UP},
            headers=cookie,
        )
    ).json()
    assert started["state"] == "pay"
    res = await move(db_client, ref, owner, departureId=other, expectedNetPaise=0)
    assert res.status_code == 200, res.text
    assert await seats_left(db, high) == 12  # the customer's hold ended with the move
    body = event("payment.captured", started["orderId"], "pay_Move000003", UP)
    assert (await deliver(db_client, body)).status_code == 200
    stayed = await fresh(db, ref)
    assert stayed.departure_id == other and stayed.total_paise == SINGLE_LOW
    assert stayed.paid_paise == SINGLE_LOW  # the late payment went back


async def test_renames_ride_on_a_move_and_a_same_date_move_with_nothing_changed_is_refused(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    (low, high), ref, owner, _ = await ready(
        db, db_app, db_client, (20, 8, 20_000_00), (27, 12, 20_000_00)
    )
    q = await quote(db_client, ref, owner, departureId=low)
    assert (q["feePaise"], q["suggestedFeePaise"]) == (0, 0)  # nothing moves: no tier fee
    same = await move(db_client, ref, owner, departureId=low, expectedNetPaise=0)
    assert (same.status_code, same.json()["error"]["reason"]) == (409, "nothing_to_move")

    renamed = [{"name": "Asha R. Iyer", "age": 30, "occupancy": "single"}]
    q = await quote(db_client, ref, owner, departureId=high, travellers=renamed)
    assert q["feePaise"] == FEE_PER_TRAVELLER_PAISE  # blank fee = the tier, no reason needed
    res = await move(
        db_client,
        ref,
        owner,
        departureId=high,
        travellers=renamed,
        expectedNetPaise=q["netPaise"],
        settle="balance",
    )
    assert res.status_code == 200, res.text
    b = await fresh(db, ref)
    names = (
        await db.execute(select(BookingTraveller.name).where(BookingTraveller.booking_id == b.id))
    ).scalars()
    assert list(names) == ["Asha R. Iyer"]
