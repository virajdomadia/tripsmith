"""The owner's answer to a cancellation request (R19, B11) —
`POST /admin/cancellations/{id}/resolve`.

- **Approve** → the booking is `cancelled` with `cancellation_approved` and its seats are free at
  once (the view stops counting a cancelled booking); the request is `approved` with the owner's
  note and the refund agreed. A refund above ₹0 raises `refund_needed`, so the booking lands in
  the desk's refund tab until 'Refund made' records exactly that amount. Refunds themselves stay
  by hand in the Razorpay dashboard.
- **Reject** → the booking is untouched; the request is `rejected` with the owner's note.

Either way the customer is emailed (the owner made the decision and gets nothing). The policy
tier is read at the day the customer asked — the day B9's acknowledgement quoted it — not at the
day the owner answers, so a slow answer never costs the customer a tier.
"""

import logging

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import Booking, BookingCancellation
from app.models.enums import BookingStatus, CancellationStatus, CancelReason
from app.schemas.admin_bookings import AdminBooking, ResolveCancellationInput
from app.services.account import CANCELLABLE
from app.services.booking.after_capture import Notify
from app.services.booking.desk import get_booking
from app.services.booking.freshness import refresh_quietly
from app.services.booking.payments import lock_booking
from app.services.booking.voucher import load_booking_facts
from app.services.email.cancellations import send_resolution_email
from app.services.format import inr

log = logging.getLogger(__name__)

NOT_FOUND = "Cancellation request not found"
STATUS_WORD = {BookingStatus.CANCELLED: "cancelled", BookingStatus.COMPLETED: "completed"}


async def resolve_cancellation(
    db: AsyncSession, id: str, payload: ResolveCancellationInput, notify: Notify | None
) -> AdminBooking:
    approve = payload.decision == "approve"
    ref = (
        await db.execute(
            select(Booking.ref)
            .join(BookingCancellation, BookingCancellation.booking_id == Booking.id)
            .where(BookingCancellation.id == id)
        )
    ).scalar_one_or_none()
    if ref is None:
        raise ApiError("not_found", NOT_FOUND)
    try:
        # Departure, then booking (lock_booking's order), then the request: a double click and a
        # capture on the same booking serialise here.
        booking, _ = await lock_booking(db, ref)
        row = (
            await db.execute(
                select(BookingCancellation)
                .where(BookingCancellation.id == id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        if row.status != CancellationStatus.REQUESTED:
            raise ApiError(
                "conflict", f"This request was already {row.status.value}", reason="resolved"
            )
        refund = payload.refund_paise if approve else None
        if approve:
            if booking.status not in CANCELLABLE:
                word = STATUS_WORD.get(booking.status, booking.status.value)
                raise ApiError(
                    "conflict",
                    f"This booking is {word} — the request can only be rejected",
                    reason="not_active",
                )
            assert refund is not None  # ResolveCancellationInput requires it on approve
            if refund > booking.paid_paise:
                raise ApiError(
                    "validation",
                    "The refund can't be more than was paid",
                    field_errors={
                        "refundPaise": f"At most {inr(booking.paid_paise // 100)} — what was paid"
                    },
                )
            await db.execute(
                update(Booking)
                .where(Booking.id == booking.id, Booking.status.in_(CANCELLABLE))
                .values(
                    status=BookingStatus.CANCELLED,
                    cancel_reason=CancelReason.CANCELLATION_APPROVED,
                    refund_needed=Booking.refund_needed | (refund > 0),
                    updated_at=func.now(),
                )
                .execution_options(synchronize_session=False)
            )
        row.status = CancellationStatus.APPROVED if approve else CancellationStatus.REJECTED
        row.refund_note = payload.note
        row.refund_paise = refund
        row.resolved_at = func.now()
        package_id = booking.package_id
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    if approve:  # the seats just came back: "from ₹" and the package page may change
        await refresh_quietly(db, {package_id}, after=f"approving the cancellation of {ref}")
    if notify is not None:
        try:
            facts = await load_booking_facts(db, ref)
        finally:
            await db.rollback()
        if facts is not None:
            await send_resolution_email(
                notify.sender,
                notify.settings,
                facts,
                approved=approve,
                note=payload.note,
                refund_paise=refund,
            )
    return await get_booking(db, ref)
