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

Early-bird (R47, P17) comes after the deal: the package's furthest-out tier that the IST booking
day still reaches (booked on or before departure − N days) takes its ₹ off each traveller, from
what the deal left and never below ₹1 each. Tiers never add up. Like the deal it is judged at
`now` — the quote and the hold — and the booking keeps the line in its snapshot.

A coupon (B15) comes after the deal and the early-bird and is taken off the trip fare once: a
flat ₹ amount, or a % of the fare after both, capped, rounded down to the rupee. It never takes
the fare below ₹1 — Razorpay refuses a ₹0 order. Whether the code may be used at all is
`services/booking/coupons.py`; `apply_coupon` only does the sum.

Add-ons (R46, P8) are priced here from the package's switched-on add-ons and added after every
discount, at full price: deals, coupons and early-bird never touch them. Per booking = the
price once; per traveller = × how many take it; per night = × the whole party × the nights.
"""

import datetime as dt
from collections import Counter
from collections.abc import Sequence

from app.errors import ApiError
from app.models import Coupon, Departure, Package, PackageAddon
from app.models.enums import AddonBasis, CouponKind, Occupancy
from app.schemas.bookings import (
    AddonChoice,
    LadderRung,
    Quote,
    QuoteAddon,
    QuoteCoupon,
    QuoteDeal,
    QuoteEarlyBird,
    QuoteLine,
    QuoteLineKind,
    QuoteTraveller,
    UnbookableReason,
)
from app.services.analytics import ist_today
from app.services.email.render import IST

MIN_DAYS_AHEAD = 2
MIN_TOTAL_PAISE = 100  # Razorpay's smallest order, ₹1
RUPEE = 100
# Line order on the breakdown; the deal lines, then the early-bird lines, follow in the same
# occupancy order.
ORDER = (Occupancy.DOUBLE, Occupancy.TRIPLE, Occupancy.SINGLE, Occupancy.CHILD)
DISCOUNTS = (QuoteLineKind.DEAL, QuoteLineKind.EARLY_BIRD)


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


def early_bird_tiers(pkg: Package) -> list[tuple[int, int]]:
    """The package's tiers as (days, off per traveller), furthest out first; [] when switched
    off. The table's checks keep tier 2 behind tier 1."""
    if not pkg.early_bird_on:
        return []
    tiers = [(pkg.eb1_days, pkg.eb1_off_paise), (pkg.eb2_days, pkg.eb2_off_paise)]
    return [(days, off) for days, off in tiers if days and off]


def early_bird_for(pkg: Package, *, date: dt.date, today: dt.date) -> QuoteEarlyBird | None:
    """The tier a booking made on IST `today` earns for a departure on `date`, or None."""
    for tier, (days, off) in enumerate(early_bird_tiers(pkg), start=1):
        book_by = date - dt.timedelta(days=days)
        if today <= book_by:
            return QuoteEarlyBird(tier=tier, days=days, per_traveller_paise=off, book_by=book_by)
    return None


def coupon_off(coupon: Coupon, amount_paise: int) -> int:
    """What the coupon takes off `amount_paise` (the fare after the deal and the early-bird), in
    whole rupees."""
    if coupon.kind == CouponKind.FLAT:
        off = coupon.amount_paise or 0
    else:
        off = amount_paise * (coupon.percent or 0) // 100
        if coupon.cap_paise:
            off = min(off, coupon.cap_paise)
    return max(0, min(off, amount_paise - MIN_TOTAL_PAISE)) // RUPEE * RUPEE


ADDON_GONE_REASON = "addon_unavailable"


def addon_gone(index: int, name: str | None = None) -> ApiError:
    """A picked add-on the package no longer offers (switched off or deleted since the page
    loaded): 409, with the choice's place in the request (`addons.<index>`) so the sheet drops
    exactly that one and asks again."""
    what = f"“{name}”" if name else "One of your add-ons"
    message = f"{what} is no longer offered — we took it off your booking"
    return ApiError(
        "conflict", message, reason=ADDON_GONE_REASON, field_errors={f"addons.{index}": message}
    )


