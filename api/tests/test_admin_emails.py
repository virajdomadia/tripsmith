"""P15b — the owner's automatic emails (R53): the settings list and its switches, a preview with a
real booking as of the day it would go, a test to the owner's inbox that touches neither the
ledger nor the history, and the booking's "Coming up" list. The db tests need TEST_DATABASE_URL."""

import datetime as dt

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models import BookingEvent, EmailSend
from app.services.analytics import ist_today
from tests.razorpay_fake import FakeRazorpay
from tests.test_booking_payments import rzp
from tests.test_booking_webhook import OWNER_INBOX
from tests.test_bookings_desk import owner_cookie
from tests.test_traveller_details import booked

__all__ = ["rzp"]

pytestmark = pytest.mark.db


async def _count(db: AsyncSession, model: type, *where: ColumnElement[bool]) -> int:
    return (await db.execute(select(func.count()).select_from(model).where(*where))).scalar_one()


async def test_every_route_is_owner_only(db: AsyncSession, db_client: AsyncClient) -> None:
    for method, path in (
        ("GET", "/admin/emails"),
        ("PUT", "/admin/emails/trip_pack"),
        ("GET", "/admin/emails/trip_pack/samples"),
        ("GET", "/admin/emails/trip_pack/preview?ref=TB-AAAAAA"),
        ("POST", "/admin/emails/trip_pack/test"),
    ):
        res = await db_client.request(method, path, json={"on": False, "ref": "TB-AAAAAA"})
        assert res.status_code == 401, (method, path, res.text)


async def test_the_settings_list_and_its_switches(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    owner = await owner_cookie(db)
    res = await db_client.get("/admin/emails", headers=owner)
    assert res.status_code == 200, res.text
    body = res.json()
    assert [t["type"] for t in body["types"]] == [
        "balance_reminder",
        "details_reminder",
        "trip_pack",
        "review_request",
        "still_thinking",
        "refund",
    ]
    assert all(t["on"] for t in body["types"]) and body["sendsAt"] == "09:00 IST"
    flags = {t["type"]: (t["switchable"], t["unsubscribable"]) for t in body["types"]}
    assert flags["refund"] == (False, False) and flags["review_request"] == (True, True)

    off = await db_client.put("/admin/emails/trip_pack", json={"on": False}, headers=owner)
    assert off.status_code == 200 and off.json()["on"] is False
    again = (await db_client.get("/admin/emails", headers=owner)).json()
    assert {t["type"]: t["on"] for t in again["types"]}["trip_pack"] is False
    refused = await db_client.put("/admin/emails/refund", json={"on": False}, headers=owner)
    assert refused.status_code == 409 and refused.json()["error"]["reason"] == "no_switch"
    assert (
        await db_client.put("/admin/emails/nope", json={"on": False}, headers=owner)
    ).status_code in (400, 422)


async def test_preview_renders_a_real_booking_as_of_the_day_it_would_go(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, _, dep = await booked(db, db_app, db_client)
    owner = await owner_cookie(db)
    samples = (await db_client.get("/admin/emails/details_reminder/samples", headers=owner)).json()
    assert [s["ref"] for s in samples["items"]] == [ref]
    assert samples["items"][0]["label"].startswith(f"{ref} · Asha Rao · ")

    res = await db_client.get(f"/admin/emails/details_reminder/preview?ref={ref}", headers=owner)
    assert res.status_code == 200, res.text
    p = res.json()
    assert p["subject"].startswith("Reminder: traveller details for ")
    assert p["asOf"] == (dep.date - dt.timedelta(days=14)).isoformat()
    assert "Mira Rao" in p["text"] and "<html" in p["html"] and p["attachments"] == []

    pack = (await db_client.get(f"/admin/emails/trip_pack/preview?ref={ref}", headers=owner)).json()
    assert pack["attachments"] == [f"Tripsmith-{ref}-trip-pack.pdf"]
    assert pack["asOf"] == (dep.date - dt.timedelta(days=3)).isoformat()
    assert "3 days to go" in pack["text"]

    wrong = await db_client.get(f"/admin/emails/review_request/preview?ref={ref}", headers=owner)
    assert wrong.status_code == 409 and wrong.json()["error"]["reason"] == "not_fitting"
    gone = await db_client.get("/admin/emails/trip_pack/preview?ref=TB-ZZZZZZ", headers=owner)
    assert gone.status_code == 404
    # Nothing was claimed or logged by looking.
    assert await _count(db, EmailSend) == 0


async def test_a_test_goes_to_the_owner_only_and_leaves_no_trace(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, _, _ = await booked(db, db_app, db_client)
    sender = db_app.state.email_sender
    sender.sent.clear()
    owner = await owner_cookie(db)
    emails_before = await _count(db, BookingEvent, BookingEvent.kind.like("email.%"))
    res = await db_client.post("/admin/emails/trip_pack/test", json={"ref": ref}, headers=owner)
    assert res.status_code == 200, res.text
    assert res.json()["to"] == OWNER_INBOX
    [mail] = sender.sent
    assert mail.to == OWNER_INBOX and mail.subject.startswith("[Test] Your trip pack for ")
    [pdf] = mail.attachments
    assert pdf.content.startswith(b"%PDF")  # the test carries the real PDF
    assert mail.headers == ()
    assert await _count(db, EmailSend) == 0
    assert await _count(db, BookingEvent, BookingEvent.kind.like("email.%")) == emails_before


async def test_the_booking_lists_what_is_coming_up_with_its_switch(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    ref, _, dep = await booked(db, db_app, db_client)
    owner = await owner_cookie(db)
    await db_client.put("/admin/emails/trip_pack", json={"on": False}, headers=owner)
    b = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    days = lambda n: (dep.date - dt.timedelta(days=n)).isoformat()  # noqa: E731
    nights = (dt.date.fromisoformat(b["returns"]) - dep.date).days
    assert [(u["type"], u["on"], u["switchOn"]) for u in b["upcomingEmails"]] == [
        ("details_reminder", days(14), True),
        ("details_reminder", days(5), True),
        ("trip_pack", days(3), False),
        ("review_request", (dep.date + dt.timedelta(days=nights + 2)).isoformat(), True),
    ]
    assert b["upcomingEmails"][0]["note"] == "3 still to fill in"
    assert ist_today() < dep.date


async def test_coming_up_shows_the_catch_up_the_next_run_sends(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    """Booked long ago, the trip now 2 days out and the pack never sent (a missed run): the
    engine sends it on the next run, so "Coming up" lists it for today."""
    from sqlalchemy import update

    from app.models import Booking, Departure

    ref, _, dep = await booked(db, db_app, db_client)
    soon = ist_today() + dt.timedelta(days=2)
    await db.execute(update(Departure).where(Departure.id == dep.id).values(date=soon))
    await db.execute(
        update(Booking)
        .where(Booking.ref == ref)
        .values(created_at=dt.datetime.now(dt.UTC) - dt.timedelta(days=60))
    )
    await db.commit()
    owner = await owner_cookie(db)
    b = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    packs = [u for u in b["upcomingEmails"] if u["type"] == "trip_pack"]
    assert [(u["on"], u["switchOn"]) for u in packs] == [(ist_today().isoformat(), True)]
    # Details are locked 3 days out: no reminder is listed any more.
    assert not [u for u in b["upcomingEmails"] if u["type"] == "details_reminder"]
