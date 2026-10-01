"""The owner's move (R45, P7b): move any confirmed or part-paid booking from the desk, at any
time — to another date of its trip and/or with a different party.

The price is `changes.reprice` (the base fare re-priced, the earned discounts kept in ₹ — per
head for the deal and the early-bird, flat for the coupon and the manual discount). A party
change re-counts the add-ons: a per-night one is charged for the new party, a per-traveller one
for at most the new party. The fee is the self-serve tier on the booking's date (30+ days free,
else ₹1,000 a traveller), which the owner may change or waive with a reason.

The move is made at once, under both departures' locks, by `changes.apply_swap`:
- a rise is settled now offline (cash, UPI, bank — a payment tied to the change, so it gets
  its own supplementary invoice when the first one exists) or added to the balance (the booking
  becomes or stays `partially_paid`, due on the new date's due day, or today if that has
  passed — extendable as in P5);
- a fall is refunded through the one refund function, or comes off the balance first.
The target date needs seats for the whole party: no overselling, as at the counter.
"""

import datetime as dt
import logging
from collections import Counter
from dataclasses import dataclass

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import (
    Booking,
    BookingAddon,
    BookingTraveller,
    DateChange,
    Departure,
    Payment,
)
from app.models.enums import (
    AddonBasis,
    BookingActor,
    BookingStatus,
    DateChangeState,
    Occupancy,
    PaymentProvider,
    PaymentStatus,
)
from app.schemas.bookings import CHILD_MAX_AGE, CHILD_MIN_AGE, Quote, QuoteAddon
from app.schemas.counter import CounterTraveller
from app.schemas.moves import MoveDate, MoveOptions, MoveQuote, MoveQuoteRequest, MoveRequest
from app.services.analytics import ist_today
from app.services.booking import deposit, history, waitlist
from app.services.booking.changes import (
    CHANGES,
    FEE_PER_TRAVELLER_PAISE,
    apply_swap,
    departure_dates,
    fee_per_traveller,
    reprice,
)
from app.services.booking.history import money
from app.services.booking.locking import NOT_FOUND, lock_change

METHOD_WORDS = {"cash": "Cash", "upi": "UPI", "bank": "Bank transfer"}
NOT_MOVABLE = "Only a confirmed or part-paid booking can be moved — release a pending one instead"
NOTHING = "Nothing changes — pick another date, change the party or set a fee"
NO_SEATS = "That date hasn't got seats for the whole party"
PRICE_CHANGED = "The price has just changed — check the new one"
NEED_REASON = "Say why the fee differs from the tier"
NEED_SETTLE = "Say how the difference is settled: paid now offline, or added to the balance"
NEED_METHOD = "Say how the money came: cash, UPI or bank"
NOT_THIS_TRIP = "That date isn't one of this trip's"

log = logging.getLogger(__name__)


def suggested_fee(departs: dt.date, today: dt.date, party: int) -> int:
    """The self-serve tier on the booking's date; inside 14 days the 15–29-day rate."""
    each = fee_per_traveller(departs, today)
    return (FEE_PER_TRAVELLER_PAISE if each is None else each) * party


def _travellers_of(rows: list[BookingTraveller]) -> list[CounterTraveller]:
    return [CounterTraveller(name=r.name, age=r.age, occupancy=r.occupancy) for r in rows]


async def _rows(db: AsyncSession, booking_id: str, *, lock: bool = False) -> list[BookingTraveller]:
    stmt = (
        select(BookingTraveller)
        .where(BookingTraveller.booking_id == booking_id)
        .order_by(BookingTraveller.position, BookingTraveller.id)
    )
    if lock:
        stmt = stmt.with_for_update()
    return list((await db.execute(stmt)).scalars())


async def _booking(db: AsyncSession, ref: str) -> Booking:
    booking = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one_or_none()
    if booking is None:
        raise ApiError("not_found", NOT_FOUND)
    return booking


