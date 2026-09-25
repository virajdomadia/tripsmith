"""The voucher's facts and its 30-minute signed link (R17, 04 v2 "Voucher").

The voucher is rendered on demand from the booking as it stands — never stored, so there is no
Blob object to go stale or leak. Two ways in:

- `GET /bookings/{ref}/voucher.pdf?exp=&sig=` — the link the success sheet shows, so a visitor
  who is not signed in can download it straight after paying. `sig` is an HMAC over the ref and
  the expiry under `SESSION_SECRET` (prefixed, so it can never collide with the key's other
  uses); valid 30 minutes. Only a caller who proved the payment gets one: `/confirm` (Razorpay's
  signature) or `/sync` with the booking's order id.
- `GET /account/bookings/{ref}/voucher.pdf` — a signed-in owner in B7; B8 adds the customer the
  booking belongs to.

Only a confirmed (or completed) booking has a voucher.
"""

import datetime as dt
import hashlib
import hmac
import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Booking, Departure, Package, Payment
from app.models.enums import BookingStatus, Occupancy, PaymentStatus

LINK_SECONDS = 30 * 60
HAS_VOUCHER = (BookingStatus.CONFIRMED, BookingStatus.COMPLETED)
OCCUPANCY_LABEL = {
    Occupancy.DOUBLE: "Double room",
    Occupancy.TRIPLE: "Triple room",
    Occupancy.SINGLE: "Single room",
    Occupancy.CHILD: "Child 5–11",
}


# --- signed link -------------------------------------------------------------------------------


def _signature(ref: str, exp: int, secret: str) -> str:
    return hmac.new(secret.encode(), f"voucher:{ref}:{exp}".encode(), hashlib.sha256).hexdigest()


def voucher_path(ref: str, secret: str | None, *, now: float | None = None) -> str | None:
    """The api-relative signed path, valid `LINK_SECONDS`; None without a `SESSION_SECRET`
    (local dev), so no link is ever signed with an empty key."""
    if not secret:
        return None
    exp = int(now if now is not None else time.time()) + LINK_SECONDS
    return f"/bookings/{ref}/voucher.pdf?exp={exp}&sig={_signature(ref, exp, secret)}"


def link_is_valid(
    ref: str, exp: int, sig: str, secret: str | None, *, now: float | None = None
) -> bool:
    if not secret:
        return False
    if exp < int(now if now is not None else time.time()):
        return False
    return hmac.compare_digest(sig.encode(), _signature(ref, exp, secret).encode())


# --- facts -------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Traveller:
    name: str
    age: int
    room: str


@dataclass(frozen=True)
class Hotel:
    name: str
    city: str
    stars: int
    nights: int


@dataclass(frozen=True)
class BookingFacts:
    """Everything the voucher and the booking emails print — plain values, read in one short
    transaction and ended before the render and the sends."""

    ref: str
    status: BookingStatus
    package_name: str
    package_slug: str
    destination: str
    nights: int
    days: int
    departure_city: str
    departs: dt.date
    returns: dt.date
    travellers: tuple[Traveller, ...]
    hotels: tuple[Hotel, ...]
    inclusions: tuple[str, ...]
    lead_name: str
    lead_phone: str
    lead_email: str
    total_paise: int
    paid_paise: int
    payment_ids: tuple[str, ...]  # captured, oldest first
    booked_at: dt.datetime

    @property
    def first_name(self) -> str:
        return self.lead_name.split()[0]

    @property
    def party(self) -> str:
        n = len(self.travellers)
        return f"{n} traveller{'s' if n != 1 else ''}"


async def load_booking_facts(db: AsyncSession, ref: str) -> BookingFacts | None:
    booking = (
        await db.execute(
            select(Booking)
            .where(Booking.ref == ref)
            .options(selectinload(Booking.travellers))
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if booking is None:
        return None
    package = (
        await db.execute(
            select(Package)
            .where(Package.id == booking.package_id)
            .options(selectinload(Package.destination))
        )
    ).scalar_one()
    departs = (
        await db.execute(select(Departure.date).where(Departure.id == booking.departure_id))
    ).scalar_one()
    paid_ids = (
        await db.execute(
            select(Payment.razorpay_payment_id)
            .where(Payment.booking_id == booking.id, Payment.status == PaymentStatus.CAPTURED)
            .order_by(Payment.created_at)
        )
    ).scalars()
    return BookingFacts(
        ref=booking.ref,
        status=booking.status,
        package_name=package.name,
        package_slug=package.slug,
        destination=package.destination.name,
        nights=package.nights,
        days=package.days,
        departure_city=package.departure_city,
        departs=departs,
        returns=departs + dt.timedelta(days=package.nights),
        travellers=tuple(
            Traveller(t.name, t.age, OCCUPANCY_LABEL[t.occupancy]) for t in booking.travellers
        ),
        hotels=tuple(
            Hotel(
                str(h.get("name", "")),
                str(h.get("city", "")),
                int(h.get("stars", 0) or 0),
                int(h.get("nights", 0) or 0),
            )
            for h in package.hotels
        ),
        inclusions=tuple(package.inclusions),
        lead_name=booking.contact_name,
        lead_phone=booking.contact_phone,
        lead_email=booking.contact_email,
        total_paise=booking.total_paise,
        paid_paise=booking.paid_paise,
        payment_ids=tuple(p for p in paid_ids.all() if p),
        booked_at=booking.created_at,
    )


async def booking_has_order(db: AsyncSession, ref: str, order_id: str) -> bool:
    """Whether `order_id` is one of the booking's Razorpay orders (read-only; ends its read)."""
    try:
        found = (
            await db.execute(
                select(Payment.id)
                .join(Booking, Booking.id == Payment.booking_id)
                .where(Booking.ref == ref, Payment.razorpay_order_id == order_id)
                .limit(1)
            )
        ).scalar_one_or_none()
    finally:
        await db.rollback()
    return found is not None
