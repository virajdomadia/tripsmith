"""F1 catalog reads: package detail, departures by month, destinations (06 C1, R4)."""

import datetime as dt

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure, Package
from app.models.enums import PackageStatus, Theme
from app.services.catalog.reads import month_bounds, related_order
from scripts.seed import seed
from tests.fixture_dates import M5, NGB_DATES, month_key
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore

CACHE = "public, s-maxage=60, stale-while-revalidate=300"


async def seeded(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())


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


def test_related_order_puts_packages_without_a_price_last_in_their_tier() -> None:
    # starting_price_paise is 0 when every departure has passed — not "cheapest".
    me = P("me", "goa", ["beach"], 100)
    assert [
        p.id
        for p in related_order(
            me, [P("goa-stale", "goa", ["beach"], 0), P("goa-live", "goa", ["beach"], 500)]
        )
    ] == [
        "goa-live",
        "goa-stale",
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
    # Departures: all four are upcoming (seeded over the next four months), soonest first, seats
    # from the view, badges by the pricing rules (16 guaranteed / 4 seats, none sold, guaranteed /
    # 16 plain / 12 plain). QA 2026-11-19: "Filling fast" needs a seat sold; 4 of 4 free is
    # not filling.
    assert [d["date"] for d in p["departures"]] == [d.isoformat() for d in NGB_DATES]
    assert [d["seatsLeft"] for d in p["departures"]] == [16, 4, 16, 12]
    assert [d["badge"] for d in p["departures"]] == ["guaranteed", "guaranteed", None, None]
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
        update(Departure).where(Departure.date == NGB_DATES[0]).values(date=dt.date(2020, 1, 1))
    )
    await db.commit()

    p = (await db_client.get("/packages/north-goa-beaches")).json()

    assert [d["date"] for d in p["departures"]] == [d.isoformat() for d in NGB_DATES[1:]]
    assert p["departures"][0]["badge"] == "guaranteed"  # NGB_DATES[1]: 4 of 4 free
    # QA 2026-11-19: "Filling fast" needs a seat sold; 4 of 4 free is not filling.


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


# --- GET /packages/{slug}/departures ------------------------------------------------------------


@pytest.mark.db
async def test_departures_filter_by_month(db: AsyncSession, db_client: AsyncClient) -> None:
    await seeded(db)

    res = await db_client.get(
        "/packages/north-goa-beaches/departures", params={"month": month_key(NGB_DATES[1])}
    )

    assert res.status_code == 200
    assert res.headers["cache-control"] == CACHE
    items = res.json()["items"]
    assert [d["date"] for d in items] == [NGB_DATES[1].isoformat()]
    # QA 2026-11-19: "Filling fast" needs a seat sold; 4 of 4 free is not filling.
    assert items[0]["seatsLeft"] == 4 and items[0]["badge"] == "guaranteed"

    empty = await db_client.get(
        "/packages/north-goa-beaches/departures", params={"month": month_key(M5)}
    )
    assert empty.json() == {"items": []}


@pytest.mark.db
async def test_departures_without_month_are_all_upcoming(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)

    plain = await db_client.get("/packages/north-goa-beaches/departures")
    blank = await db_client.get("/packages/north-goa-beaches/departures?month=")

    assert len(plain.json()["items"]) == 4
    assert blank.json() == plain.json()


@pytest.mark.db
async def test_departures_reject_a_bad_month_and_404_for_drafts(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)

    bad = await db_client.get("/packages/north-goa-beaches/departures", params={"month": "2026-13"})
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "validation"
    assert "month" in bad.json()["error"]["fieldErrors"]

    await set_status(db, "north-goa-beaches", PackageStatus.DRAFT)
    gone = await db_client.get("/packages/north-goa-beaches/departures")
    assert gone.status_code == 404
    assert gone.json()["error"]["code"] == "not_found"


# --- GET /destinations --------------------------------------------------------------------------


