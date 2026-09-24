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
from tests.test_enquiries import CountingLimiter
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
    # The target is a versioned key the daily GC deletes: an edge-cached 302 would outlive it.
    assert res.headers["cache-control"] == "no-store"
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


@pytest.mark.db
async def test_head_never_renders_or_uploads(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Link checkers HEAD every link: a cold HEAD must not cost a render and a Blob put."""
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    store = with_store(db_app, FakeBlobStore())
    assert store is not None

    async def no_render(*a: object, **k: object) -> bytes:
        raise AssertionError("HEAD rendered the PDF")

    monkeypatch.setattr(PdfService, "build", no_render)

    cold = await db_client.head(PATH)
    assert cold.status_code == 200 and cold.content == b""
    assert cold.headers["content-type"] == "application/pdf"
    assert cold.headers["cache-control"] == "no-store"
    assert store.puts == []

    monkeypatch.undo()
    with_store(db_app, store)
    location = (await db_client.get(PATH)).headers["location"]  # a real GET warms the cache

    monkeypatch.setattr(PdfService, "build", no_render)
    warm = await db_client.head(PATH)
    assert warm.status_code == 302 and warm.headers["location"] == location
    assert warm.content == b"" and len(store.puts) == 1


@pytest.mark.db
async def test_a_query_string_308s_to_the_bare_url_before_any_work(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    """Random queries must not multiply edge-cache entries or Blob lists: neither the limiter
    nor the store is touched."""
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    store = with_store(db_app, FakeBlobStore(fail=True))  # any list or put would raise → 200
    limiter = CountingLimiter()
    db_app.state.rate_limiter = limiter
    assert store is not None
    for method in ("GET", "HEAD"):
        res = await db_client.request(method, f"{PATH}?v=123&utm_source=x")
        assert res.status_code == 308
        # Relative, so it resolves under the web's /api/ prefix and on the api's own origin alike.
        assert res.headers["location"] == "itinerary.pdf"
        # A day at the edge: a repeated variant never reaches the function again.
        assert res.headers["cache-control"] == "public, s-maxage=86400"
    assert limiter.hits == [] and store.puts == []


@pytest.mark.db
async def test_downloads_are_rate_limited_per_address(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    with_store(db_app, FakeBlobStore())
    limiter = CountingLimiter(limit=2)
    db_app.state.rate_limiter = limiter
    headers = {"X-Forwarded-For": "203.0.113.5"}

    for _ in range(2):
        assert (await db_client.get(PATH, headers=headers)).status_code == 302
    res = await db_client.get(PATH, headers=headers)

    assert res.status_code == 429
    assert res.json()["error"]["code"] == "rate_limited"
    assert res.headers["retry-after"] == "600"
    assert res.headers["cache-control"] == "no-store"
    assert limiter.hits == ["pdf:203.0.113.5"] * 3
    other = await db_client.get(PATH, headers={"X-Forwarded-For": "203.0.113.6"})
    assert other.status_code == 302


@pytest.mark.db
async def test_unknown_packages_and_head_requests_are_not_counted(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    with_store(db_app, FakeBlobStore())
    limiter = CountingLimiter(limit=1)
    db_app.state.rate_limiter = limiter
    headers = {"X-Forwarded-For": "203.0.113.5"}

    for _ in range(3):
        missing = await db_client.get("/packages/atlantis/itinerary.pdf", headers=headers)
        assert missing.status_code == 404
        assert (await db_client.head(PATH, headers=headers)).status_code == 200
    assert limiter.hits == []
    assert (await db_client.get(PATH, headers=headers)).status_code == 302  # still has its one


@pytest.mark.db
async def test_the_web_handler_forwarded_address_is_the_key(
    db: AsyncSession, db_app: FastAPI, db_client: AsyncClient
) -> None:
    """Through the web's handler every visitor arrives from Vercel's hop address; the trusted
    `X-Client-Ip` keeps them in separate buckets."""
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    with_store(db_app, FakeBlobStore())
    db_app.state.settings = make_settings(revalidate_secret="web-to-api-secret")
    limiter = CountingLimiter(limit=1)
    db_app.state.rate_limiter = limiter
    hop = {"X-Forwarded-For": "76.76.21.21", "X-Internal-Secret": "web-to-api-secret"}

    first = await db_client.get(PATH, headers={**hop, "X-Client-Ip": "49.207.1.1"})
    second = await db_client.get(PATH, headers={**hop, "X-Client-Ip": "49.207.2.2"})
    assert first.status_code == second.status_code == 302
    assert limiter.hits == ["pdf:49.207.1.1", "pdf:49.207.2.2"]