async def move_options(db: AsyncSession, ref: str, *, today: dt.date | None = None) -> MoveOptions:
    today = today or ist_today()
    try:
        booking = await _booking(db, ref)
        if booking.status not in CHANGES:
            raise ApiError("conflict", NOT_MOVABLE, reason="not_movable")
        rows = await _rows(db, booking.id)
        departs = (await departure_dates(db, [booking.departure_id]))[booking.departure_id]
        from app.models.catalog import departure_availability

        found = (
            await db.execute(
                select(Departure.id, Departure.date, departure_availability.c.seats_left)
                .join(
                    departure_availability,
                    departure_availability.c.departure_id == Departure.id,
                )
                .where(Departure.package_id == booking.package_id, Departure.date >= today)
                .order_by(Departure.date)
            )
        ).all()
        dates = [
            MoveDate(
                departure_id=i,
                date=d,
                seats_left=int(left) + (len(rows) if i == booking.departure_id else 0),
                current=i == booking.departure_id,
            )
            for i, d, left in found
        ]
        out = MoveOptions(
            current_date=departs,
            travellers=_travellers_of(rows),
            suggested_fee_paise=suggested_fee(departs, today, len(rows)),
            dates=dates,
        )
    finally:
        await db.rollback()
    return out


# --- the plan (shared by the preview and the move) ---------------------------------------------


@dataclass
class Plan:
    quote: Quote
    net_paise: int
    fee_paise: int
    suggested_fee_paise: int
    addons_change_paise: int
    seats_left: int
    fits: bool
    party: list[CounterTraveller]
    party_changed: bool
    new_date: dt.date
    old_date: dt.date
    due_on: dt.date
    addon_amounts: dict[str, tuple[int, int]]  # booking_addons id → (travellers, amount)


def _rescaled(basis: AddonBasis, travellers: int, party: int) -> int:
    if basis == AddonBasis.NIGHT:
        return party
    if basis == AddonBasis.TRAVELLER:
        return min(travellers, party)
    return travellers


async def _plan(
    db: AsyncSession, booking: Booking, req: MoveQuoteRequest, *, now: dt.datetime
) -> Plan:
    today = ist_today(now)
    dep = (
        await db.execute(select(Departure).where(Departure.id == req.departure_id))
    ).scalar_one_or_none()
    if dep is None or dep.package_id != booking.package_id:
        raise ApiError("not_found", NOT_THIS_TRIP)
    rows = await _rows(db, booking.id)
    current = _travellers_of(rows)
    party = req.travellers if req.travellers is not None else current
    party_changed = [(t.occupancy, t.age) for t in party] != [
        (t.occupancy, t.age) for t in current
    ] or len(party) != len(current)
    counts: Counter[Occupancy] = Counter(t.occupancy for t in party)

    from app.models.catalog import departure_availability

    left = int(
        (
            await db.execute(
                select(departure_availability.c.seats_left).where(
                    departure_availability.c.departure_id == dep.id
                )
            )
        ).scalar_one()
    )
    if dep.id == booking.departure_id:
        left += len(rows)
    dates = await departure_dates(db, [booking.departure_id])
    old_date = dates[booking.departure_id]
    suggested = suggested_fee(old_date, today, len(party))
    fee = suggested if req.fee_paise is None else req.fee_paise
    old = Quote.model_validate(booking.quote)
    quote = reprice(old, dep, fee_paise=fee, seats_left=max(0, left - len(party)), party=counts)

    # A party change re-counts the add-ons the booking still has.
    addon_rows = list(
        (
            await db.execute(
                select(BookingAddon).where(
                    BookingAddon.booking_id == booking.id, BookingAddon.removed_at.is_(None)
                )
            )
        ).scalars()
    )
    amounts: dict[str, tuple[int, int]] = {}
    extras_change = 0
    checkout_ids = set()
    for r in addon_rows:
        t = _rescaled(r.basis, r.travellers, len(party))
        amount = r.unit_paise * t * r.nights
        if (t, amount) != (r.travellers, r.amount_paise):
            amounts[r.id] = (t, amount)
            if r.payment_id is not None:
                extras_change += amount - r.amount_paise
        if r.payment_id is None and r.addon_id:
            checkout_ids.add(r.addon_id)
    lines: list[QuoteAddon] = []
    for a in quote.addons:
        if a.addon_id in checkout_ids:
            t = _rescaled(a.basis, a.travellers, len(party))
            a = a.model_copy(update={"travellers": t, "amount_paise": a.unit_paise * t * a.nights})
        lines.append(a)
    addons_paise = sum(a.amount_paise for a in lines)
    quote = quote.model_copy(
        update={
            "addons": lines,
            "addons_paise": addons_paise,
            "total_paise": quote.total_paise - quote.addons_paise + addons_paise,
        }
    )
    net = quote.total_paise - old.total_paise + extras_change
    addons_change = (addons_paise - old.addons_paise) + extras_change
    # The owner may move inside the website's 2-day window, but never onto a date priced on
    # request, one already gone, or one without seats for the whole party.
    priced = min(dep.price_double_paise, dep.price_triple_paise, dep.price_child_paise) > 0
    fits = left >= len(party) and dep.date >= today and priced
    return Plan(
        quote=quote,
        net_paise=net,
        fee_paise=fee,
        suggested_fee_paise=suggested,
        addons_change_paise=addons_change,
        seats_left=left,
        fits=fits,
        party=party,
        party_changed=party_changed,
        new_date=dep.date,
        old_date=old_date,
        due_on=max(deposit.due_on(dep.date), today),
        addon_amounts=amounts,
    )


