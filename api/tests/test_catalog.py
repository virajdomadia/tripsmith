"""services/catalog — pricing + badge helpers (pure) and GET /packages (S10/S11 slice of F1–F3)."""

import datetime as dt

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.meta import Badge
from app.services.catalog.pricing import badge_for, starting_price
from scripts.seed import seed
from tests.settings import fixture_content, make_settings


class D:  # a departure-like duck for the pure helpers
    def __init__(self, seats_left: int, guaranteed: bool = False, price_double_paise: int = 0):
        self.seats_left = seats_left
        self.guaranteed = guaranteed
        self.price_double_paise = price_double_paise


def test_badge_rules_sold_out_beats_filling_fast_beats_guaranteed() -> None:
    assert badge_for(D(0, guaranteed=True)) is Badge.SOLD_OUT
    assert badge_for(D(4)) is Badge.FILLING_FAST
    assert badge_for(D(4, guaranteed=True)) is Badge.FILLING_FAST
    assert badge_for(D(5, guaranteed=True)) is Badge.GUARANTEED
    assert badge_for(D(12)) is None


def test_starting_price_is_the_cheapest_double_sharing_departure() -> None:
    assert (
        starting_price([D(8, price_double_paise=1_500_000), D(2, price_double_paise=1_299_900)])
        == 1_299_900
    )
    assert starting_price([]) == 0


class RecordingStore:
    def __init__(self) -> None:
        self.puts: list[str] = []

    async def put(self, pathname: str, data: bytes, content_type: str) -> str:
        self.puts.append(pathname)
        return f"https://blob.test/{pathname}"


@pytest.mark.db
async def test_get_packages_lists_live_packages_as_cards(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())

    res = await db_client.get("/packages")

    assert res.status_code == 200
    assert res.headers["cache-control"] == "public, s-maxage=60, stale-while-revalidate=300"
    body = res.json()
    assert body["total"] == 2
    cards = {c["slug"]: c for c in body["items"]}
    ngb = cards["north-goa-beaches"]
    assert ngb["name"] == "North Goa Beaches"
    assert ngb["destination"] == "Goa"
    assert (ngb["nights"], ngb["days"]) == (3, 4)
    assert ngb["startingPricePaise"] == 14_499_00
    assert ngb["themes"] == ["beach", "family"]
    assert ngb["coverUrl"] == "https://blob.test/packages/north-goa-beaches/vagator-palms-1.jpg"
    assert len(ngb["highlights"]) == 4
    # Next departure on 2026-11-20 has 16 seats and is guaranteed → "guaranteed".
    assert ngb["badge"] == "guaranteed"
    assert [c["slug"] for c in body["items"]] == [
        "north-goa-beaches",
        "goa-quiet-escape",
    ]  # cheapest first


@pytest.mark.db
async def test_get_packages_hides_drafts(db: AsyncSession, db_client: AsyncClient) -> None:
    from sqlalchemy import update

    from app.models import Package
    from app.models.enums import PackageStatus

    await seed(db, fixture_content(), RecordingStore(), make_settings())
    await db.execute(
        update(Package).where(Package.slug == "goa-quiet-escape").values(status=PackageStatus.DRAFT)
    )
    await db.commit()

    body = (await db_client.get("/packages")).json()
    assert [c["slug"] for c in body["items"]] == ["north-goa-beaches"]
    assert body["total"] == 1


@pytest.mark.db
async def test_badge_uses_the_next_upcoming_departure(
    db: AsyncSession, db_client: AsyncClient
) -> None:
    from sqlalchemy import update

    from app.models import Departure

    await seed(db, fixture_content(), RecordingStore(), make_settings())
    # Make the earliest North Goa departure (2026-11-20) a 3-seat one → filling fast.
    await db.execute(
        update(Departure).where(Departure.date == dt.date(2026, 11, 20)).values(seats_total=3)
    )
    await db.commit()

    cards = {c["slug"]: c for c in (await db_client.get("/packages")).json()["items"]}
    assert cards["north-goa-beaches"]["badge"] == "filling-fast"


async def test_get_packages_without_a_database_is_a_500_envelope(client: AsyncClient) -> None:
    # The app was built with make_settings() (no DATABASE_URL); a real URL in the developer's
    # .env.local must not be picked up behind the app's back.
    res = await client.get("/packages")
    assert res.status_code == 500
    assert res.json()["error"]["code"] == "internal"


async def test_the_session_dependency_uses_the_apps_settings() -> None:
    from httpx import ASGITransport, AsyncClient

    from app.main import create_app

    app = create_app(settings=make_settings(database_url="postgresql+asyncpg://x@127.0.0.1:1/none"))
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t"
    ) as c:
        res = await c.get("/packages")
    assert res.status_code == 500  # connection refused on port 1 → internal, not a leaked DB
