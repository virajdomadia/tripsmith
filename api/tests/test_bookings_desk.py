"""B10 — the bookings desk (R22): the list and its numbers against `departure_availability`,
mark paid (offline) with the seat re-check, release hold, 'refund made', the manifest, the CSV,
the daily sweep and a late payment on a swept booking, and travellers in entry order. The db
tests need TEST_DATABASE_URL."""

import asyncio
import csv
import io
import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, User
from app.models.enums import BookingStatus, CancelReason, UserRole
from app.services.auth.sessions import open_session
from app.services.booking.voucher import load_booking_facts
from app.services.pdf.voucher import voucher_filename
from tests.razorpay_fake import FakeRazorpay
from tests.test_auth import with_cookie
from tests.test_booking_orders import SOON, seats_left, seeded
from tests.test_booking_payments import booking, booking_body, callback, payments, rzp
from tests.test_booking_webhook import OWNER_INBOX, mailing
from tests.test_session_migration import API_DIR, _sql

__all__ = ["rzp"]

pytestmark = pytest.mark.db


async def owner_cookie(db: AsyncSession) -> dict[str, str]:
    user = User(name="Meera Nair", email="owner@tripsmith.demo", role=UserRole.OWNER)
    db.add(user)
    await db.commit()
    _, token = await open_session(db, user, ip=None, user_agent=None)
    return with_cookie(token)


async def hold(client: AsyncClient, departure_id: str, party: int, n: int) -> dict[str, str | int]:
    res = await client.post(
        "/bookings",
        json=booking_body(
            departure_id, party, email=f"p{n}@example.test", phone=f"90000000{n:02d}"
        ),
    )
    assert res.status_code == 201, res.text
    return res.json()


async def lapse(db: AsyncSession, ref: str, by: str = "2 hours") -> None:
    await db.execute(
        update(Booking)
        .where(Booking.ref == ref)
        .values(hold_expires_at=text(f"now() - interval '{by}'"))
    )
    await db.commit()


