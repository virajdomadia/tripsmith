"""2026-11-04 (crons removed): the upkeep the nightly job did now runs from the reads
(services/on_demand.py) — the catalogue refreshes a stale "from ₹" once per IST day, and the
bookings desk / My trips sweep lapsed holds and departed bookings. conftest turns both off for
every other test; these turn them back on. The db tests need TEST_DATABASE_URL."""

import datetime as dt

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure, Package
from app.models.enums import BookingStatus, CancelReason
from app.services import on_demand
from app.services.analytics import ist_today
from tests.razorpay_fake import FakeRazorpay
from tests.test_booking_orders import seeded
from tests.test_booking_payments import booking, rzp
from tests.test_bookings_desk import hold, lapse, owner_cookie

__all__ = ["rzp"]

pytestmark = pytest.mark.db


async def price_of(db: AsyncSession, package_id: str) -> int:
    db.expire_all()
    stmt = select(Package.starting_price_paise).where(Package.id == package_id)
    return (await db.execute(stmt)).scalar_one()


async def test_the_first_catalogue_read_of_the_day_drops_a_departed_date_from_the_price(
    db: AsyncSession, db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    pkg, cheap = await seeded(db, seats=4)
    pkg_id, slug = pkg.id, pkg.slug
    # The ₹20,000 date left yesterday; the cached price still names it.
    await db.execute(
        update(Departure)
        .where(Departure.id == cheap.id)
        .values(date=ist_today() - dt.timedelta(days=1))
    )
    await db.commit()
    monkeypatch.setattr(on_demand, "prices_fresh_on", None)

    res = await db_client.get(f"/packages/{slug}")
    assert res.status_code == 200, res.text
    assert await price_of(db, pkg_id) == 25_000_00
    assert on_demand.prices_fresh_on == ist_today()

    # Once a day: a second read the same day leaves the row alone.
    await db.execute(update(Package).where(Package.id == pkg_id).values(starting_price_paise=1_00))
    await db.commit()
    await db_client.get("/packages")
    assert await price_of(db, pkg_id) == 1_00


async def test_a_desk_read_sweeps_an_abandoned_checkout_at_most_every_ten_minutes(
    db: AsyncSession,
    db_app: FastAPI,
    db_client: AsyncClient,
    rzp: FakeRazorpay,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = await owner_cookie(db)
    _, departure = await seeded(db, seats=4)
    first = str((await hold(db_client, departure.id, 1, 1))["bookingRef"])
    second = str((await hold(db_client, departure.id, 1, 2))["bookingRef"])
    await lapse(db, first)
    monkeypatch.setattr(on_demand, "next_sweep_at", 0.0)

    assert (await db_client.get("/admin/bookings", headers=owner)).status_code == 200
    swept = await booking(db, first)
    assert (swept.status, swept.cancel_reason) == (
        BookingStatus.CANCELLED,
        CancelReason.HOLD_EXPIRED,
    )
    # Inside the interval a lapsed hold waits for the next sweep.
    await lapse(db, second)
    await db_client.get("/admin/bookings", headers=owner)
    assert (await booking(db, second)).status == BookingStatus.PENDING
