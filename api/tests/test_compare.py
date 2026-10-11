"""P1b — compare (R39): the URL's slugs, the facts per trip, and what is left out. The db test
needs TEST_DATABASE_URL."""

import datetime as dt

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ItineraryDay
from app.models.enums import PackageStatus
from app.services.catalog.compare import parse_slugs, places_of
from tests.test_booking_orders import SOON, dep
from tests.test_db import goa, package


def test_the_url_gives_at_most_three_distinct_well_formed_slugs() -> None:
    assert parse_slugs("a,b,c,d") == (["a", "b", "c"], [])
    assert parse_slugs(" Goa-Beaches , goa-beaches,munnar") == (["goa-beaches", "munnar"], [])
    assert parse_slugs("ok,../etc,Bad Slug,,") == (["ok"], ["../etc", "Bad Slug"])
    assert parse_slugs(None) == ([], [])
    assert parse_slugs("x" * 81) == ([], ["x" * 80])


def test_places_name_each_stretch_once() -> None:
    assert places_of(["Leh", "Leh", "Nubra", "Pangong", "Leh"]) == [
        "Leh",
        "Nubra",
        "Pangong",
        "Leh",
    ]
    assert places_of([]) == []


def day(n: int, b: bool, lunch: bool, d: bool) -> ItineraryDay:
    return ItineraryDay(
        day_no=n, title=f"Day {n}", description="…", meal_b=b, meal_l=lunch, meal_d=d, stay=None
    )


@pytest.mark.db
async def test_compare_returns_the_facts_in_the_order_asked(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    where = goa()
    north = package(
        where,
        status=PackageStatus.LIVE,
        inclusions=["Breakfast", "Airport transfers"],
        exclusions=["Flights"],
        hotels=[
            {"name": "Sea View", "city": "Calangute", "stars": 3, "nights": 2},
            {"name": "Palm Grove", "city": "Calangute", "stars": 4, "nights": 1},
        ],
    )
    north.itinerary = [
        day(1, False, False, True),
        day(2, True, False, True),
        day(3, True, True, False),
        day(4, True, False, False),
    ]
    north.departures = [
        dep(SOON, 0, 20_000_00),  # sold out: skipped
        dep(SOON + dt.timedelta(days=7), 5, 20_000_00),
        dep(SOON + dt.timedelta(days=14), 9, 20_000_00),
        dep(SOON + dt.timedelta(days=21), 9, 20_000_00),
        dep(SOON + dt.timedelta(days=28), 9, 20_000_00),  # a 4th open date: beyond the 3
    ]
    south = package(
        where,
        slug="south-goa-slow",
        name="South Goa Slow",
        status=PackageStatus.LIVE,
        deposit_on=False,
    )
    south.departures = [dep(SOON, 4, 18_000_00)]
    draft = package(where, slug="draft-trip", name="Draft Trip")
    db.add_all([north, south, draft])
    await db.commit()

    res = await db_client.get(
        "/compare", params={"slugs": "south-goa-slow,north-goa-beaches,draft-trip,nope,Bad!"}
    )
    assert res.status_code == 200, res.text
    assert res.headers["cache-control"].startswith("public, s-maxage=60")
    body = res.json()
    # The first three well-formed slugs are looked up; the rest of the list is not.
    assert [t["slug"] for t in body["items"]] == ["south-goa-slow", "north-goa-beaches"]
    assert body["missing"] == ["Bad!", "draft-trip"]

    s, n = body["items"]
    assert s["deposit"] is False and n["deposit"] is True
    assert n["places"] == ["Calangute"] and s["places"] == ["Goa"]
    assert n["meals"] == {"breakfasts": 3, "lunches": 1, "dinners": 2}
    assert [d["seatsLeft"] for d in n["departures"]] == [5, 9, 9]
    assert n["departures"][0]["date"] == (SOON + dt.timedelta(days=7)).isoformat()
    assert n["inclusions"] == ["Breakfast", "Airport transfers"]
    assert n["exclusions"] == ["Flights"]
    assert [h["name"] for h in n["hotels"]] == ["Sea View", "Palm Grove"]
    assert n["destination"] == {"slug": "goa", "name": "Goa"} and n["departureCity"]

    # Nothing asked, or nothing live: an empty answer, still 200.
    empty = (await db_client.get("/compare")).json()
    assert empty == {"items": [], "missing": []}
    gone = (await db_client.get("/compare", params={"slugs": "draft-trip"})).json()
    assert gone == {"items": [], "missing": ["draft-trip"]}
