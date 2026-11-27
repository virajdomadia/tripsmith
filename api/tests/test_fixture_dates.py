"""The frozen test catalog must never age into the past (main's CI went red on 2026-11-20)."""

import datetime as dt

from app.services.analytics import ist_today
from tests.fixture_dates import add_months, month_key
from tests.settings import fixture_content


def test_fixture_departures_are_all_in_the_future() -> None:
    today = ist_today()
    packages = fixture_content().packages
    assert packages, "the fixture catalog is empty"
    for package in packages:
        assert package.departures, package.slug
        for departure in package.departures:
            assert departure.date > today, (package.slug, departure.date)


def test_month_helpers_roll_over_the_year() -> None:
    assert add_months(dt.date(2026, 11, 26), 1) == dt.date(2026, 12, 1)
    assert add_months(dt.date(2026, 12, 1), 1) == dt.date(2027, 1, 1)
    assert add_months(dt.date(2026, 12, 31), 13) == dt.date(2028, 1, 1)
    assert month_key(dt.date(2027, 2, 12)) == "2027-02"
