"""The owner's reports (R55, P12): one IST date range, nine sections, a CSV for each.

Read-only. Every booking section starts from the same rows — the bookings **departing** in the
range, as the desk's From/To filter selects them — so the totals are the desk CSV's columns
summed (R55 accept):

- booked = Σ Total over bookings holding seats (confirmed, deposit paid, completed);
- net = collected − refunded = Σ Paid over every status (`paid_paise` drops when a refund is
  planned and comes back if it fails, exactly as the refunds table reads);
- balances due = Σ Balance due (a deposit booking's total − paid).

The funnel alone counts activity on the day it happened. The "cash" table counts money by the
day it moved, whatever the departure. A few grouped queries load the rows and the arithmetic
runs here: at a travel agency's scale a year is a few thousand bookings at most.

The seeded demo history (`seed.py --history`) is marked by its `history-seed-N@example.com`
contacts; `demo=False` leaves those bookings and enquiries out, and a departure only they
booked. Page views carry no contact, so the funnel's views always include the seeded ones.
"""

import datetime as dt
from collections import Counter, defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import ColumnElement, and_, exists, func, not_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import (
    Booking,
    BookingAddon,
    BookingTraveller,
    Departure,
    Enquiry,
    Package,
    PackageAddon,
    PackageView,
    Payment,
    Refund,
)
from app.models.catalog import departure_availability
from app.models.enums import (
    BookingChannel,
    BookingStatus,
    CancelReason,
    PackageStatus,
    PaymentStatus,
    RefundStatus,
)
from app.schemas.reports import (
    EMPTIEST_DAYS,
    EMPTIEST_MAX,
    EMPTIEST_SKIP_GUARANTEED_PERCENT,
    SPAN_MAX_DAYS,
    DiscountSource,
    ReportAddon,
    ReportAddons,
    ReportBucket,
    ReportCancellations,
    ReportCash,
    ReportCashMonth,
    ReportChannel,
    ReportCustomers,
    ReportDeparture,
    ReportDiscount,
    ReportDiscounts,
    ReportFunnel,
    ReportFunnelPackage,
    ReportKpis,
    ReportMoney,
    ReportMonth,
    ReportOccupancy,
    ReportPackage,
    ReportPastFill,
    ReportPrevious,
    ReportRange,
    ReportReason,
    Reports,
    ReportSection,
)
from app.services.admin_enquiries import csv_safe, ist_day_start
from app.services.analytics import ist_today
from app.services.booking.counter import CHANNEL_WORDS
from app.services.booking.desk import CANCEL_LABELS, SEAT_HOLDING
from app.services.email.render import IST
from app.services.email.send import HISTORY_LOCAL_PREFIX
from app.services.gst import tax

BAD_RANGE = "Pick both days, the first on or before the last"
TOO_WIDE = f"Pick at most {SPAN_MAX_DAYS} days"
PAID_STATUSES = (PaymentStatus.CAPTURED, PaymentStatus.REFUNDED)  # money that came in
PARTY_BUCKETS = ("1", "2", "3", "4", "5+")
LEAD_BUCKETS = ((7, "Under 7 days"), (30, "7–29 days"), (90, "30–89 days"), (None, "90+ days"))
DISCOUNT_LABELS = {
    DiscountSource.DEAL: "Deals",
    DiscountSource.EARLY_BIRD: "Early-bird",
    DiscountSource.MANUAL: "Manual (counter)",
}


# --- the range ----------------------------------------------------------------------------------


def fy_start(day: dt.date) -> dt.date:
    """1 April of the Indian financial year `day` falls in."""
    return dt.date(day.year if day.month >= 4 else day.year - 1, 4, 1)


def this_fy(today: dt.date) -> tuple[dt.date, dt.date]:
    start = fy_start(today)
    return start, start.replace(year=start.year + 1) - dt.timedelta(days=1)


def resolve_range(
    start: dt.date | None, end: dt.date | None, today: dt.date
) -> tuple[dt.date, dt.date]:
    """Both days, or neither (this financial year — the page's default preset)."""
    if start is None and end is None:
        return this_fy(today)
    if start is None or end is None or end < start:
        raise ApiError("validation", BAD_RANGE, field_errors={"from": BAD_RANGE})
    if (end - start).days + 1 > SPAN_MAX_DAYS:
        raise ApiError("validation", TOO_WIDE, field_errors={"from": TOO_WIDE})
    return start, end


def previous_range(start: dt.date, end: dt.date) -> tuple[dt.date, dt.date]:
    days = (end - start).days + 1
    return start - dt.timedelta(days=days), start - dt.timedelta(days=1)


def month_key(day: dt.date) -> str:
    return day.strftime("%Y-%m")


