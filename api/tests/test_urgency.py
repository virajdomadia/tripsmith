"""P2 + P4 — honest urgency labels and the verified review card (R40, R42). Every label is one
query in `services/catalog/urgency.py`; these tests pin each threshold on both sides of its
boundary, with an injected IST `today` in 2099 so they never go stale. The db tests need
TEST_DATABASE_URL."""

import datetime as dt
from itertools import count

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Booking, BookingTraveller, Departure, Destination, Package, Review
from app.models.enums import BookingChannel, BookingStatus, CancelReason, Occupancy, PackageStatus
from app.schemas.catalog import BookingProof
from app.schemas.meta import Badge
from app.services.catalog import admin_packages, urgency
from app.services.catalog.availability import Availability
from app.services.catalog.pricing import badge_for
from app.services.catalog.urgency import Proof
from app.services.email.send import is_seed_address
from scripts.seed import UrgencySeed, seed_urgency
from tests.test_booking_orders import dep
from tests.test_db import goa, package
from tests.test_reviews import extra_review

TODAY = dt.date(2099, 6, 30)  # IST
TRIP = dt.date(2099, 8, 14)
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))
_refs = count(1)


def ist(day: dt.date, hour: int = 12, minute: int = 0) -> dt.datetime:
    return dt.datetime(day.year, day.month, day.day, hour, minute, tzinfo=IST)


def ago(days: int) -> dt.datetime:
    return ist(TODAY - dt.timedelta(days=days))


def booking(
    d: Departure,
    at: dt.datetime,
    *,
    travellers: int = 2,
    status: BookingStatus = BookingStatus.CONFIRMED,
    channel: BookingChannel = BookingChannel.WEB,
) -> Booking:
    n = next(_refs)
    extra: dict[str, object] = {}
    if status is BookingStatus.CANCELLED:
        extra["cancel_reason"] = CancelReason.CANCELLATION_APPROVED
    if status is BookingStatus.PARTIALLY_PAID:
        extra |= {"deposit_paise": 100, "balance_due_on": TRIP - dt.timedelta(days=30)}
    return Booking(
        ref=f"TB-UR{n:04d}",
        package_id=d.package_id,
        departure_id=d.id,
        status=status,
        channel=channel,
        hold_expires_at=at + dt.timedelta(minutes=10),
        contact_name="Asha Rao",
        contact_phone="9876543210",
        contact_email=f"urgency{n}@example.test",
        quote={},
        total_paise=100,
        paid_paise=0 if status is BookingStatus.PENDING else 100,
        created_at=at,
        travellers=[
            BookingTraveller(name=f"T{i}", age=30, occupancy=Occupancy.DOUBLE)
            for i in range(travellers)
        ],
        **extra,
    )


async def live(db: AsyncSession, slug: str, *dates: tuple[dt.date, int]) -> Package:
    where = (
        await db.execute(select(Destination).where(Destination.slug == "goa"))
    ).scalar_one_or_none() or goa()
    pkg = package(where, slug=slug, name=slug.title(), status=PackageStatus.LIVE)
    pkg.departures = [dep(day, seats, 20_000_00) for day, seats in dates]
    db.add(pkg)
    await db.commit()
    return pkg


# --- pure ---------------------------------------------------------------------------------------


def test_package_facts_show_only_past_their_thresholds() -> None:
    assert Proof(3, 0).out() == BookingProof(recent_bookings=3, last_booked_days=0)
    assert Proof(2, 7).out() == BookingProof(recent_bookings=None, last_booked_days=7)
    assert Proof(2, 8).out() is None  # no label without data behind it
    assert Proof(5, 12).out() == BookingProof(recent_bookings=5, last_booked_days=None)


def test_one_badge_per_place_in_priority_order() -> None:
    def badge(seats: int, *, guaranteed: bool = True, likely: bool = True) -> Badge | None:
        return badge_for(Availability(seats, guaranteed, 1), likely=likely)

    assert badge(0) is Badge.SOLD_OUT
    assert badge(4) is Badge.FILLING_FAST
    assert badge(5) is Badge.LIKELY_TO_SELL_OUT  # wins over Guaranteed
    assert badge(5, likely=False) is Badge.GUARANTEED
    assert badge(5, guaranteed=False, likely=False) is None


# --- db: each label's query -----------------------------------------------------------------------


