"""`/account/*` for a signed-in customer (R18, R19, R21): My trips, one booking, the request to
cancel it, and the review of a completed trip. The voucher download lives beside the signed
link in vouchers.py."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.infra.razorpay import Razorpay
from app.models import User
from app.models.enums import BookingActor
from app.routers.site.bookings import BookingRef, extras_rate_limit, razorpay
from app.schemas.account import (
    AccountBookingDetail,
    AccountBookings,
    AccountCancellation,
    BalanceOrder,
    BalanceRequest,
    CancellationRequest,
)
from app.schemas.changes import ChangeOptions, ChangeRequest, ChangeResult
from app.schemas.details import ChecklistTick, TravellerDetailsInput, TravellerDetailsOut
from app.schemas.extras import ExtrasOrder, ExtrasQuote, ExtrasRequest
from app.schemas.reviews import AccountReview, ReviewInput
from app.services.account import get_booking, list_bookings, owns_booking, request_cancellation
from app.services.analytics import ist_today
from app.services.auth.deps import require_user
from app.services.booking import details, trip_pack, waitlist
from app.services.booking.after_capture import Notify
from app.services.booking.balance import create_balance_order
from app.services.booking.changes import change_options, start_change
from app.services.booking.extras import create_extras_order, quote_extras
from app.services.booking.freshness import refresh_quietly
from app.services.booking.refunds import send_refunds
from app.services.booking.voucher import load_booking_facts
from app.services.email.cancellations import send_cancellation_emails
from app.services.email.changes import send_change_emails
from app.services.email.reviews import send_review_email
from app.services.email.waitlist import send_due
from app.services.reviews import submit_review

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/bookings", operation_id="listMyBookings", response_model_by_alias=True)
async def get_my_bookings(
    request: Request,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> AccountBookings:
    response.headers.update(NO_STORE)
    # Read before the waitlist walk, whose commits and rollbacks expire `user`.
    name, email = user.name, user.email
    bookings = await list_bookings(db, user)
    secret = request.app.state.settings.session_secret
    entries = await waitlist.account_entries(
        db, email, secret.get_secret_value() if secret else None
    )
    await send_due(db, Notify.of(request.app.state))  # the walk may have moved offers on
    return AccountBookings(
        name=name, email=email, today=ist_today(), bookings=bookings, waitlist=entries
    )


@router.get("/bookings/{ref}", operation_id="getMyBooking", response_model_by_alias=True)
async def get_my_booking(
    ref: BookingRef,
    request: Request,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> AccountBookingDetail:
    response.headers.update(NO_STORE)
    detail = await get_booking(
        db, user, ref, today=ist_today(), settings=request.app.state.settings
    )
    if detail is None:
        raise ApiError("not_found", "No booking with that reference on your account")
    return detail


@router.post(
    "/bookings/{ref}/extras/quote", operation_id="quoteExtras", response_model_by_alias=True
)
async def post_extras_quote(
    ref: BookingRef,
    payload: ExtrasRequest,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> ExtrasQuote:
    """P8b: the server's price for these extras on this booking. 409 `extras_closed` with the
    reason, or `addon_unavailable` with `addons.<index>` for one no longer on sale."""
    response.headers.update(NO_STORE)
    return await quote_extras(db, user, ref, payload, today=ist_today())


@router.post(
    "/bookings/{ref}/extras",
    operation_id="createExtrasOrder",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
    dependencies=[Depends(extras_rate_limit)],
)
async def post_extras_order(
    ref: BookingRef,
    payload: ExtrasRequest,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    rzp: Annotated[Razorpay, Depends(razorpay)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> ExtrasOrder:
    """P8b: a Razorpay order for exactly the extras' price. Checkout's success handler posts to
    `confirmPayment` (and `syncPayment` checks it on close) like any booking payment; the add-ons
    join the booking only when the money is captured."""
    response.headers.update(NO_STORE)
    return await create_extras_order(db, user, ref, payload, rzp, today=ist_today())


@router.post(
    "/bookings/{ref}/balance",
    operation_id="createBalanceOrder",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
    dependencies=[Depends(extras_rate_limit)],
)
async def post_balance_order(
    ref: BookingRef,
    payload: BalanceRequest,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    rzp: Annotated[Razorpay, Depends(razorpay)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> BalanceOrder:
    """P5: a Razorpay order for a part of the balance (at least ₹1,000 unless less is left, at
    most what is left). Checkout's success handler posts to `confirmPayment` and `syncPayment`
    checks it on close, like any booking payment; the part that clears the balance confirms the
    booking. 409 `balance_closed` when there is nothing to pay or a cancellation request waits."""
    response.headers.update(NO_STORE)
    return await create_balance_order(db, user, ref, payload.amount_paise, rzp)


@router.get("/bookings/{ref}/change", operation_id="getChangeOptions", response_model_by_alias=True)
async def get_change_options(
    ref: BookingRef,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> ChangeOptions:
    """P7: the dates this booking can move to, each re-quoted for it (the earned discounts kept
    in ₹, today's fee, what to pay now or get back). 409 `change_closed` with the reason."""
    response.headers.update(NO_STORE)
    return await change_options(db, user, ref)


@router.post(
    "/bookings/{ref}/change",
    operation_id="changeDate",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
    dependencies=[Depends(extras_rate_limit)],
)
async def post_change(
    ref: BookingRef,
    payload: ChangeRequest,
    request: Request,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> ChangeResult:
    """P7: move the booking to another date of the trip. Nothing to pay → moved now (`done`; any
    refund goes out at once). Something to pay → the new date's seats are held for 10 minutes
    and a Razorpay order is opened (`pay`); Checkout's success handler posts to `confirmPayment`
    and `syncPayment` checks it on close, like any payment — the move happens on the capture.
    409 `change_closed` / `price_changed` / `sold_out` / `too_soon` / `same_date`."""
    response.headers.update(NO_STORE)
    rzp = getattr(request.app.state, "razorpay", None)
    started = await start_change(
        db, user, ref, payload.departure_id, payload.expected_net_paise, rzp
    )
    if started.result.state == "done":
        notify = Notify.of(request.app.state)
        await send_refunds(db, ref, rzp)
        await refresh_quietly(db, {started.package_id}, after=f"date change on {ref}")
        await send_change_emails(
            db, notify, ref, started.change_id, refund_paise=started.result.refund_paise
        )
        await send_due(db, notify)  # the old date's freed seats may have made offers
    return started.result


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
            db=db,
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
            db=db,
        )
    return review


# --- traveller details + checklist (P9, R49) -----------------------------------------------------

TravellerId = Annotated[str, Path(min_length=1, max_length=40, pattern=r"^[a-z0-9]+$")]
CheckKey = Annotated[str, Path(min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$")]


@router.put(
    "/bookings/{ref}/travellers/{traveller_id}/details",
    operation_id="saveTravellerDetails",
    response_model_by_alias=True,
)
async def put_traveller_details(
    ref: BookingRef,
    traveller_id: TravellerId,
    payload: TravellerDetailsInput,
    request: Request,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> TravellerDetailsOut:
    """One traveller's card, saved by the lead booker after payment, until 3 days before
    departure. The ID number comes back masked only."""
    response.headers.update(NO_STORE)
    user_id = user.id
    if not await owns_booking(db, user, ref):
        raise ApiError("not_found", "No booking with that reference on your account")
    return await details.save_details(
        db,
        request.app.state.settings,
        ref,
        traveller_id,
        payload,
        actor=BookingActor.CUSTOMER,
        by=user_id,
        today=ist_today(),
    )


@router.put(
    "/bookings/{ref}/checklist/{key}",
    operation_id="tickChecklistItem",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def put_checklist_item(
    ref: BookingRef,
    key: CheckKey,
    payload: ChecklistTick,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    response.headers.update(NO_STORE)
    if not await owns_booking(db, user, ref):
        raise ApiError("not_found", "No booking with that reference on your account")
    await details.tick_item(db, ref, key, done=payload.done, today=ist_today())


@router.put(
    "/bookings/{ref}/pack/read",
    operation_id="markTripPackRead",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={409: {"description": "The pack is locked (reason pack_locked) or closed"}},
)
async def put_pack_read(
    ref: BookingRef,
    response: Response,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    """P10: the customer opened the unlocked trip pack — recorded once (a readiness part)."""
    response.headers.update(NO_STORE)
    if not await owns_booking(db, user, ref):
        raise ApiError("not_found", "No booking with that reference on your account")
    await trip_pack.mark_read(db, ref, today=ist_today())