def _quote_out(booking: Booking, plan: Plan, old: Quote) -> MoveQuote:
    total = booking.total_paise + plan.net_paise
    return MoveQuote(
        current_fare_paise=old.fare_paise,
        fare_paise=plan.quote.fare_paise,
        addons_change_paise=plan.addons_change_paise,
        fee_paise=plan.fee_paise,
        net_paise=plan.net_paise,
        total_paise=total,
        paid_paise=booking.paid_paise,
        owed_paise=max(0, total - booking.paid_paise),
        refund_paise=max(0, booking.paid_paise - total),
        due_on=plan.due_on,
        seats_left=plan.seats_left,
        fits=plan.fits,
    )


async def move_quote(
    db: AsyncSession, ref: str, req: MoveQuoteRequest, *, now: dt.datetime | None = None
) -> MoveQuote:
    now = now or dt.datetime.now(dt.UTC)
    try:
        booking = await _booking(db, ref)
        if booking.status not in CHANGES:
            raise ApiError("conflict", NOT_MOVABLE, reason="not_movable")
        plan = await _plan(db, booking, req, now=now)
        out = _quote_out(booking, plan, Quote.model_validate(booking.quote))
    finally:
        await db.rollback()
    return out


# --- the move ----------------------------------------------------------------------------------


@dataclass(frozen=True)
class Moved:
    package_id: str
    change_id: str
    refund_paise: int


