"""Catalog reads for the package page and destination pages (06 C1).

`get_package` / `get_departures_for_month` / `list_destinations` / `get_destination` return
pydantic models or `None` (the router turns `None` into the 404 envelope). Draft packages never
leave this module; `seats_left` always comes from the `departure_availability` view.
"""

import datetime as dt
from collections.abc import Iterable
from typing import Protocol, TypeVar


def month_bounds(month: str) -> tuple[dt.date, dt.date]:
    """`'2026-12'` -> `(2026-12-01, 2027-01-01)`; the router validated the format."""
    year, mon = (int(part) for part in month.split("-"))
    start = dt.date(year, mon, 1)
    end = dt.date(year + 1, 1, 1) if mon == 12 else dt.date(year, mon + 1, 1)
    return start, end


class PackageLike(Protocol):
    id: str
    destination_id: str
    themes: list  # Theme enums or their string values
    starting_price_paise: int
    name: str


TPackage = TypeVar("TPackage", bound=PackageLike)


def related_order(package: PackageLike, candidates: Iterable[TPackage]) -> list[TPackage]:
    """R4 "same destination or theme": tier 0 same destination, 1 shares a theme, 2 anything
    else live; cheapest first within a tier, name as tiebreaker; the package itself excluded."""
    mine = set(package.themes)

    def tier(p: PackageLike) -> int:
        if p.destination_id == package.destination_id:
            return 0
        return 1 if mine & set(p.themes) else 2

    return sorted(
        (p for p in candidates if p.id != package.id),
        key=lambda p: (tier(p), p.starting_price_paise, p.name),
    )
