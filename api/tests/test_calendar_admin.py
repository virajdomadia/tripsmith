"""P11 (R50) — the owner's departure calendar: the month's numbers against
`departure_availability` and the desk (a booked party, a checkout hold, a counter payment link,
a waitlist offer and a date-change hold on one date), the side panel, and adding a departure
from a day. The db tests need TEST_DATABASE_URL."""

import csv
import datetime as dt
import io
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, DateChange, Package, TripLeader
from app.models.enums import (
    BookingChannel,
    BookingStatus,
    DateChangeState,
    PackageStatus,
    WaitlistState,
)
from app.models.waitlist import WaitlistEntry
from app.services.admin_calendar import month_bounds
from app.services.analytics import ist_today
from tests.razorpay_fake import FakeRazorpay
from tests.test_booking_orders import SOON, seats_left, seeded
from tests.test_booking_payments import callback, rzp
from tests.test_bookings_desk import hold, owner_cookie

__all__ = ["rzp"]

pytestmark = pytest.mark.db

MONTH = SOON.strftime("%Y-%m")


async def paid(client: AsyncClient, departure_id: str, party: int, n: int) -> str:
    h = await hold(client, departure_id, party, n)
    res = await client.post(
        f"/bookings/{h['bookingRef']}/confirm",
        json=callback(str(h["orderId"]), f"pay_Cal{n:07d}"),
    )
    assert res.status_code == 200, res.text
    return str(h["bookingRef"])


def chip(month: dict[str, Any], departure_id: str) -> dict[str, Any]:
    found = [d for d in month["departures"] if d["id"] == departure_id]
    assert len(found) == 1
    return found[0]


# --- access -------------------------------------------------------------------------------------


async def test_calendar_routes_are_owner_only(db_client: AsyncClient) -> None:
    for method, path in [
        ("GET", "/admin/calendar"),
        ("GET", "/admin/calendar/departures/d1"),
        ("POST", "/admin/packages/p1/departures"),
    ]:
        res = await db_client.request(method, path, json={})
        assert res.status_code == 401, path


def test_month_bounds() -> None:
    assert month_bounds("2026-02") == (dt.date(2026, 2, 1), dt.date(2026, 2, 28))
    assert month_bounds("2028-02") == (dt.date(2028, 2, 1), dt.date(2028, 2, 29))
    assert month_bounds("2026-12") == (dt.date(2026, 12, 1), dt.date(2026, 12, 31))


# --- the numbers (R50 accept) -------------------------------------------------------------------


