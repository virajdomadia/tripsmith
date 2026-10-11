"""The owner's departure calendar (R50, P11): a month of departures and one departure's panel.

Read-only. Every seat number comes from the `departure_availability` view plus the desk's own
count of sold travellers, so the calendar, the desk and the public page cannot disagree (R50
accept): held = seats total − sold − free. Money and readiness are one grouped query each for
the whole month, never one per departure.
"""

import datetime as dt
from collections.abc import Sequence
from typing import Any

from sqlalchemy import ColumnElement, and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import (
    Booking,
    BookingTraveller,
    DateChange,
    Departure,
    Destination,
    Package,
    TripLeader,
)
from app.models.catalog import departure_availability
from app.models.enums import BookingStatus, DateChangeState, PackageStatus, WaitlistState
from app.models.waitlist import WaitlistEntry
from app.schemas.admin_calendar import (
    CalendarDeparture,
    CalendarMonth,
    CalendarPackage,
    CalendarPanel,
    PanelBooking,
    PanelHold,
    ReadinessShare,
)
from app.services.analytics import ist_today
from app.services.booking import details, trip_pack, waitlist
from app.services.booking.desk import SEAT_HOLDING, hold_live
from app.services.catalog.admin_leaders import departure_leader, effective_leader_id, trips_between
from app.services.catalog.admin_leaders import ref as leader_ref

NOT_FOUND = "Departure not found"
BAD_MONTH = "Pick a month as YYYY-MM"
NEAR_DAYS = 31  # leader trips this far either side of the month (the add form's clash check)


