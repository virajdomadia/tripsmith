"""P20b (R59) — the read-only numbers Reviews A and Coupons B show: the reviews KPI strip and
each review's package photo and rating, and what a coupon did — given back, bookings value,
uses per week, the trips it sold and its latest uses — all counted by the uses rule (money
captured), never stored. The db tests need TEST_DATABASE_URL."""

import datetime as dt
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingTraveller, Coupon, Package, PackageImage
from app.models.enums import BookingStatus, CouponKind, Occupancy
from app.services import admin_coupons
from app.services import reviews as svc
from app.services.email.render import IST
from tests.test_booking_orders import seeded
from tests.test_bookings_desk import owner_cookie
from tests.test_reviews import RecordingRevalidate, extra_review, revalidated

__all__ = ["revalidated"]


def test_month_start_steps_back_across_the_year() -> None:
    assert svc._month_start(dt.date(2026, 1, 17)) == dt.date(2026, 1, 1)
    assert svc._month_start(dt.date(2026, 1, 17), 1) == dt.date(2025, 12, 1)
    assert svc._month_start(dt.date(2026, 3, 31), 1) == dt.date(2026, 2, 1)


def test_the_sparkline_starts_on_a_monday_seven_weeks_back() -> None:
    wed = dt.datetime(2026, 9, 30, 12, tzinfo=IST)  # a Wednesday
    first = admin_coupons._first_week(wed)
    assert first.weekday() == 0 and first == dt.date(2026, 8, 10)
    # 23:30 IST on Sunday is still that week, though UTC has not reached Monday either way.
    sunday_night = dt.datetime(2026, 10, 4, 23, 30, tzinfo=IST)
    assert admin_coupons._first_week(sunday_night) == dt.date(2026, 8, 10)


# --- db: reviews ---------------------------------------------------------------------------------


