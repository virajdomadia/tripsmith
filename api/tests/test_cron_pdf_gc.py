"""GET /cron/pdf-gc — bearer CRON_SECRET (06 §Auth), deletes stale itinerary PDFs."""

import httpx
import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

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


def test_cron_route_is_not_in_the_public_contract(app: FastAPI) -> None:
    assert "/cron/pdf-gc" not in app.openapi()["paths"]


def test_vercel_json_schedules_the_gc_weekly() -> None:
    import json
    from pathlib import Path

    cfg = json.loads((Path(__file__).resolve().parents[1] / "vercel.json").read_text())
    assert {"path": "/cron/pdf-gc", "schedule": "0 3 * * 0"} in cfg["crons"]