def price_addons(
    offered: Sequence[PackageAddon], choices: Sequence[AddonChoice], *, party: int
) -> list[QuoteAddon]:
    """One line per chosen add-on, in the owner's order. `offered` = the package's add-ons
    (switched-off ones refuse); the schema already capped travellers at the party."""
    by_id = {a.id: a for a in offered}
    for i, c in enumerate(choices):
        found = by_id.get(c.addon_id)
        if found is None or not found.active:
            raise addon_gone(i, found.name if found else None)
    wanted = {c.addon_id: c for c in choices}
    lines: list[QuoteAddon] = []
    for a in offered:
        c = wanted.get(a.id)
        if c is None:
            continue
        travellers, nights = 1, 1
        if a.basis == AddonBasis.TRAVELLER:
            travellers = c.travellers or 0
            if travellers < 1:
                raise ApiError(
                    "validation",
                    f"Say how many travellers take “{a.name}”",
                    field_errors={"addons": f"Say how many travellers take “{a.name}”"},
                )
        elif a.basis == AddonBasis.NIGHT:
            travellers, nights = party, c.nights or 0
            limit = a.max_nights or 0
            if not 1 <= nights <= limit:
                message = f"“{a.name}” can be added for 1–{limit} nights"
                raise ApiError("validation", message, field_errors={"addons": message})
        lines.append(
            QuoteAddon(
                addon_id=a.id,
                name=a.name,
                basis=a.basis,
                unit_paise=a.price_paise,
                travellers=travellers,
                nights=nights,
                amount_paise=a.price_paise * travellers * nights,
            )
        )
    return lines


def apply_coupon(quote: Quote, coupon: Coupon) -> Quote:
    off = coupon_off(coupon, quote.fare_paise)
    return quote.model_copy(
        update={
            "coupon": QuoteCoupon(code=coupon.code, off_paise=off),
            "discount_paise": quote.discount_paise + off,
            "total_paise": quote.total_paise - off,
        }
    )


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
    addons: Sequence[QuoteAddon] = (),
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
    dealt = dict.fromkeys(ORDER, 0)  # the deal per traveller, by occupancy
    if off:
        assert pkg.deal_ends_at is not None  # deal_off is 0 without it
        deal = QuoteDeal(label=pkg.deal_label, ends_at=pkg.deal_ends_at, per_traveller_paise=off)
        for occ in ORDER:
            if counts[occ]:
                dealt[occ] = min(off, unit_price(dep, occ))
                line(QuoteLineKind.DEAL, occ, -dealt[occ])

    early_bird = early_bird_for(pkg, date=dep.date, today=ist_today(now))
    if early_bird:
        for occ in ORDER:
            left = unit_price(dep, occ) - dealt[occ] - MIN_TOTAL_PAISE  # ₹1 each stays
            each = min(early_bird.per_traveller_paise, max(0, left))
            if counts[occ] and each:
                line(QuoteLineKind.EARLY_BIRD, occ, -each)
        if not any(li.kind == QuoteLineKind.EARLY_BIRD for li in lines):
            early_bird = None  # the deal already took every traveller to ₹1 or less
    discount = -sum(li.amount_paise for li in lines if li.kind in DISCOUNTS)
    extras = sum(a.amount_paise for a in addons)

    return Quote(
        departure_id=dep.id,
        package_slug=pkg.slug,
        date=dep.date,
        seats_left=seats_left,
        lines=lines,
        deal=deal,
        early_bird=early_bird,
        coupon=None,
        addons=list(addons),
        ladder=[],
        subtotal_paise=subtotal,
        discount_paise=discount,
        addons_paise=extras,
        total_paise=subtotal - discount + extras,
    )


def start_of_ist_day(day: dt.date) -> dt.datetime:
    """00:00 IST on `day`, in UTC: the first instant a booking counts as made that day."""
    return dt.datetime.combine(day, dt.time(), IST).astimezone(dt.UTC)


def price_ladder(
    dep: Departure,
    pkg: Package,
    travellers: Sequence[QuoteTraveller],
    today_quote: Quote,
    *,
    deal_base: int,
    now: dt.datetime,
    coupon: Coupon | None = None,
) -> list[LadderRung]:
    """R47's ladder: today's trip fare, then the fare from the day after each tier that is still
    running ends — the same party re-priced on that IST day, deal and coupon included, add-ons
    left out. Days on which the date can no longer be booked online are skipped. [] when the
    package has no early-bird. The deal base and the coupon's terms are today's."""
    tiers = early_bird_tiers(pkg)
    if not tiers:
        return []
    rungs = [
        LadderRung(
            from_on=None, early_bird=today_quote.early_bird, fare_paise=today_quote.fare_paise
        )
    ]
    today, last = ist_today(now), dep.date - dt.timedelta(days=MIN_DAYS_AHEAD)
    for days, _off in tiers:
        day = dep.date - dt.timedelta(days=days) + dt.timedelta(days=1)
        if not today < day <= last:
            continue
        later = build_quote(
            dep,
            pkg,
            travellers,
            seats_left=today_quote.seats_left,
            deal_base=deal_base,
            now=start_of_ist_day(day),
        )
        if coupon is not None:
            later = apply_coupon(later, coupon)
        rungs.append(
            LadderRung(from_on=day, early_bird=later.early_bird, fare_paise=later.fare_paise)
        )
    return rungs