@pytest.mark.db
async def test_booked_in_the_last_30_days_counts_ist_days_and_standing_bookings(
    db: AsyncSession,
) -> None:
    a = (await live(db, "trip-a", (TRIP, 40))).departures[0]
    b = (await live(db, "trip-b", (TRIP, 40))).departures[0]
    db.add_all(
        [
            # Day 29 is in: the IST day starts at 00:05 IST, which is still the day before in UTC.
            booking(a, ist(TODAY - dt.timedelta(days=29), 0, 5)),
            booking(a, ago(3), status=BookingStatus.PARTIALLY_PAID, channel=BookingChannel.PHONE),
            booking(a, ago(9), status=BookingStatus.COMPLETED),
            # Day 30 is out (23:55 IST), and so are bookings that no longer stand.
            booking(a, ist(TODAY - dt.timedelta(days=30), 23, 55)),
            booking(a, ago(1), status=BookingStatus.CANCELLED),
            booking(a, ago(1), status=BookingStatus.PENDING),
            # Two is not enough for "Booked N×"; the newest at 8 days is too old to name.
            booking(b, ago(8)),
            booking(b, ago(20)),
        ]
    )
    await db.commit()

    got = await urgency.proofs(db, TODAY)
    assert got == {a.package_id: BookingProof(recent_bookings=3, last_booked_days=3)}
    assert await urgency.proofs(db, TODAY, [b.package_id]) == {}
    assert await urgency.proofs(db, TODAY, []) == {}


@pytest.mark.db
async def test_last_booked_shows_within_7_ist_days(db: AsyncSession) -> None:
    a = (await live(db, "trip-a", (TRIP, 40))).departures[0]
    b = (await live(db, "trip-b", (TRIP, 40))).departures[0]
    c = (await live(db, "trip-c", (TRIP, 40))).departures[0]
    db.add_all([booking(a, ago(7)), booking(b, ago(8)), booking(c, ist(TODAY, 0, 1))])
    await db.commit()

    assert await urgency.proofs(db, TODAY) == {
        a.package_id: BookingProof(recent_bookings=None, last_booked_days=7),
        c.package_id: BookingProof(recent_bookings=None, last_booked_days=0),
    }


@pytest.mark.db
async def test_likely_to_sell_out_needs_70_percent_and_2_recent_bookings(
    db: AsyncSession,
) -> None:
    pkg = await live(
        db,
        "trip-a",
        (TRIP, 10),
        (TRIP + dt.timedelta(days=7), 10),
        (TRIP + dt.timedelta(days=14), 10),
        (TRIP + dt.timedelta(days=21), 10),
    )
    yes, short, slow, held = pkg.departures
    db.add_all(
        [
            # 7 of 10 booked, two bookings inside 14 IST days (day 0 and day 13): likely.
            booking(yes, ago(0), travellers=4),
            booking(yes, ago(13), travellers=3),
            # 6 of 10 is 60 %: not yet.
            booking(short, ago(0), travellers=3),
            booking(short, ago(1), travellers=3),
            # 7 of 10, but the second booking is 14 days old: only one recent.
            booking(slow, ago(0), travellers=4),
            booking(slow, ago(14), travellers=3),
            # Cancelled and held seats are not "booked".
            booking(held, ago(0), travellers=3),
            booking(held, ago(1), travellers=2),
            booking(held, ago(1), travellers=2, status=BookingStatus.CANCELLED),
            booking(held, ago(0), travellers=2, status=BookingStatus.PENDING),
        ]
    )
    await db.commit()

    ids = [d.id for d in pkg.departures]
    assert await urgency.likely_to_sell_out(db, ids, TODAY) == {yes.id}
    assert await urgency.likely_to_sell_out(db, [], TODAY) == set()


