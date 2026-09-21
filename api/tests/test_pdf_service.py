"""services/pdf/service.py — the network side of the PDF: cover fetch, Blob cache, attachment,
GC. Every failure degrades; nothing here may raise into a request."""

import datetime as dt
from pathlib import Path

import httpx
import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.storage import BlobInfo
from app.models import Package
from app.services.catalog.reads import get_package
from app.services.pdf.itinerary import pdf_pathname
from app.services.pdf.service import PdfService
from scripts.seed import seed
from tests.pdf_fixture import UPDATED_AT, package
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore

COVER_JPEG = (
    Path(__file__).resolve().parents[1] / "content" / "photos" / "goa" / "agonda-sunset.jpg"
)
KEY = pdf_pathname("north-goa-beaches", UPDATED_AT)
# `package(images=n)` (tests/pdf_fixture.py) gives n distinct image URLs, the cover first.


class FakeBlobStore:
    """In-memory Blob: the same put/list/delete surface as `BlobStore`."""

    def __init__(self, *, fail: bool = False) -> None:
        self.objects: dict[str, bytes] = {}
        self.puts: list[tuple[str, str]] = []
        self.fail = fail

    def _url(self, pathname: str) -> str:
        return f"https://blob.test/{pathname}"

    async def put(self, pathname: str, data: bytes, content_type: str) -> str:
        if self.fail:
            raise httpx.ConnectError("blob down")
        self.objects[pathname] = data
        self.puts.append((pathname, content_type))
        return self._url(pathname)

    async def delete(self, urls: list[str]) -> None:
        if self.fail:
            raise httpx.ConnectError("blob down")
        for url in urls:
            self.objects.pop(url.removeprefix("https://blob.test/"), None)

    async def list(self, prefix: str) -> list[BlobInfo]:
        if self.fail:
            raise httpx.ConnectError("blob down")
        return [
            BlobInfo(url=self._url(p), pathname=p, size=len(d))
            for p, d in self.objects.items()
            if p.startswith(prefix)
        ]


def cover_transport(status: int = 200, body: bytes | None = None) -> httpx.MockTransport:
    data = COVER_JPEG.read_bytes() if body is None else body
    return httpx.MockTransport(
        lambda r: httpx.Response(status, content=data, headers={"content-type": "image/jpeg"})
    )


def service(
    store: FakeBlobStore | None, transport: httpx.MockTransport | None = None
) -> PdfService:
    return PdfService(
        store,  # type: ignore[arg-type]
        make_settings(site_url="https://t.test"),
        transport=transport or cover_transport(),
    )


async def test_cached_url_matches_the_exact_pathname() -> None:
    store = FakeBlobStore()
    store.objects["pdf/north-goa-beaches/1/Tripsmith-north-goa-beaches-itinerary.pdf"] = b"old"
    svc = service(store)
    assert await svc.cached_url(package()) is None
    store.objects[KEY] = b"%PDF"
    assert await svc.cached_url(package()) == f"https://blob.test/{KEY}"


async def test_cached_url_is_none_without_a_store_or_when_blob_fails() -> None:
    assert await service(None).cached_url(package()) is None
    assert await service(FakeBlobStore(fail=True)).cached_url(package()) is None


async def test_build_embeds_the_cover_and_survives_a_missing_one() -> None:
    with_cover = await service(None).build(package())
    without = await service(None, cover_transport(404)).build(package())
    assert with_cover.startswith(b"%PDF-") and without.startswith(b"%PDF-")
    assert len(with_cover) > len(without) + 20_000  # the JPEG is in there


async def test_build_fetches_the_cover_and_up_to_four_gallery_photos_once_each() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(
            200, content=COVER_JPEG.read_bytes(), headers={"content-type": "image/jpeg"}
        )

    pkg = package(images=7)  # cover + 6 more; only the first 4 gallery photos are fetched
    pdf = await service(None, httpx.MockTransport(handler)).build(pkg)
    assert pdf.startswith(b"%PDF-")
    assert seen == [pkg.cover.url] + [i.url for i in pkg.images[1:5]]  # type: ignore[union-attr]


