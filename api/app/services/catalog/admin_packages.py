"""Owner-side package CRUD (F18, 06 §A3 §C4). Every write revalidates the public pages.

The rule and price functions at the top are pure over a loaded `Package` graph so the same
logic serves the read, the write and the status endpoints — and tests them without a session.
"""

import datetime as dt
from collections.abc import Sequence

from app.models import Package
from app.schemas.catalog import PublishRule

DUPLICATE_SLUG = "A package with this slug already exists"


def revalidate_tags(
    slug: str,
    destination_slug: str,
    old_slug: str | None = None,
    old_destination_slug: str | None = None,
) -> list[str]:
    """`destinations` too: the destination cards carry package counts and from-prices, and the
    destination page lists the package. A rename or a move has to bust the old keys as well."""
    tags = [
        "packages",
        "destinations",
        "home",
        f"package:{slug}",
        f"destination:{destination_slug}",
    ]
    if old_slug and old_slug != slug:
        tags.append(f"package:{old_slug}")
    if old_destination_slug and old_destination_slug != destination_slug:
        tags.append(f"destination:{old_destination_slug}")
    return tags


def recompute_starting_price(pkg: Package, *, today: dt.date) -> int:
    """Cheapest double-sharing price across upcoming departures; 0 when none remain.

    Unpriced departures (0 — a draft parking a date) are skipped: `reads.py` treats 0 as "no
    upcoming date", and a parked row must never advertise the package as free.
    """
    prices = [
        d.price_double_paise for d in pkg.departures if d.date >= today and d.price_double_paise > 0
    ]
    return min(prices) if prices else 0


def publish_rules(pkg: Package, *, image_count: int, today: dt.date) -> list[PublishRule]:
    """The four live-publish preconditions (06 §C4 `setPackageStatus`), in panel order."""
    written = len(pkg.itinerary)
    upcoming = [d for d in pkg.departures if d.date >= today]
    unpriced = [
        d
        for d in pkg.departures
        if not (d.price_double_paise > 0 and d.price_triple_paise > 0 and d.price_child_paise > 0)
    ]
    return [
        PublishRule(
            key="images",
            label="At least one photo",
            ok=image_count > 0,
            detail=f"{image_count} uploaded" if image_count else "No photos yet",
        ),
        PublishRule(
            key="itinerary",
            label="Full itinerary",
            ok=written == pkg.days,
            detail=f"{written} of {pkg.days} days written",
        ),
        PublishRule(
            key="departures",
            label="At least one upcoming departure",
            ok=bool(upcoming),
            detail=f"{len(upcoming)} upcoming" if upcoming else "No dates from today onwards",
        ),
        PublishRule(
            key="prices",
            label="Prices set for every departure",
            ok=not unpriced,
            detail=(
                "All departures priced"
                if not unpriced
                else f"{len(unpriced)} departure{'' if len(unpriced) == 1 else 's'} unpriced"
            ),
        ),
    ]


def can_publish(rules: Sequence[PublishRule]) -> bool:
    return all(r.ok for r in rules)
