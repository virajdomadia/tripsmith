"""POST /views — the package page's view beacon (06 C3). Always 204."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.client_ip import client_ip
from app.infra.db import get_session
from app.infra.ratelimit import RateLimiter
from app.schemas.analytics import ViewCreate
from app.services.analytics import is_bot, record_view

router = APIRouter(tags=["public"])

# Generous on purpose: this is one beacon per package page a visitor opens, and a real reader
# browsing the catalog can easily open a dozen in ten minutes. The ceiling exists so a script
# cannot drive the owner's dashboard counters — or the database's write volume — without bound
# (H4, docs/12). Unlike the enquiry and login limiters, going over is a silent no-count rather
# than a 429: the browser fires this with `keepalive` and ignores the answer either way.
VIEW_LIMIT = 60
VIEW_WINDOW_SECONDS = 600


@router.post(
    "/views",
    operation_id="recordView",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def post_view(
    payload: ViewCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    user_agent = request.headers.get("user-agent")
    # The bot check comes first, so crawlers — which outnumber visitors on a public catalog —
    # cost no Upstash round trip. `record_view` re-checks it; that call is pure regex on a header.
    if not is_bot(user_agent):
        limiter: RateLimiter = request.app.state.rate_limiter
        allowed = await limiter.hit(
            f"views:{client_ip(request)}", limit=VIEW_LIMIT, window_seconds=VIEW_WINDOW_SECONDS
        )
        if allowed.allowed:
            await record_view(db, payload.slug, user_agent=user_agent)
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers={"Cache-Control": "no-store"})
