"""P8b — add-ons after booking (R46): Add extras in My trips pays exactly the difference once,
under replay (Checkout callback + webhook + sync); a second tax invoice while the first never
changes; the door closes 7 days out, on an open cancellation request and for an add-on already
held; two orders for the same add-on add it once and refund the other; the owner taking one off
refunds it through the one refund function with a credit note. Needs TEST_DATABASE_URL."""

import datetime as dt
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingAddon, Departure, GstDocument, Payment, Refund
from app.models.enums import BookingStatus, RefundStatus
from app.services.analytics import ist_today
from tests.razorpay_fake import FakeRazorpay, sign
from tests.test_addons import addon_ids, with_addons
from tests.test_auth import with_cookie
from tests.test_booking_orders import seeded
from tests.test_booking_payments import booking, rzp
from tests.test_booking_webhook import deliver, event, mailing, with_webhook_secret
from tests.test_bookings_desk import owner_cookie
from tests.test_customer_accounts import EMAIL, paid_booking, signed_in

__all__ = ["rzp"]
pytestmark = pytest.mark.db

SINGLE = 29_000_00  # tests.test_booking_orders.seeded: ₹20,000 double + ₹9,000 supplement


async def setup(
    db: AsyncSession, db_app: FastAPI, client: AsyncClient
) -> tuple[str, dict[str, str], dict[str, str], Any]:
    """A package with three add-ons, one paid single-traveller booking for EMAIL (no add-ons),
    and a signed-in customer. Returns the ref, the customer's cookie, the add-on ids by name and
    the email sender."""
    with_webhook_secret(db_app)
    sender = mailing(db_app)
    db_app.state.settings = db_app.state.settings.model_copy(
        update={"email_from": "Tripsmith <onboarding@resend.dev>"}  # demo mode: on-screen code
    )
    pkg, dep = await seeded(db, seats=8)
    pkg_id = pkg.id
    await with_addons(db, pkg_id)
    ref = await paid_booking(client, dep.id, EMAIL, "9000000081", "pay_Extras00001")
    cookie = with_cookie(await signed_in(client))
    sender.sent.clear()
    return ref, cookie, await addon_ids(db, pkg_id), sender


def choices(ids: dict[str, str]) -> dict[str, object]:
    return {
        "addons": [
            {"addonId": ids["Rafting"], "travellers": 1},
            {"addonId": ids["Extra night"], "nights": 2},
        ]
    }


EXTRAS = 900_00 + 2_200_00 * 1 * 2  # rafting × 1 + extra night × 1 traveller × 2 nights


async def fresh(db: AsyncSession, ref: str) -> Booking:
    db.expire_all()
    return await booking(db, ref)


