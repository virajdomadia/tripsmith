"""`POST /bookings/quote` and `POST /bookings` — public, session optional (06 C5).

Starting a booking holds seats, so it is limited per visitor: `booking:{ip}` 5 / 10 min. The
web reaches it through `POST /api/bookings`, which forwards the visitor's address (the plain
rewrite would put every visitor in one bucket). A quote has no side effects and goes through
the rewrite unlimited.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.client_ip import RateLimited, client_ip
from app.infra.db import get_session
from app.infra.ratelimit import RateLimiter
from app.schemas.bookings import BookingOrder, BookingRequest, Quote, QuoteRequest
from app.services.booking.orders import create_booking_order, quote_booking

BOOKING_LIMIT = 5
BOOKING_WINDOW_SECONDS = 600


async def booking_rate_limit(request: Request) -> None:
    """Runs before the body is parsed, so junk cannot probe the rules for free."""
    limiter: RateLimiter = request.app.state.rate_limiter
    result = await limiter.hit(
        f"booking:{client_ip(request)}", limit=BOOKING_LIMIT, window_seconds=BOOKING_WINDOW_SECONDS
    )
    if not result.allowed:
        raise RateLimited(
            result.retry_after,
            "Too many booking attempts from this connection — try again in a few minutes, "
            "or WhatsApp us",
        )


router = APIRouter(tags=["public"])


@router.post("/bookings/quote", operation_id="quoteBooking", response_model_by_alias=True)
async def post_quote(
    payload: QuoteRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> Quote:
    response.headers["Cache-Control"] = "no-store"
    return await quote_booking(db, payload)


@router.post(
    "/bookings",
    operation_id="createBookingOrder",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
    dependencies=[Depends(booking_rate_limit)],
)
async def post_booking(
    payload: BookingRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> BookingOrder:
    response.headers["Cache-Control"] = "no-store"
    return await create_booking_order(db, payload)
