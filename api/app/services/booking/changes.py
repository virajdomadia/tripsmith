"""Change date (R45, P7): move a booking to another departure of the same trip.

**The price.** Only the base fare re-prices: the new date's fare lines replace the old ones,
while the discounts the booking earned (deal, early-bird, coupon, the counter's manual one) keep
their ₹ amounts, and its add-ons their snapshot price (`reprice`). The fare never goes below ₹1
a traveller, so on a much cheaper date a discount is cut to fit. The fee joins the total (a later
cancellation's tier applies to it). Net = new fare − current fare + fee.

**The fee**, by days before the booking's own departure: 30+ free, 15–29 ₹1,000 a traveller,
14 or fewer not online. One self-serve change per booking.

**The money** (`outcome`): a booking paid in full pays any rise now and gets any fall back; one
on its deposit (P5) is re-based — 25 % of the new total, due 30 days before the new date — and
pays now only the top-up to that 25 % (usually nothing), or everything owed when the new date
is inside 30 days; a fall comes off its balance first.

**The move.** Nothing to pay → the swap happens at once, under both departures' locks
(`locking.lock_change`, in id order). Something to pay → a `date_changes` row holds the party's
seats on the new date for 10 minutes (the availability view subtracts it), and a Razorpay order
for exactly that amount carries `payments.date_change_id`. The capture goes through the one
capture path (`payments.settle_capture` → `settle_change` here): the swap if the hold is live
or the seats are still free; otherwise the payment goes back in full and the booking stays.

The swap moves the booking, replaces its quote, re-bases a deposit, writes history old → new,
gives the old date's freed seats to its waitlist in the same transaction (`walk_locked`), and
plans any refund (`refunds.plan_refund`, sent after the commit). The new date's waitlist is
walked first, in its own committed transaction, as a new booking does.
"""

import datetime as dt
import logging
from collections import Counter
from dataclasses import dataclass

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.razorpay import Razorpay, RazorpayError
from app.models import (
    Booking,
    BookingCancellation,
    BookingTraveller,
    DateChange,
    Departure,
    Package,
    Payment,
    User,
)
from app.models.catalog import departure_availability
from app.models.enums import (
    BookingActor,
    BookingStatus,
    CancellationStatus,
    DateChangeState,
    Occupancy,
    PackageStatus,
    PaymentProvider,
    PaymentStatus,
)
from app.schemas.bookings import (
    Quote,
    QuoteDeposit,
    QuoteLine,
    QuoteLineKind,
    UnbookableReason,
)
from app.schemas.changes import ChangeOffer, ChangeOption, ChangeOptions, ChangeResult
from app.services.analytics import ist_today
from app.services.booking import deposit, history, waitlist
from app.services.booking.history import PaymentLog, money
from app.services.booking.locking import lock_change
from app.services.booking.pricing import (
    DISCOUNTS,
    MIN_TOTAL_PAISE,
    ORDER,
    RUPEE,
    unbookable_reason,
    unit_price,
)
from app.services.booking.refunds import Reason, plan_refund
from app.services.booking.settled import Settled
from app.services.gst.documents import issue_due_safely

HOLD = dt.timedelta(minutes=10)
LATE_CAPTURE = dt.timedelta(hours=1)  # after this, a change's payment goes back, never moves it
FREE_DAYS = 30
ONLINE_DAYS = 15  # the last self-serve day is departure − 15
FEE_PER_TRAVELLER_PAISE = 1_000_00
SELF_SERVE_CHANGES = 1
CHANGES = (BookingStatus.CONFIRMED, BookingStatus.PARTIALLY_PAID)
BASE = (QuoteLineKind.DOUBLE, QuoteLineKind.TRIPLE, QuoteLineKind.SINGLE, QuoteLineKind.CHILD)

