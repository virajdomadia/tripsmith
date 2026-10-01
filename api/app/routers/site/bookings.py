"""`POST /bookings/quote`, `POST /bookings`, `POST /bookings/{ref}/confirm`, `…/sync` and the
voucher (B7) — public (06 C5).

Starting a booking holds seats, so it is limited per visitor: `booking:{ip}` 5 / 10 min. The
web reaches it through `POST /api/bookings`, which forwards the visitor's address (the plain
rewrite would put every visitor in one bucket). A quote has no side effects and goes through
the rewrite unlimited (it never answers "already used by this email": that waits for the limited
hold), and so does confirm, which only acts on a payment Razorpay signed. Sync asks Razorpay
while the booking is pending, so it is limited per booking (`sync:{ref}` 20 / 10 min) — the key
needs no visitor address, so the rewrite is fine.

Without Razorpay keys, starting a booking is a 503 before any seat is held.

A confirmed answer from confirm (Razorpay's signature proves the payment) or from sync with the
booking's order id carries `voucherUrl`, the 30-minute signed link (services/booking/voucher.py).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.client_ip import RateLimited, client_ip
from app.infra.db import get_session
from app.infra.ratelimit import RateLimiter
from app.infra.razorpay import Razorpay
from app.models import User
from app.schemas.bookings import (
    BookingOrder,
    BookingRequest,
    LinkCallback,
    PaymentCallback,
    PaymentResult,
    Quote,
    QuoteRequest,
    SyncRequest,
)
from app.services.auth.deps import require_user
from app.services.booking.after_capture import Notify
from app.services.booking.links import link_callback, payment_result
from app.services.booking.orders import create_booking_order, quote_booking
from app.services.booking.payments import confirm_payment, sync_payment
from app.services.booking.voucher import HAS_VOUCHER, booking_has_order, voucher_path
from app.services.email.waitlist import send_due

BOOKING_LIMIT = 5
BOOKING_WINDOW_SECONDS = 600
SYNC_LIMIT = 20  # the sheet syncs once per closed Checkout; a pending hold lives 10 minutes
SYNC_WINDOW_SECONDS = 600
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


async def sync_rate_limit(request: Request, ref: BookingRef) -> None:
    """Each sync of a pending booking is a Razorpay API call under the merchant key."""
    limiter: RateLimiter = request.app.state.rate_limiter
    result = await limiter.hit(f"sync:{ref}", limit=SYNC_LIMIT, window_seconds=SYNC_WINDOW_SECONDS)
    if not result.allowed:
        raise RateLimited(
            result.retry_after, "Too many checks on this booking — try again in a few minutes"
        )


EXTRAS_LIMIT = 10  # Add extras orders per booking; each is a Razorpay order under our key
EXTRAS_WINDOW_SECONDS = 600


async def extras_rate_limit(
    request: Request, ref: BookingRef, user: Annotated[User, Depends(require_user)]
) -> None:
    """Per signed-in customer and booking, after the sign-in check: not per IP (the web
    forwards My trips calls from its own address), and a stranger cannot spend it."""
    limiter: RateLimiter = request.app.state.rate_limiter
    result = await limiter.hit(
        f"extras:{user.id}:{ref}", limit=EXTRAS_LIMIT, window_seconds=EXTRAS_WINDOW_SECONDS
    )
    if not result.allowed:
        raise RateLimited(
            result.retry_after, "Too many tries on this booking — try again in a few minutes"
        )


def notify(request: Request) -> Notify:
    return Notify.of(request.app.state)


def session_secret(request: Request) -> str | None:
    secret = request.app.state.settings.session_secret
    return secret.get_secret_value() if secret else None


def with_voucher(request: Request, result: PaymentResult) -> PaymentResult:
    if result.status not in HAS_VOUCHER:
        return result
    secret = request.app.state.settings.session_secret
    path = voucher_path(result.booking_ref, secret.get_secret_value() if secret else None)
    return result.model_copy(update={"voucher_url": path})


router = APIRouter(tags=["public"])


@router.post("/bookings/quote", operation_id="quoteBooking", response_model_by_alias=True)
async def post_quote(
    payload: QuoteRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> Quote:
    response.headers["Cache-Control"] = "no-store"
    return await quote_booking(db, payload, secret=session_secret(request))


@router.post(
    "/bookings",
    operation_id="createBookingOrder",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
    dependencies=[Depends(booking_rate_limit)],
)
async def post_booking(
    payload: BookingRequest,
    request: Request,
    response: Response,
    rzp: Annotated[Razorpay, Depends(razorpay)],  # before the session: no keys → 503, no db
    db: Annotated[AsyncSession, Depends(get_session)],
) -> BookingOrder:
    response.headers["Cache-Control"] = "no-store"
    order = await create_booking_order(db, payload, rzp, secret=session_secret(request))
    await send_due(db, notify(request))  # P6: the walk before the hold may have made offers
    return order


@router.post("/bookings/{ref}/confirm", operation_id="confirmPayment", response_model_by_alias=True)
async def post_confirm(
    ref: BookingRef,
    payload: PaymentCallback,
    request: Request,
    response: Response,
    rzp: Annotated[Razorpay, Depends(razorpay)],  # before the session: no keys → 503, no db
    db: Annotated[AsyncSession, Depends(get_session)],
) -> PaymentResult:
    response.headers["Cache-Control"] = "no-store"
    result = await confirm_payment(db, ref, payload, rzp, notify(request))
    return with_voucher(request, result)  # the signature verified: this caller paid


@router.post(
    "/bookings/{ref}/link-callback",
    operation_id="paymentLinkCallback",
    response_model_by_alias=True,
    dependencies=[Depends(sync_rate_limit)],
)
async def post_link_callback(
    ref: BookingRef,
    payload: LinkCallback,
    request: Request,
    response: Response,
    rzp: Annotated[Razorpay, Depends(razorpay)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> PaymentResult:
    """P18b: the customer's browser, back from a paid Payment Link with Razorpay's signed
    redirect. A signature that verifies syncs the link (the one capture path); a confirmed
    answer carries the voucher link, since the signature proves this caller paid."""
    response.headers["Cache-Control"] = "no-store"
    await link_callback(
        db,
        ref,
        link_id=payload.razorpay_payment_link_id,
        reference_id=payload.razorpay_payment_link_reference_id,
        status=payload.razorpay_payment_link_status,
        payment_id=payload.razorpay_payment_id,
        signature=payload.razorpay_signature,
        razorpay=rzp,
        notify=notify(request),
    )
    result = await payment_result(db, ref)
    return with_voucher(request, result)


@router.post(
    "/bookings/{ref}/sync",
    operation_id="syncPayment",
    response_model_by_alias=True,
    dependencies=[Depends(sync_rate_limit)],
)
async def post_sync(
    ref: BookingRef,
    request: Request,
    response: Response,
    rzp: Annotated[Razorpay, Depends(razorpay)],
    db: Annotated[AsyncSession, Depends(get_session)],
    payload: SyncRequest | None = None,
) -> PaymentResult:
    """Checkout closed without calling back: was the booking paid anyway? (B5) The ref alone
    answers the status; the voucher link needs the booking's order id too (B7)."""
    response.headers["Cache-Control"] = "no-store"
    result = await sync_payment(db, ref, rzp, notify(request))
    order_id = payload.order_id if payload else None
    if order_id and result.status in HAS_VOUCHER and await booking_has_order(db, ref, order_id):
        return with_voucher(request, result)
    return result
