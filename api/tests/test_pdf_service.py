"""services/pdf/service.py — the network side of the PDF: cover fetch, Blob cache, attachment,
GC. Every failure degrades; nothing here may raise into a request."""

from pathlib import Path

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.storage import BlobInfo
from app.models import Departure, Destination, ItineraryDay, Package, PackageImage
from app.models.enums import PackageStatus
from app.services.catalog.reads import get_package
from app.services.pdf.service import PdfService
from scripts.seed import seed
from tests.pdf_fixture import package
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore

COVER_JPEG = (
    Path(__file__).resolve().parents[1] / "content" / "photos" / "goa" / "agonda-sunset.jpg"
)
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


KEY = service(None).key(package())


def test_key_is_the_pathname_scheme_with_a_content_version() -> None:
    assert KEY.startswith("pdf/north-goa-beaches/")
    assert KEY.endswith("/Tripsmith-north-goa-beaches-itinerary.pdf")
    assert service(None).key(package(days=6)) != KEY


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


async def test_attachment_for_renders_warms_the_cache_and_names_the_file() -> None:
    store = FakeBlobStore()
    att = await service(store).attachment_for(package())
    assert att is not None
    assert att.filename == "Tripsmith-north-goa-beaches-itinerary.pdf"
    assert att.content.startswith(b"%PDF-")
    assert list(store.objects) == [KEY]


async def test_attachment_for_skips_the_put_when_the_cache_is_warm() -> None:
    store = FakeBlobStore()
    store.objects[KEY] = b"already-cached"

    att = await service(store).attachment_for(package())

    assert att is not None
    assert att.filename == "Tripsmith-north-goa-beaches-itinerary.pdf"
    assert att.content.startswith(b"%PDF-")
    assert store.puts == []  # rendering still happens (cheap); the upload is what's skipped


async def test_attachment_for_never_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*a: object, **k: object) -> bytes:
        raise RuntimeError("fpdf exploded")

    monkeypatch.setattr("app.services.pdf.service.render_itinerary", boom)
    assert await service(FakeBlobStore()).attachment_for(package()) is None


# --- the key follows the catalog (db) ------------------------------------------------------------


async def live_key(db: AsyncSession, slug: str = "north-goa-beaches") -> str:
    pkg = await get_package(db, slug)
    assert pkg is not None
    return service(None).key(pkg)


async def package_id(db: AsyncSession, slug: str = "north-goa-beaches") -> str:
    return (await db.execute(select(Package.id).where(Package.slug == slug))).scalar_one()


async def row_updated_at(db: AsyncSession) -> object:
    stmt = select(Package.updated_at).where(Package.slug == "north-goa-beaches")
    return (await db.execute(stmt)).scalar_one()


@pytest.mark.db
async def test_the_key_moves_with_edits_that_never_touch_the_package_row(
    db: AsyncSession,
) -> None:
    """The v1 key was `updated_at`, which none of these writes move: the PDF went stale."""
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    pid = await package_id(db)
    stamp = await row_updated_at(db)
    detail = await get_package(db, "north-goa-beaches")
    assert detail is not None and len(detail.departures) >= 2
    cheapest = min(detail.departures, key=lambda d: d.price_double_paise)
    pricier = next(d for d in detail.departures if d.id != cheapest.id)
    edits = {
        "day title": update(ItineraryDay)
        .where(ItineraryDay.package_id == pid, ItineraryDay.day_no == 1)
        .values(title="A different first day"),
        "non-cheapest departure price": update(Departure)
        .where(Departure.id == pricier.id)
        .values(price_double_paise=pricier.price_double_paise + 100_000),
        "image": update(PackageImage)
        .where(PackageImage.package_id == pid)
        .values(alt="A new caption"),
        "destination name": update(Destination)
        .where(Destination.slug == "goa")
        .values(name="Goa, India"),
    }
    for what, stmt in edits.items():
        before = await live_key(db)
        await db.execute(stmt)
        await db.commit()
        assert await live_key(db) != before, what
    assert await row_updated_at(db) == stamp, "none of these touched the package row"


async def current_keys(db: AsyncSession) -> set[str]:
    stmt = select(Package.slug).where(Package.status == PackageStatus.LIVE)
    slugs = (await db.execute(stmt)).scalars().all()
    return {await live_key(db, slug) for slug in slugs}


@pytest.mark.db
async def test_gc_deletes_every_pathname_that_is_not_current(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())
    current = await current_keys(db)
    assert len(current) == 2
    store = FakeBlobStore()
    for key in current:
        store.objects[key] = b"keep"
    store.objects["pdf/north-goa-beaches/1/Tripsmith-north-goa-beaches-itinerary.pdf"] = b"stale"
    store.objects["pdf/deleted-trip/5/Tripsmith-deleted-trip-itinerary.pdf"] = b"stale"
    store.objects["packages/goa/photo.jpg"] = b"not a pdf, not touched"

    report = await service(store).gc(db)

    assert (report.deleted, report.kept, report.configured) == (2, 2, True)
    assert set(store.objects) == current | {"packages/goa/photo.jpg"}
    # An edit the PDF draws rotates the key: the old object becomes stale on the next run.
    await db.execute(
        update(ItineraryDay)
        .where(ItineraryDay.package_id == await package_id(db), ItineraryDay.day_no == 1)
        .values(title="A different first day")
    )
    await db.commit()
    report = await service(store).gc(db)
    assert report.deleted == 1 and report.kept == 1


@pytest.mark.db
async def test_gc_without_a_store_reports_unconfigured(db: AsyncSession) -> None:
    report = await service(None).gc(db)
    assert (report.deleted, report.kept, report.configured) == (0, 0, False)
