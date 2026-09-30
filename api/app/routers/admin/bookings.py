"""`/admin/bookings*` and `/admin/departures/{id}/manifest` (R22, B10): the owner's desk.

Same shape as the enquiry inbox (routers/admin/enquiries.py): a plain `/admin` prefix so the
export can sit at `/admin/bookings.csv`, beside the collection. There is no free status change
(`PATCH …/status` was dropped from 06 on 2026-09-26): every move goes through a guarded path —
mark paid, release, send a refund or record an offline one (P13), answer a cancellation request
(B11), settle or extend a deposit booking's balance (P5), or the daily sweep.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.infra.razorpay import Razorpay
from app.models import User
from app.schemas.admin_bookings import (
    AdminBooking,
    BookingFilters,
    BookingList,
    ExtendDueInput,
    Manifest,
    MarkPaidInput,
    RefundMadeInput,
    ResolveCancellationInput,
)
from app.schemas.counter import EditTravellersInput
from app.schemas.extras import RemoveAddonInput
from app.services.auth.deps import require_owner
from app.services.booking import balance, counter, desk, extras, links, refunds, resolve
from app.services.booking.after_capture import Notify

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_owner)])

Db = Annotated[AsyncSession, Depends(get_session)]
Filters = Annotated[BookingFilters, Query()]
Owner = Annotated[User, Depends(require_owner)]  # the router already requires it; cached


@router.get("/bookings", operation_id="listAdminBookings", response_model_by_alias=True)
async def list_route(response: Response, db: Db, filters: Filters) -> BookingList:
    response.headers.update(NO_STORE)
    return await desk.list_bookings(db, filters)


@router.get(
    "/bookings.csv",
    operation_id="exportBookingsCsv",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/csv": {}}, "description": "The filtered desk as CSV"}},
)
async def export_route(db: Db, filters: Filters) -> StreamingResponse:
    records = await desk.csv_records(db, filters)
    return StreamingResponse(
        desk.bookings_csv(records),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{desk.csv_filename()}"',
            **NO_STORE,
        },
    )


@router.get("/bookings/{ref}", operation_id="getAdminBooking", response_model_by_alias=True)
async def get_route(ref: str, response: Response, db: Db) -> AdminBooking:
    response.headers.update(NO_STORE)
    return await desk.get_booking(db, ref)


@router.post(
    "/bookings/{ref}/mark-paid", operation_id="markBookingPaid", response_model_by_alias=True
)
async def mark_paid_route(
    ref: str,
    payload: MarkPaidInput,
    request: Request,
    response: Response,
    db: Db,
    owner: Owner,
) -> AdminBooking:
    """409 `seats_short` with the shortfall when the party no longer fits; nothing recorded."""
    response.headers.update(NO_STORE)
    notify = Notify.of(request.app.state)
    return await desk.mark_paid(db, ref, payload.reference, notify, by=owner.id)


@router.post(
    "/bookings/{ref}/balance-paid",
    operation_id="markBalancePaid",
    response_model_by_alias=True,
)
async def balance_paid_route(
    ref: str,
    payload: MarkPaidInput,
    request: Request,
    response: Response,
    db: Db,
    owner: Owner,
) -> AdminBooking:
    """P5: record a deposit booking's whole balance paid offline (cash, UPI, bank). The booking
    is confirmed and the invoice issued; the customer gets the paid-in-full email. 409
    `not_on_deposit` when there is no balance to settle."""
    response.headers.update(NO_STORE)
    await balance.mark_balance_paid(
        db, ref, payload.reference, Notify.of(request.app.state), by=owner.id
    )
    return await desk.get_booking(db, ref)


@router.post(
    "/bookings/{ref}/balance-due",
    operation_id="extendBalanceDue",
    response_model_by_alias=True,
)
async def balance_due_route(
    ref: str, payload: ExtendDueInput, response: Response, db: Db, owner: Owner
) -> AdminBooking:
    """P5: move the balance's due day later, up to the departure day (logged). The reminders
    re-arm for the new day."""
    response.headers.update(NO_STORE)
    await balance.extend_due(db, ref, payload.due_on, by=owner.id)
    return await desk.get_booking(db, ref)


def _razorpay(request: Request) -> Razorpay:
    rzp: Razorpay | None = getattr(request.app.state, "razorpay", None)
    if rzp is None:
        raise ApiError("internal", "Razorpay isn't set up here", status=503)
    return rzp


@router.post(
    "/bookings/{ref}/link/check", operation_id="checkPaymentLink", response_model_by_alias=True
)
async def link_check_route(ref: str, request: Request, response: Response, db: Db) -> AdminBooking:
    """P18b: ask Razorpay whether the booking's payment link was paid, and apply it through
    the one capture path (as the webhook would)."""
    response.headers.update(NO_STORE)
    await links.sync_link(db, ref, _razorpay(request), Notify.of(request.app.state))
    return await desk.get_booking(db, ref)


@router.post(
    "/bookings/{ref}/link/cancel", operation_id="cancelPaymentLink", response_model_by_alias=True
)
async def link_cancel_route(
    ref: str, request: Request, response: Response, db: Db, owner: Owner
) -> AdminBooking:
    """P18b: cancel the link at Razorpay, then release the seats. 409 `link_paid` when the
    customer paid it meanwhile (the booking is confirmed instead), `no_link` when none is open."""
    response.headers.update(NO_STORE)
    await links.cancel_link(db, ref, _razorpay(request), Notify.of(request.app.state), by=owner.id)
    return await desk.get_booking(db, ref)


@router.post(
    "/bookings/{ref}/link/email", operation_id="emailPaymentLink", response_model_by_alias=True
)
async def link_email_route(ref: str, request: Request, response: Response, db: Db) -> AdminBooking:
    """P18b: email the open link to the customer (logged in the history)."""
    response.headers.update(NO_STORE)
    await links.email_link(db, ref, Notify.of(request.app.state))
    return await desk.get_booking(db, ref)


@router.put(
    "/bookings/{ref}/travellers",
    operation_id="editBookingTravellers",
    response_model_by_alias=True,
)
async def travellers_route(
    ref: str, payload: EditTravellersInput, response: Response, db: Db, owner: Owner
) -> AdminBooking:
    """P18: names and ages, in the booking's order (details taken later at the counter). A
    child's age stays inside the child rate; the rooms stay as booked. Logged."""
    response.headers.update(NO_STORE)
    await counter.edit_travellers(db, ref, payload, by=owner.id)
    return await desk.get_booking(db, ref)