async def move_booking(
    db: AsyncSession, ref: str, req: MoveRequest, *, by: str, now: dt.datetime | None = None
) -> Moved:
    """Make the move now. The caller sends refunds, the customer's email and waitlist mail after
    the commit."""
    now = now or dt.datetime.now(dt.UTC)
    today = ist_today(now)
    booking = await _booking(db, ref)
    from_id, package_id = booking.departure_id, booking.package_id
    await db.rollback()
    if req.departure_id != from_id:
        await waitlist.walk_departures(db, [req.departure_id])  # the list first, as for a booking
    try:
        booking, _ = await lock_change(db, ref, req.departure_id)
        if booking.status not in CHANGES:
            raise ApiError("conflict", NOT_MOVABLE, reason="not_movable")
        plan = await _plan(db, booking, req, now=now)
        if not plan.fits:
            raise ApiError("conflict", NO_SEATS, reason="sold_out")
        if (
            req.departure_id == booking.departure_id
            and not plan.party_changed
            and not (plan.fee_paise)
        ):
            raise ApiError("conflict", NOTHING, reason="nothing_to_move")
        if plan.net_paise != req.expected_net_paise:
            raise ApiError("conflict", PRICE_CHANGED, reason="price_changed")
        if plan.fee_paise != plan.suggested_fee_paise and not req.fee_reason:
            raise ApiError("validation", NEED_REASON, field_errors={"feeReason": NEED_REASON})
        total = booking.total_paise + plan.net_paise
        rise = min(max(0, plan.net_paise), max(0, total - booking.paid_paise))
        if rise and req.settle is None:
            raise ApiError("validation", NEED_SETTLE, field_errors={"settle": NEED_SETTLE})
        if rise and req.settle == "offline" and req.method is None:
            raise ApiError("validation", NEED_METHOD, field_errors={"method": NEED_METHOD})
        errors = _ages(plan.party) if plan.party_changed else {}
        if errors:
            raise ApiError("validation", next(iter(errors.values())), field_errors=errors)

        change = DateChange(
            booking_id=booking.id,
            from_departure_id=booking.departure_id,
            to_departure_id=req.departure_id,
            party=len(plan.party),
            state=DateChangeState.HELD,
            hold_expires_at=now,
            fee_paise=plan.fee_paise,
            net_paise=plan.net_paise,
            pay_paise=rise if req.settle == "offline" else 0,
            quote=plan.quote.model_dump(mode="json", by_alias=True),
            invoiced=booking.status == BookingStatus.CONFIRMED,
            actor="owner",
            by_user_id=by,
            reason=req.fee_reason if plan.fee_paise != plan.suggested_fee_paise else None,
            travellers=[t.model_dump(mode="json", by_alias=True) for t in plan.party]
            if plan.party_changed
            else None,
        )
        db.add(change)
        await db.flush()
        if plan.party_changed:
            await _replace_party(db, booking, plan, by=by)
        for row_id, (t, amount) in plan.addon_amounts.items():
            await db.execute(
                update(BookingAddon)
                .where(BookingAddon.id == row_id)
                .values(travellers=t, amount_paise=amount)
                .execution_options(synchronize_session=False)
            )
        if rise and req.settle == "offline":
            assert req.method is not None
            label = METHOD_WORDS[req.method] + (f" · {req.reference}" if req.reference else "")
            db.add(
                Payment(
                    booking_id=booking.id,
                    provider=PaymentProvider.OFFLINE,
                    amount_paise=rise,
                    status=PaymentStatus.CAPTURED,
                    raw={"reference": label, "method": req.method},
                    date_change_id=change.id,
                )
            )
            await db.execute(
                update(Booking)
                .where(Booking.id == booking.id)
                .values(paid_paise=Booking.paid_paise + rise, updated_at=func.now())
                .execution_options(synchronize_session=False)
            )
            await db.flush()
            await db.refresh(booking)
            history.record(
                db,
                booking.id,
                "payment.offline",
                actor=BookingActor.OWNER,
                by=by,
                text=f"Date change paid offline · {money(rise)} · {label}",
                customer=f"Payment of {money(rise)} received for your date change",
            )
        refund = await apply_swap(db, booking, change, actor=BookingActor.OWNER, by=by, today=today)
        change_id = change.id
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    return Moved(package_id, change_id, refund)


def _ages(party: list[CounterTraveller]) -> dict[str, str]:
    errors: dict[str, str] = {}
    for i, t in enumerate(party):
        if t.occupancy == Occupancy.CHILD and (
            t.age is None or not CHILD_MIN_AGE <= t.age <= CHILD_MAX_AGE
        ):
            errors[f"travellers.{i}.age"] = (
                f"The child rate is for ages {CHILD_MIN_AGE}–{CHILD_MAX_AGE}"
            )
    return errors


async def _replace_party(db: AsyncSession, booking: Booking, plan: Plan, *, by: str) -> None:
    rows = await _rows(db, booking.id, lock=True)
    before = [{"name": r.name, "age": r.age, "room": r.occupancy.value} for r in rows]
    await db.execute(delete(BookingTraveller).where(BookingTraveller.booking_id == booking.id))
    new = [
        BookingTraveller(
            booking_id=booking.id,
            name=t.name or (booking.contact_name if i == 0 else f"Traveller {i + 1}"),
            age=t.age,
            occupancy=t.occupancy,
            position=i,
        )
        for i, t in enumerate(plan.party)
    ]
    db.add_all(new)
    await db.flush()
    history.record(
        db,
        booking.id,
        "party.changed",
        actor=BookingActor.OWNER,
        by=by,
        text=f"Party changed: {history.travellers(len(rows))} → {history.travellers(len(new))}",
        customer=f"Your party is now {history.travellers(len(new))}",
        before={"travellers": before},
        after={
            "travellers": [{"name": r.name, "age": r.age, "room": r.occupancy.value} for r in new]
        },
    )
