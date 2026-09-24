"""GET /packages/{slug}/itinerary.pdf (04 §5): 302 to the Blob-cached PDF keyed by what it
draws (`pdf_version`), rendered on the first request; streamed inline when no store is
configured (dev, CI) or Blob is down — a download never 5xx's because of the cache.

The redirect is `no-store`: its target is a versioned key the daily GC deletes once the
package moves on, so an edge-cached 302 would outlive the object it points at. A `HEAD` (link
checkers, crawlers) never renders or uploads: it answers the cached redirect, else a bodyless
200 with the PDF's content type.

Abuse (v1.0.1): the route is public and every request costs a Blob `list` (an advanced
operation on Vercel's meter), and a miss a render. So a query string — which the route never
reads, and which would give each variant its own edge-cache entry — is answered with a 308 to
the bare URL before any work, cached at the edge for a day so a repeated variant never reaches
the function again (a *new* random query still costs one cheap invocation). Then each address
gets `PDF_LIMIT` GET downloads per window, counted only for a real package; HEAD (link
checkers) is not counted. Site links go through the web's own handler
(`web/src/app/(site)/packages/[slug]/itinerary.pdf/route.ts`), which forwards the visitor's
address under `X-Client-Ip` + the shared secret; reached through the plain `/api/:path*`
rewrite instead, the address is Vercel's hop and the bucket is shared (infra/client_ip.py).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.cache import NO_STORE, PUBLIC_CACHE_CONTROL
from app.infra.client_ip import RateLimited, client_ip
from app.infra.db import get_session
from app.infra.ratelimit import RateLimiter
from app.middleware import HEAD_STATE_KEY
from app.services.catalog.reads import get_package
from app.services.pdf.itinerary import pdf_filename
from app.services.pdf.service import PdfService

router = APIRouter(tags=["public"])

CANONICAL_REDIRECT_CACHE = "public, s-maxage=86400"

PDF_LIMIT = 60
PDF_WINDOW_SECONDS = 600


@router.get(
    "/packages/{slug}/itinerary.pdf",
    operation_id="getItineraryPdf",
    response_class=Response,
    responses={
        302: {"description": "Redirect to the cached PDF"},
        200: {"content": {"application/pdf": {}}, "description": "The PDF (no Blob store)"},
        308: {"description": "Any query string: redirect to the bare URL"},
        404: {"description": "Draft or unknown package"},
        429: {"description": "Too many downloads from this address"},
    },
)
async def get_itinerary_pdf(
    slug: str, request: Request, db: Annotated[AsyncSession, Depends(get_session)]
) -> Response:
    if request.url.query:
        # Relative on purpose: through the web's rewrite the visitor's path is
        # `/api/packages/{slug}/itinerary.pdf`, and a bare `itinerary.pdf` resolves against
        # whichever path the client actually requested, dropping only the query.
        return RedirectResponse(
            "itinerary.pdf", status_code=308, headers={"Cache-Control": CANONICAL_REDIRECT_CACHE}
        )
    pkg = await get_package(db, slug, with_related=False)
    # End the read transaction now: Blob list, photo fetch, render and put below can take
    # seconds, and an open transaction would pin one of the function's few pooled connections.
    await db.rollback()
    if pkg is None:
        raise ApiError("not_found", "Package not found")
    is_head = getattr(request.state, HEAD_STATE_KEY, False)
    if not is_head:
        limiter: RateLimiter = request.app.state.rate_limiter
        limited = await limiter.hit(
            f"pdf:{client_ip(request)}", limit=PDF_LIMIT, window_seconds=PDF_WINDOW_SECONDS
        )
        if not limited.allowed:
            raise RateLimited(
                limited.retry_after, "Too many downloads from this connection — try again shortly"
            )
    service: PdfService = request.app.state.pdf
    headers = {"Cache-Control": PUBLIC_CACHE_CONTROL}

    url = await service.cached_url(pkg)
    if url is None and is_head:
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
