"""F18 package CRUD: schemas, service and `/admin/packages` routes (06 §A3, §C-REST, §C4)."""

import datetime as dt

import pytest
from pydantic import ValidationError

from app.schemas.catalog import DepartureInput, PackageInput

SUMMARY = "Three slow nights on the Konkan coast with one free beach day and a fort sunset."


def soon(days: int = 30) -> dt.date:
    """A date that is always in the future — never hardcode a calendar date in a test."""
    return dt.date.today() + dt.timedelta(days=days)


def departure(**overrides: object) -> dict[str, object]:
    fields: dict[str, object] = {
        "date": soon().isoformat(),
        "seatsTotal": 16,
        "guaranteed": False,
        "priceDoublePaise": 1_499_900,
        "priceTriplePaise": 1_349_900,
        "priceChildPaise": 899_900,
        "singleSupplementPaise": 600_000,
    }
    fields.update(overrides)
    return fields


def day(n: int) -> dict[str, object]:
    return {
        "title": f"Day {n}",
        "description": f"What happens on day {n}, in a sentence long enough to be real.",
        "meals": {"breakfast": True, "lunch": False, "dinner": False},
        "stay": "Lemon Tree Amarante, Candolim",
    }


def payload(**overrides: object) -> PackageInput:
    fields: dict[str, object] = {
        "slug": "konkan-coast",
        "destinationId": "d-goa",
        "name": "Konkan Coast",
        "summary": SUMMARY,
        "themes": ["beach"],
        "nights": 3,
        "departureCity": "Ex-Mumbai",
        "highlights": ["Sunset at the fort"],
        "inclusions": ["3 nights with breakfast"],
        "exclusions": ["Flights"],
        "hotels": [{"name": "Lemon Tree", "city": "Candolim", "stars": 4, "nights": 3}],
        "faq": [{"q": "Is it family friendly?", "a": "Yes, the beach is calm."}],
        "featured": False,
        "itinerary": [day(1), day(2), day(3), day(4)],
        "departures": [departure()],
    }
    fields.update(overrides)
    return PackageInput.model_validate(fields)


# --- schema ---------------------------------------------------------------------------------------


def test_days_is_derived_from_nights_and_never_sent() -> None:
    assert payload(nights=3).days == 4
    assert "days" not in PackageInput.model_fields


def test_itinerary_may_be_short_for_a_draft_but_never_longer_than_the_trip() -> None:
    assert payload(itinerary=[]).itinerary == []
    assert len(payload(itinerary=[day(1), day(2)]).itinerary) == 2
    with pytest.raises(ValidationError) as exc:
        payload(itinerary=[day(n) for n in range(1, 6)])
    assert "4 days" in str(exc.value)


def test_departure_dates_must_be_unique_within_the_payload() -> None:
    same = soon(45).isoformat()
    with pytest.raises(ValidationError) as exc:
        payload(departures=[departure(date=same), departure(date=same)])
    assert "same date" in str(exc.value)


def test_prices_may_be_zero_so_a_draft_can_park_a_departure() -> None:
    parked = payload(departures=[departure(priceDoublePaise=0, priceChildPaise=0)])
    assert parked.departures[0].price_double_paise == 0
    with pytest.raises(ValidationError):
        payload(departures=[departure(priceDoublePaise=-1)])


def test_rejects_bad_slugs_themes_and_empty_text() -> None:
    with pytest.raises(ValidationError):
        payload(slug="Konkan Coast")
    with pytest.raises(ValidationError):
        payload(themes=["spa"])
    with pytest.raises(ValidationError):
        payload(name="   ")
    with pytest.raises(ValidationError):
        payload(nights=0)
    with pytest.raises(ValidationError):
        payload(nights=31)


def test_strips_and_drops_blank_list_entries() -> None:
    out = payload(highlights=["  Sunset at the fort  ", "", "   "])
    assert out.highlights == ["Sunset at the fort"]
    assert payload(name="  Konkan Coast ").name == "Konkan Coast"


def test_departure_id_is_optional_so_new_rows_can_be_inserted() -> None:
    assert DepartureInput.model_validate(departure()).id is None
    assert DepartureInput.model_validate(departure(id="dep-1")).id == "dep-1"