def months_between(start: dt.date, end: dt.date) -> list[str]:
    out, y, m = [], start.year, start.month
    while (y, m) <= (end.year, end.month):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def ist_date(at: dt.datetime) -> dt.date:
    return at.astimezone(IST).date()


def demo_email(column: Any) -> ColumnElement[bool]:
    """The seeded demo history's contacts (`history-seed-N@example.com`)."""
    return func.lower(column).like(f"{HISTORY_LOCAL_PREFIX}%@example.com")


# --- the booking rows ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Row:
    id: str
    status: BookingStatus
    cancel_reason: CancelReason | None
    channel: BookingChannel
    booked_on: dt.date  # IST
    total: int
    paid: int
    quote: dict[str, Any]
    package_id: str
    departure_id: str
    departs: dt.date
    email: str
    state: str | None
    travellers: int
    collected: int
    refunded: int

    @property
    def counted(self) -> bool:
        """Holding seats: the bookings every "booked" number is made of."""
        return self.status in SEAT_HOLDING

    @property
    def balance(self) -> int:
        return self.total - self.paid if self.status == BookingStatus.PARTIALLY_PAID else 0

    @property
    def net(self) -> int:
        return self.collected - self.refunded


def _travellers() -> Any:
    return (
        select(BookingTraveller.booking_id, func.count().label("n"))
        .group_by(BookingTraveller.booking_id)
        .subquery()
    )


def _collected() -> Any:
    return (
        select(Payment.booking_id, func.sum(Payment.amount_paise).label("n"))
        .where(Payment.status.in_(PAID_STATUSES))
        .group_by(Payment.booking_id)
        .subquery()
    )


def _refunded() -> Any:
    return (
        select(Refund.booking_id, func.sum(Refund.amount_paise).label("n"))
        .where(Refund.status != RefundStatus.FAILED)
        .group_by(Refund.booking_id)
        .subquery()
    )


async def booking_rows(db: AsyncSession, start: dt.date, end: dt.date, *, demo: bool) -> list[Row]:
    """Every booking departing from `start` to `end`, any status — the desk's From/To view."""
    trav, paid, back = _travellers(), _collected(), _refunded()
    stmt = (
        select(
            Booking.id,
            Booking.status,
            Booking.cancel_reason,
            Booking.channel,
            Booking.created_at,
            Booking.total_paise,
            Booking.paid_paise,
            Booking.quote,
            Booking.package_id,
            Booking.departure_id,
            Departure.date,
            Booking.contact_email,
            Booking.billing_state,
            func.coalesce(trav.c.n, 0),
            func.coalesce(paid.c.n, 0),
            func.coalesce(back.c.n, 0),
        )
        .join(Departure, Departure.id == Booking.departure_id)
        .outerjoin(trav, trav.c.booking_id == Booking.id)
        .outerjoin(paid, paid.c.booking_id == Booking.id)
        .outerjoin(back, back.c.booking_id == Booking.id)
        .where(Departure.date >= start, Departure.date <= end)
    )
    if not demo:
        stmt = stmt.where(not_(demo_email(Booking.contact_email)))
    rows = (await db.execute(stmt)).all()
    return [
        Row(
            id=id,
            status=status,
            cancel_reason=reason,
            channel=channel,
            booked_on=ist_date(created),
            total=int(total),
            paid=int(paid_paise),
            quote=quote or {},
            package_id=package_id,
            departure_id=departure_id,
            departs=departs,
            email=email,
            state=state,
            travellers=int(n),
            collected=int(collected),
            refunded=int(refunded),
        )
        for (
            id,
            status,
            reason,
            channel,
            created,
            total,
            paid_paise,
            quote,
            package_id,
            departure_id,
            departs,
            email,
            state,
            n,
            collected,
            refunded,
        ) in rows
    ]


# --- departures ---------------------------------------------------------------------------------


@dataclass(frozen=True)
class Dep:
    id: str
    package_id: str
    package_name: str
    live: bool
    date: dt.date
    seats_total: int
    guaranteed: bool
    sold: int
    held: int
    free: int

    @property
    def fill(self) -> float:
        return self.sold / self.seats_total if self.seats_total else 1.0