NOT_YOURS = "No booking with that reference on your account"
PAYMENTS_DOWN = "Payments are not reachable right now — try again in a minute, or WhatsApp us"
PRICE_CHANGED = "The price for that date has just changed — have a look at the new one"
SAME_DATE = "That's the date you're already booked on"
NOT_THIS_TRIP = "That date isn't one of this trip's"
UNBOOKABLE = {
    UnbookableReason.SOLD_OUT: "That date has no longer got seats for your party",
    UnbookableReason.TOO_SOON: "That date is too close to book now",
    UnbookableReason.ON_REQUEST: "That date is priced on request — WhatsApp us",
}

log = logging.getLogger(__name__)


# --- the rules (no database) -------------------------------------------------------------------


def fee_per_traveller(departs: dt.date, today: dt.date) -> int | None:
    """The fee per traveller today, by days before the booking's departure; None = not online."""
    days = (departs - today).days
    if days >= FREE_DAYS:
        return 0
    if days >= ONLINE_DAYS:
        return FEE_PER_TRAVELLER_PAISE
    return None


def free_until(departs: dt.date) -> dt.date:
    return departs - dt.timedelta(days=FREE_DAYS)


def last_day(departs: dt.date) -> dt.date:
    return departs - dt.timedelta(days=ONLINE_DAYS)


def party_of(quote: Quote) -> Counter[Occupancy]:
    """The party by occupancy, read off the quote's fare lines."""
    counts: Counter[Occupancy] = Counter()
    for li in quote.lines:
        if li.kind in BASE:
            counts[li.occupancy] += li.count
    return counts


def reprice(
    old: Quote,
    dep: Departure,
    *,
    fee_paise: int,
    seats_left: int,
    party: Counter[Occupancy] | None = None,
) -> Quote:
    """`old` on departure `dep`: the new date's fare lines, the earned discounts kept in ₹ (each
    traveller still pays at least ₹1 — the early-bird is cut first, then the deal, then the
    manual discount, then the coupon), the add-ons as they were, and `fee_paise` added to the
    fees already paid. `party` (P7b) re-counts the travellers; the per-traveller discounts keep
    their amount per head."""
    counts = party if party is not None else party_of(old)
    unit_off: dict[tuple[QuoteLineKind, Occupancy], int] = {
        (li.kind, li.occupancy): -li.unit_paise for li in old.lines if li.kind in DISCOUNTS
    }
    lines: list[QuoteLine] = []

    def line(kind: QuoteLineKind, occ: Occupancy, unit: int) -> None:
        n = counts[occ]
        lines.append(
            QuoteLine(kind=kind, occupancy=occ, count=n, unit_paise=unit, amount_paise=n * unit)
        )

    for occ in ORDER:
        if not counts[occ]:
            continue
        base = dep.price_double_paise if occ == Occupancy.SINGLE else unit_price(dep, occ)
        line(QuoteLineKind(occ.value), occ, base)
        if occ == Occupancy.SINGLE and dep.single_supplement_paise:
            line(QuoteLineKind.SINGLE_SUPPLEMENT, occ, dep.single_supplement_paise)
    subtotal = sum(li.amount_paise for li in lines)

    kept: dict[tuple[QuoteLineKind, Occupancy], int] = {}
    for occ in ORDER:
        room = unit_price(dep, occ) - MIN_TOTAL_PAISE  # what one traveller can be given off
        deal = min(unit_off.get((QuoteLineKind.DEAL, occ), 0), max(0, room))
        eb = min(unit_off.get((QuoteLineKind.EARLY_BIRD, occ), 0), max(0, room - deal))
        kept[(QuoteLineKind.DEAL, occ)] = deal
        kept[(QuoteLineKind.EARLY_BIRD, occ)] = eb
    for kind in DISCOUNTS:  # deal lines, then early-bird lines, each in occupancy order
        for occ in ORDER:
            if counts[occ] and kept[(kind, occ)]:
                line(kind, occ, -kept[(kind, occ)])
    line_off = -sum(li.amount_paise for li in lines if li.kind in DISCOUNTS)
    fare_left = (subtotal - line_off - MIN_TOTAL_PAISE) // RUPEE * RUPEE  # whole rupees

    manual = old.manual
    manual_off = min(manual.off_paise, max(0, fare_left)) if manual else 0
    coupon = old.coupon
    coupon_off = min(coupon.off_paise, max(0, fare_left - manual_off)) if coupon else 0
    deal_kept = any(li.kind == QuoteLineKind.DEAL for li in lines)
    eb_kept = any(li.kind == QuoteLineKind.EARLY_BIRD for li in lines)
    discount = line_off + coupon_off + manual_off
    change_fee = old.change_fee_paise + fee_paise
    return old.model_copy(
        update={
            "departure_id": dep.id,
            "date": dep.date,
            "seats_left": seats_left,
            "lines": lines,
            "deal": old.deal if deal_kept else None,
            "early_bird": old.early_bird if eb_kept else None,
            "coupon": coupon.model_copy(update={"off_paise": coupon_off}) if coupon else None,
            "manual": manual.model_copy(update={"off_paise": manual_off}) if manual else None,
            "ladder": [],
            "subtotal_paise": subtotal,
            "discount_paise": discount,
            "change_fee_paise": change_fee,
            "total_paise": subtotal - discount + old.addons_paise + change_fee,
        }
    )