@router.post(
    "/bookings/{ref}/release", operation_id="releaseBookingHold", response_model_by_alias=True
)
async def release_route(ref: str, response: Response, db: Db, owner: Owner) -> AdminBooking:
    response.headers.update(NO_STORE)
    return await desk.release_hold(db, ref, by=owner.id)


@router.post(
    "/bookings/{ref}/refund", operation_id="sendBookingRefund", response_model_by_alias=True
)
async def send_refund_route(
    ref: str, payload: RefundMadeInput, request: Request, response: Response, db: Db, owner: Owner
) -> AdminBooking:
    """ "Send refund" (P13): refund through Razorpay whatever is owed now, and resend anything
    that never reached Razorpay (same idempotency key). 409 `no_refund` when there is nothing
    to send. The answer shows where each refund stands."""
    response.headers.update(NO_STORE)
    await refunds.send_owed(
        db, ref, getattr(request.app.state, "razorpay", None), by=owner.id, note=payload.note
    )
    return await desk.get_booking(db, ref)


@router.post(
    "/bookings/{ref}/addons/{addon_id}/remove",
    operation_id="removeBookingAddon",
    response_model_by_alias=True,
)
async def remove_addon_route(
    ref: str,
    addon_id: str,
    payload: RemoveAddonInput,
    request: Request,
    response: Response,
    db: Db,
    owner: Owner,
) -> AdminBooking:
    """P8b: take an add-on off a confirmed booking and refund it in full through the one refund
    function (credit note included). 409 once taken off, or on a booking not confirmed."""
    response.headers.update(NO_STORE)
    await extras.remove_addon(
        db,
        ref,
        addon_id,
        by=owner.id,
        note=payload.note,
        razorpay=getattr(request.app.state, "razorpay", None),
    )
    return await desk.get_booking(db, ref)


@router.post(
    "/bookings/{ref}/refund-made", operation_id="recordBookingRefund", response_model_by_alias=True
)
async def refund_route(
    ref: str, payload: RefundMadeInput, response: Response, db: Db, owner: Owner
) -> AdminBooking:
    """ "Refund made (offline)": the owner handed back an offline payment's share. 409
    `no_refund` when no offline refund is waiting."""
    response.headers.update(NO_STORE)
    await refunds.record_by_hand(db, ref, payload.note, by=owner.id)
    return await desk.get_booking(db, ref)


@router.post(
    "/cancellations/{id}/resolve",
    operation_id="resolveCancellation",
    response_model_by_alias=True,
)
async def resolve_route(
    id: str,
    payload: ResolveCancellationInput,
    request: Request,
    response: Response,
    db: Db,
    owner: Owner,
) -> AdminBooking:
    """Approve (the booking is cancelled, its seats freed, the agreed refund sent) or reject
    (the booking stands). The customer is emailed either way. 409 `resolved` when already
    answered, `not_active` when approving a booking that no longer holds its seats."""
    response.headers.update(NO_STORE)
    notify = Notify.of(request.app.state)
    return await resolve.resolve_cancellation(db, id, payload, notify, by=owner.id)


@router.get(
    "/departures/{id}/manifest", operation_id="getDepartureManifest", response_model_by_alias=True
)
async def manifest_route(id: str, response: Response, db: Db) -> Manifest:
    response.headers.update(NO_STORE)
    return await desk.manifest(db, id)
