"""My trips (R18, R19): which bookings a signed-in customer owns, the list and the detail they
see, and their cancellation request.

A booking belongs to a customer when it is attached to their user row (`user_id`, set when they
verify their email) or when it is unattached and was made with that same, verified email — so a
booking made later while signed out shows up at once, with no second sign-in. The email is
proven by the code the customer typed; `contact_email` is stored lower-cased, as `users.email`.
The owner reads every booking through the admin, never through here.

A cancellation is only ever *requested* here (B9): the booking stays confirmed and keeps its
seats until the owner approves it (B11). Only a paid booking whose departure is today or later
can be asked about, once.
"""

import datetime as dt

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import ApiError
from app.models import (
    Booking,
    BookingCancellation,
    BookingTraveller,
    Departure,
    Destination,
    Package,
    PackageImage,
    Review,
    User,
)
from app.models.enums import BookingStatus, PaymentStatus
from app.schemas.account import (
    AccountBooking,
    AccountBookingDetail,
    AccountCancellation,
    AccountPayment,
    AccountTraveller,
)
from app.schemas.bookings import Quote
from app.schemas.reviews import AccountReview, ReviewState
from app.services.booking.voucher import HAS_VOUCHER

CANCELLABLE = (BookingStatus.CONFIRMED, BookingStatus.PARTIALLY_PAID)
ALREADY_ASKED = "You've already asked to cancel this booking — we reply within a day"
NOT_PAID = "This booking was never paid, so there is nothing to cancel"
DEPARTED = "This trip has already left — WhatsApp us if something went wrong"
NOT_ACTIVE = "This booking is no longer active"


def owned_by(user: User) -> ColumnElement[bool]:
    return or_(
        Booking.user_id == user.id,
        and_(Booking.user_id.is_(None), Booking.contact_email == user.email),
    )


async def owns_booking(db: AsyncSession, user: User, ref: str) -> bool:
    found = await db.execute(select(Booking.id).where(Booking.ref == ref, owned_by(user)))
    return found.first() is not None


def account_review(r: Review) -> AccountReview:
    return AccountReview(
        rating=r.rating,
        text=r.text,
        state=ReviewState.of(r.approved, r.moderated_at),
        created_at=r.created_at,
    )


def can_review(status: BookingStatus, *, reviewed: bool) -> bool:
    """B13: only a completed trip (the daily sweep marks it the day after departure), once."""
    return status == BookingStatus.COMPLETED and not reviewed


def can_request_cancellation(
    status: BookingStatus, departs: dt.date, asked: bool, today: dt.date
) -> bool:
    return status in CANCELLABLE and departs >= today and not asked


async def list_bookings(db: AsyncSession, user: User) -> list[AccountBooking]:
    """Newest first. Every status, a lapsed checkout included — the customer should see the
    attempt they paid nothing for rather than wonder where it went."""
    travellers = (
        select(func.count())
        .where(BookingTraveller.booking_id == Booking.id)
        .correlate(Booking)
        .scalar_subquery()
    )
    rows = await db.execute(
        select(
            Booking.ref,
            Booking.status,
            Booking.hold_expires_at,
            Booking.total_paise,
            Booking.paid_paise,
            Booking.created_at,
            Package.name,
            Package.slug,
            Destination.name,
            Departure.date,
            travellers,
            PackageImage.url,
            BookingCancellation.status,
            Review.rating,
        )
        .join(Package, Package.id == Booking.package_id)
        .join(Destination, Destination.id == Package.destination_id)
        .join(Departure, Departure.id == Booking.departure_id)
        .outerjoin(PackageImage, PackageImage.id == Package.cover_image_id)
        .outerjoin(BookingCancellation, BookingCancellation.booking_id == Booking.id)
        .outerjoin(Review, Review.booking_id == Booking.id)
        .where(owned_by(user))
        .order_by(Booking.created_at.desc())
    )
    return [
        AccountBooking(
            ref=ref,
            status=status,
            hold_expires_at=hold,
            total_paise=total,
            paid_paise=paid,
            booked_at=booked,
            package_name=pkg,
            package_slug=slug,
            destination=dest,
            departs=departs,
            travellers=count,
            has_voucher=status in HAS_VOUCHER,
            cover_url=cover,
            cancellation=asked,
            review_rating=stars,
            can_review=can_review(status, reviewed=stars is not None),
        )
        for (
            ref,
            status,
            hold,
            total,
            paid,
            booked,
            pkg,
            slug,
            dest,
            departs,
            count,
            cover,
            asked,
            stars,
        ) in rows
    ]


