"""services/format.py — the numbers and dates the PDF and the emails print (mirror of
web/src/lib/format.ts)."""

import datetime as dt

from app.services.format import duration, inr, long_date, meals_label, seats_label


def test_inr_uses_indian_grouping() -> None:
    assert inr(0) == "₹0"
    assert inr(999) == "₹999"
    assert inr(18499) == "₹18,499"
    assert inr(1234567) == "₹12,34,567"
    assert inr(-2500) == "-₹2,500"


def test_long_date_matches_the_web() -> None:
    assert long_date(dt.date(2026, 12, 18)) == "Fri 18 Dec 2026"
    assert long_date(dt.date(2027, 1, 3)) == "Sun 3 Jan 2027"


def test_duration_pluralises() -> None:
    assert duration(3, 4) == "3 nights / 4 days"
    assert duration(1, 2) == "1 night / 2 days"


def test_meals_label() -> None:
    assert meals_label(True, False, True) == "Breakfast · Dinner"
    assert meals_label(True, True, True) == "Breakfast · Lunch · Dinner"
    assert meals_label(False, False, False) == "No meals"


def test_seats_label() -> None:
    assert seats_label(6) == "6 seats"
    assert seats_label(1) == "1 seat"
    assert seats_label(0) == "Sold out"
    assert seats_label(-2) == "Sold out"