async def departures(db: AsyncSession, where: ColumnElement[bool], *, demo: bool) -> list[Dep]:
    """Departures matching `where`, with sold seats (travellers on bookings holding seats), and
    held = total − every sold seat − free, as the calendar counts them (R50). Without the demo
    history, its seats leave `sold` and a departure only it booked leaves the list."""
    rows = (
        await db.execute(
            select(
                Departure.id,
                Departure.package_id,
                Package.name,
                Package.status,
                Departure.date,
                Departure.seats_total,
                Departure.guaranteed,
                departure_availability.c.seats_left,
            )
            .join(Package, Package.id == Departure.package_id)
            .join(departure_availability, departure_availability.c.departure_id == Departure.id)
            .where(where)
            .order_by(Departure.date, Package.name)
        )
    ).all()
    ids = [r[0] for r in rows]
    if not ids:
        return []
    is_demo = demo_email(Booking.contact_email)
    holding = Booking.status.in_(SEAT_HOLDING)
    seats = await db.execute(
        select(
            Booking.departure_id,
            func.count(BookingTraveller.id).filter(holding),
            func.count(BookingTraveller.id).filter(holding, not_(is_demo)),
        )
        .join(BookingTraveller, BookingTraveller.booking_id == Booking.id)
        .where(Booking.departure_id.in_(ids))
        .group_by(Booking.departure_id)
    )
    sold_all: dict[str, int] = {}
    sold_real: dict[str, int] = {}
    for dep_id, every, real in seats.all():
        sold_all[dep_id], sold_real[dep_id] = int(every), int(real)
    only_demo: set[str] = set()
    if not demo:
        kinds = await db.execute(
            select(Booking.departure_id, func.bool_and(is_demo))
            .where(Booking.departure_id.in_(ids))
            .group_by(Booking.departure_id)
        )
        only_demo = {dep_id for dep_id, all_demo in kinds.all() if all_demo}
    out = []
    for id, package_id, name, status, date, total, guaranteed, left in rows:
        if id in only_demo:
            continue
        every, free = sold_all.get(id, 0), int(left)
        out.append(
            Dep(
                id=id,
                package_id=package_id,
                package_name=name,
                live=status == PackageStatus.LIVE,
                date=date,
                seats_total=total,
                guaranteed=guaranteed,
                sold=every if demo else sold_real.get(id, 0),
                held=max(total - every - free, 0),
                free=free,
            )
        )
    return out


def _departure_out(d: Dep, today: dt.date) -> ReportDeparture:
    return ReportDeparture(
        departure_id=d.id,
        package_id=d.package_id,
        package_name=d.package_name,
        date=d.date,
        seats_total=d.seats_total,
        sold=d.sold,
        held=d.held,
        free=d.free,
        guaranteed=d.guaranteed,
        days_to_go=(d.date - today).days,
    )


def emptiest(deps: Iterable[Dep]) -> list[Dep]:
    """The live departures with the most room, the soonest first among equals; a guaranteed
    date already 70 % full and a sold-out one are not a worry."""
    worry = [
        d
        for d in deps
        if d.live
        and d.seats_total
        and d.sold < d.seats_total
        and not (d.guaranteed and d.fill * 100 >= EMPTIEST_SKIP_GUARANTEED_PERCENT)
    ]
    return sorted(worry, key=lambda d: (d.fill, d.date))[:EMPTIEST_MAX]


# --- sections -----------------------------------------------------------------------------------


def gst_in(r: Row) -> int:
    """The GST inside what the booking kept (prices are GST-inclusive; R51's split)."""
    return tax.split(r.net, r.state).tax_paise if r.net > 0 else 0


def _money(rows: Sequence[Row], start: dt.date, end: dt.date, cash: ReportCash) -> ReportMoney:
    months = {
        m: ReportMonth(
            month=m,
            bookings=0,
            booked_paise=0,
            collected_paise=0,
            refunded_paise=0,
            net_paise=0,
            gst_paise=0,
            balance_paise=0,
        )
        for m in months_between(start, end)
    }
    for r in rows:
        m = months[month_key(r.departs)]
        if r.counted:
            m.bookings += 1
            m.booked_paise += r.total
        m.collected_paise += r.collected
        m.refunded_paise += r.refunded
        m.net_paise += r.net
        m.gst_paise += gst_in(r)
        m.balance_paise += r.balance
    collected = sum(r.collected for r in rows)
    refunded = sum(r.refunded for r in rows)
    return ReportMoney(
        booked_paise=sum(r.total for r in rows if r.counted),
        collected_paise=collected,
        refunded_paise=refunded,
        net_paise=collected - refunded,
        gst_paise=sum(m.gst_paise for m in months.values()),
        balance_paise=sum(r.balance for r in rows),
        balance_bookings=sum(1 for r in rows if r.balance),
        months=list(months.values()),
        cash=cash,
    )


