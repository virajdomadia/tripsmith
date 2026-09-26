"""`quoteBooking` and `createBookingOrder` (06 C5, 04 v2 §3–§4).

A hold is a `pending` booking whose `hold_expires_at` is in the future; the
`departure_availability` view subtracts its travellers until then. Seats are never checked
outside the departure's row lock, so two orders for the last seat serialise on it and the second
sees the first's travellers. Holds lapse on their own — nothing here depends on a cron.

The Razorpay order is created after the hold commits (never a network call under the row lock),
from the server's amount. If Razorpay is down the hold we just made is released, any hold it
replaced is given back, and the visitor gets a 502: holding seats nobody can pay for would only
block the next visitor.
"""

import datetime as dt
import logging
import secrets
from typing import NamedTuple

from sqlalchemy import func, or_, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.db import constraint_name
from app.infra.razorpay import Razorpay, RazorpayError
from app.models import Booking, BookingTraveller, Departure, Package, Payment
from app.models.catalog import departure_availability
from app.models.enums import BookingStatus, PackageStatus, PaymentProvider, PaymentStatus
from app.schemas.bookings import (
    BookingContact,
    BookingOrder,
    BookingRequest,
    Quote,
    QuoteRequest,
    UnbookableReason,
)
from app.services.analytics import ist_today
from app.services.booking.freshness import refresh_quietly
from app.services.booking.payments import lock_booking, seats_short
from app.services.booking.pricing import build_quote, unbookable_reason
from app.services.enquiries import REF_ALPHABET

HOLD = dt.timedelta(minutes=10)
REF_CONSTRAINT = "uq_bookings_ref"
REF_ATTEMPTS = 5
GONE = "That trip is no longer available"
PAYMENTS_DOWN = "Payments are not reachable right now — try again in a minute, or WhatsApp us"
UNBOOKABLE_MESSAGE = {
    UnbookableReason.ON_REQUEST: "This date is priced on request — enquire and we'll quote it",
    UnbookableReason.TOO_SOON: "This date departs too soon to book online — WhatsApp us",
    UnbookableReason.SOLD_OUT: "Not enough seats left on this date for your party",
}


log = logging.getLogger(__name__)


class Released(NamedTuple):
    ref: str
    package_id: str
    hold_expires_at: dt.datetime


def make_ref() -> str:
    return "TB-" + "".join(secrets.choice(REF_ALPHABET) for _ in range(6))


def unbookable(reason: UnbookableReason) -> ApiError:
    return ApiError("conflict", UNBOOKABLE_MESSAGE[reason], reason=reason.value)


async def _load(db: AsyncSession, departure_id: str, *, lock: bool) -> tuple[Departure, Package]:
    stmt = (
        select(Departure, Package)
        .join(Package, Package.id == Departure.package_id)
        .where(Departure.id == departure_id)
    )
    if lock:
        stmt = stmt.with_for_update(of=Departure)
    row = (await db.execute(stmt)).one_or_none()
    if row is None or row[1].status != PackageStatus.LIVE:
        raise ApiError("not_found", GONE)
    return row[0], row[1]


async def _seats_left(db: AsyncSession, departure_id: str) -> int:
    return int(
        (
            await db.execute(
                select(departure_availability.c.seats_left).where(
                    departure_availability.c.departure_id == departure_id
                )
            )
        ).scalar_one()
    )


async def _deal_base(db: AsyncSession, package_id: str, *, now: dt.datetime) -> int:
    """The cheapest upcoming priced double, seats ignored — what the deal is measured from
    (see pricing.py: holds must not be able to move it). 0 when nothing is priced."""
    cheapest = (
        await db.execute(
            select(func.min(Departure.price_double_paise)).where(
                Departure.package_id == package_id,
                Departure.date >= ist_today(now),
                Departure.price_double_paise > 0,
            )
        )
    ).scalar_one_or_none()
    return int(cheapest or 0)


async def quote_booking(
    db: AsyncSession, req: QuoteRequest, *, now: dt.datetime | None = None
) -> Quote:
    """The breakdown for a party on a departure; no side effects. 404 when the trip is gone,
    409 with the reason when it cannot be booked."""
    now = now or dt.datetime.now(dt.UTC)
    dep, pkg = await _load(db, req.departure_id, lock=False)
    seats = await _seats_left(db, dep.id)
    if reason := unbookable_reason(dep, seats_left=seats, party=len(req.travellers), now=now):
        raise unbookable(reason)
    base = await _deal_base(db, pkg.id, now=now)
    return build_quote(dep, pkg, req.travellers, seats_left=seats, deal_base=base, now=now)


async def _lock_contact(db: AsyncSession, email: str, phone: str) -> None:
    """Serialise orders per email and per phone for the rest of the transaction, so two tabs
    racing each other cannot both keep a hold. Taken in sorted order, before the departure
    lock, so no two orders ever wait on each other in opposite orders."""
    for key in sorted((f"booking:{email}", f"booking:{phone}")):
        await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": key})