def month_bounds(month: str) -> tuple[dt.date, dt.date]:
    try:
        first = dt.date.fromisoformat(f"{month}-01")
    except ValueError as exc:
        raise ApiError("validation", BAD_MONTH, field_errors={"month": BAD_MONTH}) from exc
    nxt = (first.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    return first, nxt - dt.timedelta(days=1)


def month_of(day: dt.date) -> str:
    return day.strftime("%Y-%m")


def returns_on(departs: dt.date, nights: int) -> dt.date:
    return departs + dt.timedelta(days=nights)


# --- chips --------------------------------------------------------------------------------------


async def _sold(db: AsyncSession, ids: Sequence[str]) -> dict[str, int]:
    rows = await db.execute(
        select(Booking.departure_id, func.count(BookingTraveller.id))
        .join(BookingTraveller, BookingTraveller.booking_id == Booking.id)
        .where(Booking.departure_id.in_(ids), Booking.status.in_(SEAT_HOLDING))
        .group_by(Booking.departure_id)
    )
    return {d: int(n) for d, n in rows.all()}


Money = tuple[int, int, int, int, dt.date | None]


async def _money(db: AsyncSession, ids: Sequence[str]) -> dict[str, Money]:
    """(revenue, collected, balance, balance bookings, first due) per departure — the desk
    CSV's Total, Paid and Balance due columns summed (R50 accept)."""
    holding = Booking.status.in_(SEAT_HOLDING)
    part = Booking.status == BookingStatus.PARTIALLY_PAID
    rows = await db.execute(
        select(
            Booking.departure_id,
            func.coalesce(func.sum(Booking.total_paise).filter(holding), 0),
            func.coalesce(func.sum(Booking.paid_paise).filter(holding), 0),
            func.coalesce(func.sum(Booking.total_paise - Booking.paid_paise).filter(part), 0),
            func.count().filter(part),
            func.min(Booking.balance_due_on).filter(part),
        )
        .where(Booking.departure_id.in_(ids), holding)
        .group_by(Booking.departure_id)
    )
    return {d: (int(r), int(c), int(b), int(n), due) for d, r, c, b, n, due in rows.all()}


async def _smallest_waiting(db: AsyncSession, ids: Sequence[str]) -> dict[str, int]:
    rows = await db.execute(
        select(WaitlistEntry.departure_id, func.min(WaitlistEntry.party))
        .where(WaitlistEntry.departure_id.in_(ids), WaitlistEntry.state == WaitlistState.WAITING)
        .group_by(WaitlistEntry.departure_id)
    )
    return {d: int(n) for d, n in rows.all()}


def _chip_select() -> Any:
    return (
        select(
            Departure,
            Package.nights,
            effective_leader_id(),
            departure_availability.c.seats_left,
        )
        .join(Package, Package.id == Departure.package_id)
        .join(departure_availability, departure_availability.c.departure_id == Departure.id)
    )


async def _chips(db: AsyncSession, where: ColumnElement[bool]) -> list[CalendarDeparture]:
    rows = (
        await db.execute(_chip_select().where(where).order_by(Departure.date, Package.name))
    ).all()
    ids = [d.id for d, *_ in rows]
    if not ids:
        return []
    sold, money = await _sold(db, ids), await _money(db, ids)
    waiting = await waitlist.waiting_counts(db, ids)
    smallest = await _smallest_waiting(db, ids)
    paid_rows = await details.open_booking_rows(db, ids)
    out = []
    for dep, nights, leader_id, left in rows:
        n_sold, free = sold.get(dep.id, 0), int(left)
        revenue, collected, balance, balance_n, due = money.get(dep.id, (0, 0, 0, 0, None))
        ready = details.readiness_of(paid_rows.get(dep.id, []))
        out.append(
            CalendarDeparture(
                id=dep.id,
                package_id=dep.package_id,
                date=dep.date,
                returns=returns_on(dep.date, nights),
                leader_id=leader_id,
                seats_total=dep.seats_total,
                sold=n_sold,
                held=max(dep.seats_total - n_sold - free, 0),
                free=free,
                waiting=waiting.get(dep.id, 0),
                smallest_waiting_party=smallest.get(dep.id),
                guaranteed=dep.guaranteed,
                price_double_paise=dep.price_double_paise,
                revenue_paise=revenue,
                collected_paise=collected,
                balance_paise=balance,
                balance_bookings=balance_n,
                first_due_on=due,
                missing_travellers=ready.missing_travellers,
                ready_percent=ready.percent,
            )
        )
    return out


# --- the month ----------------------------------------------------------------------------------


async def _packages(db: AsyncSession) -> list[CalendarPackage]:
    """Every package, with its latest date's seats and prices as the add form's prefill."""
    latest = (
        select(
            Departure.package_id,
            Departure.seats_total,
            Departure.price_double_paise,
            Departure.price_triple_paise,
            Departure.price_child_paise,
            Departure.single_supplement_paise,
        )
        .distinct(Departure.package_id)
        .order_by(Departure.package_id, Departure.date.desc())
        .subquery()
    )
    rows = await db.execute(
        select(
            Package.id,
            Package.name,
            Package.destination_id,
            Destination.name,
            Package.nights,
            Package.status,
            Package.leader_id,
            latest.c.seats_total,
            latest.c.price_double_paise,
            latest.c.price_triple_paise,
            latest.c.price_child_paise,
            latest.c.single_supplement_paise,
        )
        .join(Destination, Destination.id == Package.destination_id)
        .outerjoin(latest, latest.c.package_id == Package.id)
        .order_by(Package.name)
    )
    return [
        CalendarPackage(
            id=pid,
            name=name,
            destination_id=dest_id,
            destination_name=dest_name,
            nights=nights,
            draft=status != PackageStatus.LIVE,
            leader_id=leader_id,
            seats_total=seats,
            price_double_paise=double,
            price_triple_paise=triple,
            price_child_paise=child,
            single_supplement_paise=single,
        )
        for (
            pid,
            name,
            dest_id,
            dest_name,
            nights,
            status,
            leader_id,
            seats,
            double,
            triple,
            child,
            single,
        ) in rows.all()
    ]


async def _busy_month(db: AsyncSession, *, after: dt.date | None, before: dt.date | None) -> Any:
    if after is not None:
        day = await db.execute(select(func.min(Departure.date)).where(Departure.date > after))
    else:
        day = await db.execute(select(func.max(Departure.date)).where(Departure.date < before))
    found = day.scalar_one_or_none()
    return month_of(found) if found else None


async def get_month(db: AsyncSession, month: str | None) -> CalendarMonth:
    today = ist_today()
    first, last = month_bounds(month or month_of(today))
    chips = await _chips(db, and_(Departure.date >= first, Departure.date <= last))
    leading = {c.leader_id for c in chips if c.leader_id}
    leaders = (
        (
            await db.execute(
                select(TripLeader)
                .where(or_(TripLeader.active, TripLeader.id.in_(leading)))
                .order_by(TripLeader.name)
            )
        )
        .scalars()
        .all()
    )
    return CalendarMonth(
        month=month_of(first),
        today=today,
        departures=chips,
        packages=await _packages(db),
        leaders=[leader_ref(row) for row in leaders],
        leader_trips=await trips_between(
            db, first - dt.timedelta(days=NEAR_DAYS), last + dt.timedelta(days=NEAR_DAYS)
        ),
        next_busy_month=await _busy_month(db, after=last, before=None),
        prev_busy_month=await _busy_month(db, after=None, before=first),
    )


# --- one departure's panel ----------------------------------------------------------------------


def _shares(rows: Sequence[details.ReadinessRow]) -> list[ReadinessShare]:
    """Each readiness part's mean over the paid bookings — what holds the % back."""
    if not rows:
        return []
    acc: dict[str, list[float]] = {"details": [], "balance": [], "pack": [], "calendar": []}
    items: list[float] = []
    for b, n, m, checklist in rows:
        acc["details"].append((n - m) / n if n else 1.0)
        acc["balance"].append(1.0 if b.status == BookingStatus.CONFIRMED else 0.0)
        acc["pack"].append(1.0 if b.pack_read_at is not None else 0.0)
        acc["calendar"].append(1.0 if b.calendar_added_at is not None else 0.0)
        done = set(b.checklist_done)
        items.extend(1.0 if i["key"] in done else 0.0 for i in checklist)
    labels = {
        "details": "Details",
        "balance": "Balance paid",
        "pack": "Trip pack read",
        "calendar": "In calendar",
    }
    out = [
        ReadinessShare(key=k, label=labels[k], percent=round(sum(v) / len(v) * 100))  # type: ignore[arg-type]
        for k, v in acc.items()
    ]
    if items:
        out.append(
            ReadinessShare(
                key="items", label="Checklist", percent=round(sum(items) / len(items) * 100)
            )
        )
    return out


_ORDER = case(
    (Booking.status == BookingStatus.PENDING, 0),
    (Booking.status == BookingStatus.PARTIALLY_PAID, 1),
    else_=2,
)


async def _bookings(
    db: AsyncSession, departure_id: str, paid_rows: Sequence[details.ReadinessRow]
) -> list[PanelBooking]:
    by_id = {b.id: (n, m, checklist) for b, n, m, checklist in paid_rows}
    rows = await db.execute(
        select(
            Booking,
            select(func.count())
            .where(BookingTraveller.booking_id == Booking.id)
            .correlate(Booking)
            .scalar_subquery(),
        )
        .where(
            Booking.departure_id == departure_id,
            or_(Booking.status.in_(SEAT_HOLDING), hold_live()),
        )
        .order_by(_ORDER, Booking.created_at, Booking.id)
    )
    out = []
    for b, n in rows.all():
        paid = by_id.get(b.id)
        part = b.status == BookingStatus.PARTIALLY_PAID
        out.append(
            PanelBooking(
                ref=b.ref,
                status=b.status,
                lead_name=b.contact_name,
                travellers=int(n),
                total_paise=b.total_paise,
                paid_paise=b.paid_paise,
                balance_due_on=b.balance_due_on if part else None,
                channel=b.channel,
                hold_expires_at=b.hold_expires_at if b.status == BookingStatus.PENDING else None,
                missing_travellers=paid[1] if paid else 0,
                ready_percent=details.booking_percent(b, paid[0], paid[0] - paid[1], paid[2])
                if paid
                else None,
            )
        )
    return out


async def _holds(db: AsyncSession, departure_id: str) -> list[PanelHold]:
    """The view's other holds (0019): live waitlist offers and date changes moving in."""
    offers = await db.execute(
        select(WaitlistEntry)
        .where(
            WaitlistEntry.departure_id == departure_id,
            WaitlistEntry.state == WaitlistState.OFFERED,
            WaitlistEntry.offer_expires_at > func.now(),
        )
        .order_by(WaitlistEntry.offer_expires_at)
    )
    moves = await db.execute(
        select(DateChange, Booking.ref, Booking.contact_name)
        .join(Booking, Booking.id == DateChange.booking_id)
        .where(
            DateChange.to_departure_id == departure_id,
            DateChange.state == DateChangeState.HELD,
            DateChange.hold_expires_at > func.now(),
        )
        .order_by(DateChange.hold_expires_at)
    )
    out = [
        PanelHold(kind="waitlist_offer", name=e.name, party=e.party, expires_at=e.offer_expires_at)
        for e in offers.scalars().all()
    ]
    out += [
        PanelHold(
            kind="date_change", name=name, party=c.party, expires_at=c.hold_expires_at, ref=ref
        )
        for c, ref, name in moves.all()
    ]
    return out


async def get_panel(db: AsyncSession, departure_id: str) -> CalendarPanel:
    chips = await _chips(db, Departure.id == departure_id)
    dep = await db.get(Departure, departure_id)
    if not chips or dep is None:
        raise ApiError("not_found", NOT_FOUND)
    pkg = await db.get(Package, dep.package_id)
    assert pkg is not None
    destination = await db.get(Destination, pkg.destination_id)
    assert destination is not None
    paid_rows = (await details.open_booking_rows(db, [departure_id])).get(departure_id, [])
    return CalendarPanel(
        departure=chips[0],
        package_name=pkg.name,
        package_slug=pkg.slug,
        destination_name=destination.name,
        nights=pkg.nights,
        draft=pkg.status != PackageStatus.LIVE,
        price_triple_paise=dep.price_triple_paise,
        price_child_paise=dep.price_child_paise,
        single_supplement_paise=dep.single_supplement_paise,
        leader=await departure_leader(db, departure_id),
        meeting=trip_pack.meeting_of(pkg, dep),
        readiness_parts=_shares(paid_rows),
        bookings=await _bookings(db, departure_id, paid_rows),
        holds=await _holds(db, departure_id),
    )
