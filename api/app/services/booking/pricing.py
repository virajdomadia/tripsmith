"""The quote (04 v2 §4) — pure over a loaded departure and package, so it is tested to the paisa
without a database and the same numbers reach the Book-now panel, the booking snapshot and
(B4) the Razorpay order.

Bookable = package live (the caller 404s otherwise), double/triple/child priced (0 = "on
request", the v1 rule; the supplement may be 0), the date at least IST today + 2 days, and seats
for the whole party. The deal is a flat amount off per traveller — starting price − deal price —
while `now < deal_ends_at`, never more than that traveller's own price.

The "starting price" here is the deal *base*: the cheapest upcoming priced double, seats
ignored. The cached `starting_price_paise` skips sold-out dates, so it rises while holds sit on
the cheap date — reading it would let anyone widen the discount by holding seats and walking
away (the lapse fires no event, so it would stay wide until the daily cron).
"""

import datetime as dt
from collections import Counter
from collections.abc import Sequence

from app.models import Departure, Package
from app.models.enums import Occupancy
from app.schemas.bookings import (
    Quote,
    QuoteDeal,
    QuoteLine,
    QuoteLineKind,
    QuoteTraveller,
    UnbookableReason,
)
from app.services.analytics import ist_today

MIN_DAYS_AHEAD = 2
# Line order on the breakdown; the deal lines follow in the same occupancy order.
ORDER = (Occupancy.DOUBLE, Occupancy.TRIPLE, Occupancy.SINGLE, Occupancy.CHILD)


def unbookable_reason(
    dep: Departure, *, seats_left: int, party: int, now: dt.datetime
) -> UnbookableReason | None:
    """The first rule the departure breaks for this party, in the order the picker explains it."""
    if min(dep.price_double_paise, dep.price_triple_paise, dep.price_child_paise) <= 0:
        return UnbookableReason.ON_REQUEST
    if dep.date < ist_today(now) + dt.timedelta(days=MIN_DAYS_AHEAD):
        return UnbookableReason.TOO_SOON
    if seats_left < party:
        return UnbookableReason.SOLD_OUT
    return None


def deal_off(pkg: Package, *, base: int, now: dt.datetime) -> int:
    """The flat discount per traveller while the deal runs; 0 when there is none."""
    deal, ends = pkg.deal_price_paise, pkg.deal_ends_at
    if deal is None or ends is None or now >= ends or not 0 < deal < base:
        return 0
    return base - deal


def unit_price(dep: Departure, occupancy: Occupancy) -> int:
    """One traveller's full price in this occupancy (a single includes the supplement)."""
    match occupancy:
        case Occupancy.DOUBLE:
            return dep.price_double_paise
        case Occupancy.TRIPLE:
            return dep.price_triple_paise
        case Occupancy.SINGLE:
            return dep.price_double_paise + dep.single_supplement_paise
        case Occupancy.CHILD:
            return dep.price_child_paise


def build_quote(
    dep: Departure,
    pkg: Package,
    travellers: Sequence[QuoteTraveller],
    *,
    seats_left: int,
    deal_base: int,
    now: dt.datetime,
) -> Quote:
    counts = Counter(t.occupancy for t in travellers)
    lines: list[QuoteLine] = []

    def line(kind: QuoteLineKind, occupancy: Occupancy, unit: int) -> None:
        n = counts[occupancy]
        lines.append(
            QuoteLine(
                kind=kind, occupancy=occupancy, count=n, unit_paise=unit, amount_paise=n * unit
            )
        )

    for occ in ORDER:
        if not counts[occ]:
            continue
        base = dep.price_double_paise if occ == Occupancy.SINGLE else unit_price(dep, occ)
        line(QuoteLineKind(occ.value), occ, base)
        if occ == Occupancy.SINGLE and dep.single_supplement_paise:
            line(QuoteLineKind.SINGLE_SUPPLEMENT, occ, dep.single_supplement_paise)
    subtotal = sum(li.amount_paise for li in lines)

    off = deal_off(pkg, base=deal_base, now=now)
    deal: QuoteDeal | None = None
    if off:
        assert pkg.deal_ends_at is not None  # deal_off is 0 without it
        deal = QuoteDeal(label=pkg.deal_label, ends_at=pkg.deal_ends_at, per_traveller_paise=off)
        for occ in ORDER:
            if counts[occ]:
                line(QuoteLineKind.DEAL, occ, -min(off, unit_price(dep, occ)))
    discount = -sum(li.amount_paise for li in lines if li.kind == QuoteLineKind.DEAL)

    return Quote(
        departure_id=dep.id,
        package_slug=pkg.slug,
        date=dep.date,
        seats_left=seats_left,
        lines=lines,
        deal=deal,
        subtotal_paise=subtotal,
        discount_paise=discount,
        total_paise=subtotal - discount,
    )
