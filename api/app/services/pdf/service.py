"""`PdfService`: everything around `render_itinerary` that touches the network — the cover
photo, the Blob cache (find / put), the email attachment and the weekly GC. Lives on
`app.state.pdf`. Every method degrades (logs + Sentry) instead of raising: a package download
falls back to streaming, an enquiry goes out without the attachment.
"""

import asyncio
import logging

import httpx
import sentry_sdk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.infra.email import EmailAttachment
from app.infra.storage import BlobStore
from app.models import Package
from app.schemas.catalog import PackageDetail
from app.schemas.pdf import GcReport
from app.services.catalog.reads import get_package
from app.services.pdf.itinerary import (
    GALLERY_MAX,
    PDF_PREFIX,
    pdf_filename,
    pdf_pathname,
    pdf_prefix,
    render_itinerary,
)

log = logging.getLogger(__name__)

COVER_TIMEOUT = 5.0
COVER_MAX_BYTES = 6_000_000
PDF_CONTENT_TYPE = "application/pdf"


class PdfService:
    def __init__(
        self,
        store: BlobStore | None,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._store = store
        self._settings = settings
        self._transport = transport  # tests: never the network

    # --- cache ---------------------------------------------------------------------------------

    async def cached_url(self, pkg: PackageDetail) -> str | None:
        if self._store is None:
            return None
        key = pdf_pathname(pkg.slug, pkg.updated_at)
        try:
            blobs = await self._store.list(pdf_prefix(pkg.slug))
        except Exception as exc:
            self._degrade("Blob list failed for %s", pkg.slug, exc)
            return None
        return next((b.url for b in blobs if b.pathname == key), None)

    async def put(self, pkg: PackageDetail, pdf: bytes) -> str | None:
        if self._store is None:
            return None
        try:
            key = pdf_pathname(pkg.slug, pkg.updated_at)
            return await self._store.put(key, pdf, PDF_CONTENT_TYPE)
        except Exception as exc:
            self._degrade("Blob put failed for %s", pkg.slug, exc)
            return None

    # --- render --------------------------------------------------------------------------------

    async def build(self, pkg: PackageDetail) -> bytes:
        """Fetch the cover and the gallery photos (best effort, concurrently) and render off
        the event loop."""
        urls = [pkg.cover.url] if pkg.cover else []
        gallery_urls = [i.url for i in pkg.images if not pkg.cover or i.url != pkg.cover.url]
        urls += gallery_urls[:GALLERY_MAX]
        photos: list[bytes | None] = []
        if urls:
            async with httpx.AsyncClient(
                transport=self._transport, timeout=COVER_TIMEOUT
            ) as client:
                photos = list(await asyncio.gather(*(self._fetch_image(client, u) for u in urls)))
        cover = photos[0] if pkg.cover and photos else None
        gallery = [p for p in photos[1 if pkg.cover else 0 :] if p]
        return await asyncio.to_thread(
            render_itinerary,
            pkg,
            cover=cover,
            gallery=gallery,
            site_url=self._settings.site_url,
            whatsapp_number=self._settings.whatsapp_number,
        )

    async def _fetch_image(self, client: httpx.AsyncClient, url: str) -> bytes | None:
        try:
            res = await client.get(url, follow_redirects=True)
            if res.status_code != 200:
                return None
            if int(res.headers.get("content-length", len(res.content))) > COVER_MAX_BYTES:
                return None
            if not res.headers.get("content-type", "").startswith("image/"):
                return None
            return res.content
        except Exception as exc:  # a missing photo is not worth a failed download
            log.warning("Photo fetch failed for %s: %s", url, exc)
            return None

    # --- email ---------------------------------------------------------------------------------

    async def attachment_for(self, db: AsyncSession, slug: str) -> EmailAttachment | None:
        """The visitor's attachment for a live package; also warms the Blob cache. Never raises."""
        try:
            pkg = await get_package(db, slug)
            if pkg is None:
                return None
            pdf = await self.build(pkg)
            await self.put(pkg, pdf)
            return EmailAttachment(filename=pdf_filename(slug), content=pdf)
        except Exception as exc:
            self._degrade("Itinerary PDF failed for %s", slug, exc)
            return None

    # --- gc ------------------------------------------------------------------------------------

    async def gc(self, db: AsyncSession) -> GcReport:
        """Delete every `pdf/` object whose pathname is not a package's current key."""
        if self._store is None:
            return GcReport(deleted=0, kept=0, configured=False)
        rows = (await db.execute(select(Package.slug, Package.updated_at))).all()
        current = {pdf_pathname(slug, updated_at) for slug, updated_at in rows}
        blobs = await self._store.list(PDF_PREFIX)
        stale = [b.url for b in blobs if b.pathname not in current]
        await self._store.delete(stale)
        return GcReport(deleted=len(stale), kept=len(blobs) - len(stale), configured=True)

    def _degrade(self, msg: str, slug: str, exc: Exception) -> None:
        log.error(msg + ": %s", slug, exc)
        sentry_sdk.capture_exception(exc)
