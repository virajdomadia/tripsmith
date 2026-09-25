"""`POST /bookings/quote`, `POST /bookings`, `POST /bookings/{ref}/confirm` — public (06 C5).

Starting a booking holds seats, so it is limited per visitor: `booking:{ip}` 5 / 10 min. The
web reaches it through `POST /api/bookings`, which forwards the visitor's address (the plain
rewrite would put every visitor in one bucket). A quote has no side effects and goes through
the rewrite unlimited; so does confirm, which only acts on a payment Razorpay signed.

Without Razorpay keys, starting a booking is a 503 before any seat is held.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.client_ip import RateLimited, client_ip
from app.infra.db import get_session
from app.infra.ratelimit import RateLimiter
from app.infra.razorpay import Razorpay
from app.schemas.bookings import (
    BookingOrder,
    BookingRequest,
    PaymentCallback,
    PaymentResult,
    Quote,
    QuoteRequest,
)
from app.services.booking.orders import create_booking_order, quote_booking
from app.services.booking.payments import confirm_payment

BOOKING_LIMIT = 5
BOOKING_WINDOW_SECONDS = 600
PAYMENTS_OFF = "Online booking is switched off right now — send an enquiry or WhatsApp us"
BookingRef = Annotated[str, Path(pattern=r"^TB-[A-Z0-9]{6}$", examples=["TB-7F3K2Q"])]


def razorpay(request: Request) -> Razorpay:
    """The app's Razorpay client; a 503 when its keys are unset (never an import-time crash)."""
    client: Razorpay | None = request.app.state.razorpay
    if client is None:
        raise ApiError("internal", PAYMENTS_OFF, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return client


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
    rzp: Annotated[Razorpay, Depends(razorpay)],  # before the session: no keys → 503, no db
    db: Annotated[AsyncSession, Depends(get_session)],
) -> BookingOrder:
    response.headers["Cache-Control"] = "no-store"
    return await create_booking_order(db, payload, rzp)


@router.post("/bookings/{ref}/confirm", operation_id="confirmPayment", response_model_by_alias=True)
async def post_confirm(
    ref: BookingRef,
    payload: PaymentCallback,
    response: Response,
    rzp: Annotated[Razorpay, Depends(razorpay)],  # before the session: no keys → 503, no db
    db: Annotated[AsyncSession, Depends(get_session)],
) -> PaymentResult:
    response.headers["Cache-Control"] = "no-store"
    return await confirm_payment(db, ref, payload, rzp)