async def test_the_month_matches_departure_availability_and_the_desk(
    db: AsyncSession, db_client: AsyncClient, rzp: FakeRazorpay
) -> None:
    owner = await owner_cookie(db)
    pkg, departure = await seeded(db, seats=20)
    dep_id, later_id = departure.id, pkg.departures[1].id
    full = await paid(db_client, dep_id, 3, 1)
    part = await paid(db_client, dep_id, 2, 2)
    await hold(db_client, dep_id, 2, 3)  # a live checkout hold
    link = await hold(db_client, dep_id, 1, 4)  # a counter payment link: pending + channel
    await db.execute(
        update(Booking)
        .where(Booking.ref == link["bookingRef"])
        .values(channel=BookingChannel.PHONE)
    )
    # A deposit booking: a balance still to pay.
    total = (await db.execute(select(Booking.total_paise).where(Booking.ref == part))).scalar_one()
    await db.execute(
        update(Booking)
        .where(Booking.ref == part)
        .values(
            status=BookingStatus.PARTIALLY_PAID,
            paid_paise=total // 4,
            deposit_paise=total // 4,
            balance_due_on=SOON - dt.timedelta(days=30),
        )
    )
    db.add(
        WaitlistEntry(
            departure_id=dep_id,
            name="Ira Sen",
            email="ira@example.test",
            party=2,
            position=1,
            state=WaitlistState.OFFERED,
            offer_expires_at=dt.datetime.now(dt.UTC) + dt.timedelta(hours=10),
            offer_no=1,
        )
    )
    db.add(
        WaitlistEntry(
            departure_id=dep_id,
            name="Om Das",
            email="om@example.test",
            party=3,
            position=2,
            state=WaitlistState.WAITING,
        )
    )
    mover = await paid(db_client, later_id, 1, 5)
    mover_id = (await db.execute(select(Booking.id).where(Booking.ref == mover))).scalar_one()
    db.add(
        DateChange(
            booking_id=mover_id,
            from_departure_id=later_id,
            to_departure_id=dep_id,
            party=1,
            state=DateChangeState.HELD,
            hold_expires_at=dt.datetime.now(dt.UTC) + dt.timedelta(minutes=10),
            fee_paise=0,
            net_paise=0,
            pay_paise=0,
            quote={},
            invoiced=False,
            actor="customer",
        )
    )
    await db.commit()

    res = await db_client.get("/admin/calendar", params={"month": MONTH}, headers=owner)
    assert res.status_code == 200, res.text
    c = chip(res.json(), dep_id)
    desk = await db_client.get("/admin/bookings", params={"departureId": dep_id}, headers=owner)
    seats = desk.json()["seats"]
    csv_res = await db_client.get(
        "/admin/bookings.csv", params={"departureId": dep_id}, headers=owner
    )
    await db.rollback()  # now() is frozen at the test transaction's start

    # Seats: 5 sold; held = 2 + 1 (holds) + 2 (offer) + 1 (date change); the rest free.
    assert (c["sold"], c["held"], c["free"]) == (5, 6, 9)
    assert c["sold"] + c["held"] + c["free"] == c["seatsTotal"] == 20
    assert c["free"] == await seats_left(db, dep_id)
    assert (seats["booked"], seats["held"], seats["seatsLeft"]) == (c["sold"], c["held"], c["free"])
    assert (c["waiting"], c["smallestWaitingParty"]) == (2, 3)

    # Money: the desk CSV's Total / Paid / Balance due over the seat-holding rows.
    rows = list(csv.DictReader(io.StringIO(csv_res.text.lstrip("﻿"))))
    holding = [r for r in rows if r["Status"] in ("Confirmed", "Deposit paid", "Completed")]
    assert {r["Ref"] for r in holding} == {full, part}
    assert c["revenuePaise"] == sum(int(r["Total (₹)"]) for r in holding) * 100
    assert c["collectedPaise"] == sum(int(r["Paid (₹)"]) for r in holding) * 100
    assert c["balancePaise"] == sum(int(r["Balance due (₹)"] or 0) for r in holding) * 100
    assert (c["balanceBookings"], c["firstDueOn"]) == (
        1,
        (SOON - dt.timedelta(days=30)).isoformat(),
    )
    assert c["missingTravellers"] == 5 and c["readyPercent"] is not None

    # The panel: holds first, then the balance, then paid; the non-booking holds listed.
    res = await db_client.get(f"/admin/calendar/departures/{dep_id}", headers=owner)
    assert res.status_code == 200, res.text
    panel = res.json()
    assert panel["departure"] == c
    statuses = [b["status"] for b in panel["bookings"]]
    assert statuses == ["pending", "pending", "partially_paid", "confirmed"]
    assert {b["channel"] for b in panel["bookings"][:2]} == {"web", "phone"}
    assert sorted((h["kind"], h["party"]) for h in panel["holds"]) == [
        ("date_change", 1),
        ("waitlist_offer", 2),
    ]
    assert {p["key"] for p in panel["readinessParts"]} >= {"details", "balance", "pack"}
    balance = next(p for p in panel["readinessParts"] if p["key"] == "balance")
    assert balance["percent"] == 50  # one of two paid bookings has paid in full


