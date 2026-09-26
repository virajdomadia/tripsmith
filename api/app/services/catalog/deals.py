"""Deals (03 R20, 04 v2 §4): a flat amount off per traveller — starting price − deal price —
while `now < deal_ends_at`. The quote side lives in `services/booking/pricing.py` (`deal_off`);
this module is what every *read* shows, so the card, the page, search and the admin agree.

Two starting prices meet here, on purpose:

- the deal **base** — the cheapest upcoming priced double, seats ignored — measures the discount
  (`off = base − deal price`) and validates the form, so holding seats can never widen it
  (see pricing.py);
- the cached `starting_price_paise` — the cheapest date *with seats* — is what a card shows,
  struck through, and the price shown next to it is `starting − off`. That equals the owner's
  deal price whenever the cheapest date has seats.

A deal is shown only while the package has a bookable price at all (`starting > 0`): a sold-out
package has nothing to strike through.

The end date is stored as the end of that IST day: `deal_ends_at` = 00:00 IST the next day, so
"active while now < ends_at" keeps the whole last day.
"""

import datetime as dt
from collections.abc import Iterable
from enum import StrEnum

from sqlalchemy import ColumnElement, and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure, Package
from app.schemas.catalog import DealOut, DealState
from app.services.booking.pricing import deal_off
from app.services.email.render import IST


class DealField(StrEnum):
    """The form's three fields, as the error envelope names them."""

    PRICE = "dealPricePaise"
    LABEL = "dealLabel"
    ENDS = "dealEndsOn"


def end_of_ist_day(day: dt.date) -> dt.datetime:
    """The instant the deal stops: midnight IST after `day`, in UTC."""
    return dt.datetime.combine(day + dt.timedelta(days=1), dt.time(), IST).astimezone(dt.UTC)


def ends_on(ends_at: dt.datetime) -> dt.date:
    """The last IST day a deal runs — the date the owner picked."""
    return (ends_at.astimezone(IST) - dt.timedelta(microseconds=1)).date()


# --- the base ---------------------------------------------------------------------------------


def base_of(departures: Iterable[Departure], today: dt.date) -> int:
    """`_deal_base` over loaded rows (the admin form validates what it is about to save)."""
    prices = [d.price_double_paise for d in departures if d.date >= today and d.price_double_paise]
    return min(prices, default=0)


def base_column(today: dt.date) -> ColumnElement[int]:
    """The base as a correlated subquery on `Package`, for ordering and filtering in SQL."""
    return (
        select(func.min(Departure.price_double_paise))
        .where(
            Departure.package_id == Package.id,
            Departure.date >= today,
            Departure.price_double_paise > 0,
        )
        .correlate(Package)
        .scalar_subquery()
    )


async def bases(db: AsyncSession, today: dt.date) -> dict[str, int]:
    """Every package's base in one query; a package with nothing priced is absent (= 0)."""
    rows = await db.execute(
        select(Departure.package_id, func.min(Departure.price_double_paise))
        .where(Departure.date >= today, Departure.price_double_paise > 0)
        .group_by(Departure.package_id)
    )
    return {package_id: int(base) for package_id, base in rows}


def shown_price(now: dt.datetime, today: dt.date) -> ColumnElement[int]:
    """SQL twin of `deal_for(...).price_paise` falling back to the starting price: what the
    card shows, so search sorts and filters by it. 0 stays 0 ("on request")."""
    base = base_column(today)
    active = and_(
        Package.deal_price_paise.is_not(None),
        Package.deal_ends_at > now,
        Package.starting_price_paise > 0,
        Package.deal_price_paise > 0,
        Package.deal_price_paise < base,
    )
    return Package.starting_price_paise - case((active, base - Package.deal_price_paise), else_=0)


# --- what a read shows ------------------------------------------------------------------------


def deal_for(pkg: Package, base: int, now: dt.datetime) -> DealOut | None:
    """The deal a visitor sees on this package now, or None."""
    off = deal_off(pkg, base=base, now=now)
    if not off or pkg.starting_price_paise <= 0:
        return None
    assert pkg.deal_ends_at is not None  # deal_off is 0 without it
    return DealOut(
        label=pkg.deal_label,
        ends_on=ends_on(pkg.deal_ends_at),
        ends_at=pkg.deal_ends_at,
        off_paise=off,
        price_paise=pkg.starting_price_paise - off,
    )


def shown(pkg: Package, deal: DealOut | None) -> int:
    return deal.price_paise if deal else pkg.starting_price_paise


def state(pkg: Package, base: int, now: dt.datetime) -> DealState:
    """The owner's view: `inactive` = saved but not below the base (a departure price moved)."""
    if pkg.deal_price_paise is None or pkg.deal_ends_at is None:
        return DealState.NONE
    if now >= pkg.deal_ends_at:
        return DealState.ENDED
    if not 0 < pkg.deal_price_paise < base:
        return DealState.INACTIVE
    return DealState.ACTIVE
