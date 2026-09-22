"""F18 package CRUD: schemas, service and `/admin/packages` routes (06 §A3, §C-REST, §C4)."""

import datetime as dt
from collections.abc import Sequence

import pytest
from pydantic import ValidationError

from app.models import Departure, ItineraryDay, Package, PackageImage
from app.schemas.catalog import DepartureInput, PackageInput, PublishRule
from app.services.catalog import admin_packages as svc

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


# --- publish rules and pricing (pure) -------------------------------------------------------------


def built_package(
    *,
    nights: int = 3,
    days_written: int = 4,
    departures: Sequence[tuple[dt.date, int]] = (),
    images: int = 1,
) -> Package:
    """An in-memory Package graph — enough for the pure rule functions, no session needed."""
    pkg = Package(
        slug="konkan-coast",
        destination_id="d-goa",
        name="Konkan Coast",
        summary=SUMMARY,
        nights=nights,
        days=nights + 1,
    )
    pkg.itinerary = [
        ItineraryDay(day_no=n, title=f"Day {n}", description="Text")
        for n in range(1, days_written + 1)
    ]
    pkg.departures = [
        Departure(
            date=d,
            seats_total=16,
            price_double_paise=price,
            price_triple_paise=max(price - 100_000, 0),
            price_child_paise=max(price - 500_000, 0),
            single_supplement_paise=0,
        )
        for d, price in departures
    ]
    pkg.images = [
        PackageImage(url=f"https://blob.test/{n}.jpg", width=1600, height=1000, position=n)
        for n in range(images)
    ]
    return pkg


def rule(rules: Sequence[PublishRule], key: str) -> PublishRule:
    return next(r for r in rules if r.key == key)


def test_publish_rules_all_pass_for_a_complete_package() -> None:
    pkg = built_package(departures=[(soon(), 1_499_900)])
    rules = svc.publish_rules(pkg, image_count=1, today=dt.date.today())
    assert [r.key for r in rules] == ["images", "itinerary", "departures", "prices"]
    assert all(r.ok for r in rules)
    assert svc.can_publish(rules) is True


def test_each_rule_fails_on_its_own() -> None:
    today = dt.date.today()

    no_image = built_package(departures=[(soon(), 1_499_900)], images=0)
    rules = svc.publish_rules(no_image, image_count=0, today=today)
    assert rule(rules, "images").ok is False
    assert rule(rules, "itinerary").ok is True
    assert svc.can_publish(rules) is False

    short = built_package(days_written=2, departures=[(soon(), 1_499_900)])
    rules = svc.publish_rules(short, image_count=1, today=today)
    assert rule(rules, "itinerary").ok is False
    assert rule(rules, "itinerary").detail == "2 of 4 days written"

    none_upcoming = built_package(departures=[(today - dt.timedelta(days=1), 1_499_900)])
    rules = svc.publish_rules(none_upcoming, image_count=1, today=today)
    assert rule(rules, "departures").ok is False
    assert rule(rules, "prices").ok is True  # the past departure still has prices

    unpriced = built_package(departures=[(soon(), 0)])
    rules = svc.publish_rules(unpriced, image_count=1, today=today)
    assert rule(rules, "prices").ok is False
    assert "1 departure" in rule(rules, "prices").detail


def test_a_departure_today_counts_as_upcoming() -> None:
    today = dt.date.today()
    pkg = built_package(departures=[(today, 1_499_900)])
    assert rule(svc.publish_rules(pkg, image_count=1, today=today), "departures").ok is True


def test_starting_price_is_the_cheapest_upcoming_double_and_zero_when_none_remain() -> None:
    today = dt.date.today()
    pkg = built_package(
        departures=[(soon(10), 1_749_900), (soon(60), 1_449_900), (today, 1_599_900)]
    )
    assert svc.recompute_starting_price(pkg, today=today) == 1_449_900

    past_only = built_package(departures=[(today - dt.timedelta(days=1), 1_000_000)])
    assert svc.recompute_starting_price(past_only, today=today) == 0
    assert svc.recompute_starting_price(built_package(), today=today) == 0


def test_an_unpriced_upcoming_departure_does_not_become_the_starting_price() -> None:
    """A parked departure (price 0) must not advertise the package as free."""
    today = dt.date.today()
    pkg = built_package(departures=[(soon(10), 0), (soon(60), 1_449_900)])
    assert svc.recompute_starting_price(pkg, today=today) == 1_449_900


def test_revalidate_tags_cover_the_old_slug_and_the_old_destination() -> None:
    assert svc.revalidate_tags("konkan-coast", "goa") == [
        "packages",
        "destinations",
        "home",
        "package:konkan-coast",
        "destination:goa",
    ]
    moved = svc.revalidate_tags(
        "konkan-coast", "maharashtra", old_slug="konkan", old_destination_slug="goa"
    )
    assert "package:konkan" in moved and "destination:goa" in moved