async def get_booking(
    db: AsyncSession, user: User, ref: str, *, today: dt.date
) -> AccountBookingDetail | None:
    booking = (
        await db.execute(
            select(Booking)
            .where(Booking.ref == ref, owned_by(user))
            .options(
                selectinload(Booking.travellers),
                selectinload(Booking.cancellation),
                selectinload(Booking.payments),
            )
        )
    ).scalar_one_or_none()
    if booking is None:
        return None
    pkg = (
        await db.execute(
            select(Package)
            .where(Package.id == booking.package_id)
            .options(selectinload(Package.destination), selectinload(Package.cover_image))
        )
    ).scalar_one()
    departs = (
        await db.execute(select(Departure.date).where(Departure.id == booking.departure_id))
    ).scalar_one()
    asked = booking.cancellation
    review = (
        await db.execute(select(Review).where(Review.booking_id == booking.id))
    ).scalar_one_or_none()
    return AccountBookingDetail(
        ref=booking.ref,
        status=booking.status,
        hold_expires_at=booking.hold_expires_at,
        booked_at=booking.created_at,
        today=today,
        package_name=pkg.name,
        package_slug=pkg.slug,
        destination=pkg.destination.name,
        nights=pkg.nights,
        days=pkg.days,
        departure_city=pkg.departure_city,
        departs=departs,
        returns=departs + dt.timedelta(days=pkg.nights),
        cover_url=pkg.cover_image.url if pkg.cover_image else None,
        travellers=[
            AccountTraveller(name=t.name, age=t.age, occupancy=t.occupancy)
            for t in booking.travellers
        ],
        quote=Quote.model_validate(booking.quote),
        total_paise=booking.total_paise,
        paid_paise=booking.paid_paise,
        payments=[
            AccountPayment(
                provider=p.provider,
                reference=p.razorpay_payment_id,
                amount_paise=p.amount_paise,
                paid_at=p.updated_at,
            )
            for p in booking.payments
            if p.status == PaymentStatus.CAPTURED
        ],
        lead_name=booking.contact_name,
        lead_phone=booking.contact_phone,
        lead_email=booking.contact_email,
        has_voucher=booking.status in HAS_VOUCHER,
        cancellation=_cancellation_out(asked) if asked else None,
        can_request_cancellation=can_request_cancellation(
            booking.status, departs, asked is not None, today
        ),
        review=account_review(review) if review else None,
        can_review=can_review(booking.status, reviewed=review is not None),
    )


def _cancellation_out(row: BookingCancellation) -> AccountCancellation:
    return AccountCancellation(
        status=row.status,
        reason=row.reason,
        requested_at=row.created_at,
        refund_note=row.refund_note,
        refund_paise=row.refund_paise,
        resolved_at=row.resolved_at,
    )


async def request_cancellation(
    db: AsyncSession, user: User, ref: str, reason: str, *, today: dt.date
) -> AccountCancellation:
    """Record the request under a row lock on the booking — a double submit finds the first
    request, not a unique-key 500. 404 for a booking that is not this customer's."""
    booking = (
        await db.execute(
            select(Booking)
            .where(Booking.ref == ref, owned_by(user))
            .options(selectinload(Booking.cancellation))
            .with_for_update(of=Booking)
        )
    ).scalar_one_or_none()
    if booking is None:
        await db.rollback()
        raise ApiError("not_found", "No booking with that reference on your account")
    departs = (
        await db.execute(select(Departure.date).where(Departure.id == booking.departure_id))
    ).scalar_one()
    refusal = _refusal(booking, departs, today)
    if refusal is not None:
        await db.rollback()
        code, message = refusal
        raise ApiError("conflict", message, reason=code)
    row = BookingCancellation(booking_id=booking.id, reason=reason)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:  # a request from another session got in first
        await db.rollback()
        raise ApiError("conflict", ALREADY_ASKED, reason="already_requested") from None
    await db.refresh(row)
    return _cancellation_out(row)


def _refusal(booking: Booking, departs: dt.date, today: dt.date) -> tuple[str, str] | None:
    if booking.cancellation is not None:
        return "already_requested", ALREADY_ASKED
    if booking.status == BookingStatus.PENDING:
        return "not_paid", NOT_PAID
    if booking.status not in CANCELLABLE:
        return "not_active", NOT_ACTIVE
    if departs < today:
        return "departed", DEPARTED
    return None
