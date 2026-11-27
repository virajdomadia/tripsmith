"""v4.1 `quotePrice`: the quote route's price for a party, read-only, no contact details."""

import datetime as dt

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking
from app.services.ai.tools import TOOLS, ToolContext, run_tool
from app.services.analytics import ist_today
from scripts.seed import DEMO_COUPON, seed_demo_coupon
from tests.test_booking_orders import seeded

pytestmark = pytest.mark.db


async def run(db: AsyncSession, args: dict[str, object]) -> dict[str, object]:
    now = dt.datetime.now(dt.UTC)
    result, _ = await run_tool(ToolContext(db, ist_today(now), now), "quotePrice", args)
    return result


def test_quote_price_is_mcp_only_and_takes_no_contact_details() -> None:
    tool = TOOLS["quotePrice"]
    assert tool.surfaces == frozenset({"mcp"})
    assert set(tool.spec.parameters["properties"]) == {
        "departureId",
        "adults",
        "children",
        "couponCode",
    }


async def test_quote_matches_the_quote_route(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    _, departure = await seeded(db, seats=10)
    departure_id = departure.id

    got = await run(db, {"departureId": departure_id, "adults": 2})

    route = await db_client.post(
        "/bookings/quote",
        json={"departureId": departure_id, "travellers": [{"occupancy": "double"}] * 2},
    )
    assert route.status_code == 200, route.text
    assert route.json()["totalPaise"] == 40_000_00
    assert got["total"] == "₹40,000"
    assert got["perPerson"] == "₹20,000"
    assert [line["amount"] for line in got["lines"]] == ["₹40,000"]  # type: ignore[index, union-attr]
    assert "coupon" not in got


async def test_quote_with_a_coupon_names_its_code_and_saving(db: AsyncSession) -> None:
    _, departure = await seeded(db, seats=10)
    departure_id = departure.id
    await seed_demo_coupon(db)

    got = await run(db, {"departureId": departure_id, "adults": 2, "couponCode": DEMO_COUPON})

    assert got["coupon"] == {"code": DEMO_COUPON, "off": "₹1,000"}
    assert got["total"] == "₹39,000"


async def test_quote_full_departure_returns_the_service_reason(db: AsyncSession) -> None:
    _, departure = await seeded(db, seats=1)

    got = await run(db, {"departureId": departure.id, "adults": 2})

    assert set(got) == {"error"}
    assert isinstance(got["error"], str) and got["error"]


async def test_quote_bad_coupon_returns_its_reason(db: AsyncSession) -> None:
    _, departure = await seeded(db, seats=10)

    got = await run(db, {"departureId": departure.id, "adults": 2, "couponCode": "NOPE"})

    assert got == {"error": "We don't recognise that code — check the spelling"}


async def test_quote_unknown_departure_is_an_error_not_a_crash(db: AsyncSession) -> None:
    got = await run(db, {"departureId": "nope", "adults": 2})
    assert set(got) == {"error"}


async def test_quote_has_no_side_effects(db: AsyncSession) -> None:
    _, departure = await seeded(db, seats=10)
    departure_id = departure.id

    async def bookings() -> int:
        return (await db.execute(select(func.count()).select_from(Booking))).scalar_one()

    before = await bookings()
    await run(db, {"departureId": departure_id, "adults": 2})
    await run(db, {"departureId": departure_id, "adults": 3, "children": 1})

    assert await bookings() == before == 0
    again = await run(db, {"departureId": departure_id, "adults": 10})  # seats untouched
    assert "error" not in again