async def test_add_extras_pays_exactly_the_difference_once_under_replay(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, cookie, ids, sender = await setup(db, db_app, db_client)
    page = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()
    assert page["extras"]["open"] is True and page["addons"] == []
    assert [a["name"] for a in page["extras"]["offered"]] == [
        "Airport transfers",
        "Rafting",
        "Extra night",
    ]
    assert (
        page["extras"]["closesOn"]
        == (dt.date.fromisoformat(page["departs"]) - dt.timedelta(days=7)).isoformat()
    )

    # Only a signed-in owner of the booking may price or order extras.
    anon = await db_client.post(f"/account/bookings/{ref}/extras/quote", json=choices(ids))
    assert anon.status_code == 401

    quoted = await db_client.post(
        f"/account/bookings/{ref}/extras/quote", json=choices(ids), headers=cookie
    )
    assert quoted.status_code == 200, quoted.text
    assert quoted.json()["totalPaise"] == EXTRAS

    made = await db_client.post(
        f"/account/bookings/{ref}/extras", json=choices(ids), headers=cookie
    )
    assert made.status_code == 201, made.text
    order = made.json()
    assert order["amountPaise"] == EXTRAS
    before = await fresh(db, ref)
    assert (before.total_paise, before.paid_paise) == (SINGLE, SINGLE)  # nothing until paid

    # Checkout's callback, then the webhook five times: applied once.
    pay = "pay_Extras00002"
    res = await db_client.post(
        f"/bookings/{ref}/confirm",
        json={
            "razorpayOrderId": order["orderId"],
            "razorpayPaymentId": pay,
            "razorpaySignature": sign(order["orderId"], pay),
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "confirmed" and res.json()["refundNeeded"] is False
    for _ in range(5):
        body = event("payment.captured", order["orderId"], pay, EXTRAS)
        assert (await deliver(db_client, body)).status_code == 200

    after = await fresh(db, ref)
    assert (after.total_paise, after.paid_paise) == (SINGLE + EXTRAS, SINGLE + EXTRAS)
    rows = (
        (await db.execute(select(BookingAddon).where(BookingAddon.booking_id == after.id)))
        .scalars()
        .all()
    )
    assert sorted((r.name, r.amount_paise) for r in rows) == [
        ("Extra night", 4_400_00),
        ("Rafting", 900_00),
    ]
    assert len({r.payment_id for r in rows}) == 1 and rows[0].payment_id is not None
    captured = (
        (
            await db.execute(
                select(Payment).where(Payment.booking_id == after.id, Payment.extras.is_not(None))
            )
        )
        .scalars()
        .all()
    )
    assert [(p.razorpay_payment_id, p.status.value) for p in captured] == [(pay, "captured")]

    # One email with the extras' own tax invoice; nothing on the replays.
    extras_mail = [m for m in sender.sent if "Extras added" in m.subject]
    assert len(extras_mail) == 2  # the customer's (redirected in demo mode) + the owner's
    assert any(a.filename.endswith(".pdf") for m in extras_mail for a in m.attachments)

    # GST: the first invoice keeps the booked price; a second invoice covers exactly the extras.
    docs = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()["documents"]
    invoices = [
        (d["key"], d["amountPaise"], d["number"] is not None)
        for d in docs
        if d["kind"] == "invoice"
    ]
    assert invoices[0] == ("invoice", SINGLE, True)
    assert invoices[1][1:] == (EXTRAS, True) and invoices[1][0].startswith("invoice-")
    assert sum(d["kind"] == "receipt" for d in docs) == 2
    pdf = await db_client.get(
        f"/account/bookings/{ref}/documents/{invoices[1][0]}.pdf", headers=cookie
    )
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    page = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()
    assert [(a["name"], a["addedLater"]) for a in page["addons"]] == [
        ("Rafting", True),
        ("Extra night", True),
    ]
    assert [a["name"] for a in page["extras"]["offered"]] == ["Airport transfers"]
    assert any("extras added: Rafting (1 traveller)" in e["text"] for e in page["activity"])

    # Already held → refused with the index to drop.
    again = await db_client.post(
        f"/account/bookings/{ref}/extras/quote",
        json={
            "addons": [
                {"addonId": ids["Airport transfers"]},
                {"addonId": ids["Rafting"], "travellers": 1},
            ]
        },
        headers=cookie,
    )
    assert again.status_code == 409
    assert again.json()["error"]["reason"] == "addon_unavailable"
    assert list(again.json()["error"]["fieldErrors"]) == ["addons.1"]


async def test_two_orders_for_the_same_add_on_add_it_once_and_refund_the_other(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, cookie, ids, _ = await setup(db, db_app, db_client)
    body = {"addons": [{"addonId": ids["Airport transfers"]}]}
    first = (
        await db_client.post(f"/account/bookings/{ref}/extras", json=body, headers=cookie)
    ).json()
    second = (
        await db_client.post(f"/account/bookings/{ref}/extras", json=body, headers=cookie)
    ).json()
    for order, pay in ((first, "pay_ExtrasTwin01"), (second, "pay_ExtrasTwin02")):
        rzp.captured[pay] = order["amountPaise"]
        e = event("payment.captured", order["orderId"], pay, order["amountPaise"])
        assert (await deliver(db_client, e)).status_code == 200
    b = await fresh(db, ref)
    assert b.total_paise == SINGLE + 1_800_00  # added once
    held = (
        (await db.execute(select(BookingAddon).where(BookingAddon.booking_id == b.id)))
        .scalars()
        .all()
    )
    assert [r.name for r in held] == ["Airport transfers"]
    refunds = (await db.execute(select(Refund).where(Refund.booking_id == b.id))).scalars().all()
    assert [(r.amount_paise, r.reason, r.status) for r in refunds] == [
        (1_800_00, "surplus", RefundStatus.PROCESSED)
    ]
    assert b.paid_paise == SINGLE + 1_800_00 and b.refund_needed is False


async def test_the_door_closes_seven_days_out_and_on_a_cancellation_request(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, cookie, ids, _ = await setup(db, db_app, db_client)
    b = await booking(db, ref)
    await db.execute(
        update(Departure)
        .where(Departure.id == b.departure_id)
        .values(date=ist_today() + dt.timedelta(days=6))
    )
    await db.commit()
    page = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()
    assert page["extras"]["open"] is False and page["extras"]["offered"] == []
    assert "7 days before departure" in page["extras"]["reason"]
    res = await db_client.post(f"/account/bookings/{ref}/extras", json=choices(ids), headers=cookie)
    assert (res.status_code, res.json()["error"]["reason"]) == (409, "extras_closed")

    await db.execute(
        update(Departure)
        .where(Departure.id == b.departure_id)
        .values(date=ist_today() + dt.timedelta(days=7))
    )
    await db.commit()  # exactly 7 days out: the last day it is open
    assert (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()["extras"][
        "open"
    ]
    asked = await db_client.post(
        f"/account/bookings/{ref}/cancellation",
        json={"reason": "Plans changed, sorry about this."},
        headers=cookie,
    )
    assert asked.status_code == 201, asked.text
    page = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()
    assert page["extras"]["open"] is False and "cancel" in page["extras"]["reason"]


async def test_a_late_capture_on_a_cancelled_booking_is_refunded_in_full(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, cookie, ids, _ = await setup(db, db_app, db_client)
    order = (
        await db_client.post(f"/account/bookings/{ref}/extras", json=choices(ids), headers=cookie)
    ).json()
    b = await booking(db, ref)
    await db.execute(
        update(Booking).where(Booking.id == b.id).values(status=BookingStatus.CANCELLED)
    )
    await db.commit()
    rzp.captured["pay_ExtrasLate1"] = EXTRAS
    e = event("payment.captured", order["orderId"], "pay_ExtrasLate1", EXTRAS)
    assert (await deliver(db_client, e)).status_code == 200
    b = await fresh(db, ref)
    assert b.total_paise == SINGLE  # nothing joined the booking
    held = (await db.execute(select(BookingAddon).where(BookingAddon.booking_id == b.id))).all()
    assert held == []
    refunds = (await db.execute(select(Refund).where(Refund.booking_id == b.id))).scalars().all()
    assert sum(r.amount_paise for r in refunds) == SINGLE + EXTRAS  # cancelled: all of it


async def test_sync_applies_an_extras_payment_checkout_never_reported(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, cookie, ids, _ = await setup(db, db_app, db_client)
    order = (
        await db_client.post(f"/account/bookings/{ref}/extras", json=choices(ids), headers=cookie)
    ).json()
    rzp.payments[order["orderId"]] = [
        {
            "id": "pay_ExtrasSync1",
            "status": "captured",
            "amount": EXTRAS,
            "order_id": order["orderId"],
        }
    ]
    res = await db_client.post(f"/bookings/{ref}/sync", json={"orderId": order["orderId"]})
    assert res.status_code == 200, res.text
    b = await fresh(db, ref)
    assert (b.total_paise, b.paid_paise) == (SINGLE + EXTRAS, SINGLE + EXTRAS)
    again = await db_client.post(f"/bookings/{ref}/sync", json={"orderId": order["orderId"]})
    assert again.status_code == 200
    assert (await fresh(db, ref)).paid_paise == SINGLE + EXTRAS  # nothing open: no second apply


async def test_the_owner_takes_an_add_on_off_and_it_is_refunded_with_a_credit_note(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, cookie, ids, _ = await setup(db, db_app, db_client)
    order = (
        await db_client.post(f"/account/bookings/{ref}/extras", json=choices(ids), headers=cookie)
    ).json()
    rzp.captured["pay_ExtrasOwn01"] = EXTRAS
    e = event("payment.captured", order["orderId"], "pay_ExtrasOwn01", EXTRAS)
    assert (await deliver(db_client, e)).status_code == 200

    owner = await owner_cookie(db)
    desk = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert desk["canRemoveAddons"] is True
    night = next(a for a in desk["addons"] if a["name"] == "Extra night")
    res = await db_client.post(
        f"/admin/bookings/{ref}/addons/{night['id']}/remove",
        json={"note": "The hotel is full that night"},
        headers=owner,
    )
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["totalPaise"] == SINGLE + EXTRAS - 4_400_00
    assert out["paidPaise"] == SINGLE + EXTRAS - 4_400_00
    gone = next(a for a in out["addons"] if a["id"] == night["id"])
    assert gone["removedAt"] is not None
    assert [(r["amountPaise"], r["reason"], r["status"]) for r in out["refunds"]] == [
        (4_400_00, "addon", "processed")
    ]
    kinds = [d["kind"] for d in out["documents"]]
    assert kinds.count("credit_note") == 1
    credit = next(d for d in out["documents"] if d["kind"] == "credit_note")
    assert credit["amountPaise"] == 4_400_00 and credit["number"] is not None
    assert any("Add-on taken off: Extra night" in e["text"] for e in out["history"]["entries"])

    twice = await db_client.post(
        f"/admin/bookings/{ref}/addons/{night['id']}/remove", json={}, headers=owner
    )
    assert twice.status_code == 409
    b = await fresh(db, ref)
    first_invoice = (
        await db.execute(
            select(GstDocument).where(
                GstDocument.booking_id == b.id,
                GstDocument.kind == "invoice",
                GstDocument.payment_id.is_(None),
            )
        )
    ).scalar_one()
    assert first_invoice.amount_paise == SINGLE  # the first invoice never changes
    page = (await db_client.get(f"/account/bookings/{ref}", headers=cookie)).json()
    assert "Extra night" in [a["name"] for a in page["extras"]["offered"]]  # can be bought again
