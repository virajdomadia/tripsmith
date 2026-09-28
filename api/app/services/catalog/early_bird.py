"""Early-bird on the reads (R47, P17). The quote side lives in `services/booking/pricing.py`
(`early_bird_for`); this module is what the package page, the cards and the daily cron show.

- The package page gets the tiers themselves; the site works out each date's "Early bird −₹X ·
  book by <date>" from them and the IST day, so a label flips at midnight even on a prerendered
  page.
- A card's "Early-bird savings" tag means: a date that can be booked online today, with seats and
  a price, still earns a tier. Seats count, so the tag never points at a sold-out date only.
- The "from ₹" price and the JSON-LD stay as they are: early-bird is per date, not per package.
"""

import datetime as dt

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure, Destination, Package
from app.models.catalog import departure_availability
from app.models.enums import PackageStatus
from app.schemas.catalog import EarlyBirdOut, EarlyBirdTierOut
from app.services.booking.pricing import MIN_DAYS_AHEAD, early_bird_tiers


def early_bird_out(pkg: Package) -> EarlyBirdOut | None:
    """The package page's tiers; None while switched off."""
    tiers = early_bird_tiers(pkg)
    if not tiers:
        return None
    return EarlyBirdOut(tiers=[EarlyBirdTierOut(days=d, off_paise=o) for d, o in tiers])


async def with_savings(db: AsyncSession, today: dt.date) -> set[str]:
    """Ids of the switched-on packages with a date bookable today (seats, a price, ≥ 2 days out)
    that still earns a tier — the cards' tag."""
    rows = await db.execute(
        select(Package.id)
        .join(Departure, Departure.package_id == Package.id)
        .join(departure_availability, departure_availability.c.departure_id == Departure.id)
        .where(
            Package.early_bird_on.is_(True),
            Departure.date >= today + dt.timedelta(days=MIN_DAYS_AHEAD),
            Departure.price_double_paise > 0,
            Departure.price_triple_paise > 0,
            Departure.price_child_paise > 0,
            departure_availability.c.seats_left > 0,
            # The tier nearest departure (tier 2 when set) is the last to end.
            Departure.date - func.coalesce(Package.eb2_days, Package.eb1_days) >= today,
        )
        .distinct()
    )
    return set(rows.scalars())


ENDED_TIER_WINDOW = 2  # days: a missed daily run still catches up, like the deals' 48 h


async def ended_tiers(db: AsyncSession, today: dt.date) -> list[tuple[str, str]]:
    """(package slug, destination slug) of the live, switched-on packages where a tier ended
    for an upcoming date in the last two IST days (its "book by" was yesterday or the day
    before) — their pages are rebuilt so the label and the tag move on."""
    ended = [today - dt.timedelta(days=n) for n in range(1, ENDED_TIER_WINDOW + 1)]
    book_by = [Departure.date - Package.eb1_days, Departure.date - Package.eb2_days]
    rows = await db.execute(
        select(Package.slug, Destination.slug)
        .join(Destination, Destination.id == Package.destination_id)
        .join(Departure, Departure.package_id == Package.id)
        .where(
            Package.status == PackageStatus.LIVE,
            Package.early_bird_on.is_(True),
            Departure.date >= today,
            book_by[0].in_(ended) | book_by[1].in_(ended),
        )
        .distinct()
    )
    return [(slug, destination) for slug, destination in rows.all()]
