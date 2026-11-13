"""`POST /alerts` — "email me when new dates are added" (v3 C3, R30). Public, rate-limited.

The web reaches it through its own `POST /api/alerts` handler, which forwards the visitor's
address (like `/api/waitlist`), so `alerts:{ip}` buckets per visitor. Nothing is emailed now:
the alert waits for the owner to add dates (services/alerts.py).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.client_ip import RateLimited, client_ip
from app.infra.db import get_session
from app.infra.ratelimit import RateLimiter
from app.schemas.alerts import AlertSubscribe, AlertSubscribed
from app.services import alerts

ALERT_LIMIT = 5
ALERT_WINDOW_SECONDS = 600


async def alert_rate_limit(request: Request) -> None:
    limiter: RateLimiter = request.app.state.rate_limiter
    result = await limiter.hit(
        f"alerts:{client_ip(request)}", limit=ALERT_LIMIT, window_seconds=ALERT_WINDOW_SECONDS
    )
    if not result.allowed:
        raise RateLimited(result.retry_after)


router = APIRouter(tags=["public"], dependencies=[Depends(alert_rate_limit)])


@router.post(
    "/alerts",
    operation_id="subscribeDepartureAlert",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def post_alert(
    payload: AlertSubscribe,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> AlertSubscribed:
    response.headers.update(NO_STORE)
    return await alerts.subscribe(db, payload)
