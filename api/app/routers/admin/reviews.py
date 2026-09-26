"""`/admin/reviews*` (R24, B13): the owner's moderation queue — one tab per state — and the two
moves, publish and hide. Each move recomputes the package's cached rating and revalidates its
pages; the owner never edits a review's text."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.schemas.reviews import MAX_PAGE, AdminReview, AdminReviewList, ReviewState
from app.services import reviews as svc
from app.services.auth.deps import require_owner

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_owner)])

Db = Annotated[AsyncSession, Depends(get_session)]


@router.get("/reviews", operation_id="listAdminReviews", response_model_by_alias=True)
async def list_route(
    response: Response,
    db: Db,
    state: Annotated[ReviewState, Query(description="The tab")] = ReviewState.PENDING,
    page: Annotated[int, Query(ge=1, le=MAX_PAGE, description="1-based")] = 1,
) -> AdminReviewList:
    response.headers.update(NO_STORE)
    return await svc.list_reviews(db, state, page=page)


@router.post("/reviews/{id}/publish", operation_id="publishReview", response_model_by_alias=True)
async def publish_route(id: str, response: Response, db: Db) -> AdminReview:
    response.headers.update(NO_STORE)
    return await svc.moderate(db, id, publish=True)


@router.post("/reviews/{id}/hide", operation_id="hideReview", response_model_by_alias=True)
async def hide_route(id: str, response: Response, db: Db) -> AdminReview:
    response.headers.update(NO_STORE)
    return await svc.moderate(db, id, publish=False)
