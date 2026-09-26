"""`/admin/bookings*` and `/admin/departures/{id}/manifest` (R22, B10): the owner's desk.

Same shape as the enquiry inbox (routers/admin/enquiries.py): a plain `/admin` prefix so the
export can sit at `/admin/bookings.csv`, beside the collection. There is no free status change
(`PATCH …/status` was dropped from 06 on 2026-09-26): every move goes through a guarded path —
mark paid, release, record a refund, answer a cancellation request (B11), or the daily sweep.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.schemas.admin_bookings import (
    AdminBooking,
    BookingFilters,
    BookingList,
    Manifest,
    MarkPaidInput,
    RefundMadeInput,
    ResolveCancellationInput,
)
from app.services.auth.deps import require_owner
from app.services.booking import desk, resolve
from app.services.booking.after_capture import Notify

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_owner)])

Db = Annotated[AsyncSession, Depends(get_session)]
Filters = Annotated[BookingFilters, Query()]


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
    ref: str, payload: MarkPaidInput, request: Request, response: Response, db: Db
) -> AdminBooking:
    """409 `seats_short` with the shortfall when the party no longer fits; nothing recorded."""
    response.headers.update(NO_STORE)
    notify = Notify(request.app.state.email_sender, request.app.state.settings)
    return await desk.mark_paid(db, ref, payload.reference, notify)


@router.post(
    "/bookings/{ref}/release", operation_id="releaseBookingHold", response_model_by_alias=True
)
async def release_route(ref: str, response: Response, db: Db) -> AdminBooking:
    response.headers.update(NO_STORE)
    return await desk.release_hold(db, ref)


@router.post(
    "/bookings/{ref}/refund-made", operation_id="recordBookingRefund", response_model_by_alias=True
)
async def refund_route(
    ref: str, payload: RefundMadeInput, response: Response, db: Db
) -> AdminBooking:
    response.headers.update(NO_STORE)
    return await desk.record_refund(db, ref, payload.note)


@router.post(
    "/cancellations/{id}/resolve",
    operation_id="resolveCancellation",
    response_model_by_alias=True,
)
async def resolve_route(
    id: str, payload: ResolveCancellationInput, request: Request, response: Response, db: Db
) -> AdminBooking:
    """Approve (the booking is cancelled, its seats freed, the agreed refund flagged) or reject
    (the booking stands). The customer is emailed either way. 409 `resolved` when already
    answered, `not_active` when approving a booking that no longer holds its seats."""
    response.headers.update(NO_STORE)
    notify = Notify(request.app.state.email_sender, request.app.state.settings)
    return await resolve.resolve_cancellation(db, id, payload, notify)


@router.get(
    "/departures/{id}/manifest", operation_id="getDepartureManifest", response_model_by_alias=True
)
async def manifest_route(id: str, response: Response, db: Db) -> Manifest:
    response.headers.update(NO_STORE)
    return await desk.manifest(db, id)
