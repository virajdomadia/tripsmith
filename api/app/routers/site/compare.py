"""`GET /compare?slugs=a,b,c` (R39, P1b): the compare page's one read. Always 200 — trips that
are not live come back in `missing`, so a shared link to a retired trip still renders the rest.
CDN-cached like the catalogue (60 s)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import PUBLIC_CACHE_CONTROL
from app.infra.db import get_session
from app.schemas.compare import CompareResult
from app.services.catalog.compare import compare

router = APIRouter(tags=["public"])


@router.get("/compare", operation_id="compareTrips")
async def compare_route(
    db: Annotated[AsyncSession, Depends(get_session)],
    response: Response,
    slugs: Annotated[
        str | None,
        Query(max_length=400, description="Comma-separated package slugs; the first 3 are used"),
    ] = None,
) -> CompareResult:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    return await compare(db, slugs)