@dataclass(frozen=True)
class Outcome:
    """What a move does to the booking's money."""

    total_paise: int
    pay_now_paise: int
    refund_paise: int
    status: BookingStatus
    deposit_paise: int | None
    due_on: dt.date | None


def outcome(
    *,
    status: BookingStatus,
    total_paise: int,
    paid_paise: int,
    deposit_paise: int | None,
    due_on: dt.date | None,
    net_paise: int,
    departs: dt.date,
    today: dt.date,
) -> Outcome:
    """The booking's money after a move worth `net_paise`, before anything new is paid.

    Paid in full → pays any rise now, gets any fall back. On its deposit (P5) → re-based to 25 %
    of the new total, due 30 days before the new date: pays now only the top-up to that, or
    everything owed when the new due day has already come; a fall comes off the balance first."""
    total = total_paise + net_paise
    refund = max(0, paid_paise - total)
    if status == BookingStatus.PARTIALLY_PAID:
        due = deposit.due_on(departs)
        if today < due:
            new_deposit = deposit.deposit_paise(total)
            pay = max(0, new_deposit - paid_paise)
            if paid_paise + pay < total:
                return Outcome(total, pay, 0, BookingStatus.PARTIALLY_PAID, new_deposit, due)
            return Outcome(total, pay, refund, BookingStatus.CONFIRMED, deposit_paise, due)
        pay = max(0, total - paid_paise)
        return Outcome(total, pay, refund, BookingStatus.CONFIRMED, deposit_paise, due)
    pay = max(0, total - paid_paise)
    return Outcome(total, pay, refund, BookingStatus.CONFIRMED, deposit_paise, due_on)


def owed_after(o: Outcome, paid_paise: int) -> int:
    """What would still be owed once the move's pay-now is in."""
    return max(0, o.total_paise - paid_paise - o.pay_now_paise + o.refund_paise)


def refusal(
    booking: Booking, departs: dt.date, today: dt.date, *, asked: bool, used: bool
) -> str | None:
    """Why the customer cannot change this booking's date online today — or None."""
    if booking.status not in CHANGES:
        return "Dates can be changed on a confirmed booking"
    if asked:
        return "You've asked to cancel this booking, so date changes are closed"
    if used:
        return "This booking has had its one online date change — WhatsApp us and we'll help"
    if fee_per_traveller(departs, today) is None:
        return (
            f"Date changes close online {ONLINE_DAYS} days before departure — WhatsApp us and "
            "we'll see what we can do"
        )
    return None


async def departure_dates(db: AsyncSession, ids: list[str]) -> dict[str, dt.date]:
    """Departure id → its date."""
    rows = await db.execute(select(Departure.id, Departure.date).where(Departure.id.in_(ids)))
    return {i: d for i, d in rows.all()}


