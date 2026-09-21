"""Money, dates and labels as the PDF and the emails print them — a mirror of
web/src/lib/format.ts (change both)."""

import datetime as dt

WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
MONTHS = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)


def inr(rupees: int) -> str:
    """Indian grouping: ₹12,34,567."""
    s = str(abs(rupees))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = [head[max(i - 2, 0) : i] for i in range(len(head), 0, -2)][::-1]
        s = ",".join(groups) + "," + tail
    return ("-" if rupees < 0 else "") + "₹" + s


def long_date(d: dt.date) -> str:
    """`Fri 18 Dec 2026` — no zero padding, like the web's `formatDate`."""
    return f"{WEEKDAYS[d.weekday()]} {d.day} {MONTHS[d.month - 1]} {d.year}"


def duration(nights: int, days: int) -> str:
    """The web's `duration` — short form, everywhere on the site."""
    return f"{nights}N / {days}D"


def meals_label(breakfast: bool, lunch: bool, dinner: bool) -> str:
    """Format meals as `Breakfast · Lunch · Dinner` or `No meals`."""
    names = [
        n
        for n, on in (
            ("Breakfast", breakfast),
            ("Lunch", lunch),
            ("Dinner", dinner),
        )
        if on
    ]
    return " · ".join(names) if names else "No meals"


def seats_label(seats_left: int) -> str:
    """Format seat availability as `6 seats`, `1 seat`, or `Sold out`."""
    if seats_left <= 0:
        return "Sold out"
    return f"{seats_left} seat{'s' if seats_left != 1 else ''}"