async def _cash(db: AsyncSession, start: dt.date, end: dt.date, *, demo: bool) -> ReportCash:
    since, until = ist_day_start(start), ist_day_start(end + dt.timedelta(days=1))
    ins = select(Payment.created_at, Payment.amount_paise).where(
        Payment.status.in_(PAID_STATUSES), Payment.created_at >= since, Payment.created_at < until
    )
    when = func.coalesce(Refund.processed_at, Refund.created_at)
    outs = select(when, Refund.amount_paise).where(
        Refund.status != RefundStatus.FAILED, when >= since, when < until
    )
    if not demo:
        ins = ins.join(Booking, Booking.id == Payment.booking_id).where(
            not_(demo_email(Booking.contact_email))
        )
        outs = outs.join(Booking, Booking.id == Refund.booking_id).where(
            not_(demo_email(Booking.contact_email))
        )
    months = {
        m: ReportCashMonth(month=m, in_paise=0, out_paise=0) for m in months_between(start, end)
    }
    for at, amount in (await db.execute(ins)).all():
        months[month_key(ist_date(at))].in_paise += int(amount)
    for at, amount in (await db.execute(outs)).all():
        months[month_key(ist_date(at))].out_paise += int(amount)
    total_in = sum(m.in_paise for m in months.values())
    total_out = sum(m.out_paise for m in months.values())
    return ReportCash(
        in_paise=total_in,
        out_paise=total_out,
        net_paise=total_in - total_out,
        months=list(months.values()),
    )


def _packages(
    rows: Sequence[Row], deps: Sequence[Dep], names: dict[str, str]
) -> list[ReportPackage]:
    out: dict[str, ReportPackage] = {}

    def of(package_id: str) -> ReportPackage:
        if package_id not in out:
            out[package_id] = ReportPackage(
                package_id=package_id,
                name=names.get(package_id, ""),
                bookings=0,
                travellers=0,
                booked_paise=0,
                net_paise=0,
                departures=0,
                seats_sold=0,
                seats_total=0,
            )
        return out[package_id]

    for r in rows:
        p = of(r.package_id)
        p.net_paise += r.net
        if r.counted:
            p.bookings += 1
            p.travellers += r.travellers
            p.booked_paise += r.total
    for d in deps:
        p = of(d.package_id)
        p.departures += 1
        p.seats_sold += d.sold
        p.seats_total += d.seats_total
    return sorted(out.values(), key=lambda p: (-p.booked_paise, -p.seats_sold, p.name))


def _occupancy(deps: Sequence[Dep], soon: Sequence[Dep], today: dt.date) -> ReportOccupancy:
    past: dict[str, ReportPastFill] = {}
    for d in deps:
        if d.date >= today:
            continue
        p = past.setdefault(
            d.package_id,
            ReportPastFill(
                package_id=d.package_id,
                name=d.package_name,
                departures=0,
                seats_sold=0,
                seats_total=0,
            ),
        )
        p.departures += 1
        p.seats_sold += d.sold
        p.seats_total += d.seats_total
    return ReportOccupancy(
        upcoming=[_departure_out(d, today) for d in deps if d.date >= today],
        past=sorted(
            past.values(),
            key=lambda p: (-(p.seats_sold / p.seats_total if p.seats_total else 0), p.name),
        ),
        emptiest=[_departure_out(d, today) for d in emptiest(soon)],
    )


async def _funnel(
    db: AsyncSession, start: dt.date, end: dt.date, names: dict[str, str], *, demo: bool
) -> ReportFunnel:
    since, until = ist_day_start(start), ist_day_start(end + dt.timedelta(days=1))
    views = {
        p: int(n)
        for p, n in (
            await db.execute(
                select(PackageView.package_id, func.sum(PackageView.count))
                .where(PackageView.day >= start, PackageView.day <= end)
                .group_by(PackageView.package_id)
            )
        ).all()
    }
    enq = (
        select(Enquiry.package_id, func.count())
        .where(
            Enquiry.package_id.is_not(None), Enquiry.created_at >= since, Enquiry.created_at < until
        )
        .group_by(Enquiry.package_id)
    )
    if not demo:
        enq = enq.where(not_(demo_email(Enquiry.email)))
    enquiries = {p: int(n) for p, n in (await db.execute(enq)).all() if p is not None}
    ever_paid = (
        exists()
        .where(Payment.booking_id == Booking.id, Payment.status.in_(PAID_STATUSES))
        .correlate(Booking)
    )
    holds_q = (
        select(Booking.package_id, func.count(), func.count().filter(ever_paid))
        .where(
            Booking.channel == BookingChannel.WEB,
            Booking.created_at >= since,
            Booking.created_at < until,
        )
        .group_by(Booking.package_id)
    )
    if not demo:
        holds_q = holds_q.where(not_(demo_email(Booking.contact_email)))
    holds = {p: (int(h), int(paid)) for p, h, paid in (await db.execute(holds_q)).all()}
    packages = [
        ReportFunnelPackage(
            package_id=p,
            name=names.get(p, ""),
            views=int(views.get(p, 0)),
            enquiries=int(enquiries.get(p, 0)),
            holds=holds.get(p, (0, 0))[0],
            paid=holds.get(p, (0, 0))[1],
        )
        for p in set(views) | set(enquiries) | set(holds)
    ]
    packages.sort(key=lambda p: (-p.views, -p.holds, p.name))
    return ReportFunnel(
        views=sum(p.views for p in packages),
        enquiries=sum(p.enquiries for p in packages),
        holds=sum(p.holds for p in packages),
        paid=sum(p.paid for p in packages),
        packages=packages,
    )