@pytest.mark.db
async def test_the_reviews_strip_counts_waiting_average_and_months(
    db: AsyncSession, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    pkg, departure = await seeded(db, seats=40)
    pkg_id, departure_id = pkg.id, departure.id
    image = PackageImage(package_id=pkg_id, url="https://img.test/goa.jpg", width=8, height=6)
    db.add(image)
    await db.flush()
    await db.execute(update(Package).where(Package.id == pkg_id).values(cover_image_id=image.id))
    await db.commit()

    now = dt.datetime.now(dt.UTC)
    first_of_month = now.astimezone(IST).replace(day=1, hour=12, minute=0, second=0)
    last_month = (first_of_month - dt.timedelta(days=3)).astimezone(dt.UTC)
    reviews = [
        await extra_review(db, pkg, departure_id, n, r, at=now - dt.timedelta(days=10 - n))
        for n, r in enumerate([5, 4, 2, 3, 5])
    ]
    ids = [r.id for r in reviews]
    await svc.moderate(db, ids[0], publish=True, now=first_of_month.astimezone(dt.UTC))
    await svc.moderate(db, ids[1], publish=True, now=first_of_month.astimezone(dt.UTC))
    await svc.moderate(db, ids[2], publish=True, now=last_month)
    await svc.moderate(db, ids[3], publish=False)  # hidden: never in the average
    # ids[4] stays pending

    owner = await owner_cookie(db)
    res = await db_client.get("/admin/reviews", headers=owner)
    assert res.status_code == 200, res.text
    body = res.json()
    stats = body["stats"]
    assert stats["publishedAvg"] == 3.7  # (5 + 4 + 2) / 3 = 3.666…
    assert stats["publishedPackages"] == 1
    assert (stats["publishedThisMonth"], stats["publishedLastMonth"]) == (2, 1)
    [waiting] = body["items"]
    assert waiting["id"] == ids[4]
    assert stats["oldestPendingAt"] == waiting["createdAt"]
    assert waiting["packageCoverUrl"] == "https://img.test/goa.jpg"
    assert waiting["packageRating"] == {"avg": 3.7, "count": 3}

    # Once nothing waits and nothing is published, the strip is empty, not an error.
    for review_id in ids:
        await svc.moderate(db, review_id, publish=False)
    stats = (await db_client.get("/admin/reviews", headers=owner)).json()["stats"]
    assert stats == {
        "oldestPendingAt": None,
        "publishedAvg": None,
        "publishedPackages": 0,
        "publishedThisMonth": 0,
        "publishedLastMonth": 0,
    }
    hidden = (await db_client.get("/admin/reviews?state=hidden", headers=owner)).json()
    assert all(r["packageRating"] is None for r in hidden["items"])


# --- db: coupons ---------------------------------------------------------------------------------


async def use(
    db: AsyncSession,
    pkg: Package,
    departure_id: str,
    n: int,
    code: str,
    *,
    off: int,
    total: int,
    at: dt.datetime,
    paid: bool = True,
    party: int = 2,
    hold_until: dt.datetime | None = None,
) -> None:
    """A booking carrying `code`, straight into the tables: paid (a use) or a live hold."""
    quote: dict[str, Any] = {"coupon": {"code": code, "offPaise": off}}
    booking = Booking(
        ref=f"TB-CP{n:04d}",
        package_id=pkg.id,
        departure_id=departure_id,
        status=BookingStatus.CONFIRMED if paid else BookingStatus.PENDING,
        hold_expires_at=hold_until or at,
        contact_name=f"Guest {n}",
        contact_phone="9000000000",
        contact_email=f"guest{n}@customer.in",
        quote=quote,
        total_paise=total,
        paid_paise=total if paid else 0,
        coupon_code=code,
        created_at=at,
    )
    booking.travellers = [
        BookingTraveller(name=f"T{i}", age=30, occupancy=Occupancy.DOUBLE, position=i)
        for i in range(party)
    ]
    db.add(booking)
    await db.commit()


@pytest.mark.db
async def test_a_coupon_reports_what_it_did_from_its_captured_uses(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    pkg, departure = await seeded(db, seats=40)
    dep_id = departure.id
    coupon = Coupon(
        code="WELCOME10",
        kind=CouponKind.PERCENT,
        percent=10,
        cap_paise=1_000_00,
        starts_at=dt.datetime(2026, 1, 1, tzinfo=dt.UTC),
        all_packages=True,
        active=True,
    )
    idle = Coupon(
        code="LATER",
        kind=CouponKind.FLAT,
        amount_paise=500_00,
        starts_at=dt.datetime(2030, 1, 1, tzinfo=dt.UTC),
        all_packages=True,
        active=True,
    )
    db.add_all([coupon, idle])
    await db.commit()
    cid, idle_id = coupon.id, idle.id

    now = dt.datetime.now(dt.UTC)
    sec = dt.timedelta(seconds=1)
    await use(db, pkg, dep_id, 1, "WELCOME10", off=1_000_00, total=39_000_00, at=now - sec)
    await use(db, pkg, dep_id, 2, "WELCOME10", off=800_00, total=7_200_00, at=now - 2 * sec)
    await use(
        db,
        pkg,
        dep_id,
        3,
        "WELCOME10",
        off=1_000_00,
        total=19_000_00,
        at=now - dt.timedelta(weeks=3),
    )
    await use(
        db,
        pkg,
        dep_id,
        4,
        "WELCOME10",
        off=1_000_00,
        total=9_000_00,
        at=now - dt.timedelta(weeks=20),
    )
    # A live hold: not a use, not money — but shown as "in checkout".
    await use(
        db,
        pkg,
        dep_id,
        5,
        "WELCOME10",
        off=1_000_00,
        total=9_000_00,
        at=now,
        paid=False,
        hold_until=now + dt.timedelta(minutes=10),
    )
    # A lapsed hold: nothing at all.
    await use(
        db,
        pkg,
        dep_id,
        6,
        "WELCOME10",
        off=1_000_00,
        total=9_000_00,
        at=now,
        paid=False,
        hold_until=now - dt.timedelta(minutes=1),
    )

    owner = await owner_cookie(db)
    items = {
        c["code"]: c for c in (await db_client.get("/admin/coupons", headers=owner)).json()["items"]
    }
    w = items["WELCOME10"]
    assert (w["uses"], w["liveHolds"]) == (4, 1)
    assert (w["givenPaise"], w["bookedPaise"]) == (3_800_00, 74_200_00)
    assert len(w["weekly"]) == 8 and w["weekly"][-1] == 2 and w["weekly"][-4] == 1
    assert sum(w["weekly"]) == 3  # the 20-week-old use is outside the sparkline
    later = items["LATER"]
    assert (later["givenPaise"], later["bookedPaise"], later["weekly"]) == (0, 0, [0] * 8)
    one = (await db_client.get(f"/admin/coupons/{cid}", headers=owner)).json()
    assert one["givenPaise"] == 3_800_00

    res = await db_client.get(f"/admin/coupons/{cid}/results", headers=owner)
    assert res.status_code == 200, res.text
    r = res.json()
    assert r["trips"] == [{"packageId": pkg.id, "name": pkg.name, "coverUrl": None, "uses": 4}]
    assert r["otherTripUses"] == 0
    latest = r["latest"]
    assert [u["ref"] for u in latest] == [f"TB-CP000{n}" for n in (5, 1, 2, 3, 4)]
    held = next(u for u in latest if u["ref"] == "TB-CP0005")
    assert held["holding"] is True and held["travellers"] == 2
    paid = next(u for u in latest if u["ref"] == "TB-CP0002")
    assert paid == {**paid, "holding": False, "offPaise": 800_00, "email": "guest2@customer.in"}
    assert all(u["ref"] != "TB-CP0006" for u in latest)

    empty = (await db_client.get(f"/admin/coupons/{idle_id}/results", headers=owner)).json()
    assert empty == {"trips": [], "otherTripUses": 0, "latest": []}
    assert (await db_client.get(f"/admin/coupons/{cid}/results")).status_code == 401
    assert (await db_client.get("/admin/coupons/nope/results", headers=owner)).status_code == 404