async def _release_holds(db: AsyncSession, email: str, phone: str) -> list[Released]:
    """One active hold per email or phone (R16): end the previous one now.

    The booking stays `pending` with its hold lapsed — exactly the state an abandoned checkout
    reaches on its own — so the seats free at once, `/cron/daily` later cancels it as
    `hold_expired`, and a payment that still lands on it goes through B4's late-capture re-check.
    `now()` is the database clock the view compares against. Returns what was released, with
    each hold's old expiry, so a Razorpay outage can put it back (`_undo_hold`).
    """
    rows = (
        await db.execute(
            select(Booking.id, Booking.ref, Booking.package_id, Booking.hold_expires_at)
            .where(
                Booking.status == BookingStatus.PENDING,
                Booking.hold_expires_at > func.now(),
                or_(Booking.contact_email == email, Booking.contact_phone == phone),
            )
            .with_for_update()
        )
    ).all()
    if rows:
        await db.execute(
            update(Booking)
            .where(Booking.id.in_([r.id for r in rows]))
            .values(hold_expires_at=func.now(), updated_at=func.now())
            .execution_options(synchronize_session=False)
        )
    return [Released(r.ref, str(r.package_id), r.hold_expires_at) for r in rows]


async def _undo_hold(
    db: AsyncSession, booking: Booking, released: list[Released], contact: BookingContact
) -> None:
    """Razorpay could not open an order: end the hold just made, and give back the holds it
    replaced — each under its departure lock, only while its old clock still runs and its seats
    are still free (another visitor may have taken them in the seconds since)."""
    try:
        await _lock_contact(db, contact.email, contact.phone)
        await lock_booking(db, booking.ref)  # departure first, as everywhere else
        await db.execute(
            update(Booking)
            .where(Booking.id == booking.id, Booking.status == BookingStatus.PENDING)
            .values(hold_expires_at=func.now(), updated_at=func.now())
            .execution_options(synchronize_session=False)
        )
        for prev in released:
            held, live = await lock_booking(db, prev.ref)
            db_now = (await db.execute(select(func.now()))).scalar_one()
            if (
                held.status != BookingStatus.PENDING
                or live
                or prev.hold_expires_at <= db_now
                or await seats_short(db, held, hold_live=False)
            ):
                continue
            await db.execute(
                update(Booking)
                .where(Booking.id == held.id, Booking.status == BookingStatus.PENDING)
                .values(hold_expires_at=prev.hold_expires_at, updated_at=func.now())
                .execution_options(synchronize_session=False)
            )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise


async def create_booking_order(
    db: AsyncSession, req: BookingRequest, razorpay: Razorpay, *, now: dt.datetime | None = None
) -> BookingOrder:
    """Hold seats for the party, then open a Razorpay order for the held amount.

    The hold is one transaction with the departure row locked throughout; a failed check rolls
    back, so a previous hold survives a party that no longer fits. The order's `payments` row
    (`created`) is what `confirm_payment` later matches the Checkout callback against.
    """
    now = now or dt.datetime.now(dt.UTC)
    contact = req.contact
    try:
        await _lock_contact(db, contact.email, contact.phone)
        dep, pkg = await _load(db, req.departure_id, lock=True)
        released = await _release_holds(db, contact.email, contact.phone)
        seats = await _seats_left(db, dep.id)
        party = len(req.travellers)
        if reason := unbookable_reason(dep, seats_left=seats, party=party, now=now):
            raise unbookable(reason)
        quote = build_quote(
            dep,
            pkg,
            req.as_quote().travellers,
            seats_left=seats - party,
            deal_base=await _deal_base(db, pkg.id, now=now),
            now=now,
        )

        booking: Booking | None = None
        for _attempt in range(REF_ATTEMPTS):
            candidate = Booking(
                ref=make_ref(),
                package_id=pkg.id,
                departure_id=dep.id,
                status=BookingStatus.PENDING,
                hold_expires_at=now + HOLD,
                contact_name=contact.name,
                contact_phone=contact.phone,
                contact_email=contact.email,
                quote=quote.model_dump(mode="json", by_alias=True),
                total_paise=quote.total_paise,
                travellers=[
                    BookingTraveller(name=t.name, age=t.age, occupancy=t.occupancy, position=i)
                    for i, t in enumerate(req.travellers)
                ],
            )
            try:
                # A savepoint: a ref collision must not drop the locks taken above.
                async with db.begin_nested():
                    db.add(candidate)
            except IntegrityError as exc:
                if REF_CONSTRAINT in constraint_name(exc):
                    continue  # 1 in 2^30 — draw again
                raise
            booking = candidate
            break
        if booking is None:
            raise RuntimeError("Could not draw a unique booking ref")
        await db.commit()
    except BaseException:
        await db.rollback()
        raise

    touched = {pkg.id, *(r.package_id for r in released)}
    try:
        order_id = await razorpay.create_order(
            amount_paise=booking.total_paise, receipt=booking.ref
        )
    except RazorpayError:
        log.exception("Razorpay order for booking %s failed; undoing its hold", booking.ref)
        await _undo_hold(db, booking, released, contact)
        await refresh_quietly(db, touched, after=f"releasing booking {booking.ref}")
        raise ApiError("internal", PAYMENTS_DOWN, status=502) from None

    db.add(
        Payment(
            booking_id=booking.id,
            provider=PaymentProvider.RAZORPAY,
            razorpay_order_id=order_id,
            amount_paise=booking.total_paise,
            status=PaymentStatus.CREATED,
        )
    )
    await db.commit()
    await refresh_quietly(db, touched, after=f"booking {booking.ref}")
    return BookingOrder(
        booking_ref=booking.ref,
        order_id=order_id,
        key_id=razorpay.key_id,
        amount_paise=booking.total_paise,
        hold_expires_at=booking.hold_expires_at,
        quote=quote,
    )
