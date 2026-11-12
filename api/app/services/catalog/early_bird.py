"""Early-bird on the reads (R47, P17). The quote side lives in `services/booking/pricing.py`
(`early_bird_for`); this module is what the package page and the cards show.

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

from app.models import Departure, Package
from app.models.catalog import departure_availability
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
