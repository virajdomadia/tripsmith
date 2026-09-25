"""B2 — migration 0004_v2: the booking-aware `departure_availability` view counts only the
travellers whose booking holds seats, and the revision round-trips. Needs TEST_DATABASE_URL."""

import asyncio
import datetime as dt
import os

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.models import Booking, BookingTraveller, Departure, Payment
from app.models.enums import BookingStatus, CancelReason, Occupancy, PaymentProvider
from tests.test_db import goa, package

pytestmark = pytest.mark.db

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOW = dt.datetime.now(dt.UTC)
_refs = iter(range(100_000, 999_999))


def departure(seats_total: int) -> Departure:
    return Departure(
        date=dt.date(2026, 12, 18),
        seats_total=seats_total,
        price_double_paise=1,
        price_triple_paise=1,
        price_child_paise=1,
        single_supplement_paise=1,
    )


def booking(
    dep: Departure,
    travellers: int,
    status: BookingStatus,
    *,
    hold: dt.timedelta = dt.timedelta(minutes=10),
    cancel_reason: CancelReason | None = None,
) -> Booking:
    return Booking(
        ref=f"TB-{next(_refs)}",
        package_id=dep.package_id,
        departure_id=dep.id,
        status=status,
        hold_expires_at=NOW + hold,
        contact_name="Asha",
        contact_phone="9876543210",
        contact_email="asha@example.test",
        quote={"lines": [], "totalPaise": 100},
        total_paise=100,
        cancel_reason=cancel_reason,
        travellers=[
            BookingTraveller(name=f"T{i}", age=30, occupancy=Occupancy.DOUBLE)
            for i in range(travellers)
        ],
    )


async def seats_left(db: AsyncSession, dep: Departure) -> int:
    return (
        await db.execute(
            text("select seats_left from departure_availability where departure_id = :id"),
            {"id": dep.id},
        )
    ).scalar_one()


async def seeded_departure(db: AsyncSession, seats_total: int = 12) -> Departure:
    pkg = package(goa())
    pkg.departures = [departure(seats_total)]
    db.add(pkg)
    await db.commit()
    return pkg.departures[0]


async def test_view_subtracts_confirmed_and_live_holds_only(db: AsyncSession) -> None:
    dep = await seeded_departure(db, 12)
    db.add_all(
        [
            booking(dep, 3, BookingStatus.CONFIRMED),
            booking(dep, 2, BookingStatus.PENDING),  # live hold
            booking(dep, 4, BookingStatus.PENDING, hold=-dt.timedelta(seconds=1)),  # lapsed
            booking(dep, 5, BookingStatus.CANCELLED, cancel_reason=CancelReason.PAYMENT_FAILED),
        ]
    )
    await db.commit()
    assert await seats_left(db, dep) == 12 - 3 - 2


async def test_completed_and_partially_paid_still_hold_seats(db: AsyncSession) -> None:
    dep = await seeded_departure(db, 12)
    db.add_all(
        [booking(dep, 2, BookingStatus.COMPLETED), booking(dep, 1, BookingStatus.PARTIALLY_PAID)]
    )
    await db.commit()
    assert await seats_left(db, dep) == 9


async def test_a_hold_frees_its_seats_the_moment_it_lapses(db: AsyncSession) -> None:
    dep = await seeded_departure(db, 4)
    hold = booking(dep, 4, BookingStatus.PENDING)
    db.add(hold)
    await db.commit()
    assert await seats_left(db, dep) == 0

    # No cron, no status change: only the clock moves past hold_expires_at.
    hold.hold_expires_at = NOW - dt.timedelta(minutes=1)
    await db.commit()
    assert await seats_left(db, dep) == 4


async def test_view_never_goes_negative_and_keeps_its_v1_types(db: AsyncSession) -> None:
    dep = await seeded_departure(db, 2)
    db.add(booking(dep, 3, BookingStatus.CONFIRMED))  # owner shrank seats_total after selling
    await db.commit()
    assert await seats_left(db, dep) == 0

    types = (
        await db.execute(
            text(
                "select column_name, data_type from information_schema.columns "
                "where table_name = 'departure_availability' order by ordinal_position"
            )
        )
    ).all()
    assert types == [("departure_id", "text"), ("seats_left", "smallint")]


async def test_a_replayed_capture_cannot_be_recorded_twice(db: AsyncSession) -> None:
    dep = await seeded_departure(db)
    b = booking(dep, 1, BookingStatus.CONFIRMED)
    db.add(b)
    await db.commit()
    for _ in range(2):
        db.add(
            Payment(
                booking_id=b.id,
                provider=PaymentProvider.RAZORPAY,
                razorpay_order_id="order_1",
                razorpay_payment_id="pay_1",
                amount_paise=100,
            )
        )
    with pytest.raises(IntegrityError):
        await db.commit()
    await db.rollback()
    assert (await db.execute(select(Payment))).all() == []


async def _columns(url: str, table: str) -> list[str]:
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            res = await conn.execute(
                text(
                    "select column_name from information_schema.columns "
                    "where table_name = :t order by column_name"
                ),
                {"t": table},
            )
            return [r[0] for r in res.all()]
    finally:
        await engine.dispose()


def test_0004_round_trips(migrated_database_url: str) -> None:
    # Sync on purpose: env.py runs its own event loop, like the conftest harness.
    cfg = Config(os.path.join(API_DIR, "alembic.ini"))
    url = migrated_database_url
    try:
        command.downgrade(cfg, "0003")
        assert asyncio.run(_columns(url, "bookings")) == []
        assert "token" in asyncio.run(_columns(url, "sessions"))
        command.upgrade(cfg, "head")
        assert "token" not in asyncio.run(_columns(url, "sessions"))
        assert "cancel_reason" in asyncio.run(_columns(url, "bookings"))
    finally:
        command.upgrade(cfg, "head")
