"""F3 package search: `search_packages` filter matrix, sort, facets and the GET /packages query
params (03 R3, 06 C1). The same function feeds the v3 AI tool, so the matrix is thorough."""

import datetime as dt

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure, Destination, Package
from app.models.enums import PackageStatus, Theme
from app.schemas.catalog import RangeFacet, SearchParams, SortOrder
from app.services.catalog.search import budget_range, month_label, search_packages
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore

NGB, GQE, KER = "north-goa-beaches", "goa-quiet-escape", "kerala-backwaters"
CACHE = "public, s-maxage=60, stale-while-revalidate=300"


# --- pure helpers -------------------------------------------------------------------------------


def test_month_label() -> None:
    assert month_label("2026-11") == "November 2026"
    assert month_label("2027-01") == "January 2027"


def test_budget_range_rounds_out_to_the_nearest_thousand_rupees() -> None:
    assert budget_range(14_499_00, 21_499_00) == RangeFacet(min=14_000, max=22_000)
    assert budget_range(10_000_00, 10_000_00) == RangeFacet(min=10_000, max=10_000)
    assert budget_range(None, None) == RangeFacet(min=0, max=0)
    assert budget_range(0, 0) == RangeFacet(min=0, max=0)  # every package "on request"


def test_search_params_validates_the_nights_range_and_reads_camel_case() -> None:
    with pytest.raises(ValueError, match="nightsMin"):
        SearchParams(nights_min=5, nights_max=3)
    assert SearchParams(nights_min=3, nights_max=3).nights_max == 3
    params = SearchParams.model_validate({"maxBudget": 20000, "sort": "duration"})
    assert (params.max_budget, params.sort) == (20000, SortOrder.DURATION)
    assert SearchParams().sort is SortOrder.PRICE_ASC


# --- fixture: the two seeded Goa trips + one Kerala trip ----------------------------------------
#
# NGB  North Goa Beaches   3N  ₹14,499  beach+family      Nov 20 (16) · Dec 18 (4) · Jan 15 (16)
#                                                          · Feb 12 (12)
# GQE  Goa Quiet Escape    4N  ₹21,499  beach+honeymoon   Nov 27 (12) · Dec 24 (10) · Jan 22 (12)
# KER  Kerala Backwaters   5N  ₹24,999  honeymoon+heritage  Dec 5 (8) · Jan 9 (0 — sold out)
#
# Like F1's tests these assume today < 2026-11-20 (the seed content moves forward in F4+F5).


