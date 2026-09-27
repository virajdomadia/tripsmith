"""P20c (R59) — the read-only numbers the catalogue screens show: each package card's publish
checks, photo count and next date's seat fill (Packages B), and each destination card's next
date on a live trip (Destinations A). The db tests need TEST_DATABASE_URL."""

import datetime as dt

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingTraveller, PackageImage
from app.models.enums import BookingStatus, Occupancy, PackageStatus
from tests.test_booking_orders import SOON, dep, seeded
from tests.test_bookings_desk import owner_cookie
from tests.test_db import package

pytestmark = pytest.mark.db


async def test_package_rows_carry_their_checks_photos_and_next_date_fill(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    pkg, first = await seeded(db, seats=6)
    pkg_id, first_id, dest = pkg.id, first.id, pkg.destination
    db.add(PackageImage(package_id=pkg_id, url="https://img.test/a.jpg", width=8, height=6))
    # A confirmed party of two and a live hold of one take three of the six seats.
    now = dt.datetime.now(dt.UTC)
    for n, (status, party, until) in enumerate(
        [
            (BookingStatus.CONFIRMED, 2, now),
            (BookingStatus.PENDING, 1, now + dt.timedelta(minutes=10)),
            (BookingStatus.PENDING, 3, now - dt.timedelta(minutes=1)),  # lapsed: nothing
        ]
    ):
        b = Booking(
            ref=f"TB-P20C{n:02d}",
            package_id=pkg_id,
            departure_id=first_id,
            status=status,
            hold_expires_at=until,
            contact_name="Asha Rao",
            contact_phone="9000000000",
            contact_email=f"a{n}@customer.in",
            quote={},
            total_paise=1,
        )
        b.travellers = [
            BookingTraveller(name=f"T{i}", age=30, occupancy=Occupancy.DOUBLE, position=i)
            for i in range(party)
        ]
        db.add(b)
    # A draft beside it, with no dates and no photos.
    draft = package(dest, slug="goa-draft", name="Goa draft", status=PackageStatus.DRAFT)
    draft.departures = []
    db.add(draft)
    # A past date on the live package is never "next".
    past = dep(SOON - dt.timedelta(days=60), 10, 20_000_00)
    past.package_id = pkg_id
    db.add(past)
    await db.commit()

    owner = await owner_cookie(db)
    res = await db_client.get("/admin/packages", headers=owner)
    assert res.status_code == 200, res.text
    rows = {r["slug"]: r for r in res.json()["items"]}
    live = rows[pkg.slug]
    assert live["imageCount"] == 1
    assert live["nextDeparture"] == {"date": SOON.isoformat(), "seats": 6, "taken": 3}
    assert [(r["key"], r["ok"]) for r in live["publishRules"]] == [
        ("images", True),
        ("itinerary", False),  # the fixture writes no days
        ("departures", True),
        ("prices", True),
    ]
    empty = rows["goa-draft"]
    assert (empty["imageCount"], empty["nextDeparture"]) == (0, None)
    assert [r["ok"] for r in empty["publishRules"]] == [False, False, False, True]


async def test_destination_cards_carry_the_next_date_on_a_live_trip(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    pkg, _ = await seeded(db, seats=4)
    dest_id = pkg.destination_id
    owner = await owner_cookie(db)
    items = (await db_client.get("/admin/destinations", headers=owner)).json()["items"]
    [goa] = [d for d in items if d["id"] == dest_id]
    assert goa["nextDepartureOn"] == SOON.isoformat()

    # Unpublished, its dates no longer count.
    pkg.status = PackageStatus.DRAFT
    await db.commit()
    items = (await db_client.get("/admin/destinations", headers=owner)).json()["items"]
    assert next(d for d in items if d["id"] == dest_id)["nextDepartureOn"] is None
    one = (await db_client.get(f"/admin/destinations/{dest_id}", headers=owner)).json()
    assert one["nextDepartureOn"] is None  # the list's figure only
