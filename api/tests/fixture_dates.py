"""Departure dates for the test catalog, anchored to today so "upcoming" stays upcoming.

The frozen catalog used fixed calendar dates; they aged into the past and turned CI red. Every
date is now a day in one of the months after the current one, which keeps the shape the tests
rely on (which month a departure falls in, who departs first) whatever day the suite runs. The
first month is always the next calendar month, so every date is in the future and `M1` day 20 is
never less than three weeks away.
"""

import datetime as dt

from app.services.analytics import ist_today


def add_months(day: dt.date, months: int) -> dt.date:
    """The 1st of the month `months` after `day`'s month."""
    index = day.year * 12 + (day.month - 1) + months
    return dt.date(index // 12, index % 12 + 1, 1)


def month_key(day: dt.date) -> str:
    """`YYYY-MM`, the shape of the `month` filter and the months facet."""
    return f"{day.year:04d}-{day.month:02d}"


_THIS_MONTH = ist_today().replace(day=1)
M1, M2, M3, M4, M5 = (add_months(_THIS_MONTH, n) for n in range(1, 6))

# North Goa Beaches (the first Goa package), Goa Quiet Escape, and the Kerala trip that
# tests/test_search.py adds. Day-of-month and month spread mirror the original frozen dates.
NGB_DATES = [M1.replace(day=20), M2.replace(day=18), M3.replace(day=15), M4.replace(day=12)]
GQE_DATES = [M1.replace(day=27), M2.replace(day=24), M3.replace(day=22)]
KER_DATES = [M2.replace(day=5), M3.replace(day=9)]  # the second is sold out