def _reason_key(r: Row) -> str:
    return r.cancel_reason.value if r.cancel_reason else "other"


def _reasons(rows: Iterable[Row]) -> list[ReportReason]:
    out: dict[str, ReportReason] = {}
    for r in rows:
        key = _reason_key(r)
        found = out.setdefault(
            key,
            ReportReason(
                reason=key,
                label=CANCEL_LABELS[r.cancel_reason] if r.cancel_reason else "Other",
                bookings=0,
                refunded_paise=0,
                kept_paise=0,
            ),
        )
        found.bookings += 1
        found.refunded_paise += r.refunded
        found.kept_paise += r.net
    return sorted(out.values(), key=lambda x: (-x.bookings, x.label))


def _cancellations(rows: Sequence[Row]) -> ReportCancellations:
    paid = [r for r in rows if r.collected > 0]
    gone = [r for r in paid if r.status == BookingStatus.CANCELLED]
    lapsed = [r for r in rows if r.collected == 0 and r.status == BookingStatus.CANCELLED]
    return ReportCancellations(
        paid_bookings=len(paid),
        cancelled=len(gone),
        refunded_paise=sum(r.refunded for r in gone),
        kept_paise=sum(r.net for r in gone),
        reasons=_reasons(gone),
        lapsed=_reasons(lapsed),
    )


def discount_parts(quote: dict[str, Any]) -> list[tuple[DiscountSource, str, int]]:
    """(source, label, ₹ off) for each discount on a booking's quote snapshot."""
    parts: list[tuple[DiscountSource, str, int]] = []
    lines = quote.get("lines") or []
    for source in (DiscountSource.DEAL, DiscountSource.EARLY_BIRD):
        off = -sum(int(li.get("amountPaise") or 0) for li in lines if li.get("kind") == source)
        if off > 0:
            parts.append((source, DISCOUNT_LABELS[source], off))
    if (coupon := quote.get("coupon")) and int(coupon.get("offPaise") or 0) > 0:
        parts.append(
            (DiscountSource.COUPON, str(coupon.get("code") or ""), int(coupon["offPaise"]))
        )
    if (manual := quote.get("manual")) and int(manual.get("offPaise") or 0) > 0:
        parts.append(
            (DiscountSource.MANUAL, DISCOUNT_LABELS[DiscountSource.MANUAL], int(manual["offPaise"]))
        )
    return parts


def _discounts(counted: Sequence[Row]) -> ReportDiscounts:
    out: dict[tuple[DiscountSource, str], ReportDiscount] = {}
    discounted = 0
    for r in counted:
        parts = discount_parts(r.quote)
        discounted += bool(parts)
        for source, label, off in parts:
            d = out.setdefault(
                (source, label),
                ReportDiscount(
                    source=source, label=label, given_paise=0, bookings=0, booked_paise=0
                ),
            )
            d.given_paise += off
            d.bookings += 1
            d.booked_paise += r.total
    sources = sorted(out.values(), key=lambda d: (-d.given_paise, d.label))
    return ReportDiscounts(
        given_paise=sum(d.given_paise for d in sources),
        discounted_bookings=discounted,
        bookings=len(counted),
        sources=sources,
    )


async def _addons(db: AsyncSession, counted: Sequence[Row]) -> ReportAddons:
    ids = [r.id for r in counted]
    taken = (
        (
            await db.execute(
                select(
                    BookingAddon.booking_id,
                    BookingAddon.addon_id,
                    BookingAddon.name,
                    BookingAddon.amount_paise,
                ).where(BookingAddon.booking_id.in_(ids), BookingAddon.removed_at.is_(None))
            )
        ).all()
        if ids
        else []
    )
    offered = (
        await db.execute(select(PackageAddon.id, PackageAddon.package_id, PackageAddon.name))
    ).all()
    packages_of: dict[str, set[str]] = defaultdict(set)
    name_of: dict[str, str] = {}
    for addon_id, package_id, name in offered:
        packages_of[addon_id].add(package_id)
        name_of[addon_id] = name
    per_package = Counter(r.package_id for r in counted)
    takers: dict[str, set[str]] = defaultdict(set)
    revenue: Counter[str] = Counter()
    eligible: dict[str, int] = {}
    with_any: set[str] = set()
    for booking_id, addon_id, name, amount in taken:
        key = addon_id or f"name:{name}"  # an add-on deleted since: its own row, by name
        name_of.setdefault(key, name)
        takers[key].add(booking_id)
        revenue[key] += int(amount)
        with_any.add(booking_id)
    for key in takers:
        packages = packages_of.get(key)
        eligible[key] = sum(per_package[p] for p in packages) if packages else len(takers[key])
    rows = [
        ReportAddon(
            name=name_of[key],
            bookings=len(takers[key]),
            eligible=max(eligible[key], len(takers[key])),
            revenue_paise=revenue[key],
        )
        for key in takers
    ]
    rows.sort(key=lambda a: (-a.revenue_paise, a.name))
    return ReportAddons(
        revenue_paise=sum(revenue.values()),
        with_any=len(with_any),
        bookings=len(counted),
        addons=rows,
    )


