"""Compare (R39, P1b): up to three live packages side by side, read from the URL alone.

Each trip is the package page's own read (`reads.get_package`, without related cards), so a
compare column can never disagree with the page it links to: the same deal, early-bird tiers,
live seats and leader. Three package reads per request is fine at portfolio scale, and the
answer is CDN-cached like every catalogue read.
"""

import datetime as dt
import re
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Package
from app.schemas.catalog import SLUG_PATTERN, PackageDetail
from app.schemas.compare import (
    MAX_COMPARE,
    NEXT_DEPARTURES,
    CompareResult,
    CompareTrip,
    MealCount,
)
from app.schemas.public_leaders import PublicLeaderRef
from app.services.analytics import ist_today
from app.services.catalog.reads import get_package

_SLUG = re.compile(SLUG_PATTERN)


def parse_slugs(raw: str | None) -> tuple[list[str], list[str]]:
    """`a,b,c` → (the first `MAX_COMPARE` distinct well-formed slugs, the malformed ones).
    Case and spaces are forgiven; duplicates collapse onto the first."""
    wanted: list[str] = []
    bad: list[str] = []
    for part in (raw or "").split(","):
        slug = part.strip().lower()
        if not slug:
            continue
        if len(slug) > 80 or not _SLUG.match(slug):
            bad.append(part.strip()[:80])
        elif slug not in wanted:
            wanted.append(slug)
    return wanted[:MAX_COMPARE], bad


def places_of(hotels: Iterable[str]) -> list[str]:
    """Hotel cities in order, a city named once per stretch (Leh, Nubra, Pangong, Leh)."""
    out: list[str] = []
    for city in hotels:
        if city and (not out or out[-1] != city):
            out.append(city)
    return out


def trip_of(p: PackageDetail, *, deposit: bool) -> CompareTrip:
    return CompareTrip(
        slug=p.slug,
        name=p.name,
        destination=p.destination,
        nights=p.nights,
        days=p.days,
        departure_city=p.departure_city,
        cover=p.cover,
        starting_price_paise=p.starting_price_paise,
        deal=p.deal,
        early_bird=p.early_bird,
        places=places_of(h.city for h in p.hotels) or [p.destination.name],
        hotels=p.hotels,
        meals=MealCount(
            breakfasts=sum(d.meals.breakfast for d in p.itinerary),
            lunches=sum(d.meals.lunch for d in p.itinerary),
            dinners=sum(d.meals.dinner for d in p.itinerary),
        ),
        inclusions=p.inclusions,
        exclusions=p.exclusions,
        departures=[d for d in p.departures if d.seats_left > 0][:NEXT_DEPARTURES],
        rating=p.rating,
        leader=(
            PublicLeaderRef(slug=p.leader.slug, name=p.leader.name, photo_url=p.leader.photo_url)
            if p.leader
            else None
        ),
        deposit=deposit,
    )


async def compare(db: AsyncSession, raw: str | None) -> CompareResult:
    wanted, missing = parse_slugs(raw)
    now = dt.datetime.now(dt.UTC)
    today = ist_today(now)
    deposits = dict(
        (await db.execute(select(Package.slug, Package.deposit_on).where(Package.slug.in_(wanted))))
        .tuples()
        .all()  # a Result has .keys(), so dict() would read it as a mapping
    )
    items: list[CompareTrip] = []
    for slug in wanted:
        detail = await get_package(db, slug, today=today, now=now, with_related=False)
        if detail is None:
            missing.append(slug)
            continue
        items.append(trip_of(detail, deposit=bool(deposits.get(slug, False))))
    return CompareResult(items=items, missing=missing)
