"""The owner's "Send details link" (R49, P9b): who still owes which details, the lock date, and a
link to the booking page's details cards.

Same rules as the booking emails: demo mode redirects the customer's copy to the owner's inbox,
the send lands in the booking's history, and nothing here raises. It names fields, never values,
so no ID number can ride in it.
"""

import datetime as dt
import logging
from dataclasses import dataclass

import sentry_sdk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import Settings
from app.errors import ApiError
from app.infra.email import EmailMessage, EmailSender
from app.models import Booking, Departure, Package
from app.services.booking import details
from app.services.booking.after_capture import Notify
from app.services.booking.voucher import BookingFacts, load_booking_facts
from app.services.email.bookings import _message, _vars, deliver
from app.services.format import long_date


@dataclass(frozen=True)
class Owed:
    name: str
    fields: str  # "ID · emergency contact"


log = logging.getLogger(__name__)


def render_details_link(
    facts: BookingFacts, settings: Settings, *, owed: list[Owed], locks_on: dt.date
) -> list[tuple[str, EmailMessage]]:
    vars = {
        **_vars(facts, settings),
        "url": f"{settings.site_url.rstrip('/')}/account/bookings/{facts.ref}#details",
        "owed": owed,
        "locks_on": long_date(locks_on),
    }
    subject = f"A few traveller details for {facts.package_name} — {facts.ref}"
    return [("customer", _message(facts.lead_email, subject, "details_link", vars))]


async def send_details_link(
    sender: EmailSender,
    settings: Settings,
    facts: BookingFacts,
    *,
    owed: list[Owed],
    locks_on: dt.date,
    db: AsyncSession | None = None,
) -> None:
    try:
        labelled = render_details_link(facts, settings, owed=owed, locks_on=locks_on)
    except Exception as exc:
        log.exception("Could not render the details link email for %s", facts.ref)
        sentry_sdk.capture_exception(exc)
        return
    await deliver(sender, settings, labelled, ref=facts.ref, what="details link", db=db)


async def email_details_link(db: AsyncSession, ref: str, notify: Notify, *, today: dt.date) -> None:
    """The desk's button: refused unless the booking is paid, before the lock, with someone's
    details missing. The send lands in the booking's history (`deliver`)."""
    booking = (
        await db.execute(
            select(Booking).where(Booking.ref == ref).options(selectinload(Booking.travellers))
        )
    ).scalar_one_or_none()
    if booking is None:
        raise ApiError("not_found", "Booking not found")
    pkg = (await db.execute(select(Package).where(Package.id == booking.package_id))).scalar_one()
    departs = (
        await db.execute(select(Departure.date).where(Departure.id == booking.departure_id))
    ).scalar_one()
    block = await details.details_block(
        db, booking, pkg, departs, departs + dt.timedelta(days=pkg.nights), today
    )
    if booking.status not in details.OPEN_STATUSES or block.state != "open":
        raise ApiError(
            "conflict", "The details can't be filled in online any more", reason="not_open"
        )
    left = details.owed(block)
    if not left:
        raise ApiError("conflict", "Every traveller's details are in", reason="complete")
    facts = await load_booking_facts(db, ref)
    assert facts is not None
    owed = [
        Owed(name=name, fields=" · ".join(details.FIELD_WORDS[f] for f in fields))
        for name, fields in left
    ]
    await send_details_link(
        notify.sender, notify.settings, facts, owed=owed, locks_on=block.locks_on, db=db
    )
    await db.commit()