async def test_build_ignores_a_cover_that_is_not_an_image_or_too_big() -> None:
    junk = await service(None, cover_transport(200, b"<html>")).build(package())
    assert junk.startswith(b"%PDF-")
    huge = httpx.MockTransport(
        lambda r: httpx.Response(200, content=b"x", headers={"content-length": "99999999"})
    )
    assert (await service(None, huge).build(package())).startswith(b"%PDF-")


async def test_put_stores_under_the_key_and_degrades() -> None:
    store = FakeBlobStore()
    url = await service(store).put(package(), b"%PDF-x")
    assert url == f"https://blob.test/{KEY}"
    assert store.puts == [(KEY, "application/pdf")]
    assert await service(None).put(package(), b"%PDF-x") is None
    assert await service(FakeBlobStore(fail=True)).put(package(), b"%PDF-x") is None


@pytest.mark.db
async def test_attachment_for_renders_warms_the_cache_and_names_the_file(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    store = FakeBlobStore()
    att = await service(store).attachment_for(db, "north-goa-beaches")
    assert att is not None
    assert att.filename == "Tripsmith-north-goa-beaches-itinerary.pdf"
    assert att.content.startswith(b"%PDF-")
    assert len(store.objects) == 1
    assert next(iter(store.objects)).startswith("pdf/north-goa-beaches/")
    assert await service(store).attachment_for(db, "no-such-trip") is None


@pytest.mark.db
async def test_attachment_for_skips_the_put_when_the_cache_is_warm(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    pkg = await get_package(db, "north-goa-beaches")
    assert pkg is not None
    key = pdf_pathname(pkg.slug, pkg.updated_at)
    store = FakeBlobStore()
    store.objects[key] = b"already-cached"

    att = await service(store).attachment_for(db, "north-goa-beaches")

    assert att is not None
    assert att.filename == "Tripsmith-north-goa-beaches-itinerary.pdf"
    assert att.content.startswith(b"%PDF-")
    assert store.puts == []  # rendering still happens (cheap); the upload is what's skipped


@pytest.mark.db
async def test_attachment_for_never_raises(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())

    def boom(*a: object, **k: object) -> bytes:
        raise RuntimeError("fpdf exploded")

    monkeypatch.setattr("app.services.pdf.service.render_itinerary", boom)
    assert await service(FakeBlobStore()).attachment_for(db, "north-goa-beaches") is None


@pytest.mark.db
async def test_gc_deletes_every_pathname_that_is_not_current(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    rows = (await db.execute(Package.__table__.select())).all()
    current = {pdf_pathname(r.slug, r.updated_at) for r in rows}
    store = FakeBlobStore()
    for key in current:
        store.objects[key] = b"keep"
    store.objects["pdf/north-goa-beaches/1/Tripsmith-north-goa-beaches-itinerary.pdf"] = b"stale"
    store.objects["pdf/deleted-trip/5/Tripsmith-deleted-trip-itinerary.pdf"] = b"stale"
    store.objects["packages/goa/photo.jpg"] = b"not a pdf, not touched"

    report = await service(store).gc(db)

    assert (report.deleted, report.kept, report.configured) == (2, 2, True)
    assert set(store.objects) == current | {"packages/goa/photo.jpg"}
    # An edit rotates the key: the old object becomes stale on the next run. `updated_at` is
    # bumped explicitly (not left to `onupdate=func.now()`) so the new epoch second is always
    # distinct from the seeded one, however fast this test happens to run.
    await db.execute(
        update(Package)
        .where(Package.slug == "north-goa-beaches")
        .values(featured=True, updated_at=Package.updated_at + dt.timedelta(seconds=2))
    )
    await db.commit()
    report = await service(store).gc(db)
    assert report.deleted == 1 and report.kept == 1


@pytest.mark.db
async def test_gc_without_a_store_reports_unconfigured(db: AsyncSession) -> None:
    report = await service(None).gc(db)
    assert (report.deleted, report.kept, report.configured) == (0, 0, False)