@pytest.fixture
async def catalog(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    kerala = Destination(
        slug="kerala",
        name="Kerala",
        tagline="Backwaters, tea hills and a slower pace",
        intro="Houseboats on Vembanad, tea at Munnar.",
        cover_url="https://blob.test/destinations/kerala.jpg",
        region="South India",
        best_months=[10, 11, 12, 1, 2],
        position=2,
    )
    db.add(kerala)
    await db.flush()
    package = Package(
        slug=KER,
        destination_id=kerala.id,
        name="Kerala Backwaters",
        summary="Five nights of houseboats and tea gardens.",
        themes=[Theme.HONEYMOON, Theme.HERITAGE],
        nights=5,
        days=6,
        highlights=["A night on a houseboat", "Tea tasting at Munnar"],
        starting_price_paise=24_999_00,
        status=PackageStatus.LIVE,
    )
    db.add(package)
    await db.flush()
    for date, seats in ((dt.date(2026, 12, 5), 8), (dt.date(2027, 1, 9), 0)):
        db.add(
            Departure(
                package_id=package.id,
                date=date,
                seats_total=seats,
                price_double_paise=24_999_00,
                price_triple_paise=22_999_00,
                price_child_paise=12_499_00,
                single_supplement_paise=9_000_00,
            )
        )
    await db.commit()


async def slugs(client: AsyncClient, query: str = "") -> list[str]:
    res = await client.get(f"/packages{query}")
    assert res.status_code == 200, res.text
    return [c["slug"] for c in res.json()["items"]]


async def field_errors(client: AsyncClient, query: str) -> list[str]:
    res = await client.get(f"/packages{query}")
    assert res.status_code == 400, res.text
    assert res.json()["error"]["code"] == "validation"
    return list(res.json()["error"]["fieldErrors"])


# --- GET /packages ------------------------------------------------------------------------------


@pytest.mark.db
async def test_unfiltered_is_every_live_package_cheapest_first(
    catalog: None, db_client: AsyncClient
) -> None:
    res = await db_client.get("/packages")

    assert res.status_code == 200
    assert res.headers["cache-control"] == CACHE
    body = res.json()
    assert [c["slug"] for c in body["items"]] == [NGB, GQE, KER]
    assert body["total"] == 3
    assert set(body["facets"]) == {"destinations", "themes", "months", "nights", "budget"}


@pytest.mark.db
async def test_destination_is_any_of(catalog: None, db_client: AsyncClient) -> None:
    assert await slugs(db_client, "?destination=goa") == [NGB, GQE]
    assert await slugs(db_client, "?destination=kerala") == [KER]
    assert await slugs(db_client, "?destination=kerala&destination=goa") == [NGB, GQE, KER]
    assert await slugs(db_client, "?destination=mars") == []
    assert await field_errors(db_client, "?" + "&".join(["destination=goa"] * 21)) == [
        "destination"
    ]


@pytest.mark.db
async def test_max_budget_is_rupees_against_the_starting_price(
    catalog: None, db: AsyncSession, db_client: AsyncClient
) -> None:
    assert await slugs(db_client, "?maxBudget=15000") == [NGB]
    assert await slugs(db_client, "?maxBudget=14499") == [NGB]  # inclusive
    assert await slugs(db_client, "?maxBudget=14498") == []
    assert await slugs(db_client, "?maxBudget=30000") == [NGB, GQE, KER]

    # "On request" (no upcoming price) can never satisfy a budget.
    await db.execute(update(Package).where(Package.slug == GQE).values(starting_price_paise=0))
    await db.commit()
    assert await slugs(db_client, "?maxBudget=30000") == [NGB, KER]

    assert await field_errors(db_client, "?maxBudget=0") == ["maxBudget"]
    assert await field_errors(db_client, "?maxBudget=cheap") == ["maxBudget"]
    assert await field_errors(db_client, "?maxBudget=99999999999") == ["maxBudget"]


@pytest.mark.db
async def test_nights_range_is_inclusive_either_side_optional(
    catalog: None, db_client: AsyncClient
) -> None:
    assert await slugs(db_client, "?nightsMin=4") == [GQE, KER]
    assert await slugs(db_client, "?nightsMax=3") == [NGB]
    assert await slugs(db_client, "?nightsMin=4&nightsMax=4") == [GQE]
    assert await slugs(db_client, "?nightsMin=3&nightsMax=5") == [NGB, GQE, KER]
    assert await field_errors(db_client, "?nightsMin=5&nightsMax=3") == ["nightsMax"]
    assert await field_errors(db_client, "?nightsMin=0") == ["nightsMin"]


@pytest.mark.db
async def test_themes_are_any_of(catalog: None, db_client: AsyncClient) -> None:
    assert await slugs(db_client, "?themes=honeymoon") == [GQE, KER]
    assert await slugs(db_client, "?themes=family") == [NGB]
    assert await slugs(db_client, "?themes=family&themes=heritage") == [NGB, KER]
    assert await slugs(db_client, "?themes=hills") == []
    assert await field_errors(db_client, "?themes=luxury") == ["themes.0"]


@pytest.mark.db
async def test_month_needs_a_departure_with_seats_that_month(
    catalog: None, db: AsyncSession, db_client: AsyncClient
) -> None:
    assert await slugs(db_client, "?month=2026-12") == [NGB, GQE, KER]
    # KER's January date is sold out, so January is only the Goa trips.
    assert await slugs(db_client, "?month=2027-01") == [NGB, GQE]
    assert await slugs(db_client, "?month=2027-03") == []

    # Selling out KER's last December seats drops it from December.
    await db.execute(
        update(Departure).where(Departure.date == dt.date(2026, 12, 5)).values(seats_total=0)
    )
    await db.commit()
    assert await slugs(db_client, "?month=2026-12") == [NGB, GQE]

    assert await field_errors(db_client, "?month=2026-13") == ["month"]
    assert await field_errors(db_client, "?month=Dec") == ["month"]


@pytest.mark.db
async def test_past_departures_never_count(catalog: None, db: AsyncSession) -> None:
    # A `today` after every seeded date: nothing departs "in December" any more, and the
    # months facet is empty too.
    result = await search_packages(db, SearchParams(month="2026-12"), today=dt.date(2027, 6, 1))
    assert result.items == []
    assert result.total == 0
    assert result.facets.months == []


@pytest.mark.db
async def test_sort_orders(catalog: None, db: AsyncSession, db_client: AsyncClient) -> None:
    assert await slugs(db_client, "?sort=price-asc") == [NGB, GQE, KER]
    assert await slugs(db_client, "?sort=price-desc") == [KER, GQE, NGB]
    assert await slugs(db_client, "?sort=duration") == [NGB, GQE, KER]

    # "On request" sinks to the bottom whichever way prices are sorted.
    await db.execute(update(Package).where(Package.slug == NGB).values(starting_price_paise=0))
    await db.commit()
    assert await slugs(db_client, "?sort=price-asc") == [GQE, KER, NGB]
    assert await slugs(db_client, "?sort=price-desc") == [KER, GQE, NGB]

    assert await field_errors(db_client, "?sort=newest") == ["sort"]


@pytest.mark.db
async def test_filters_and_together(catalog: None, db_client: AsyncClient) -> None:
    assert await slugs(db_client, "?destination=goa&themes=honeymoon&month=2026-12") == [GQE]
    assert (
        await slugs(db_client, "?destination=goa&themes=honeymoon&month=2026-12&maxBudget=20000")
        == []
    )


@pytest.mark.db
async def test_drafts_never_match(catalog: None, db: AsyncSession, db_client: AsyncClient) -> None:
    await db.execute(update(Package).where(Package.slug == KER).values(status=PackageStatus.DRAFT))
    await db.commit()

    assert await slugs(db_client, "?destination=kerala") == []
    assert await slugs(db_client, "?themes=heritage") == []
    facets = (await db_client.get("/packages")).json()["facets"]
    assert [d["value"] for d in facets["destinations"]] == ["goa"]
    assert facets["nights"] == {"min": 3, "max": 4}


@pytest.mark.db
async def test_blank_params_mean_unfiltered(catalog: None, db_client: AsyncClient) -> None:
    query = "?destination=&maxBudget=&nightsMin=&nightsMax=&themes=&month=&sort="
    assert await slugs(db_client, query) == [NGB, GQE, KER]


@pytest.mark.db
async def test_facets_describe_the_whole_live_catalog(
    catalog: None, db_client: AsyncClient
) -> None:
    # Not narrowed by the current filter — the panel keeps offering every real option.
    facets = (await db_client.get("/packages?destination=kerala")).json()["facets"]

    assert facets["destinations"] == [
        {"value": "goa", "label": "Goa", "count": 2},
        {"value": "kerala", "label": "Kerala", "count": 1},
    ]
    assert facets["themes"] == [
        {"value": "beach", "label": "Beach", "count": 2},
        {"value": "hills", "label": "Hills", "count": 0},
        {"value": "honeymoon", "label": "Honeymoon", "count": 2},
        {"value": "family", "label": "Family", "count": 1},
        {"value": "adventure", "label": "Adventure", "count": 0},
        {"value": "heritage", "label": "Heritage", "count": 1},
    ]
    assert facets["months"] == [
        {"value": "2026-11", "label": "November 2026", "count": 2},
        {"value": "2026-12", "label": "December 2026", "count": 3},
        {"value": "2027-01", "label": "January 2027", "count": 2},  # KER's Jan date is sold out
        {"value": "2027-02", "label": "February 2027", "count": 1},
    ]
    assert facets["nights"] == {"min": 3, "max": 5}
    assert facets["budget"] == {"min": 14_000, "max": 25_000}


@pytest.mark.db
async def test_search_packages_is_callable_with_params_directly(
    catalog: None, db: AsyncSession
) -> None:
    """What the v3 `searchPackages` tool will do — no HTTP in between."""
    result = await search_packages(
        db,
        SearchParams(themes=[Theme.HONEYMOON], sort=SortOrder.PRICE_DESC),
        today=dt.date(2026, 10, 1),
    )
    assert [c.slug for c in result.items] == [KER, GQE]
    assert result.total == 2
    assert result.facets.nights == RangeFacet(min=3, max=5)
