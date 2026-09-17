"""`search_packages` — the single filter function the site, the sitemap and (v3) the AI reuse
(03 R3, 06 C1).

Filters are `where` clauses over live packages; the travel month is an EXISTS over upcoming
departures joined to the `departure_availability` view. Facets describe the whole live catalog
so the filter panel offers only real destinations, months and ranges.
"""

import calendar
import datetime as dt
import math
from collections import Counter, defaultdict
from typing import Any

from sqlalchemy import Select, func, nulls_last, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Departure, Destination, Package
from app.models.catalog import departure_availability
from app.models.enums import PackageStatus, Theme
from app.schemas.catalog import (
    FacetOption,
    PackageList,
    RangeFacet,
    SearchFacets,
    SearchParams,
    SortOrder,
)
from app.schemas.meta import THEME_LABELS
from app.services.catalog.availability import next_departures
from app.services.catalog.cards import package_card
from app.services.catalog.reads import month_bounds

BUDGET_STEP_RUPEES = 1_000

# `app.schemas.meta.Theme` and `app.models.enums.Theme` are distinct classes with the same values
# (the DB/contract split, 06 C0); key by the plain string value to satisfy pyright.
THEME_LABELS_BY_VALUE: dict[str, str] = {t.value: label for t, label in THEME_LABELS.items()}


# --- pure ---------------------------------------------------------------------------------------


def month_label(month: str) -> str:
    """`'2026-11'` -> `'November 2026'` (the format was validated upstream)."""
    year, mon = month.split("-")
    return f"{calendar.month_name[int(mon)]} {year}"


def budget_range(cheapest_paise: int | None, priciest_paise: int | None) -> RangeFacet:
    """Slider bounds in rupees, rounded out to ₹1,000 so every real price sits inside them."""
    if not cheapest_paise or not priciest_paise:
        return RangeFacet(min=0, max=0)
    step = BUDGET_STEP_RUPEES
    return RangeFacet(
        min=math.floor(cheapest_paise / 100 / step) * step,
        max=math.ceil(priciest_paise / 100 / step) * step,
    )


def sort_order(sort: SortOrder) -> tuple[Any, ...]:
    """ORDER BY clauses. "On request" (price 0) sinks to the bottom whichever way prices go;
    `name` breaks ties so the order is stable between requests."""
    price = func.nullif(Package.starting_price_paise, 0)
    match sort:
        case SortOrder.PRICE_DESC:
            return (nulls_last(price.desc()), Package.name)
        case SortOrder.DURATION:
            return (Package.nights, nulls_last(price.asc()), Package.name)
        case _:
            return (nulls_last(price.asc()), Package.name)


def seat_available_departures(today: dt.date) -> Select[tuple[str]]:
    """Ids of departures on/after `today` that still have seats (the view, never `seats_total`)."""
    return (
        select(Departure.id)
        .join(departure_availability, departure_availability.c.departure_id == Departure.id)
        .where(Departure.date >= today, departure_availability.c.seats_left > 0)
    )


def apply_filters(
    stmt: Select[tuple[Package]], params: SearchParams, today: dt.date
) -> Select[tuple[Package]]:
    """The R3 filters, AND-ed; each list is any-of. Pure so a test can read the statement."""
    if params.destination:
        stmt = stmt.join(Destination, Destination.id == Package.destination_id).where(
            Destination.slug.in_(params.destination)
        )
    if params.max_budget is not None:
        # Rupees on the query, paise in the row; "on request" (0) has no price to compare.
        stmt = stmt.where(
            Package.starting_price_paise > 0,
            Package.starting_price_paise <= params.max_budget * 100,
        )
    if params.nights_min is not None:
        stmt = stmt.where(Package.nights >= params.nights_min)
    if params.nights_max is not None:
        stmt = stmt.where(Package.nights <= params.nights_max)
    if params.themes:
        stmt = stmt.where(Package.themes.overlap(params.themes))
    if params.month:
        start, end = month_bounds(params.month)
        stmt = stmt.where(
            seat_available_departures(today)
            .where(
                Departure.package_id == Package.id,
                Departure.date >= start,
                Departure.date < end,
            )
            .exists()
        )
    return stmt


# --- queries --------------------------------------------------------------------------------------


async def search_facets(db: AsyncSession, today: dt.date) -> SearchFacets:
    """The filter panel's options, from the live catalog. Twelve packages: counting in Python is
    simpler than array-unnest SQL and just as fast."""
    live = Package.status == PackageStatus.LIVE

    destination_rows = await db.execute(
        select(Destination.slug, Destination.name, func.count(Package.id))
        .join(Package, Package.destination_id == Destination.id)
        .where(live)
        .group_by(Destination.id)
        .order_by(Destination.position, Destination.name)
    )
    destinations = [
        FacetOption(value=slug, label=name, count=count) for slug, name, count in destination_rows
    ]

    theme_counts = Counter(
        theme
        for themes in (await db.execute(select(Package.themes).where(live))).scalars()
        for theme in themes
    )
    themes = [
        FacetOption(
            value=t.value, label=THEME_LABELS_BY_VALUE[t.value], count=theme_counts.get(t, 0)
        )
        for t in Theme
    ]

    departure_rows = await db.execute(
        select(Departure.package_id, Departure.date)
        .join(Package, Package.id == Departure.package_id)
        .join(departure_availability, departure_availability.c.departure_id == Departure.id)
        .where(live, Departure.date >= today, departure_availability.c.seats_left > 0)
    )
    by_month: dict[str, set[str]] = defaultdict(set)
    for package_id, date in departure_rows:
        by_month[date.strftime("%Y-%m")].add(package_id)
    months = [
        FacetOption(value=month, label=month_label(month), count=len(ids))
        for month, ids in sorted(by_month.items())
    ]

    nights_min, nights_max, cheapest, priciest = (
        await db.execute(
            select(
                func.min(Package.nights),
                func.max(Package.nights),
                func.min(func.nullif(Package.starting_price_paise, 0)),
                func.max(Package.starting_price_paise),
            ).where(live)
        )
    ).one()

    return SearchFacets(
        destinations=destinations,
        themes=themes,
        months=months,
        nights=RangeFacet(min=nights_min or 0, max=nights_max or 0),
        budget=budget_range(cheapest, priciest),
    )


async def search_packages(
    db: AsyncSession, params: SearchParams | None = None, *, today: dt.date | None = None
) -> PackageList:
    """Live packages matching `params` as cards, plus the facets the filter panel needs.
    The v3 `searchPackages` tool calls this with the same `SearchParams`."""
    params = params or SearchParams()
    today = today or dt.date.today()
    stmt = apply_filters(select(Package).where(Package.status == PackageStatus.LIVE), params, today)
    packages = (
        (
            await db.execute(
                stmt.options(
                    selectinload(Package.destination), selectinload(Package.cover_image)
                ).order_by(*sort_order(params.sort))
            )
        )
        .scalars()
        .all()
    )
    upcoming = await next_departures(db, today)
    items = [package_card(p, upcoming.get(p.id)) for p in packages]
    return PackageList(items=items, total=len(items), facets=await search_facets(db, today))