@pytest.mark.db
async def test_the_cron_rebuilds_pages_whose_labels_move_with_the_day(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    posted: list[list[str]] = []

    async def fake_revalidate(tags: list[str]) -> None:
        posted.append(tags)

    monkeypatch.setattr(admin_packages, "revalidate", fake_revalidate)
    a = (await live(db, "trip-a", (TRIP, 40))).departures[0]
    b = (await live(db, "trip-b", (TRIP, 40))).departures[0]
    c = (await live(db, "trip-c", (TRIP, 40))).departures[0]
    draft = (await live(db, "trip-d", (TRIP, 40))).departures[0]
    await db.execute(update(Package).where(Package.slug == "trip-d").values(status="draft"))
    db.add_all(
        [
            booking(a, ago(30)),  # its label lapsed at this midnight: rebuilt once more
            booking(b, ago(31)),  # long gone
            booking(c, ago(2), status=BookingStatus.CANCELLED),
            booking(draft, ago(1)),  # not public
        ]
    )
    await db.commit()

    assert await admin_packages.revalidate_urgency(db, today=TODAY) == 1
    assert posted and "package:trip-a" in posted[0]
    assert not any("package:trip-b" in t or "package:trip-d" in t for t in posted[0])


# --- db: through the public api -----------------------------------------------------------------


@pytest.mark.db
async def test_the_labels_reach_the_card_the_package_page_and_compare(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    hot = await live(db, "hot-trip", (dt.date(2099, 8, 14), 20), (dt.date(2099, 9, 14), 20))
    await live(db, "quiet-trip", (dt.date(2099, 8, 14), 20))
    now = dt.datetime.now(dt.UTC)
    first = hot.departures[0]
    db.add_all(
        [
            booking(first, now, travellers=5),
            booking(first, now - dt.timedelta(minutes=5), travellers=5),
            booking(first, now - dt.timedelta(minutes=9), travellers=4),
        ]
    )
    await db.commit()

    page = (await db_client.get("/packages/hot-trip")).json()
    assert page["proof"] == {"recentBookings": 3, "lastBookedDays": 0}
    # 14 of 20 booked, 6 left: likely — the later date has no bookings and no label.
    assert [(d["badge"], d["seatsLeft"]) for d in page["departures"]] == [
        ("likely-to-sell-out", 6),
        (None, 20),
    ]

    cards = {c["slug"]: c for c in (await db_client.get("/packages")).json()["items"]}
    assert cards["hot-trip"]["badge"] == "likely-to-sell-out"
    assert cards["hot-trip"]["seatsLeft"] == 6
    assert cards["hot-trip"]["proof"] == {"recentBookings": 3, "lastBookedDays": 0}
    assert cards["quiet-trip"]["proof"] is None  # nothing booked, nothing said
    assert cards["quiet-trip"]["badge"] is None

    compared = (await db_client.get("/compare?slugs=hot-trip,quiet-trip")).json()["items"]
    assert [t["proof"] for t in compared] == [{"recentBookings": 3, "lastBookedDays": 0}, None]
    assert compared[0]["departures"][0]["badge"] == "likely-to-sell-out"


@pytest.mark.db
async def test_a_review_carries_the_party_the_reviewer_travelled_with(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    pkg = await live(db, "reviewed-trip", (dt.date(2099, 8, 14), 20))
    at = dt.datetime.now(dt.UTC)
    group = await extra_review(db, pkg, pkg.departures[0].id, 1, 5, at=at)
    solo = await extra_review(db, pkg, pkg.departures[0].id, 2, 4, at=at - dt.timedelta(minutes=1))
    db.add_all(
        BookingTraveller(
            booking_id=group.booking_id, name=f"T{i}", age=30, occupancy=Occupancy.DOUBLE
        )
        for i in range(4)
    )
    db.add(
        BookingTraveller(booking_id=solo.booking_id, name="S", age=30, occupancy=Occupancy.SINGLE)
    )
    await db.execute(
        update(Review).values(approved=True, moderated_at=at).where(Review.package_id == pkg.id)
    )
    await db.execute(update(Package).where(Package.id == pkg.id).values(rating_count=2))
    await db.commit()

    items = (await db_client.get("/packages/reviewed-trip/reviews")).json()["items"]
    assert [(i["party"], i["travelled"]) for i in items] == [(4, "2099-08-14"), (1, "2099-08-14")]


# --- the seed ------------------------------------------------------------------------------------


@pytest.mark.db
async def test_the_urgency_seed_gives_each_label_real_bookings_once(db: AsyncSession) -> None:
    await live(db, "busy-trip", (TRIP, 16))
    await live(db, "big-trip", (TRIP, 24))
    await live(db, "tight-trip", (TRIP, 16))
    plans = (
        UrgencySeed("busy-trip", "TB-URGK", (1, 6, 13, 22), party=(2, 3, 2, 4)),
        UrgencySeed("big-trip", "TB-URGS", (2, 10, 33, 41, 52), fill_percent=72),
        UrgencySeed("tight-trip", "TB-URGG", (35, 44, 58), leave=3),
        UrgencySeed("no-such-trip", "TB-URGX", (1,), party=(2,)),
    )

    first = await seed_urgency(db, today=TODAY, seeds=plans)
    assert first.counts == {"urgency_bookings": 12}
    assert first.warnings == ["no-such-trip: not live here — skipped"]

    by_slug = {
        p.slug: p
        for p in (
            await db.execute(select(Package).options(selectinload(Package.departures)))
        ).scalars()
    }
    proofs = await urgency.proofs(db, TODAY)
    assert proofs == {
        by_slug["busy-trip"].id: BookingProof(recent_bookings=4, last_booked_days=1),
        by_slug["big-trip"].id: BookingProof(recent_bookings=None, last_booked_days=2),
    }
    big, tight = by_slug["big-trip"].departures[0], by_slug["tight-trip"].departures[0]
    assert await urgency.likely_to_sell_out(db, [big.id, tight.id], TODAY) == {big.id}
    left = dict(
        (await db.execute(text("select departure_id, seats_left from departure_availability")))
        .tuples()
        .all()
    )
    assert (left[big.id], left[tight.id]) == (6, 3)  # 18 of 24 booked; 3 left
    emails = (
        (await db.execute(select(Booking.contact_email).where(Booking.ref.like("TB-URG%"))))
        .scalars()
        .all()
    )
    assert all(is_seed_address(e) for e in emails)

    again = await seed_urgency(db, today=TODAY, seeds=plans)
    assert again.counts == {"urgency_bookings": 0}  # by ref: nothing is added twice
