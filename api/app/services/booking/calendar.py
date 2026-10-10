"""Add to calendar (R48, P10): a Google Calendar link and an `.ics` file for the trip.

The event is all-day, from the departure date to the last day of the trip (iCalendar's end date
is exclusive: departure + `days`), at the meeting place (the destination when none is set). Its
UID is the booking's — `<ref>@tripsmith.virajdomadia.com` — and its SEQUENCE rises with the
booking's `updated_at`, so after a date change the new `.ics` replaces the event in Apple and
Google Calendar instead of adding a second one. A Google "template" link can't carry a UID:
after a date change the booking page asks for the `.ics` instead.

Every button is a signed api link — `/calendar/{ref}.ics` and `/calendar/{ref}/google`, with
`exp` and `sig` like the voucher's — so it works signed out (the success screen, 30 minutes) and
from an email (until 30 days after the trip). Opening one records the click on the booking
(`calendar_added_at`, `calendar_via`) and then sends the event: "added to calendar" means the
customer clicked, not that their calendar accepted it. A mail scanner that opens links ahead of
the reader (Outlook's Safe Links) would count too; it only ticks one readiness part.
"""

import datetime as dt
import hashlib
import hmac
import time
from dataclasses import dataclass
from urllib.parse import urlencode

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, Departure, Destination, Package
from app.models.enums import BookingActor
from app.schemas.trip_pack import CalendarBlock, CalendarVia
from app.services.analytics import ist_today
from app.services.booking import history
from app.services.booking.details import purge_on
from app.services.booking.trip_pack import HAS_PACK, meeting_of, opens_on
from app.services.email.render import IST
from app.services.format import long_date

UID_DOMAIN = "tripsmith.virajdomadia.com"
SHORT_LINK_SECONDS = 30 * 60  # the success screen, like the voucher's link
SEQUENCE_EPOCH = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)
VIA_WORDS: dict[CalendarVia, str] = {"google": "Google Calendar", "ics": "a calendar file (.ics)"}


# --- signed links ------------------------------------------------------------------------------


def _signature(ref: str, exp: int, secret: str) -> str:
    return hmac.new(secret.encode(), f"calendar:{ref}:{exp}".encode(), hashlib.sha256).hexdigest()


def trip_link_exp(returns: dt.date) -> int:
    """A link that lives as long as the trip matters: to the end of the purge day (IST)."""
    end = dt.datetime.combine(purge_on(returns), dt.time.max, tzinfo=IST)
    return int(end.timestamp())


def short_link_exp(now: float | None = None) -> int:
    return int(now if now is not None else time.time()) + SHORT_LINK_SECONDS


def calendar_path(ref: str, via: CalendarVia, secret: str | None, *, exp: int) -> str | None:
    """The api-relative signed path; None without a `SESSION_SECRET` (local dev)."""
    if not secret:
        return None
    tail = f"{ref}.ics" if via == "ics" else f"{ref}/google"
    return f"/calendar/{tail}?exp={exp}&sig={_signature(ref, exp, secret)}"


def link_is_valid(
    ref: str, exp: int, sig: str, secret: str | None, *, now: float | None = None
) -> bool:
    if not secret or exp < int(now if now is not None else time.time()):
        return False
    return hmac.compare_digest(sig.encode(), _signature(ref, exp, secret).encode())


# --- the event ---------------------------------------------------------------------------------


@dataclass(frozen=True)
class TripEvent:
    ref: str
    package_name: str
    starts: dt.date
    days: int
    location: str
    booking_url: str
    opens_on: dt.date
    updated_at: dt.datetime

    @property
    def uid(self) -> str:
        return f"{self.ref}@{UID_DOMAIN}"

    @property
    def ends(self) -> dt.date:
        """The last day of the trip (inclusive)."""
        return self.starts + dt.timedelta(days=self.days - 1)

    @property
    def summary(self) -> str:
        return f"{self.package_name} ({self.ref})"

    @property
    def sequence(self) -> int:
        """Seconds since 2026 — rises with every change to the booking, so the newest file
        wins, and fits RFC 5545's 32-bit INTEGER until 2094."""
        return max(0, int((self.updated_at - SEQUENCE_EPOCH).total_seconds()))

    @property
    def description(self) -> str:
        when = (
            "in your trip pack"
            if self.opens_on <= ist_today()
            else f"in the trip pack from {long_date(self.opens_on)}"
        )
        return (
            f"Your Tripsmith booking {self.ref}: {self.booking_url}\n"
            f"Meeting time and your trip leader's phone are {when}."
        )


