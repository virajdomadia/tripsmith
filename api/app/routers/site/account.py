"""`/account/*` for a signed-in customer (R18, R19, R21): My trips, one booking, the request to
cancel it, and the review of a completed trip. The voucher download lives beside the signed
link in vouchers.py."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.models import User
from app.routers.site.bookings import BookingRef
from app.schemas.account import (
    AccountBookingDetail,
    AccountBookings,
    AccountCancellation,
    CancellationRequest,
)
from app.schemas.reviews import AccountReview, ReviewInput
from app.services.account import get_booking, list_bookings, request_cancellation
from app.services.analytics import ist_today
from app.services.auth.deps import require_user
from app.services.booking.voucher import load_booking_facts
from app.services.email.cancellations import send_cancellation_emails
from app.services.email.reviews import send_review_email
from app.services.reviews import submit_review

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/bookings", operation_id="listMyBookings", response_model_by_alias=True)
async def get_my_bookings(
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> AccountBookings:
    response.headers.update(NO_STORE)
    return AccountBookings(
        name=user.name,
        email=user.email,
        today=ist_today(),
        bookings=await list_bookings(db, user),
    )


@router.get("/bookings/{ref}", operation_id="getMyBooking", response_model_by_alias=True)
async def get_my_booking(
    ref: BookingRef,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> AccountBookingDetail:
    response.headers.update(NO_STORE)
    detail = await get_booking(db, user, ref, today=ist_today())
    if detail is None:
        raise ApiError("not_found", "No booking with that reference on your account")
    return detail


@router.post(
    "/bookings/{ref}/cancellation",
    operation_id="requestCancellation",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def post_cancellation(
    ref: BookingRef,
    payload: CancellationRequest,
    request: Request,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> AccountCancellation:
    """Records the request (the booking stays confirmed until the owner decides, B11), then
    emails the owner the request and the customer an acknowledgement. A lost email never
    undoes the request."""
    response.headers.update(NO_STORE)
    today = ist_today()
    asked = await request_cancellation(db, user, ref, payload.reason, today=today)
    try:
        facts = await load_booking_facts(db, ref)
    finally:
        await db.rollback()
    if facts is not None:
        await send_cancellation_emails(
            request.app.state.email_sender,
            request.app.state.settings,
            facts,
            reason=asked.reason,
            requested_at=asked.requested_at,
            today=today,
        )
    return asked


@router.post(
    "/bookings/{ref}/review",
    operation_id="submitReview",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def post_review(
    ref: BookingRef,
    payload: ReviewInput,
    request: Request,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> AccountReview:
    """B13: one review per completed booking, final once sent, hidden until the owner
    publishes it. The owner is emailed; a lost email never undoes the review."""
    response.headers.update(NO_STORE)
    review = await submit_review(db, user, ref, payload)
    try:
        facts = await load_booking_facts(db, ref)
    finally:
        await db.rollback()
    if facts is not None:
        await send_review_email(
            request.app.state.email_sender,
            request.app.state.settings,
            facts,
            rating=review.rating,
            text=review.text,
        )
    return review