async def test_the_month_lists_its_departures_drafts_and_neighbours(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    owner = await owner_cookie(db)
    pkg, departure = await seeded(db, seats=10)
    draft = (await db.execute(select(Package).where(Package.id == pkg.id))).scalar_one()
    await db.execute(
        update(Package).where(Package.id == draft.id).values(status=PackageStatus.DRAFT)
    )
    await db.commit()
    res = await db_client.get("/admin/calendar", params={"month": MONTH}, headers=owner)
    body = res.json()
    assert body["month"] == MONTH and body["today"] == ist_today().isoformat()
    c = chip(body, departure.id)
    assert (c["sold"], c["held"], c["free"], c["readyPercent"]) == (0, 0, 10, None)
    assert c["returns"] == (SOON + dt.timedelta(days=draft.nights)).isoformat()
    [p] = body["packages"]
    assert p["draft"] is True and p["seatsTotal"] == 12  # the latest date's prefill
    first, _ = month_bounds(MONTH)
    before = (first - dt.timedelta(days=1)).strftime("%Y-%m")
    empty = await db_client.get("/admin/calendar", params={"month": before}, headers=owner)
    assert empty.json()["departures"] == []
    assert empty.json()["nextBusyMonth"] == MONTH
    bad = await db_client.get("/admin/calendar", params={"month": "2026-13"}, headers=owner)
    assert bad.status_code == 400
    missing = await db_client.get("/admin/calendar/departures/nope", headers=owner)
    assert missing.status_code == 404


# --- adding a departure -------------------------------------------------------------------------


def new_date(day: dt.date, **over: object) -> dict[str, object]:
    return {
        "date": day.isoformat(),
        "seatsTotal": 14,
        "priceDoublePaise": 21_000_00,
        "priceTriplePaise": 19_000_00,
        "priceChildPaise": 10_500_00,
        "singleSupplementPaise": 9_000_00,
        **over,
    }


async def test_adding_a_departure_keeps_the_others_and_stales_an_open_editor(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    owner = await owner_cookie(db)
    pkg, _ = await seeded(db, seats=10)
    before = await db_client.get(f"/admin/packages/{pkg.id}", headers=owner)
    day = SOON + dt.timedelta(days=3)
    res = await db_client.post(
        f"/admin/packages/{pkg.id}/departures", json=new_date(day), headers=owner
    )
    assert res.status_code == 201, res.text
    after = (await db_client.get(f"/admin/packages/{pkg.id}", headers=owner)).json()
    dates = [d["date"] for d in after["departures"]]
    assert dates == sorted(dates) and len(dates) == 3 and day.isoformat() in dates
    # `editedAt` moved: an editor still holding the old list gets the stale 409 (tested in
    # test_admin_packages) instead of saving it over the new date.
    assert after["editedAt"] != before.json()["editedAt"]


async def test_adding_a_departure_is_refused_on_a_taken_or_past_day(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    owner = await owner_cookie(db)
    pkg, departure = await seeded(db, seats=10)
    url = f"/admin/packages/{pkg.id}/departures"
    taken = await db_client.post(url, json=new_date(departure.date), headers=owner)
    assert taken.status_code == 409 and "date" in taken.json()["error"]["fieldErrors"]
    past = await db_client.post(
        url, json=new_date(ist_today() - dt.timedelta(days=1)), headers=owner
    )
    assert past.status_code == 400 and "date" in past.json()["error"]["fieldErrors"]
    free = await db_client.post(url, json=new_date(SOON, priceDoublePaise=0), headers=owner)
    assert free.status_code == 400
    gone = await db_client.post(
        "/admin/packages/nope/departures", json=new_date(SOON), headers=owner
    )
    assert gone.status_code == 404


async def test_a_draft_package_takes_a_new_date(db: AsyncSession, db_client: AsyncClient) -> None:
    owner = await owner_cookie(db)
    pkg, _ = await seeded(db, seats=10)
    await db.execute(update(Package).where(Package.id == pkg.id).values(status=PackageStatus.DRAFT))
    await db.commit()
    res = await db_client.post(
        f"/admin/packages/{pkg.id}/departures",
        json=new_date(SOON + dt.timedelta(days=1)),
        headers=owner,
    )
    assert res.status_code == 201, res.text


async def test_a_leader_on_another_trip_cannot_take_the_new_date(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    owner = await owner_cookie(db)
    tenzin = TripLeader(slug="tenzin", name="Tenzin Norbu", phone="+91 90000 00001")
    kavya = TripLeader(slug="kavya", name="Kavya Rawat", phone="+91 90000 00002")
    db.add_all([tenzin, kavya])
    pkg, _ = await seeded(db, seats=10)
    await db.execute(update(Package).where(Package.id == pkg.id).values(leader_id=tenzin.id))
    await db.commit()
    # Tenzin leads SOON .. SOON + nights by default; a date inside that window clashes.
    day = SOON + dt.timedelta(days=1)
    url = f"/admin/packages/{pkg.id}/departures"
    res = await db_client.post(url, json=new_date(day), headers=owner)
    assert res.status_code == 409, res.text
    assert "Tenzin Norbu" in res.json()["error"]["fieldErrors"]["leaderId"]
    ok = await db_client.post(url, json=new_date(day, leaderId=kavya.id), headers=owner)
    assert ok.status_code == 201, ok.text
    month = (await db_client.get("/admin/calendar", params={"month": MONTH}, headers=owner)).json()
    assert chip(month, ok.json()["id"])["leaderId"] == kavya.id
    trips = {(t["leaderId"], t["date"]) for t in month["leaderTrips"]}
    assert (tenzin.id, SOON.isoformat()) in trips and (kavya.id, day.isoformat()) in trips
    assert {lead["slug"] for lead in month["leaders"]} == {"tenzin", "kavya"}
    unknown = await db_client.post(
        url, json=new_date(day + dt.timedelta(days=20), leaderId="nope"), headers=owner
    )
    assert unknown.status_code == 400