def _escape(text: str) -> str:
    """RFC 5545 TEXT: backslash, semicolon and comma escaped, newlines as `\\n`."""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _fold(line: str) -> str:
    """Lines over 75 octets continue on the next with one leading space (never splitting a
    UTF-8 character)."""
    out: list[str] = []
    chunk, size = "", 0
    for ch in line:
        n = len(ch.encode())
        if size + n > (75 if not out else 74):
            out.append(chunk)
            chunk, size = "", 0
        chunk += ch
        size += n
    out.append(chunk)
    return "\r\n ".join(out)


def ics(event: TripEvent, *, now: dt.datetime | None = None) -> str:
    stamp = (now or dt.datetime.now(dt.UTC)).astimezone(dt.UTC).strftime("%Y%m%dT%H%M%SZ")
    end = event.starts + dt.timedelta(days=event.days)  # exclusive
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Tripsmith//Trip calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{event.uid}",
        f"SEQUENCE:{event.sequence}",
        f"DTSTAMP:{stamp}",
        f"DTSTART;VALUE=DATE:{event.starts:%Y%m%d}",
        f"DTEND;VALUE=DATE:{end:%Y%m%d}",
        f"SUMMARY:{_escape(event.summary)}",
        f"LOCATION:{_escape(event.location)}",
        f"DESCRIPTION:{_escape(event.description)}",
        f"URL:{event.booking_url}",
        "STATUS:CONFIRMED",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "".join(_fold(line) + "\r\n" for line in lines)


def google_url(event: TripEvent) -> str:
    end = event.starts + dt.timedelta(days=event.days)
    query = urlencode(
        {
            "action": "TEMPLATE",
            "text": event.summary,
            "dates": f"{event.starts:%Y%m%d}/{end:%Y%m%d}",
            "details": event.description,
            "location": event.location,
        }
    )
    return f"https://calendar.google.com/calendar/render?{query}"


def ics_filename(ref: str) -> str:
    return f"Tripsmith-{ref}.ics"


def event_of(
    booking: Booking, pkg: Package, dep: Departure, destination: str, site_url: str
) -> TripEvent:
    meeting = meeting_of(pkg, dep)
    return TripEvent(
        ref=booking.ref,
        package_name=pkg.name,
        starts=dep.date,
        days=pkg.days,
        location=meeting.place if meeting else destination,
        booking_url=f"{site_url.rstrip('/')}/account/bookings/{booking.ref}",
        opens_on=opens_on(dep.date),
        updated_at=booking.updated_at,
    )


async def load_event(db: AsyncSession, ref: str, site_url: str) -> TripEvent | None:
    """None for an unknown booking or one with nothing to put in a calendar (pending,
    cancelled)."""
    row = (
        await db.execute(
            select(Booking, Package, Departure, Destination.name)
            .join(Package, Package.id == Booking.package_id)
            .join(Departure, Departure.id == Booking.departure_id)
            .join(Destination, Destination.id == Package.destination_id)
            .where(Booking.ref == ref)
        )
    ).one_or_none()
    if row is None or row[0].status not in HAS_PACK:
        return None
    booking, pkg, dep, destination = row
    return event_of(booking, pkg, dep, destination, site_url)


def block_of(
    booking: Booking, event: TripEvent, secret: str | None, *, returns: dt.date
) -> CalendarBlock | None:
    """The booking page's coupon (None when the booking has no calendar event)."""
    if booking.status not in HAS_PACK:
        return None
    exp = trip_link_exp(returns)
    return CalendarBlock(
        google_url=calendar_path(booking.ref, "google", secret, exp=exp),
        ics_url=calendar_path(booking.ref, "ics", secret, exp=exp),
        added_at=booking.calendar_added_at,
        via=booking.calendar_via,  # type: ignore[arg-type]  # checked by 0022's constraint
        stale=booking.calendar_added_at is None and booking.calendar_via is not None,
        starts=event.starts,
        ends=event.ends,
        location=event.location,
    )


async def mark_added(db: AsyncSession, ref: str, via: CalendarVia) -> None:
    """Record the click: every click moves `calendar_added_at`; the history gets one entry when
    it was not already on the calendar (first time, or the first time after a date change)."""
    try:
        before = (
            await db.execute(
                select(Booking.id, Booking.calendar_added_at)
                .where(Booking.ref == ref)
                .with_for_update()
            )
        ).one_or_none()
        if before is None:
            return
        booking_id, added = before
        await db.execute(
            update(Booking)
            .where(Booking.id == booking_id)
            .values(calendar_added_at=dt.datetime.now(dt.UTC), calendar_via=via)
            .execution_options(synchronize_session=False)
        )
        if added is None:
            words = VIA_WORDS[via]
            history.record(
                db,
                booking_id,
                "calendar.added",
                actor=BookingActor.CUSTOMER,
                text=f"Customer added the trip to {words}",
                customer=f"You added the trip to {words}",
            )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
