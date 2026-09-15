"""F1 catalog reads: package detail, departures by month, destinations (06 C1, R4)."""

import datetime as dt

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure, Package
from app.models.enums import PackageStatus, Theme
from app.services.catalog.reads import month_bounds, related_order
from content import load_content
from scripts.seed import seed
from tests.settings import make_settings
from tests.test_catalog import RecordingStore

CACHE = "public, s-maxage=60, stale-while-revalidate=300"


async def seeded(db: AsyncSession) -> None:
    await seed(db, load_content(), RecordingStore(), make_settings())


async def set_status(db: AsyncSession, slug: str, status: PackageStatus) -> None:
    await db.execute(update(Package).where(Package.slug == slug).values(status=status))
    await db.commit()


# --- pure helpers -------------------------------------------------------------------------------


def test_month_bounds_rolls_over_december() -> None:
    assert month_bounds("2026-12") == (dt.date(2026, 12, 1), dt.date(2027, 1, 1))
    assert month_bounds("2026-02") == (dt.date(2026, 2, 1), dt.date(2026, 3, 1))


def P(id: str, dest: str, themes: list[str], price: int) -> Package:
    """An unsaved row: `related_order` is pure, so no session is needed."""
    return Package(
        id=id,
        destination_id=dest,
        themes=[Theme(t) for t in themes],
        starting_price_paise=price,
        name=id,
    )


def test_related_order_same_destination_then_shared_theme_then_rest_cheapest_first() -> None:
    me = P("me", "goa", ["beach", "family"], 100)
    candidates = [
        me,  # excluded
        P("kerala-family", "kerala", ["family"], 50),
        P("goa-pricey", "goa", ["honeymoon"], 900),
        P("goa-cheap", "goa", ["beach"], 300),
        P("ladakh", "ladakh", ["adventure"], 10),
        P("himachal-beach", "himachal", ["hills", "beach"], 400),
    ]
    assert [p.id for p in related_order(me, candidates)] == [
        "goa-cheap",
        "goa-pricey",
        "kerala-family",
        "himachal-beach",
        "ladakh",
    ]


# --- GET /packages/{slug} -----------------------------------------------------------------------


@pytest.mark.db
async def test_get_package_returns_the_full_detail(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)

    res = await db_client.get("/packages/north-goa-beaches")

    assert res.status_code == 200
    assert res.headers["cache-control"] == CACHE
    p = res.json()
    assert p["name"] == "North Goa Beaches"
    assert p["destination"] == {"slug": "goa", "name": "Goa"}
    assert (p["nights"], p["days"], p["departureCity"]) == (3, 4, "Ex-Mumbai")
    assert p["startingPricePaise"] == 14_499_00
    assert p["themes"] == ["beach", "family"]
    assert len(p["highlights"]) == 4 and p["inclusions"] and p["exclusions"]
    assert p["hotels"][0] == {
        "name": "Lemon Tree Amarante Beach Resort",
        "city": "Candolim",
        "stars": 4,
        "nights": 3,
    }
    assert p["faq"][0]["q"] == "Is this package suitable for children?"
    # Itinerary: one entry per day, in order, with the meals object.
    assert [d["dayNo"] for d in p["itinerary"]] == [1, 2, 3, 4]
    assert set(p["itinerary"][0]["meals"]) == {"breakfast", "lunch", "dinner"}
    assert p["itinerary"][1]["meals"]["breakfast"] is True
    # Gallery: seed order, cover first, dimensions present.
    assert len(p["images"]) >= 4
    assert p["cover"] == p["images"][0]
    assert p["images"][0]["url"].endswith("/packages/north-goa-beaches/vagator-palms-1.jpg")
    assert p["images"][0]["width"] > 0 and p["images"][0]["alt"]
    # Departures: all four are upcoming (seeded 2026-11 to 2027-02), soonest first, seats from the
    # view, badges by the pricing rules (16 guaranteed / 4 seats / 16 plain / 12 plain).
    assert [d["date"] for d in p["departures"]] == [
        "2026-11-20",
        "2026-12-18",
        "2027-01-15",
        "2027-02-12",
    ]
    assert [d["seatsLeft"] for d in p["departures"]] == [16, 4, 16, 12]
    assert [d["badge"] for d in p["departures"]] == ["guaranteed", "filling-fast", None, None]
    first = p["departures"][0]
    assert (first["priceDoublePaise"], first["priceTriplePaise"]) == (14_999_00, 13_499_00)
    assert (first["priceChildPaise"], first["singleSupplementPaise"]) == (8_999_00, 6_000_00)
    assert first["id"] and first["seatsTotal"] == 16
    # Related: the only other live package (same destination), as a card with its badge.
    assert [r["slug"] for r in p["related"]] == ["goa-quiet-escape"]
    assert p["related"][0]["badge"] == "guaranteed"
    assert p["updatedAt"]


@pytest.mark.db
async def test_get_package_hides_past_departures(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)
    await db.execute(
        update(Departure)
        .where(Departure.date == dt.date(2026, 11, 20))
        .values(date=dt.date(2020, 1, 1))
    )
    await db.commit()

    p = (await db_client.get("/packages/north-goa-beaches")).json()

    assert [d["date"] for d in p["departures"]] == ["2026-12-18", "2027-01-15", "2027-02-12"]
    assert p["departures"][0]["badge"] == "filling-fast"


@pytest.mark.db
async def test_get_package_404s_for_drafts_and_unknown_slugs(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)
    await set_status(db, "goa-quiet-escape", PackageStatus.DRAFT)

    for slug in ("goa-quiet-escape", "nope"):
        res = await db_client.get(f"/packages/{slug}")
        assert res.status_code == 404, slug
        assert res.json() == {"error": {"code": "not_found", "message": "Package not found"}}

    # A draft is also no longer "related" to the live one.
    live = (await db_client.get("/packages/north-goa-beaches")).json()
    assert live["related"] == []
