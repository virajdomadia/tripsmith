"""`/account/saved/*` (R39, P1): the ♡ for a signed-in customer — the saved slugs the hearts
paint from, save and unsave, the guest merge on sign-in, and the Saved tab's cards. Guests keep
their saves in the browser (web/src/lib/saved.ts); nothing here is reachable without a session.
"""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.client_ip import RateLimited
from app.infra.db import get_session
from app.infra.ratelimit import RateLimiter
from app.models import User
from app.routers.site.guards import same_origin_write
from app.schemas.catalog import SLUG_PATTERN
from app.schemas.saved import SavedMerge, SavedMergeInput, SavedSlugs, SavedTrips
from app.services import saved
from app.services.analytics import ist_today
from app.services.auth.deps import require_user

router = APIRouter(
    prefix="/account/saved", tags=["account"], dependencies=[Depends(same_origin_write)]
)

SAVED_LIMIT = 60
SAVED_WINDOW_SECONDS = 600

Slug = Annotated[str, Path(pattern=SLUG_PATTERN, min_length=1, max_length=80)]


async def saved_rate_limit(request: Request, user: Annotated[User, Depends(require_user)]) -> None:
    """Per signed-in customer (the web forwards from its own address, so never per IP)."""
    limiter: RateLimiter = request.app.state.rate_limiter
    result = await limiter.hit(
        f"saved:{user.id}", limit=SAVED_LIMIT, window_seconds=SAVED_WINDOW_SECONDS
    )
    if not result.allowed:
        raise RateLimited(result.retry_after, "Too many saves — try again in a few minutes")


@router.get("", operation_id="listSavedTrips", response_model_by_alias=True)
async def get_saved_trips(
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SavedTrips:
    """The Saved tab: live packages as cards with the next date that has seats."""
    response.headers.update(NO_STORE)
    now = dt.datetime.now(dt.UTC)
    return await saved.trips(db, user.id, today=ist_today(now), now=now)


@router.get("/slugs", operation_id="listSavedSlugs", response_model_by_alias=True)
async def get_saved_slugs(
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SavedSlugs:
    response.headers.update(NO_STORE)
    return await saved.slugs(db, user.id)


@router.put(
    "/{slug}",
    operation_id="saveTrip",
    response_model_by_alias=True,
    dependencies=[Depends(saved_rate_limit)],
)
async def put_saved(
    slug: Slug,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SavedSlugs:
    """Idempotent. 404 for a trip that is not live; 409 `saved_full` past the cap."""
    response.headers.update(NO_STORE)
    user_id = user.id
    return await saved.save(db, user_id, slug, now=dt.datetime.now(dt.UTC))


@router.delete(
    "/{slug}",
    operation_id="unsaveTrip",
    response_model_by_alias=True,
    dependencies=[Depends(saved_rate_limit)],
)
async def delete_saved(
    slug: Slug,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SavedSlugs:
    response.headers.update(NO_STORE)
    user_id = user.id
    return await saved.unsave(db, user_id, slug)


@router.post(
    "/merge",
    operation_id="mergeSavedTrips",
    response_model_by_alias=True,
    dependencies=[Depends(saved_rate_limit)],
)
async def post_merge(
    payload: SavedMergeInput,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> SavedMerge:
    """A guest's browser saves join the account on sign-in (union; the older time wins; past
    the cap the oldest browser saves are left out and counted in `leftOut`)."""
    response.headers.update(NO_STORE)
    user_id = user.id
    return await saved.merge(db, user_id, payload.items, now=dt.datetime.now(dt.UTC))
