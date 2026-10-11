"""Honest urgency labels (P2, R40): every label is one query over real bookings, and none shows
without the rows behind it. No view counts.

A booking *counts* when it is confirmed, part-paid (deposit in) or completed — any channel, the
counter's included. Cancelled ones never count, even if they were booked inside the window; nor
do holds and pending checkouts. "Booked" is `bookings.created_at` on its IST day (there is no
`confirmed_at`; a web booking captures within minutes of its hold).

- **Booked N× in the last 30 days** (package): counted bookings made today or in the 29 IST days
  before, shown at 3 or more.
- **Last booked …** (package): IST days since the newest counted booking, shown within 7.
- **Likely to sell out** (departure): booked travellers on counted bookings ≥ 70 % of
  `seats_total`, and 2+ counted bookings on that date in the last 14 IST days. Holds and waitlist
  offers are left out — they come and go. `pricing.badge_for` shows it only above Filling fast.

The labels ride on the package reads, so the pages' existing tags carry them: a booking event
revalidates through `freshness.refresh_packages`, and `/cron/daily` rebuilds the pages whose
day-counted labels move at IST midnight (`admin_packages.revalidate_urgency`).
"""

import datetime as dt
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import ColumnElement, Date, cast, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Booking, BookingTraveller, Departure
from app.models.enums import BookingStatus
from app.schemas.catalog import BookingProof

COUNTED = (BookingStatus.CONFIRMED, BookingStatus.PARTIALLY_PAID, BookingStatus.COMPLETED)
RECENT_DAYS = 30  # "in the last 30 days": today and the 29 IST days before
RECENT_MIN = 3
LAST_BOOKED_MAX_DAYS = 7
LIKELY_FULL_PERCENT = 70
LIKELY_WINDOW_DAYS = 14
LIKELY_MIN_BOOKINGS = 2


def booked_on() -> ColumnElement[dt.date]:
    """A booking's IST day."""
    return cast(func.timezone("Asia/Kolkata", Booking.created_at), Date)


@dataclass(frozen=True)
class Proof:
    """Raw counts for one package; `out()` applies the thresholds."""

    recent: int
    last_days: int | None

    def out(self) -> BookingProof | None:
        recent = self.recent if self.recent >= RECENT_MIN else None
        last = (
            self.last_days
            if self.last_days is not None and self.last_days <= LAST_BOOKED_MAX_DAYS
            else None
        )
        if recent is None and last is None:
            return None
        return BookingProof(recent_bookings=recent, last_booked_days=last)


async def proofs(
    db: AsyncSession, today: dt.date, package_ids: Iterable[str] | None = None
) -> dict[str, BookingProof]:
    """Per package id, its "Booked N×" / "Last booked" facts — only packages with one to show.
    One grouped query; `package_ids=None` reads every package (the listing pages)."""
    day = booked_on()
    since = today - dt.timedelta(days=RECENT_DAYS - 1)
    stmt = (
        select(Booking.package_id, func.count(), func.max(day))
        .where(Booking.status.in_(COUNTED), day >= since, day <= today)
        .group_by(Booking.package_id)
    )
    if package_ids is not None:
        ids = list(set(package_ids))
        if not ids:
            return {}
        stmt = stmt.where(Booking.package_id.in_(ids))
    out: dict[str, BookingProof] = {}
    for package_id, recent, last in (await db.execute(stmt)).all():
        proof = Proof(int(recent), (today - last).days).out()
        if proof:
            out[package_id] = proof
    return out


async def likely_to_sell_out(
    db: AsyncSession, departure_ids: Iterable[str], today: dt.date
) -> set[str]:
    """The departures that pass "Likely to sell out" on seats booked and recent pace. Seats left
    are not read here: `badge_for` lets Sold out and Filling fast win."""
    ids = list(set(departure_ids))
    if not ids:
        return set()
    day = booked_on()
    since = today - dt.timedelta(days=LIKELY_WINDOW_DAYS - 1)
    rows = await db.execute(
        select(
            Booking.departure_id,
            Departure.seats_total,
            func.count(BookingTraveller.id),
            func.count(distinct(Booking.id)).filter(day >= since, day <= today),
        )
        .join(Departure, Departure.id == Booking.departure_id)
        .join(BookingTraveller, BookingTraveller.booking_id == Booking.id)
        .where(Booking.departure_id.in_(ids), Booking.status.in_(COUNTED))
        .group_by(Booking.departure_id, Departure.seats_total)
    )
    return {
        departure_id
        for departure_id, total, booked, recent in rows.all()
        if total > 0
        and int(booked) * 100 >= LIKELY_FULL_PERCENT * total
        and int(recent) >= LIKELY_MIN_BOOKINGS
    }


async def labelled_packages(db: AsyncSession, today: dt.date) -> list[str]:
    """Package ids with a counted booking made in the last 31 IST days: every page whose
    day-counted labels can change at this midnight — including one whose label just lapsed."""
    day = booked_on()
    since = today - dt.timedelta(days=RECENT_DAYS)
    rows = await db.execute(
        select(distinct(Booking.package_id)).where(Booking.status.in_(COUNTED), day >= since)
    )
    return sorted(rows.scalars().all())