# --- reads -------------------------------------------------------------------------------------


async def _open_request(db: AsyncSession, booking_id: str) -> bool:
    return (
        await db.execute(
            select(BookingCancellation.id).where(
                BookingCancellation.booking_id == booking_id,
                BookingCancellation.status == CancellationStatus.REQUESTED,
            )
        )
    ).first() is not None


async def _used(db: AsyncSession, booking_id: str) -> bool:
    done = (
        await db.execute(
            select(func.count())
            .select_from(DateChange)
            .where(
                DateChange.booking_id == booking_id,
                DateChange.actor == "customer",
                DateChange.state == DateChangeState.DONE,
            )
        )
    ).scalar_one()
    return done >= SELF_SERVE_CHANGES


async def _party(db: AsyncSession, booking_id: str) -> int:
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(BookingTraveller)
                .where(BookingTraveller.booking_id == booking_id)
            )
        ).scalar_one()
    )


async def _seats_left(db: AsyncSession, departure_id: str) -> int:
    return int(
        (
            await db.execute(
                select(departure_availability.c.seats_left).where(
                    departure_availability.c.departure_id == departure_id
                )
            )
        ).scalar_one()
    )


async def offer(
    db: AsyncSession, booking: Booking, departs: dt.date, today: dt.date
) -> ChangeOffer:
    """The "Change date" card on My trips."""
    used = await _used(db, booking.id)
    why = refusal(booking, departs, today, asked=await _open_request(db, booking.id), used=used)
    each = fee_per_traveller(departs, today)
    party = await _party(db, booking.id)
    return ChangeOffer(
        open=why is None,
        reason=why,
        fee_per_traveller_paise=each,
        fee_paise=None if each is None else each * party,
        free_until=free_until(departs),
        last_day=last_day(departs),
        used=used,
    )


async def owned(db: AsyncSession, user: User, ref: str) -> Booking:
    from app.services.account import owned_by  # account imports this module for My trips

    booking = (
        await db.execute(select(Booking).where(Booking.ref == ref, owned_by(user)))
    ).scalar_one_or_none()
    if booking is None:
        raise ApiError("not_found", NOT_YOURS)
    return booking


@dataclass(frozen=True)
class Priced:
    """One candidate date, priced for a booking."""

    dep: Departure
    quote: Quote
    seats_left: int
    unbookable: UnbookableReason | None
    fee_paise: int
    net_paise: int
    outcome: Outcome


def _price(
    booking: Booking,
    current: Quote,
    dep: Departure,
    *,
    seats_left: int,
    party: int,
    fee_paise: int,
    now: dt.datetime,
) -> Priced:
    quote = reprice(current, dep, fee_paise=fee_paise, seats_left=max(0, seats_left - party))
    net = quote.total_paise - current.total_paise
    today = ist_today(now)
    out = outcome(
        status=booking.status,
        total_paise=booking.total_paise,
        paid_paise=booking.paid_paise,
        deposit_paise=booking.deposit_paise,
        due_on=booking.balance_due_on,
        net_paise=net,
        departs=dep.date,
        today=today,
    )
    if current.deposit is not None and out.status == BookingStatus.PARTIALLY_PAID:
        amount = out.deposit_paise or deposit.deposit_paise(quote.total_paise)
        quote = quote.model_copy(
            update={
                "deposit": QuoteDeposit(
                    percent=deposit.DEPOSIT_PERCENT,
                    amount_paise=amount,
                    balance_paise=max(0, quote.total_paise - amount),
                    due_on=deposit.due_on(dep.date),
                )
            }
        )
    reason = unbookable_reason(dep, seats_left=seats_left, party=party, now=now)
    return Priced(dep, quote, seats_left, reason, fee_paise, net, out)