def _channels(counted: Sequence[Row]) -> list[ReportChannel]:
    out = {
        c: ReportChannel(channel=c, bookings=0, travellers=0, booked_paise=0)
        for c in BookingChannel
    }
    for r in counted:
        c = out[r.channel]
        c.bookings += 1
        c.travellers += r.travellers
        c.booked_paise += r.total
    return list(out.values())


def party_bucket(n: int) -> str:
    return str(n) if n < 5 else "5+"


def lead_bucket(days: int) -> str:
    for limit, label in LEAD_BUCKETS:
        if limit is None or days < limit:
            return label
    raise AssertionError("unreachable")


async def _customers(db: AsyncSession, counted: Sequence[Row]) -> ReportCustomers:
    emails = {r.email.lower() for r in counted}
    paid_ever: dict[str, int] = {}
    if emails:
        email = func.lower(Booking.contact_email)
        paid_ever = {
            e: int(n)
            for e, n in (
                await db.execute(
                    select(email, func.count())
                    .where(email.in_(emails), Booking.status.in_(SEAT_HOLDING))
                    .group_by(email)
                )
            ).all()
        }
    party = Counter(party_bucket(r.travellers) for r in counted)
    lead = Counter(lead_bucket(max((r.departs - r.booked_on).days, 0)) for r in counted)
    repeat = sum(1 for r in counted if paid_ever.get(r.email.lower(), 0) >= 2)
    return ReportCustomers(
        bookings=len(counted),
        travellers=sum(r.travellers for r in counted),
        party=[ReportBucket(label=b, bookings=party[b]) for b in PARTY_BUCKETS],
        lead=[ReportBucket(label=label, bookings=lead[label]) for _, label in LEAD_BUCKETS],
        repeat=repeat,
        first=len(counted) - repeat,
    )


# --- the whole report ---------------------------------------------------------------------------


async def get_reports(
    db: AsyncSession,
    start: dt.date | None = None,
    end: dt.date | None = None,
    *,
    demo: bool = True,
    today: dt.date | None = None,
) -> Reports:
    today = today or ist_today()
    start, end = resolve_range(start, end, today)
    prev_start, prev_end = previous_range(start, end)
    names = {id: name for id, name in (await db.execute(select(Package.id, Package.name))).all()}

    rows = await booking_rows(db, start, end, demo=demo)
    counted = [r for r in rows if r.counted]
    previous = await booking_rows(db, prev_start, prev_end, demo=demo)
    deps = await departures(db, and_(Departure.date >= start, Departure.date <= end), demo=demo)
    soon = await departures(
        db,
        and_(
            Departure.date >= today,
            Departure.date <= today + dt.timedelta(days=EMPTIEST_DAYS),
            Package.status == PackageStatus.LIVE,
        ),
        demo=demo,
    )
    demo_count = (
        await db.execute(
            select(func.count())
            .select_from(Booking)
            .join(Departure, Departure.id == Booking.departure_id)
            .where(
                Departure.date >= start,
                Departure.date <= end,
                demo_email(Booking.contact_email),
            )
        )
    ).scalar_one()
    money = _money(rows, start, end, await _cash(db, start, end, demo=demo))
    return Reports(
        range=ReportRange.model_validate(
            {
                "from": start,
                "to": end,
                "previous_from": prev_start,
                "previous_to": prev_end,
                "today": today,
                "demo": demo,
                "demo_bookings": int(demo_count),
            }
        ),
        kpis=ReportKpis(
            booked_paise=money.booked_paise,
            collected_paise=money.collected_paise,
            refunded_paise=money.refunded_paise,
            net_paise=money.net_paise,
            balance_paise=money.balance_paise,
            bookings=len(counted),
            travellers=sum(r.travellers for r in counted),
            seats_sold=sum(d.sold for d in deps),
            seats_total=sum(d.seats_total for d in deps),
            departures=len(deps),
            previous=ReportPrevious(
                booked_paise=sum(r.total for r in previous if r.counted),
                net_paise=sum(r.net for r in previous),
                bookings=sum(1 for r in previous if r.counted),
            ),
        ),
        money=money,
        packages=_packages(rows, deps, names),
        occupancy=_occupancy(deps, soon, today),
        funnel=await _funnel(db, start, end, names, demo=demo),
        cancellations=_cancellations(rows),
        discounts=_discounts(counted),
        addons=await _addons(db, counted),
        channels=_channels(counted),
        customers=await _customers(db, counted),
    )


