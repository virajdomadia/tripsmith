"""GET /packages/{slug}/itinerary.pdf (06 C, 04 §5): 302 to the Blob copy, streamed when there
is no store, 404 for drafts."""

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Package
from app.models.enums import PackageStatus
from app.services.pdf.service import PdfService
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore
from tests.test_pdf_service import FakeBlobStore, cover_transport

PATH = "/packages/north-goa-beaches/itinerary.pdf"


def with_store(db_app: FastAPI, store: FakeBlobStore | None) -> FakeBlobStore | None:
    db_app.state.pdf = PdfService(store, make_settings(), transport=cover_transport())  # type: ignore[arg-type]
    return store


@pytest.mark.db
async def test_first_download_renders_stores_and_redirects(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    store = with_store(db_app, FakeBlobStore())
    assert store is not None

    res = await db_client.get(PATH)

    assert res.status_code == 302, res.text
    assert res.headers["cache-control"] == "public, s-maxage=60, stale-while-revalidate=300"
    location = res.headers["location"]
    assert location.startswith("https://blob.test/pdf/north-goa-beaches/")
    assert location.endswith("/Tripsmith-north-goa-beaches-itinerary.pdf")
    assert len(store.puts) == 1 and store.puts[0][1] == "application/pdf"
    assert next(iter(store.objects.values())).startswith(b"%PDF-")

    again = await db_client.get(PATH)
    assert again.status_code == 302 and again.headers["location"] == location
    assert len(store.puts) == 1  # served from the cache, not re-rendered


@pytest.mark.db
async def test_without_a_store_the_pdf_is_streamed_inline(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    with_store(db_app, None)
    res = await db_client.get(PATH)
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert (
        res.headers["content-disposition"]
        == 'inline; filename="Tripsmith-north-goa-beaches-itinerary.pdf"'
    )
    assert res.headers["cache-control"] == "public, s-maxage=60, stale-while-revalidate=300"
    assert res.content.startswith(b"%PDF-")


@pytest.mark.db
async def test_blob_outage_still_serves_the_pdf(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    with_store(db_app, FakeBlobStore(fail=True))
    res = await db_client.get(PATH)
    assert res.status_code == 200 and res.content.startswith(b"%PDF-")


@pytest.mark.db
async def test_draft_and_unknown_are_404(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    with_store(db_app, FakeBlobStore())
    await db.execute(
        update(Package).where(Package.slug == "goa-quiet-escape").values(status=PackageStatus.DRAFT)
    )
    await db.commit()
    for slug in ("goa-quiet-escape", "atlantis"):
        res = await db_client.get(f"/packages/{slug}/itinerary.pdf")
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "not_found"