async def change_options(
    db: AsyncSession, user: User, ref: str, *, now: dt.datetime | None = None
) -> ChangeOptions:
    """The dates this booking can move to, each re-quoted. 409 `change_closed` with the reason."""
    now = now or dt.datetime.now(dt.UTC)
    today = ist_today(now)
    try:
        booking = await owned(db, user, ref)
        departs = (
            await db.execute(select(Departure.date).where(Departure.id == booking.departure_id))
        ).scalar_one()
        asked = await _open_request(db, booking.id)
        if why := refusal(booking, departs, today, asked=asked, used=await _used(db, booking.id)):
            raise ApiError("conflict", why, reason="change_closed")
        current = Quote.model_validate(booking.quote)
        party = await _party(db, booking.id)
        fee = (fee_per_traveller(departs, today) or 0) * party
        deps = (
            await db.execute(
                select(Departure, departure_availability.c.seats_left)
                .join(
                    departure_availability,
                    departure_availability.c.departure_id == Departure.id,
                )
                .where(
                    Departure.package_id == booking.package_id,
                    Departure.id != booking.departure_id,
                    Departure.date >= today,
                )
                .order_by(Departure.date)
            )
        ).all()
        options: list[ChangeOption] = []
        for dep, seats in deps:
            p = _price(
                booking, current, dep, seats_left=int(seats), party=party, fee_paise=fee, now=now
            )
            if p.unbookable == UnbookableReason.TOO_SOON:
                continue
            options.append(_option(p, booking))
        out = ChangeOptions(
            current_date=departs,
            current_fare_paise=current.fare_paise,
            party=party,
            fee_paise=fee,
            options=options,
        )
    finally:
        await db.rollback()
    return out


def _option(p: Priced, booking: Booking) -> ChangeOption:
    return ChangeOption(
        departure_id=p.dep.id,
        date=p.dep.date,
        seats_left=p.seats_left,
        bookable=p.unbookable is None,
        unbookable=p.unbookable,
        fare_paise=p.quote.fare_paise,
        difference_paise=p.net_paise - p.fee_paise,
        fee_paise=p.fee_paise,
        net_paise=p.net_paise,
        total_paise=p.outcome.total_paise,
        pay_now_paise=p.outcome.pay_now_paise,
        refund_paise=p.outcome.refund_paise,
        balance_paise=owed_after(p.outcome, booking.paid_paise),
        due_on=p.outcome.due_on if p.outcome.status == BookingStatus.PARTIALLY_PAID else None,
    )


# --- the customer's move -----------------------------------------------------------------------


@dataclass(frozen=True)
class Started:
    """What `start_change` did: moved (`done`) or holding for payment (`pay`)."""

    result: ChangeResult
    package_id: str
    change_id: str
    freed_departure_id: str | None  # the old date, when the move is done