async def run_daily(client: AsyncClient, app: FastAPI) -> dict[str, object]:
    secret = app.state.settings.cron_secret
    headers = {"Authorization": f"Bearer {secret.get_secret_value()}"} if secret else {}
    res = await client.get("/cron/daily", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture
def cron(db_app: FastAPI) -> None:
    from pydantic import SecretStr

    db_app.state.settings = db_app.state.settings.model_copy(
        update={"cron_secret": SecretStr("cron-test-secret")}
    )


# --- access -------------------------------------------------------------------------------------


async def test_every_desk_route_is_owner_only(db: AsyncSession, db_client: AsyncClient) -> None:
    routes = [
        ("GET", "/admin/bookings"),
        ("GET", "/admin/bookings.csv"),
        ("GET", "/admin/bookings/TB-AAAAAA"),
        ("POST", "/admin/bookings/TB-AAAAAA/mark-paid"),
        ("POST", "/admin/bookings/TB-AAAAAA/release"),
        ("POST", "/admin/bookings/TB-AAAAAA/refund-made"),
        ("GET", "/admin/departures/d1/manifest"),
    ]
    for method, path in routes:
        res = await db_client.request(method, path, json={})
        assert res.status_code == 401, path
    customer = User(name="Asha", email="asha@example.test", role=UserRole.CUSTOMER)
    db.add(customer)
    await db.commit()
    _, token = await open_session(db, customer, ip=None, user_agent=None)
    for method, path in routes:
        res = await db_client.request(method, path, json={}, headers=with_cookie(token))
        assert res.status_code == 403, path


# --- list + numbers -----------------------------------------------------------------------------


async def test_the_desk_numbers_match_departure_availability(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=10)
    dep_id = departure.id
    paid = await hold(db_client, dep_id, 3, 1)
    res = await db_client.post(
        f"/bookings/{paid['bookingRef']}/confirm",
        json=callback(str(paid["orderId"]), "pay_Desk00001"),
    )
    assert res.json()["status"] == "confirmed"
    live = await hold(db_client, dep_id, 2, 2)  # a live hold
    lapsed = await hold(db_client, dep_id, 4, 3)
    await lapse(db, str(lapsed["bookingRef"]), "5 minutes")  # lapsed: no longer counted

    res = await db_client.get("/admin/bookings", params={"departureId": dep_id}, headers=owner)
    assert res.status_code == 200, res.text
    body = res.json()
    seats = body["seats"]
    await db.rollback()  # now() is frozen at the test transaction's start
    assert seats["seatsLeft"] == await seats_left(db, dep_id) == 10 - 3 - 2
    assert (seats["seatsTotal"], seats["booked"], seats["held"]) == (10, 3, 2)
    assert seats["seatsTotal"] - seats["booked"] - seats["held"] == seats["seatsLeft"]

    assert [r["ref"] for r in body["items"]] == [
        lapsed["bookingRef"],
        live["bookingRef"],
        paid["bookingRef"],
    ]  # newest first
    rows = {r["ref"]: r for r in body["items"]}
    assert rows[live["bookingRef"]]["holdLive"] is True
    assert rows[lapsed["bookingRef"]]["holdLive"] is False
    assert rows[paid["bookingRef"]]["travellers"] == 3
    assert body["counts"] | {} == {
        "pending": 2,
        "confirmed": 1,
        "completed": 0,
        "cancelled": 0,
        "all": 3,
        "refund": 0,
        "cancellation": 0,
    }
    assert [d["id"] for d in body["departures"]] == [dep_id]

    # Tabs leave their own filter out; search by ref, phone and email.
    confirmed = await db_client.get(
        "/admin/bookings", params={"status": "confirmed"}, headers=owner
    )
    assert [r["ref"] for r in confirmed.json()["items"]] == [paid["bookingRef"]]
    assert confirmed.json()["counts"]["pending"] == 2
    for q in (str(paid["bookingRef"]).lower(), "+91 90000-00001", "P1@example.test"):
        found = await db_client.get("/admin/bookings", params={"q": q}, headers=owner)
        assert [r["ref"] for r in found.json()["items"]] == [paid["bookingRef"]], q
    # The date range is the departure's date.
    after = await db_client.get(
        "/admin/bookings", params={"from": SOON.isoformat(), "to": SOON.isoformat()}, headers=owner
    )
    assert after.json()["total"] == 3
    later = SOON.replace(year=SOON.year + 1).isoformat()
    none = await db_client.get("/admin/bookings", params={"from": later}, headers=owner)
    assert none.json()["total"] == 0


# --- mark paid ----------------------------------------------------------------------------------


async def test_mark_paid_confirms_a_lapsed_hold_and_mails_only_the_customer(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    sender = mailing(db_app)
    _, departure = await seeded(db, seats=4)
    order = await hold(db_client, departure.id, 2, 1)
    ref = str(order["bookingRef"])
    await lapse(db, ref, "3 hours")  # a bank transfer, days later

    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert (detail["canMarkPaid"], detail["canRelease"], detail["seatsShort"]) == (True, True, 0)

    res = await db_client.post(
        f"/admin/bookings/{ref}/mark-paid", json={"reference": "  UTR 4471 "}, headers=owner
    )
    assert res.status_code == 200, res.text
    b = res.json()
    assert b["status"] == "confirmed" and b["paidPaise"] == b["totalPaise"]
    assert b["hasVoucher"] is True and b["canMarkPaid"] is False
    offline = [p for p in b["payments"] if p["provider"] == "offline"]
    assert [(p["status"], p["reference"], p["via"]) for p in offline] == [
        ("captured", "UTR 4471", "desk")
    ]
    assert "Marked paid offline" in [e["text"] for e in b["timeline"]][-1]

    # The customer's confirmation with the voucher; no "New booking" email to the owner.
    [mail] = sender.sent
    assert mail.to == "p1@example.test" and "confirmed" in mail.subject
    assert [a.filename for a in mail.attachments] == [voucher_filename(ref)]
    assert "marked this booking paid offline" in mail.text
    assert all(m.to != OWNER_INBOX for m in sender.sent)
    facts = await load_booking_facts(db, ref)
    assert facts is not None and facts.payment_ids == ("offline (UTR 4471)",)
    assert facts.paid_offline

    # Once paid it cannot be paid again.
    again = await db_client.post(f"/admin/bookings/{ref}/mark-paid", json={}, headers=owner)
    assert again.status_code == 409 and again.json()["error"]["reason"] == "not_payable"


async def test_mark_paid_refuses_with_the_shortfall_and_records_nothing(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=3)
    dep_id = departure.id
    first = await hold(db_client, dep_id, 3, 1)
    await lapse(db, str(first["bookingRef"]))
    await hold(db_client, dep_id, 2, 2)  # someone else holds two of the three

    ref = str(first["bookingRef"])
    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert detail["seatsShort"] == 2
    res = await db_client.post(f"/admin/bookings/{ref}/mark-paid", json={}, headers=owner)
    assert res.status_code == 409
    err = res.json()["error"]
    assert err["reason"] == "seats_short"
    assert err["message"] == "Only 1 seat left on this date — the party of 3 is 2 short"
    assert (await booking(db, ref)).status == BookingStatus.PENDING
    assert [p.provider.value for p in await payments(db, ref)] == ["razorpay"]  # nothing added


# --- release ------------------------------------------------------------------------------------


async def test_release_hold_frees_the_seats_at_once_without_email(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    sender = mailing(db_app)
    _, departure = await seeded(db, seats=5)
    dep_id = departure.id
    order = await hold(db_client, dep_id, 2, 1)
    await db.rollback()
    assert await seats_left(db, dep_id) == 3

    ref = str(order["bookingRef"])
    res = await db_client.post(f"/admin/bookings/{ref}/release", headers=owner)
    assert res.status_code == 200, res.text
    b = res.json()
    assert (b["status"], b["cancelReason"], b["canRelease"]) == (
        "cancelled",
        "owner_released",
        False,
    )
    assert b["timeline"][-1]["text"].startswith("Hold released by the owner")
    await db.rollback()
    assert await seats_left(db, dep_id) == 5
    assert sender.sent == []
    res = await db_client.post(f"/admin/bookings/{ref}/release", headers=owner)
    assert res.status_code == 409


# --- refund made --------------------------------------------------------------------------------


async def test_refund_made_clears_the_flag_and_the_badge(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=2)
    dep_id = departure.id
    first = await hold(db_client, dep_id, 2, 1)
    await lapse(db, str(first["bookingRef"]), "1 minute")
    await hold(db_client, dep_id, 2, 2)  # the seats go
    ref = str(first["bookingRef"])
    res = await db_client.post(
        f"/bookings/{ref}/confirm", json=callback(str(first["orderId"]), "pay_Late0B10")
    )
    assert res.json()["refundNeeded"] is True

    session = (await db_client.get("/auth/session", headers=owner)).json()
    assert session["bookingsAttention"] == 1
    flagged = await db_client.get("/admin/bookings", params={"flag": "refund"}, headers=owner)
    assert [r["ref"] for r in flagged.json()["items"]] == [ref]

    res = await db_client.post(
        f"/admin/bookings/{ref}/refund-made", json={"note": "rfnd_991"}, headers=owner
    )
    assert res.status_code == 200, res.text
    b = res.json()
    assert (b["refundNeeded"], b["paidPaise"]) == (False, 0)
    [p] = b["payments"]
    assert (p["status"], p["via"]) == ("refunded", "checkout")
    kinds = [e["kind"] for e in b["timeline"]]
    assert kinds.index("captured") < kinds.index("refunded")
    assert (await db_client.get("/auth/session", headers=owner)).json()["bookingsAttention"] == 0
    again = await db_client.post(f"/admin/bookings/{ref}/refund-made", json={}, headers=owner)
    assert again.status_code == 409


# --- sweep + late payment -----------------------------------------------------------------------


async def test_sweep_cancels_old_holds_and_a_late_payment_still_confirms_if_seats_are_free(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    _, departure = await seeded(db, seats=4)
    dep_id = departure.id
    old = await hold(db_client, dep_id, 2, 1)
    recent = await hold(db_client, dep_id, 1, 2)
    await lapse(db, str(old["bookingRef"]), "2 hours")
    await lapse(db, str(recent["bookingRef"]), "30 minutes")  # under an hour: left alone

    report = await run_daily(db_client, db_app)
    assert (report["holdsExpired"], report["bookingsCompleted"]) == (1, 0)
    swept = await booking(db, str(old["bookingRef"]))
    assert (swept.status, swept.cancel_reason) == (
        BookingStatus.CANCELLED,
        CancelReason.HOLD_EXPIRED,
    )
    assert (await booking(db, str(recent["bookingRef"]))).status == BookingStatus.PENDING

    # The payment lands after the sweep; the seats are still free → confirmed, no refund.
    res = await db_client.post(
        f"/bookings/{old['bookingRef']}/confirm",
        json=callback(str(old["orderId"]), "pay_AfterSweep"),
    )
    assert res.json()["status"] == "confirmed" and res.json()["refundNeeded"] is False
    late = await booking(db, str(old["bookingRef"]))
    assert late.cancel_reason is None and late.paid_paise == late.total_paise


async def test_a_late_payment_on_a_swept_booking_with_no_seats_is_seats_gone(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    _, departure = await seeded(db, seats=2)
    dep_id = departure.id
    old = await hold(db_client, dep_id, 2, 1)
    await lapse(db, str(old["bookingRef"]))
    await run_daily(db_client, db_app)
    await hold(db_client, dep_id, 2, 2)  # the seats go to someone else

    res = await db_client.post(
        f"/bookings/{old['bookingRef']}/confirm",
        json=callback(str(old["orderId"]), "pay_SweptGone"),
    )
    assert res.json() == {
        "bookingRef": old["bookingRef"],
        "status": "cancelled",
        "refundNeeded": True,
        "voucherUrl": None,
    }
    assert (await booking(db, str(old["bookingRef"]))).cancel_reason == CancelReason.SEATS_GONE


async def test_mark_paid_works_on_a_swept_booking(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    old = await hold(db_client, departure.id, 2, 1)
    await lapse(db, str(old["bookingRef"]))
    await run_daily(db_client, db_app)
    ref = str(old["bookingRef"])
    res = await db_client.post(f"/admin/bookings/{ref}/mark-paid", json={}, headers=owner)
    assert res.status_code == 200, res.text
    assert (res.json()["status"], res.json()["cancelReason"]) == ("confirmed", None)


async def test_sweep_completes_departed_confirmed_bookings(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, rzp: FakeRazorpay, cron: None
) -> None:
    _, departure = await seeded(db, seats=4)
    order = await hold(db_client, departure.id, 1, 1)
    ref = str(order["bookingRef"])
    await db_client.post(
        f"/bookings/{ref}/confirm", json=callback(str(order["orderId"]), "pay_Done00001")
    )
    await db.execute(
        text("update departures set date = current_date - 3 where id = :id"), {"id": departure.id}
    )
    await db.commit()
    report = await run_daily(db_client, db_app)
    assert report["bookingsCompleted"] == 1
    assert (await booking(db, ref)).status == BookingStatus.COMPLETED


# --- manifest + csv + order ---------------------------------------------------------------------


async def test_manifest_lists_confirmed_travellers_in_entry_order_with_matching_seats(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=9)
    dep_id = departure.id
    names = ["Zoya Khan", "Arjun Mehta", "Meera Iyer", "Bilal Shaikh"]
    body = {
        "departureId": dep_id,
        "travellers": [
            {"name": n, "age": 30 + i, "occupancy": "single"} for i, n in enumerate(names)
        ],
        "contact": {"name": "Zoya Khan", "phone": "9000000001", "email": "zoya@example.test"},
    }
    order = (await db_client.post("/bookings", json=body)).json()
    ref = order["bookingRef"]
    await db_client.post(f"/bookings/{ref}/confirm", json=callback(order["orderId"], "pay_Man0001"))
    await hold(db_client, dep_id, 2, 2)  # a live hold: counted as held, not on the manifest

    res = await db_client.get(f"/admin/departures/{dep_id}/manifest", headers=owner)
    assert res.status_code == 200, res.text
    m = res.json()
    await db.rollback()
    assert m["seats"]["seatsLeft"] == await seats_left(db, dep_id) == 3
    assert (m["seats"]["booked"], m["seats"]["held"], m["travellers"]) == (4, 2, 4)
    [group] = m["bookings"]
    assert group["ref"] == ref and group["leadPhone"] == "9000000001"
    assert [t["name"] for t in group["travellers"]] == names  # entry order, not id order
    facts = await load_booking_facts(db, ref)
    assert facts is not None and [t.name for t in facts.travellers] == names
    detail = (await db_client.get(f"/admin/bookings/{ref}", headers=owner)).json()
    assert [t["name"] for t in detail["travellers"]] == names
    missing = await db_client.get("/admin/departures/nope/manifest", headers=owner)
    assert missing.status_code == 404


async def test_csv_is_the_filtered_desk_with_safe_cells(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=6)
    body = booking_body(departure.id, 1, email="x@example.test", phone="9000000009")
    body["contact"] = {"name": "=HYPERLINK(1)", "phone": "9000000009", "email": "x@example.test"}
    order = (await db_client.post("/bookings", json=body)).json()
    await hold(db_client, departure.id, 1, 3)
    await db_client.post(
        f"/bookings/{order['bookingRef']}/confirm", json=callback(order["orderId"], "pay_Csv0001")
    )

    res = await db_client.get("/admin/bookings.csv", params={"status": "confirmed"}, headers=owner)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "tripsmith-bookings-" in res.headers["content-disposition"]
    rows = list(csv.reader(io.StringIO(res.text.lstrip("﻿"))))
    assert rows[0][:3] == ["Ref", "Booked (IST)", "Status"]
    [row] = rows[1:]
    assert row[0] == order["bookingRef"] and row[2] == "Confirmed"
    assert row[10] == "'=HYPERLINK(1)"
    assert row[15] == "pay_Csv0001 captured"


# --- migration 0006 ------------------------------------------------------------------------------


def test_0006_numbers_existing_travellers_and_old_inserts_still_work(
    migrated_database_url: str,
) -> None:
    cfg = Config(os.path.join(API_DIR, "alembic.ini"))
    url = migrated_database_url
    try:
        command.downgrade(cfg, "0005")
        asyncio.run(
            _sql(
                url,
                "truncate table bookings, departures, packages, destinations cascade",
                "insert into destinations (id, slug, name, tagline, intro, cover_url, region, "
                "best_months) values ('dst', 'goa', 'Goa', 't', 'i', 'c', 'r', '{1}')",
                "insert into packages (id, slug, destination_id, name, summary, nights, days) "
                "values ('pkg', 'p', 'dst', 'P', 'S', 2, 3)",
                "insert into departures (id, package_id, date, seats_total, price_double_paise, "
                "price_triple_paise, price_child_paise, single_supplement_paise) "
                "values ('dep', 'pkg', current_date + 30, 10, 1, 1, 1, 1)",
                "insert into bookings (id, ref, package_id, departure_id, hold_expires_at, "
                "contact_name, contact_phone, contact_email, quote, total_paise) values "
                "('bk', 'TB-MIGRAT', 'pkg', 'dep', now(), 'A', '9000000000', 'a@x.test', "
                "'{}', 100)",
                "insert into booking_travellers (id, booking_id, name, age, occupancy) values "
                "('t2', 'bk', 'B', 30, 'single'), ('t1', 'bk', 'A', 30, 'single')",
            )
        )
        command.upgrade(cfg, "0006")
        rows = asyncio.run(
            _sql(url, "select id, position from booking_travellers order by position")
        )
        assert rows == [("t1", 0), ("t2", 1)]
        # The deployed api (before this code merges) never names the column: its insert works.
        asyncio.run(
            _sql(
                url,
                "insert into booking_travellers (id, booking_id, name, age, occupancy) "
                "values ('t3', 'bk', 'C', 30, 'single')",
            )
        )
        rows = asyncio.run(_sql(url, "select position from booking_travellers where id = 't3'"))
        assert rows == [(0,)]
        command.downgrade(cfg, "0005")
    finally:
        command.upgrade(cfg, "head")
        asyncio.run(
            _sql(url, "truncate table bookings, departures, packages, destinations cascade")
        )


async def test_owner_booking_detail_404(db: AsyncSession, db_client: AsyncClient) -> None:
    owner = await owner_cookie(db)
    res = await db_client.get("/admin/bookings/TB-NOPE00", headers=owner)
    assert res.status_code == 404
    assert (await db.execute(select(Booking))).first() is None
