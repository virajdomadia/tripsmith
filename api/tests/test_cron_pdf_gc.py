"""GET /cron/pdf-gc and GET /cron/daily — bearer CRON_SECRET (06 §Auth): stale itinerary PDFs,
and the daily starting-price recompute."""

import asyncio
import datetime as dt
from collections.abc import Sequence

import httpx
import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models import Departure, Package
from app.services.analytics import ist_today
from app.services.catalog.admin_packages import recompute_all_starting_prices
from app.services.pdf.service import PdfService
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore
from tests.test_pdf_service import FakeBlobStore

AUTH = {"Authorization": "Bearer s3cret"}


def configured(db_app: FastAPI, store: FakeBlobStore | None) -> FakeBlobStore | None:
    settings = make_settings(cron_secret="s3cret")
    db_app.state.settings = settings
    db_app.state.pdf = PdfService(store, settings)  # type: ignore[arg-type]
    return store


@pytest.mark.db
async def test_gc_deletes_stale_objects_and_reports(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    store = configured(db_app, FakeBlobStore())
    assert store is not None
    store.objects["pdf/north-goa-beaches/1/Tripsmith-north-goa-beaches-itinerary.pdf"] = b"stale"

    res = await db_client.get("/cron/pdf-gc", headers=AUTH)

    assert res.status_code == 200, res.text
    assert res.headers["cache-control"] == "no-store"
    assert res.json() == {"deleted": 1, "kept": 0, "configured": True}
    assert store.objects == {}


@pytest.mark.db
async def test_gc_rejects_a_missing_or_wrong_bearer(
    db_app: FastAPI, db_client: AsyncClient
) -> None:
    configured(db_app, FakeBlobStore())
    non_ascii = httpx.Headers([(b"authorization", "Bearer sécrét".encode())])
    for headers in (
        {},
        {"Authorization": "Bearer nope"},
        {"Authorization": "Basic s3cret"},
        # non-ASCII must 401, not 500 (`compare_digest` on `str` is ASCII-only); raw bytes get a
        # non-ASCII value onto the wire without httpx trying (and failing) to ascii-encode it.
        non_ascii,
    ):
        res = await db_client.get("/cron/pdf-gc", headers=headers)
        assert res.status_code == 401, headers
        assert res.json()["error"]["code"] == "unauthorized"


@pytest.mark.db
async def test_gc_is_401_when_no_secret_is_configured(
    db_app: FastAPI, db_client: AsyncClient
) -> None:
    db_app.state.settings = make_settings()
    res = await db_client.get("/cron/pdf-gc", headers=AUTH)
    assert res.status_code == 401


@pytest.mark.db
async def test_gc_without_a_store_is_a_no_op(db_app: FastAPI, db_client: AsyncClient) -> None:
    configured(db_app, None)
    res = await db_client.get("/cron/pdf-gc", headers=AUTH)
    assert res.status_code == 200
    assert res.json() == {"deleted": 0, "kept": 0, "configured": False}


@pytest.mark.db
async def test_blob_failure_is_a_500_so_the_cron_log_shows_it(
    db_app: FastAPI, db_client: AsyncClient
) -> None:
    configured(db_app, FakeBlobStore(fail=True))
    res = await db_client.get("/cron/pdf-gc", headers=AUTH)
    assert res.status_code == 500
    assert res.json()["error"]["code"] == "internal"


def test_cron_routes_are_not_in_the_public_contract(app: FastAPI) -> None:
    assert "/cron/pdf-gc" not in app.openapi()["paths"]
    assert "/cron/daily" not in app.openapi()["paths"]


def test_vercel_json_runs_the_daily_job_after_ist_midnight() -> None:
    """Hobby fires a cron anywhere in its scheduled hour: 19:30 UTC is 01:00 IST, so even the
    latest firing (01:59 IST) and the earliest (01:00) both fall on the new IST day."""
    import json
    from pathlib import Path

    cfg = json.loads((Path(__file__).resolve().parents[1] / "vercel.json").read_text())
    assert cfg["crons"] == [{"path": "/cron/daily", "schedule": "30 19 * * *"}]


# --- /cron/daily ---------------------------------------------------------------------------------


class RecordingRevalidate:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    async def __call__(self, tags: Sequence[str]) -> bool:
        self.calls.append(list(tags))
        return True


@pytest.fixture
def revalidated(monkeypatch: pytest.MonkeyPatch) -> RecordingRevalidate:
    rec = RecordingRevalidate()
    monkeypatch.setattr("app.services.catalog.admin_packages.revalidate", rec)
    return rec


async def price_and_stamp(db: AsyncSession, slug: str) -> tuple[int, object]:
    stmt = select(Package.starting_price_paise, Package.updated_at).where(Package.slug == slug)
    price, stamp = (await db.execute(stmt)).one()
    return price, stamp


@pytest.mark.db
async def test_daily_recomputes_prices_that_departures_left_behind(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    store = configured(db_app, FakeBlobStore())
    assert store is not None
    store.objects["pdf/north-goa-beaches/1/Tripsmith-north-goa-beaches-itinerary.pdf"] = b"stale"
    # The cheapest north-goa date (₹14,499, 12 Feb) "leaves": move it into the past.
    await db.execute(
        update(Departure)
        .where(Departure.price_double_paise == 14_499_00)
        .values(date=Departure.date - dt.timedelta(days=3650))
    )
    await db.commit()
    before_price, before_stamp = await price_and_stamp(db, "north-goa-beaches")
    quiet_before = await price_and_stamp(db, "goa-quiet-escape")
    assert before_price == 14_499_00

    res = await db_client.get("/cron/daily", headers=AUTH)

    assert res.status_code == 200, res.text
    assert res.headers["cache-control"] == "no-store"
    assert res.json() == {
        "pricesUpdated": 1,
        "pdf": {"deleted": 1, "kept": 0, "configured": True},
        "sessionsPruned": 0,  # B8: tested in test_customer_accounts.py
        "codesPruned": 0,
        "holdsExpired": 0,  # B10: tested in test_bookings_desk.py
        "bookingsCompleted": 0,
    }
    db.expire_all()
    price, stamp = await price_and_stamp(db, "north-goa-beaches")
    assert price == 14_999_00, "the next-cheapest upcoming date"
    assert stamp == before_stamp, "a calendar tick is not an owner edit"
    assert await price_and_stamp(db, "goa-quiet-escape") == quiet_before
    assert revalidated.calls == [
        ["packages", "destinations", "home", "package:north-goa-beaches", "destination:goa"]
    ]

    # Nothing moved since: no writes, no revalidation.
    res = await db_client.get("/cron/daily", headers=AUTH)
    assert res.json()["pricesUpdated"] == 0
    assert len(revalidated.calls) == 1


@pytest.mark.db
async def test_daily_drops_to_on_request_when_every_date_has_passed(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    configured(db_app, None)
    pid = (
        await db.execute(select(Package.id).where(Package.slug == "goa-quiet-escape"))
    ).scalar_one()
    await db.execute(
        update(Departure)
        .where(Departure.package_id == pid)
        .values(date=Departure.date - dt.timedelta(days=3650))
    )
    await db.commit()

    res = await db_client.get("/cron/daily", headers=AUTH)

    assert res.status_code == 200, res.text
    db.expire_all()
    assert (await price_and_stamp(db, "goa-quiet-escape"))[0] == 0


@pytest.mark.db
async def test_daily_needs_the_cron_secret(db_app: FastAPI, db_client: AsyncClient) -> None:
    configured(db_app, None)
    assert (await db_client.get("/cron/daily")).status_code == 401
    assert (
        await db_client.get("/cron/daily", headers={"Authorization": "Bearer nope"})
    ).status_code == 401
    db_app.state.settings = make_settings()  # no secret configured: closed, not open
    assert (await db_client.get("/cron/daily", headers=AUTH)).status_code == 401


@pytest.mark.db
async def test_daily_skips_a_sold_out_cheapest_date(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, revalidated: RecordingRevalidate
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    configured(db_app, None)
    # north-goa's cheapest upcoming date (₹14,499, 12 Feb) sells out.
    await db.execute(
        update(Departure).where(Departure.price_double_paise == 14_499_00).values(seats_total=0)
    )
    await db.commit()

    res = await db_client.get("/cron/daily", headers=AUTH)

    assert res.status_code == 200, res.text
    assert res.json()["pricesUpdated"] == 1
    db.expire_all()
    assert (await price_and_stamp(db, "north-goa-beaches"))[0] == 14_999_00


@pytest.mark.db
async def test_daily_waits_for_an_owner_save_in_flight_instead_of_overwriting_it(
    db: AsyncSession, db_engine: AsyncEngine, revalidated: RecordingRevalidate
) -> None:
    """The owner reprices every date while the job runs. Without the row lock the job read the
    old departures, computed yesterday's price and wrote it over the owner's fresh one."""
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    # Yesterday's cheapest date has left, so the job has a price to change.
    await db.execute(
        update(Departure)
        .where(Departure.price_double_paise == 14_499_00)
        .values(date=Departure.date - dt.timedelta(days=3650))
    )
    await db.commit()
    pid = (
        await db.execute(select(Package.id).where(Package.slug == "north-goa-beaches"))
    ).scalar_one()

    factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with factory() as owner, factory() as job:
        # The owner's save, uncommitted: every date at ₹20,000 and the price to match.
        await owner.execute(
            update(Departure)
            .where(Departure.package_id == pid)
            .values(price_double_paise=20_000_00)
        )
        await owner.execute(
            update(Package).where(Package.id == pid).values(starting_price_paise=20_000_00)
        )
        running = asyncio.create_task(recompute_all_starting_prices(job, today=ist_today()))
        await asyncio.sleep(0.5)
        assert not running.done(), "the job must wait for the owner's row"
        await owner.commit()
        changed = await asyncio.wait_for(running, timeout=10)

    assert changed == 0, "it computed from the owner's rows, which already agree"
    db.expire_all()
    assert (await price_and_stamp(db, "north-goa-beaches"))[0] == 20_000_00