async def start_change(
    db: AsyncSession,
    user: User,
    ref: str,
    departure_id: str,
    expected_net_paise: int,
    razorpay: Razorpay | None,
    *,
    now: dt.datetime | None = None,
) -> Started:
    """Move the booking now (nothing to pay), or hold the new date's seats for 10 minutes and open
    a Razorpay order for the difference. The caller sends refunds, emails and waitlist mail after
    a `done`."""
    now = now or dt.datetime.now(dt.UTC)
    today = ist_today(now)
    user_id = user.id  # read before any rollback expires it
    try:
        booking = await owned(db, user, ref)
        booking_id, package_id = booking.id, booking.package_id
        email, phone = booking.contact_email, booking.contact_phone
    finally:
        await db.rollback()
    # The new date's list goes first, in its own transaction, as for a new booking: seats a
    # lapsed hold gave back go to the people waiting before this move.
    await waitlist.walk_departures(db, [departure_id])
    try:
        from app.services.booking.orders import _lock_contact

        await _lock_contact(db, email, phone)
        target = (
            await db.execute(
                select(Departure, Package.status)
                .join(Package, Package.id == Departure.package_id)
                .where(Departure.id == departure_id)
            )
        ).one_or_none()
        if target is None or target[0].package_id != package_id:
            raise ApiError("not_found", NOT_THIS_TRIP)
        if target[1] != PackageStatus.LIVE:
            raise ApiError("conflict", UNBOOKABLE[UnbookableReason.ON_REQUEST], reason="on_request")
        booking, _ = await lock_change(db, ref, departure_id)
        if booking.departure_id == departure_id:
            raise ApiError("conflict", SAME_DATE, reason="same_date")
        departs = (
            await db.execute(select(Departure.date).where(Departure.id == booking.departure_id))
        ).scalar_one()
        asked = await _open_request(db, booking.id)
        if why := refusal(booking, departs, today, asked=asked, used=await _used(db, booking.id)):
            raise ApiError("conflict", why, reason="change_closed")
        await _end_holds(db, booking.id)  # a newer pick replaces a hold not yet paid for
        dep = (await db.execute(select(Departure).where(Departure.id == departure_id))).scalar_one()
        party = await _party(db, booking.id)
        fee = (fee_per_traveller(departs, today) or 0) * party
        seats = await _seats_left(db, departure_id)
        p = _price(
            booking,
            Quote.model_validate(booking.quote),
            dep,
            seats_left=seats,
            party=party,
            fee_paise=fee,
            now=now,
        )
        if p.unbookable is not None:
            raise ApiError("conflict", UNBOOKABLE[p.unbookable], reason=p.unbookable.value)
        if p.net_paise != expected_net_paise:
            raise ApiError("conflict", PRICE_CHANGED, reason="price_changed")
        invoiced = booking.status == BookingStatus.CONFIRMED
        change = DateChange(
            booking_id=booking.id,
            from_departure_id=booking.departure_id,
            to_departure_id=dep.id,
            party=party,
            state=DateChangeState.HELD,
            hold_expires_at=now + HOLD,
            fee_paise=fee,
            net_paise=p.net_paise,
            pay_paise=p.outcome.pay_now_paise,
            quote=p.quote.model_dump(mode="json", by_alias=True),
            invoiced=invoiced,
            actor="customer",
            by_user_id=user_id,
        )
        db.add(change)
        await db.flush()
        old_id = booking.departure_id
        if p.outcome.pay_now_paise == 0:
            await apply_swap(
                db, booking, change, actor=BookingActor.CUSTOMER, by=user_id, today=today
            )
            result = ChangeResult(
                booking_ref=ref,
                state="done",
                date=dep.date,
                pay_now_paise=0,
                refund_paise=p.outcome.refund_paise,
            )
            change_id = change.id
            await db.commit()
            return Started(result, package_id, change_id, old_id)
        history.record(
            db,
            booking.id,
            "change.held",
            actor=BookingActor.CUSTOMER,
            by=user_id,
            text=f"Date change started: {history.day(departs)} → {history.day(dep.date)} · "
            f"{money(p.outcome.pay_now_paise)} to pay · {history.travellers(party)} held on the "
            "new date for 10 minutes",
        )
        change_id, pay, hold_until = change.id, p.outcome.pay_now_paise, change.hold_expires_at
        new_date = dep.date
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    if razorpay is None:
        await _cancel_change(db, change_id)
        raise ApiError("internal", PAYMENTS_DOWN, status=503)
    try:
        order_id = await razorpay.create_order(amount_paise=pay, receipt=ref)
    except RazorpayError:
        log.exception("Razorpay order for a date change on %s failed", ref)
        await _cancel_change(db, change_id)
        raise ApiError("internal", PAYMENTS_DOWN, status=502) from None
    try:
        db.add(
            Payment(
                booking_id=booking_id,
                provider=PaymentProvider.RAZORPAY,
                razorpay_order_id=order_id,
                amount_paise=pay,
                status=PaymentStatus.CREATED,
                date_change_id=change_id,
            )
        )
        history.record(
            db,
            booking_id,
            "order.date_change",
            actor=BookingActor.CUSTOMER,
            by=user_id,
            text=f"Date change payment started · {money(pay)} · Razorpay order {order_id}",
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    return Started(
        ChangeResult(
            booking_ref=ref,
            state="pay",
            date=new_date,
            pay_now_paise=pay,
            refund_paise=0,
            order_id=order_id,
            key_id=razorpay.key_id,
            hold_expires_at=hold_until,
        ),
        package_id,
        change_id,
        None,
    )


async def _end_holds(db: AsyncSession, booking_id: str) -> None:
    """End the booking's change holds not yet paid for (a newer pick replaces them). A payment
    that still lands on one is refunded by `settle_change`."""
    await db.execute(
        update(DateChange)
        .where(DateChange.booking_id == booking_id, DateChange.state == DateChangeState.HELD)
        .values(state=DateChangeState.CANCELLED, updated_at=func.now())
        .execution_options(synchronize_session=False)
    )


async def _cancel_change(db: AsyncSession, change_id: str) -> None:
    """The order never opened: give the held seats back at once."""
    try:
        await db.execute(
            update(DateChange)
            .where(DateChange.id == change_id, DateChange.state == DateChangeState.HELD)
            .values(state=DateChangeState.CANCELLED, updated_at=func.now())
            .execution_options(synchronize_session=False)
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise


# --- the swap ----------------------------------------------------------------------------------


async def apply_swap(
    db: AsyncSession,
    booking: Booking,
    change: DateChange,
    *,
    actor: BookingActor,
    by: str | None,
    today: dt.date,
) -> int:
    """Move a booking held by `lock_change` to `change.to_departure_id`, in the caller's
    transaction: the new quote and total, the money re-based (`outcome` on what is paid now), the
    change `done`, history old → new, the old date's freed seats to its waitlist, and any refund
    planned. Returns the refund."""
    old_id = booking.departure_id
    dates = await departure_dates(db, [old_id, change.to_departure_id])
    old_date, new_date = dates[old_id], dates[change.to_departure_id]
    total = booking.total_paise + change.net_paise
    paid = booking.paid_paise
    status = BookingStatus.CONFIRMED if paid >= total else BookingStatus.PARTIALLY_PAID
    deposit_paise, due = booking.deposit_paise, booking.balance_due_on
    if status == BookingStatus.PARTIALLY_PAID:
        due = max(deposit.due_on(new_date), today)
        deposit_paise = deposit.deposit_paise(total)
    elif due is not None:
        due = deposit.due_on(new_date)
    before = {
        "date": old_date.isoformat(),
        "totalPaise": booking.total_paise,
        "status": booking.status.value,
        "balanceDueOn": booking.balance_due_on.isoformat() if booking.balance_due_on else None,
    }
    await db.execute(
        update(Booking)
        .where(Booking.id == booking.id)
        .values(
            departure_id=change.to_departure_id,
            quote=change.quote,
            total_paise=total,
            status=status,
            deposit_paise=deposit_paise,
            balance_due_on=due,
            updated_at=func.now(),
        )
        .execution_options(synchronize_session=False)
    )
    change.state = DateChangeState.DONE
    await db.flush()
    await db.refresh(booking)
    fee = f" · fee {money(change.fee_paise)}" if change.fee_paise else ""
    sign = "+" if change.net_paise > 0 else "−" if change.net_paise < 0 else "±"
    diff = f"{sign}{money(abs(change.net_paise))}"
    still = (
        f" · {money(total - paid)} due by {history.day(due)}"
        if status == BookingStatus.PARTIALLY_PAID and due
        else ""
    )
    history.record(
        db,
        booking.id,
        "date.changed",
        actor=actor,
        by=by,
        text=f"Date changed: {history.day(old_date)} → {history.day(new_date)} · "
        f"{history.travellers(change.party)} · {diff}{fee} · total {money(total)}{still}",
        customer=f"Your trip moved from {history.day(old_date)} to {history.day(new_date)}"
        + (f" — {money(total - paid)} is due by {history.day(due)}" if still and due else ""),
        before=before,
        after={
            "date": new_date.isoformat(),
            "totalPaise": total,
            "status": status.value,
            "balanceDueOn": due.isoformat() if due else None,
        },
    )
    await waitlist.walk_locked(db, old_id)  # P6: the seats the move freed
    await waitlist.mark_booked(db, booking)  # this email's entry on the new date is done
    refund = max(0, paid - total)
    if refund:
        reason: Reason = "date_change" if change.net_paise < 0 else "surplus"
        await plan_refund(db, booking, refund, reason=reason, actor=actor, by=by)
    await issue_due_safely(db, booking)
    return refund


async def settle_change(
    db: AsyncSession,
    booking: Booking,
    *,
    change_id: str,
    amount_paise: int,
    entry: PaymentLog,
) -> Settled:
    """Apply a captured change payment to a booking held by `lock_change` (both departures).
    Called once per payment by `settle_capture`; the caller commits.

    The hold still live, or the seats still free → the swap. Otherwise (the seats went after the
    10 minutes, the change was replaced, or the booking is no longer on its old date or no longer
    takes a change) the payment goes back in full and the booking stays as it is."""
    change = (
        await db.execute(select(DateChange).where(DateChange.id == change_id).with_for_update())
    ).scalar_one()
    before = {"paidPaise": booking.paid_paise}
    await db.execute(
        update(Booking)
        .where(Booking.id == booking.id)
        .values(paid_paise=Booking.paid_paise + amount_paise, updated_at=func.now())
        .execution_options(synchronize_session=False)
    )
    await db.flush()
    await db.refresh(booking)
    hold_live, recent = (
        await db.execute(
            select(
                DateChange.hold_expires_at > func.now(),
                DateChange.created_at > func.now() - LATE_CAPTURE,
            ).where(DateChange.id == change.id)
        )
    ).one()
    # A capture after the hold still moves the booking while the seats are free — but only soon
    # after (a Razorpay order never expires: days later, the quote and the fee tier are stale),
    # and never once the customer has asked to cancel.
    fits = (
        change.state == DateChangeState.HELD
        and booking.status in CHANGES
        and booking.departure_id == change.from_departure_id
        and not await _open_request(db, booking.id)
        and (
            bool(hold_live)
            or (bool(recent) and await _seats_left(db, change.to_departure_id) >= change.party)
        )
    )
    history.record(
        db,
        booking.id,
        entry.kind,
        actor=entry.actor,
        by=entry.by,
        text=entry.text
        + (" — for the date change" if fits else " — for a date change it can no longer make"),
        customer=f"Payment of {money(amount_paise)} received for your date change",
        before=before,
        after={"paidPaise": booking.paid_paise},
    )
    if fits:
        actor = BookingActor.CUSTOMER if change.actor == "customer" else BookingActor.OWNER
        await apply_swap(db, booking, change, actor=actor, by=change.by_user_id, today=ist_today())
        return Settled.DATE_CHANGED
    if change.state == DateChangeState.HELD:
        change.state = DateChangeState.LAPSED
    history.record(
        db,
        booking.id,
        "change.lapsed",
        actor=BookingActor.SYSTEM,
        text="Date change not made — the hold had ended and the new date could no longer be "
        f"held for it · refunding "
        f"{money(amount_paise)} in full",
        customer="Your payment arrived after the hold on the new date had ended, so the change "
        f"couldn't be made and your trip stays as it was — {money(amount_paise)} will be refunded "
        "in full",
    )
    await plan_refund(db, booking, amount_paise, reason="surplus", actor=BookingActor.SYSTEM)
    await issue_due_safely(db, booking)  # the payment's receipt
    return Settled.CHANGE_LAPSED


async def latest_change(db: AsyncSession, booking_id: str) -> DateChange | None:
    return (
        await db.execute(
            select(DateChange)
            .where(DateChange.booking_id == booking_id)
            .order_by(DateChange.created_at.desc(), DateChange.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
