"""My trips (R18): which bookings a signed-in customer owns, and the list they see.

A booking belongs to a customer when it is attached to their user row (`user_id`, set when they
verify their email) or when it is unattached and was made with that same, verified email — so a
booking made later while signed out shows up at once, with no second sign-in. The email is
proven by the code the customer typed; `contact_email` is stored lower-cased, as `users.email`.
The owner reads every booking through the admin, never through here.
"""

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingTraveller, Departure, Destination, Package, User
from app.schemas.account import AccountBooking
from app.services.booking.voucher import HAS_VOUCHER


def owned_by(user: User) -> ColumnElement[bool]:
    return or_(
        Booking.user_id == user.id,
        and_(Booking.user_id.is_(None), Booking.contact_email == user.email),
    )


async def owns_booking(db: AsyncSession, user: User, ref: str) -> bool:
    found = await db.execute(select(Booking.id).where(Booking.ref == ref, owned_by(user)))
    return found.first() is not None


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
        )
        .join(Package, Package.id == Booking.package_id)
        .join(Destination, Destination.id == Package.destination_id)
        .join(Departure, Departure.id == Booking.departure_id)
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
        )
        for (ref, status, hold, total, paid, booked, pkg, slug, dest, departs, count) in rows
    ]