# --- csv ----------------------------------------------------------------------------------------


def rupees(paise: int) -> str:
    """Whole rupees as the desk CSV writes them; paise only when there are some (GST)."""
    return str(paise // 100) if paise % 100 == 0 else f"{paise / 100:.2f}"


def percent(part: int, whole: int) -> str:
    return f"{part * 100 / whole:.1f}" if whole else ""


Table = tuple[list[str], list[list[str]]]


def _money_csv(r: Reports) -> Table:
    m = r.money
    head = [
        "Departure month",
        "Bookings",
        "Booked (₹)",
        "Collected (₹)",
        "Refunded (₹)",
        "Net (₹)",
        "GST in net (₹)",
        "Balance due (₹)",
    ]

    def line(label: str, n: int, x: ReportMonth | ReportMoney) -> list[str]:
        return [
            label,
            str(n),
            rupees(x.booked_paise),
            rupees(x.collected_paise),
            rupees(x.refunded_paise),
            rupees(x.net_paise),
            rupees(x.gst_paise),
            rupees(x.balance_paise),
        ]

    rows = [line(x.month, x.bookings, x) for x in m.months]
    rows.append(line("Total", r.kpis.bookings, m))
    return head, rows


def _cash_csv(r: Reports) -> Table:
    c = r.money.cash
    rows = [
        [x.month, rupees(x.in_paise), rupees(x.out_paise), rupees(x.in_paise - x.out_paise)]
        for x in c.months
    ]
    rows.append(["Total", rupees(c.in_paise), rupees(c.out_paise), rupees(c.net_paise)])
    return ["Month (IST)", "Payments in (₹)", "Refunds out (₹)", "Net (₹)"], rows


def _packages_csv(r: Reports) -> Table:
    head = [
        "Package",
        "Bookings",
        "Travellers",
        "Booked (₹)",
        "Net (₹)",
        "Departures",
        "Seats sold",
        "Seats",
        "Fill (%)",
    ]
    rows = [
        [
            p.name,
            str(p.bookings),
            str(p.travellers),
            rupees(p.booked_paise),
            rupees(p.net_paise),
            str(p.departures),
            str(p.seats_sold),
            str(p.seats_total),
            percent(p.seats_sold, p.seats_total),
        ]
        for p in r.packages
    ]
    k = r.kpis
    rows.append(
        [
            "Total",
            str(k.bookings),
            str(k.travellers),
            rupees(k.booked_paise),
            rupees(k.net_paise),
            str(k.departures),
            str(k.seats_sold),
            str(k.seats_total),
            percent(k.seats_sold, k.seats_total),
        ]
    )
    return head, rows


def _departure_line(view: str, d: ReportDeparture, flag: str) -> list[str]:
    return [
        view,
        d.package_name,
        d.date.isoformat(),
        "1",
        str(d.seats_total),
        str(d.sold),
        str(d.held),
        str(d.free),
        percent(d.sold, d.seats_total),
        flag,
    ]


def _occupancy_csv(r: Reports) -> Table:
    o = r.occupancy
    flagged = {d.departure_id for d in o.emptiest}
    head = [
        "View",
        "Package",
        "Departs",
        "Departures",
        "Seats",
        "Sold",
        "Held",
        "Free",
        "Fill (%)",
        "Flag",
    ]
    rows = [
        _departure_line("Upcoming", d, "Emptiest" if d.departure_id in flagged else "")
        for d in o.upcoming
    ]
    rows += [
        [
            "Past",
            p.name,
            "",
            str(p.departures),
            str(p.seats_total),
            str(p.seats_sold),
            "",
            "",
            percent(p.seats_sold, p.seats_total),
            "",
        ]
        for p in o.past
    ]
    rows += [
        _departure_line("Emptiest, next 60 days", d, f"{d.days_to_go} days to go")
        for d in o.emptiest
    ]
    return head, rows


def _funnel_csv(r: Reports) -> Table:
    f = r.funnel
    head = ["Package", "Views", "Enquiries", "Holds", "Paid", "Views to paid (%)"]
    rows = [
        [
            p.name,
            str(p.views),
            str(p.enquiries),
            str(p.holds),
            str(p.paid),
            percent(p.paid, p.views),
        ]
        for p in f.packages
    ]
    rows.append(
        [
            "Total",
            str(f.views),
            str(f.enquiries),
            str(f.holds),
            str(f.paid),
            percent(f.paid, f.views),
        ]
    )
    return head, rows


def _cancellations_csv(r: Reports) -> Table:
    c = r.cancellations
    head = ["Group", "Reason", "Bookings", "Refunded (₹)", "Kept (₹)"]
    rows = [
        [
            "Cancelled after paying",
            x.label,
            str(x.bookings),
            rupees(x.refunded_paise),
            rupees(x.kept_paise),
        ]
        for x in c.reasons
    ]
    rows += [["Never paid", x.label, str(x.bookings), "", ""] for x in c.lapsed]
    rate = percent(c.cancelled, c.paid_bookings) or "0.0"
    rows.append(
        [
            "Total",
            f"{c.cancelled} of {c.paid_bookings} paid bookings ({rate} %)",
            str(c.cancelled),
            rupees(c.refunded_paise),
            rupees(c.kept_paise),
        ]
    )
    return head, rows


SOURCE_WORDS = {
    DiscountSource.DEAL: "Deal",
    DiscountSource.EARLY_BIRD: "Early-bird",
    DiscountSource.COUPON: "Coupon",
    DiscountSource.MANUAL: "Manual",
}


def _discounts_csv(r: Reports) -> Table:
    d = r.discounts
    head = ["Source", "Discount", "Bookings", "Given (₹)", "Booked (₹)", "Booked per ₹1 given"]
    rows = [
        [
            SOURCE_WORDS[x.source],
            x.label,
            str(x.bookings),
            rupees(x.given_paise),
            rupees(x.booked_paise),
            f"{x.booked_paise / x.given_paise:.1f}" if x.given_paise else "",
        ]
        for x in d.sources
    ]
    rows.append(
        [
            "Total",
            f"{d.discounted_bookings} of {d.bookings} bookings discounted",
            str(d.discounted_bookings),
            rupees(d.given_paise),
            "",
            "",
        ]
    )
    return head, rows


def _addons_csv(r: Reports) -> Table:
    a = r.addons
    head = ["Add-on", "Bookings", "Offered to", "Attach (%)", "Revenue (₹)"]
    rows = [
        [
            x.name,
            str(x.bookings),
            str(x.eligible),
            percent(x.bookings, x.eligible),
            rupees(x.revenue_paise),
        ]
        for x in a.addons
    ]
    rows.append(
        [
            "Any add-on",
            str(a.with_any),
            str(a.bookings),
            percent(a.with_any, a.bookings),
            rupees(a.revenue_paise),
        ]
    )
    return head, rows


def _channels_csv(r: Reports) -> Table:
    total = r.kpis.bookings
    rows = [
        [
            CHANNEL_WORDS[c.channel],
            str(c.bookings),
            str(c.travellers),
            rupees(c.booked_paise),
            percent(c.bookings, total),
        ]
        for c in r.channels
    ]
    rows.append(
        [
            "Total",
            str(total),
            str(r.kpis.travellers),
            rupees(r.kpis.booked_paise),
            "100.0" if total else "",
        ]
    )
    return ["Channel", "Bookings", "Travellers", "Booked (₹)", "Share (%)"], rows


def _customers_csv(r: Reports) -> Table:
    c = r.customers
    rows = [
        ["Party size", b.label, str(b.bookings), percent(b.bookings, c.bookings)] for b in c.party
    ]
    rows += [
        ["Booked ahead", b.label, str(b.bookings), percent(b.bookings, c.bookings)] for b in c.lead
    ]
    rows += [
        ["Customers", "Repeat", str(c.repeat), percent(c.repeat, c.bookings)],
        ["Customers", "First trip", str(c.first), percent(c.first, c.bookings)],
    ]
    return ["Measure", "Group", "Bookings", "Share (%)"], rows


CSV_BUILDERS = {
    ReportSection.MONEY: _money_csv,
    ReportSection.CASH: _cash_csv,
    ReportSection.PACKAGES: _packages_csv,
    ReportSection.OCCUPANCY: _occupancy_csv,
    ReportSection.FUNNEL: _funnel_csv,
    ReportSection.CANCELLATIONS: _cancellations_csv,
    ReportSection.DISCOUNTS: _discounts_csv,
    ReportSection.ADDONS: _addons_csv,
    ReportSection.CHANNELS: _channels_csv,
    ReportSection.CUSTOMERS: _customers_csv,
}


def section_csv(r: Reports, section: ReportSection) -> Table:
    head, rows = CSV_BUILDERS[section](r)
    return head, [[csv_safe(v) for v in row] for row in rows]


def csv_filename(r: Reports, section: ReportSection) -> str:
    return f"tripsmith-{section.value}_{r.range.from_.isoformat()}_{r.range.to.isoformat()}.csv"
