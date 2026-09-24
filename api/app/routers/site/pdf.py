"""GET /packages/{slug}/itinerary.pdf (04 §5): 302 to the Blob-cached PDF keyed by what it
draws (`pdf_version`), rendered on the first request; streamed inline when no store is
configured (dev, CI) or Blob is down — a download never 5xx's because of the cache.

The redirect is `no-store`: its target is a versioned key the daily GC deletes once the
package moves on, so an edge-cached 302 would outlive the object it points at. A `HEAD` (link
checkers, crawlers) never renders or uploads: it answers the cached redirect, else a bodyless
200 with the PDF's content type.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.cache import NO_STORE, PUBLIC_CACHE_CONTROL
from app.infra.db import get_session
from app.middleware import HEAD_STATE_KEY
from app.services.catalog.reads import get_package
from app.services.pdf.itinerary import pdf_filename
from app.services.pdf.service import PdfService

router = APIRouter(tags=["public"])


@router.get(
    "/packages/{slug}/itinerary.pdf",
    operation_id="getItineraryPdf",
    response_class=Response,
    responses={
        302: {"description": "Redirect to the cached PDF"},
        200: {"content": {"application/pdf": {}}, "description": "The PDF (no Blob store)"},
        404: {"description": "Draft or unknown package"},
    },
)
async def get_itinerary_pdf(
    slug: str, request: Request, db: Annotated[AsyncSession, Depends(get_session)]
) -> Response:
    pkg = await get_package(db, slug, with_related=False)
    # End the read transaction now: Blob list, photo fetch, render and put below can take
    # seconds, and an open transaction would pin one of the function's few pooled connections.
    await db.rollback()
    if pkg is None:
        raise ApiError("not_found", "Package not found")
    service: PdfService = request.app.state.pdf
    headers = {"Cache-Control": PUBLIC_CACHE_CONTROL}

    url = await service.cached_url(pkg)
    if url is None and getattr(request.state, HEAD_STATE_KEY, False):
        return Response(media_type="application/pdf", headers=NO_STORE)
    if url is None:
        pdf = await service.build(pkg)
        url = await service.put(pkg, pdf)
        if url is None:
            return Response(
                pdf,
                media_type="application/pdf",
                headers={
                    **headers,
                    "Content-Disposition": f'inline; filename="{pdf_filename(slug)}"',
                },
            )
    return RedirectResponse(url, status_code=302, headers=NO_STORE)