@pytest.mark.db
async def test_destinations_list_counts_live_packages(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)

    res = await db_client.get("/destinations")

    assert res.status_code == 200
    assert res.headers["cache-control"] == CACHE
    items = res.json()["items"]
    assert len(items) == 1
    goa = items[0]
    assert (goa["slug"], goa["name"]) == ("goa", "Goa")
    assert goa["tagline"]
    assert goa["coverUrl"].startswith("https://blob.test/destinations/goa/")
    assert goa["bestMonths"] == [11, 12, 1, 2]  # the S2 pill: "2 trips · best Nov – Feb"
    assert goa["packageCount"] == 2
    assert goa["startingPricePaise"] == 14_499_00

    # A live package whose departures have all passed carries starting_price 0 — it still counts,
    # but it must not become the destination's "from" price.
    await db.execute(
        update(Package).where(Package.slug == "north-goa-beaches").values(starting_price_paise=0)
    )
    await db.commit()
    goa = (await db_client.get("/destinations")).json()["items"][0]
    assert goa["packageCount"] == 2
    assert goa["startingPricePaise"] == 21_499_00


@pytest.mark.db
async def test_destination_detail_lists_its_live_packages_cheapest_first(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)

    res = await db_client.get("/destinations/goa")

    assert res.status_code == 200
    d = res.json()
    assert d["region"] == "West India"
    assert d["intro"] and d["tagline"] and d["coverUrl"]
    assert all(1 <= m <= 12 for m in d["bestMonths"]) and d["bestMonths"]
    assert [p["slug"] for p in d["packages"]] == ["north-goa-beaches", "goa-quiet-escape"]
    assert d["packages"][0]["badge"] == "guaranteed"


@pytest.mark.db
async def test_destinations_without_live_packages_are_hidden(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seeded(db)
    await set_status(db, "north-goa-beaches", PackageStatus.DRAFT)

    still = (await db_client.get("/destinations")).json()["items"]
    assert still[0]["packageCount"] == 1 and still[0]["startingPricePaise"] == 21_499_00

    await set_status(db, "goa-quiet-escape", PackageStatus.DRAFT)
    assert (await db_client.get("/destinations")).json() == {"items": []}
    gone = await db_client.get("/destinations/goa")
    assert gone.status_code == 404
    assert gone.json()["error"]["message"] == "Destination not found"
    assert (await db_client.get("/destinations/atlantis")).status_code == 404


@pytest.mark.db
async def test_destination_page_puts_on_request_packages_last(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    """Price 0 is "on request" (every departure passed), not the cheapest — the same rule search
    and home follow."""
    await seeded(db)
    await db.execute(
        update(Package).where(Package.slug == "north-goa-beaches").values(starting_price_paise=0)
    )
    await db.commit()

    d = (await db_client.get("/destinations/goa")).json()

    assert [p["slug"] for p in d["packages"]] == ["goa-quiet-escape", "north-goa-beaches"]


@pytest.mark.db
async def test_card_badge_skips_a_sold_out_first_departure(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    """The badge comes from the next departure a visitor can still book; "Sold out" only when
    every upcoming date is full."""
    await seeded(db)
    first = NGB_DATES[0]  # north-goa-beaches: guaranteed, 16 seats; then 4 seats
    # (guaranteed, none sold: "Guaranteed", not "Filling fast", since QA 2026-11-19)
    await db.execute(update(Departure).where(Departure.date == first).values(seats_total=0))
    await db.commit()

    cards = {p["slug"]: p for p in (await db_client.get("/destinations/goa")).json()["packages"]}
    assert (
        cards["north-goa-beaches"]["badge"] == "guaranteed"
    )  # from the second date, not the sold-out

    pid = (
        await db.execute(select(Package.id).where(Package.slug == "north-goa-beaches"))
    ).scalar_one()
    await db.execute(update(Departure).where(Departure.package_id == pid).values(seats_total=0))
    await db.commit()

    cards = {p["slug"]: p for p in (await db_client.get("/destinations/goa")).json()["packages"]}
    assert cards["north-goa-beaches"]["badge"] == "sold-out"
