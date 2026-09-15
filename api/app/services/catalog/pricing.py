"""Pricing + badge rules (04 §2, 03 R4). Pure functions over departure-like objects so the
same rules serve the API, the PDF and (v3) the AI tools."""

from collections.abc import Iterable
from typing import Protocol

from app.schemas.meta import Badge

FILLING_FAST_MAX_SEATS = 4


class DepartureLike(Protocol):
    seats_left: int
    guaranteed: bool
    price_double_paise: int


def badge_for(departure: DepartureLike) -> Badge | None:
    """*Sold out* 0 seats · *Filling fast* ≤ 4 · *Guaranteed* flag · else none."""
    if departure.seats_left <= 0:
        return Badge.SOLD_OUT
    if departure.seats_left <= FILLING_FAST_MAX_SEATS:
        return Badge.FILLING_FAST
    if departure.guaranteed:
        return Badge.GUARANTEED
    return None


def starting_price(departures: Iterable[DepartureLike]) -> int:
    """Cheapest double-sharing price across the given (live) departures; 0 when there are none."""
    prices = [d.price_double_paise for d in departures]
    return min(prices) if prices else 0
