"""B3 — holding seats (04 v2 §3): the last seat goes to exactly one of two simultaneous orders,
one email or phone keeps one live hold, and the routes speak the contract. Needs
TEST_DATABASE_URL."""

import asyncio
import datetime as dt

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.errors import ApiError
from app.models import Booking, Departure, Package
from app.models.enums import BookingStatus, Occupancy, PackageStatus
from app.schemas.bookings import BookingOrder, BookingRequest
from app.services.analytics import ist_today
from app.services.booking.orders import create_booking_order
from tests.test_db import goa, package
from tests.test_enquiries import CountingLimiter

pytestmark = pytest.mark.db

SOON = ist_today() + dt.timedelta(days=30)


def dep(date: dt.date, seats: int, double: int) -> Departure:
    return Departure(
        date=date,
        seats_total=seats,
        price_double_paise=double,
        price_triple_paise=double - 2_000_00,
        price_child_paise=double // 2,
        single_supplement_paise=9_000_00,
    )


async def seeded(db: AsyncSession, seats: int) -> tuple[Package, Departure]:
    """A live package: a cheap date with `seats` seats, and a dearer one later."""
    pkg = package(goa(), status=PackageStatus.LIVE, starting_price_paise=20_000_00)
    pkg.departures = [
        dep(SOON, seats, 20_000_00),
        dep(SOON + dt.timedelta(days=7), 12, 25_000_00),
    ]
    db.add(pkg)
    await db.commit()
    return pkg, pkg.departures[0]


def order(
    departure_id: str, party: int, *, email: str = "asha@example.test", phone: str = "9876543210"
) -> BookingRequest:
    return BookingRequest.model_validate(
        {
            "departureId": departure_id,
            "travellers": [
                {"name": f"Traveller {i}", "age": 30, "occupancy": Occupancy.SINGLE}
                for i in range(party)
            ],
            "contact": {"name": "Asha Rao", "phone": phone, "email": email},
        }
    )


async def seats_left(db: AsyncSession, departure_id: str) -> int:
    return (
        await db.execute(
            text("select seats_left from departure_availability where departure_id = :id"),
            {"id": departure_id},
        )
    ).scalar_one()


async def test_last_seat_goes_to_exactly_one_of_two_simultaneous_orders(
    db: AsyncSession, db_engine: AsyncEngine
) -> None:
    pkg, last = await seeded(db, seats=1)
    factory = async_sessionmaker(db_engine, expire_on_commit=False)

    async def attempt(email: str, phone: str) -> BookingOrder | ApiError:
        async with factory() as session:
            try:
                return await create_booking_order(
                    session, order(last.id, 1, email=email, phone=phone)
                )
            except ApiError as exc:
                return exc

    results = await asyncio.gather(
        attempt("a@example.test", "9000000001"), attempt("b@example.test", "9000000002")
    )
    won = [r for r in results if isinstance(r, BookingOrder)]
    lost = [r for r in results if isinstance(r, ApiError)]
    assert len(won) == 1 and len(lost) == 1
    assert (lost[0].status, lost[0].reason) == (409, "sold_out")
    assert won[0].amount_paise == 20_000_00 + 9_000_00  # one single room
    assert won[0].booking_ref.startswith("TB-") and len(won[0].booking_ref) == 9

    assert await seats_left(db, last.id) == 0
    # The freshness helper ran: "from ₹X" now names the date that still has seats.
    await db.refresh(pkg)
    assert pkg.starting_price_paise == 25_000_00


async def test_one_live_hold_per_email_or_phone(db: AsyncSession) -> None:
    _, departure = await seeded(db, seats=4)
    dep_id = departure.id  # the service's rollback below expires the test's objects too
    first = await create_booking_order(db, order(dep_id, 2))
    assert await seats_left(db, dep_id) == 2

    # Same email, new phone, a bigger party: the first hold is released in the same
    # transaction, so its seats count towards this one.
    second = await create_booking_order(db, order(dep_id, 3, phone="9000000009"))
    assert await seats_left(db, dep_id) == 1

    # A party that no longer fits rolls back — the live hold is not lost to a failed attempt.
    with pytest.raises(ApiError) as too_big:
        await create_booking_order(db, order(dep_id, 5, email="other@example.test"))
    assert too_big.value.reason == "sold_out"
    assert await seats_left(db, dep_id) == 1

    # Same phone, new email: releases the second hold too.
    third = await create_booking_order(
        db, order(dep_id, 4, email="other@example.test", phone="9000000009")
    )
    assert await seats_left(db, dep_id) == 0

    db.expire_all()
    rows = {
        b.ref: b
        for b in (await db.execute(select(Booking).where(Booking.status == BookingStatus.PENDING)))
        .scalars()
        .all()
    }
    assert len(rows) == 3  # released holds stay pending with a lapsed clock; the cron cancels
    now = (await db.execute(text("select now()"))).scalar_one()
    assert rows[first.booking_ref].hold_expires_at <= now
    assert rows[second.booking_ref].hold_expires_at <= now
    assert rows[third.booking_ref].hold_expires_at > now


async def test_routes_quote_hold_and_explain_refusals(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    _, departure = await seeded(db, seats=2)
    limiter = CountingLimiter(limit=5)
    db_app.state.rate_limiter = limiter
    travellers = [{"name": "A B", "age": 30, "occupancy": "double"}] * 2
    quote_body = {"departureId": departure.id, "travellers": [{"occupancy": "double"}] * 2}

    quoted = await db_client.post("/bookings/quote", json=quote_body)
    assert quoted.status_code == 200, quoted.text
    assert quoted.json()["totalPaise"] == 40_000_00 and quoted.json()["seatsLeft"] == 2
    assert quoted.headers["cache-control"] == "no-store"

    # An amount in the body is ignored: the price is always the server's.
    body = {
        "departureId": departure.id,
        "travellers": travellers,
        "contact": {"name": "Asha Rao", "phone": "+91 98765 43210", "email": "Asha@Example.test"},
        "totalPaise": 1,
    }
    held = await db_client.post("/bookings", json=body, headers={"X-Forwarded-For": "7.7.7.7"})
    assert held.status_code == 201, held.text
    assert held.json()["amountPaise"] == 40_000_00
    assert held.json()["quote"]["seatsLeft"] == 0
    assert limiter.hits == ["booking:7.7.7.7"]  # the quote is not limited

    full = await db_client.post("/bookings/quote", json=quote_body)
    assert full.status_code == 409
    assert full.json()["error"]["code"] == "conflict"
    assert full.json()["error"]["reason"] == "sold_out"

    odd = await db_client.post(
        "/bookings/quote", json={**quote_body, "travellers": [{"occupancy": "double"}]}
    )
    assert odd.status_code == 400 and "travellers" in odd.json()["error"]["fieldErrors"]

    gone = await db_client.post("/bookings/quote", json={**quote_body, "departureId": "nope"})
    assert gone.status_code == 404
