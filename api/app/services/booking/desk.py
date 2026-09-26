"""The owner's bookings desk (R22, B10): list, one booking, mark paid (offline), release a
hold, record a refund, CSV, and a departure's manifest.

Built on the enquiry inbox's patterns (services/admin_enquiries.py): URL filters, status tabs
counted with the other filters applied, server-side paging, a CSV materialised before it
streams. Every write takes `lock_booking` — the departure row, then the booking — the order the
hold engine and the payment paths already use, so a desk action and a Checkout capture on the
same booking serialise instead of racing.

Seat numbers are never computed here on their own: `seats_left` is read from the
`departure_availability` view, and `booked`/`held` are counted with the view's own rules, so the
desk, the manifest and the public page cannot disagree (R22 accept).
"""

import datetime as dt
import logging
import math
from collections.abc import Iterator, Sequence
from typing import Any, cast

from sqlalchemy import ColumnElement, Select, and_, case, exists, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.business import refund_tier, suggested_refund_paise
from app.errors import ApiError
from app.models import (
    Booking,
    BookingCancellation,
    BookingTraveller,
    Departure,
    Package,
    Payment,
)
from app.models.catalog import departure_availability
from app.models.enums import (
    BookingStatus,
    CancellationStatus,
    CancelReason,
    PaymentProvider,
    PaymentStatus,
)
from app.schemas.account import AccountTraveller
from app.schemas.admin_bookings import (
    AdminBooking,
    AdminCancellation,
    AdminPayment,
    BookingCounts,
    BookingFilters,
    BookingList,
    BookingPackage,
    BookingRow,
    DepartureOption,
    DepartureSeats,
    Manifest,
    ManifestBooking,
    PaymentVia,
    TimelineEvent,
)
from app.schemas.admin_enquiries import PAGE_SIZE
from app.schemas.bookings import Quote
from app.schemas.enquiries import normalise_phone
from app.services.account import CANCELLABLE
from app.services.admin_enquiries import PHONE_QUERY_RE, csv_lines, csv_safe, like_escape
from app.services.analytics import ist_today
from app.services.booking.after_capture import Notify, on_new_capture
from app.services.booking.freshness import refresh_quietly
from app.services.booking.payments import (
    awaiting_payment,
    lock_booking,
    seats_short,
    settle_capture,
)
from app.services.booking.settled import Capture, Settled
from app.services.booking.voucher import (
    HAS_VOUCHER,
    OCCUPANCY_LABEL,
    offline_label,
    offline_reference,
    payment_label,
)
from app.services.email.render import IST
from app.services.format import inr

log = logging.getLogger(__name__)

NOT_FOUND = "Booking not found"
# The view's rules (0004_v2): these statuses hold seats for good; `pending` only while live.
SEAT_HOLDING = (BookingStatus.CONFIRMED, BookingStatus.PARTIALLY_PAID, BookingStatus.COMPLETED)
NOT_PAYABLE = "Only a booking still waiting for payment can be marked paid"
NOT_PENDING = "Only a pending booking's hold can be released"
NO_REFUND = "This booking has no refund to record"


def hold_live() -> ColumnElement[bool]:
    return and_(Booking.status == BookingStatus.PENDING, Booking.hold_expires_at > func.now())


# --- seats --------------------------------------------------------------------------------------


def _travellers_where(*conds: ColumnElement[bool]) -> Any:
    return (
        select(func.count())
        .select_from(BookingTraveller)
        .join(Booking, Booking.id == BookingTraveller.booking_id)
        .where(Booking.departure_id == Departure.id, *conds)
        .correlate(Departure)
        .scalar_subquery()
    )


async def departure_seats(db: AsyncSession, departure_id: str) -> DepartureSeats | None:
    row = (
        await db.execute(
            select(
                Departure.id,
                Package.id,
                Package.name,
                Departure.date,
                Departure.seats_total,
                _travellers_where(Booking.status.in_(SEAT_HOLDING)),
                _travellers_where(hold_live()),
                departure_availability.c.seats_left,
            )
            .join(Package, Package.id == Departure.package_id)
            .join(
                departure_availability,
                departure_availability.c.departure_id == Departure.id,
            )
            .where(Departure.id == departure_id)
        )
    ).one_or_none()
    if row is None:
        return None
    dep_id, pkg_id, pkg_name, date, total, booked, held, left = row
    return DepartureSeats(
        departure_id=dep_id,
        package_id=pkg_id,
        package_name=pkg_name,
        date=date,
        seats_total=total,
        booked=int(booked),
        held=int(held),
        seats_left=int(left),
    )


# --- list ---------------------------------------------------------------------------------------


def search_clause(q: str) -> ColumnElement[bool]:
    """A ref or a name as typed, an email by its `@`, a phone the way the booking form
    normalised it (`+91 98450-22110` finds `9845022110`)."""
    text = q.strip()
    if "@" in text:
        return Booking.contact_email.contains(text.lower(), autoescape=True)
    if PHONE_QUERY_RE.match(text):
        digits = normalise_phone(text)
        if digits:
            return Booking.contact_phone.contains(digits)
    pattern = f"%{like_escape(text)}%"
    return or_(Booking.ref.ilike(pattern), Booking.contact_name.ilike(pattern))


def _open_request() -> ColumnElement[bool]:
    # Correlate on `bookings` only: the desk list also outer-joins `booking_cancellations`, and
    # auto-correlation would then strip the subquery of its only FROM (a 500 on the tab).
    return (
        exists()
        .where(
            BookingCancellation.booking_id == Booking.id,
            BookingCancellation.status == CancellationStatus.REQUESTED,
        )
        .correlate(Booking)
    )


def _flag_clause(flag: str) -> ColumnElement[bool]:
    return Booking.refund_needed.is_(True) if flag == "refund" else _open_request()


def _filtered[S: Select[Any]](
    stmt: S, f: BookingFilters, *, with_status: bool = True, with_flag: bool = True
) -> S:
    """Every filter; the tab counts leave out their own (status, or flag). The statement must
    already join `Departure` (the date range is the departure's date)."""
    if with_status and f.status is not None:
        stmt = stmt.where(Booking.status == f.status)
    if with_flag and f.flag is not None:
        stmt = stmt.where(_flag_clause(f.flag))
    if f.package_id is not None:
        stmt = stmt.where(Booking.package_id == f.package_id)
    if f.departure_id is not None:
        stmt = stmt.where(Booking.departure_id == f.departure_id)
    if f.from_ is not None:
        stmt = stmt.where(Departure.date >= f.from_)
    if f.to is not None:
        stmt = stmt.where(Departure.date <= f.to)
    if f.q:
        stmt = stmt.where(search_clause(f.q))
    return stmt


def _counted(f: BookingFilters, **skip: bool) -> Select[Any]:
    return _filtered(
        select(func.count())
        .select_from(Booking)
        .join(Departure, Departure.id == Booking.departure_id),
        f,
        **skip,
    )


async def counts(db: AsyncSession, f: BookingFilters) -> BookingCounts:
    by_status = {
        status: int(n)
        for status, n in (
            await db.execute(
                _filtered(
                    select(Booking.status, func.count())
                    .select_from(Booking)
                    .join(Departure, Departure.id == Booking.departure_id),
                    f,
                    with_status=False,
                ).group_by(Booking.status)
            )
        ).all()
    }
    flags = (
        await db.execute(
            _counted(f, with_flag=False).with_only_columns(
                func.count().filter(Booking.refund_needed.is_(True)),
                func.count().filter(_open_request()),
            )
        )
    ).one()
    return BookingCounts(
        pending=by_status.get(BookingStatus.PENDING, 0),
        confirmed=by_status.get(BookingStatus.CONFIRMED, 0),
        completed=by_status.get(BookingStatus.COMPLETED, 0),
        cancelled=by_status.get(BookingStatus.CANCELLED, 0),
        all=sum(by_status.values()),
        refund=int(flags[0]),
        cancellation=int(flags[1]),
    )


def _party() -> Any:
    return (
        select(func.count())
        .where(BookingTraveller.booking_id == Booking.id)
        .correlate(Booking)
        .scalar_subquery()
    )


def _rows(f: BookingFilters) -> Select[Any]:
    stmt = (
        select(
            Booking,
            Package.name,
            Departure.date,
            _party(),
            hold_live(),
            BookingCancellation.status,
        )
        .join(Package, Package.id == Booking.package_id)
        .join(Departure, Departure.id == Booking.departure_id)
        .outerjoin(BookingCancellation, BookingCancellation.booking_id == Booking.id)
    )
    return _filtered(stmt, f).order_by(Booking.created_at.desc(), Booking.id.desc())


def _row(b: Booking, pkg: str, departs: dt.date, party: int, live: bool, asked: Any) -> BookingRow:
    return BookingRow(
        ref=b.ref,
        status=b.status,
        cancel_reason=b.cancel_reason,
        hold_expires_at=b.hold_expires_at,
        hold_live=bool(live),
        refund_needed=b.refund_needed,
        cancellation=asked,
        package_name=pkg,
        departure_id=b.departure_id,
        departs=departs,
        travellers=int(party),
        lead_name=b.contact_name,
        lead_phone=b.contact_phone,
        total_paise=b.total_paise,
        paid_paise=b.paid_paise,
        booked_at=b.created_at,
    )


async def departure_options(db: AsyncSession) -> list[DepartureOption]:
    """Departures with at least one booking: upcoming soonest first, then past, latest first."""
    today = ist_today()
    rows = await db.execute(
        select(Departure.id, Package.name, Departure.date)
        .join(Package, Package.id == Departure.package_id)
        .where(exists().where(Booking.departure_id == Departure.id))
        .order_by(
            Departure.date < today,
            case((Departure.date >= today, Departure.date)).asc(),
            Departure.date.desc(),
            Package.name,
        )
    )
    return [DepartureOption(id=i, package_name=n, date=d) for i, n, d in rows.all()]


async def list_bookings(db: AsyncSession, f: BookingFilters) -> BookingList:
    total = (await db.execute(_counted(f))).scalar_one()
    rows = await db.execute(_rows(f).limit(PAGE_SIZE).offset((f.page - 1) * PAGE_SIZE))
    return BookingList(
        items=[_row(*r) for r in rows.all()],
        page=f.page,
        page_size=PAGE_SIZE,
        total=total,
        total_pages=max(1, math.ceil(total / PAGE_SIZE)),
        counts=await counts(db, f),
        departures=await departure_options(db),
        seats=await departure_seats(db, f.departure_id) if f.departure_id else None,
    )


async def count_needing_attention(db: AsyncSession) -> int:
    """The sidebar badge: bookings with a refund to make or a cancellation to answer (one per
    booking, even when both)."""
    return (
        await db.execute(
            select(func.count())
            .select_from(Booking)
            .where(or_(Booking.refund_needed.is_(True), _open_request()))
        )
    ).scalar_one()


# --- detail -------------------------------------------------------------------------------------


def payment_via(p: Payment) -> PaymentVia | None:
    """Which path recorded the capture, read off what it left in `raw`: the webhook stores the
    event (it has `event`), the sync stores Razorpay's payment item (it has `id`), Checkout's
    signed callback stores nothing. The desk marks offline payments."""
    if p.provider == PaymentProvider.OFFLINE:
        return "desk"
    if p.status == PaymentStatus.CREATED:
        return None
    raw = p.raw or {}
    if "event" in raw:
        return "webhook"
    if "id" in raw:
        return "sync"
    return "checkout"


def _refund_info(p: Payment) -> dict[str, Any]:
    info = (p.raw or {}).get("refund")
    return info if isinstance(info, dict) else {}


def _at(value: object, fallback: dt.datetime) -> dt.datetime:
    if isinstance(value, str):
        try:
            return dt.datetime.fromisoformat(value)
        except ValueError:
            pass
    return fallback


VIA_TEXT = {"checkout": "Checkout", "sync": "the payment check", "webhook": "Razorpay's webhook"}
CANCEL_TEXT = {
    CancelReason.HOLD_EXPIRED: "Cancelled by the daily tidy — the checkout was abandoned",
    CancelReason.PAYMENT_FAILED: "Cancelled — the payment failed",
    CancelReason.SEATS_GONE: "Cancelled — paid after the hold lapsed and the seats had gone",
    CancelReason.CANCELLATION_APPROVED: "Cancelled — the customer's request was approved",
    CancelReason.OWNER_RELEASED: "Hold released by the owner — cancelled, seats freed",
}


def timeline(
    b: Booking, departs: dt.date, cancellation: BookingCancellation | None, *, live: bool
) -> list[TimelineEvent]:
    """R22's payment timeline, derived: there is no event log (decided 2026-09-26), so each
    payment row gives its opening and its final state — a failed try later captured on the same
    row shows only the capture — and a status change is dated by `updated_at`."""
    party = len(b.travellers)
    events = [
        TimelineEvent(
            at=b.created_at,
            kind="booked",
            text=f"Booked online · {party} traveller{'s' if party != 1 else ''} · "
            f"{inr(b.total_paise // 100)}",
        )
    ]
    for p in b.payments:
        amount = inr(p.amount_paise // 100)
        if p.provider == PaymentProvider.OFFLINE:
            ref = offline_reference(p)
            events.append(
                TimelineEvent(
                    at=p.created_at,
                    kind="offline",
                    text=f"Marked paid offline · {amount}" + (f" · {ref}" if ref else ""),
                )
            )
        else:
            events.append(
                TimelineEvent(
                    at=p.created_at,
                    kind="order",
                    text=f"Razorpay order {p.razorpay_order_id} opened · {amount}",
                )
            )
        refund = _refund_info(p)
        if p.status == PaymentStatus.FAILED:
            events.append(
                TimelineEvent(
                    at=p.updated_at,
                    kind="failed",
                    text=f"Payment {p.razorpay_payment_id} failed",
                )
            )
        elif p.provider == PaymentProvider.RAZORPAY and p.status in (
            PaymentStatus.CAPTURED,
            PaymentStatus.REFUNDED,
        ):
            via = payment_via(p) or "checkout"
            events.append(
                TimelineEvent(
                    at=_at(refund.get("capturedAt"), p.updated_at),
                    kind="captured",
                    text=f"Payment {p.razorpay_payment_id} captured · {amount} · via "
                    f"{VIA_TEXT.get(via, via)}",
                )
            )
        if p.status == PaymentStatus.REFUNDED:
            note = refund.get("note")
            back = inr((_refunded_paise(p) or 0) // 100)  # B11: may be part of the payment
            events.append(
                TimelineEvent(
                    at=_at(refund.get("at"), p.updated_at),
                    kind="refunded",
                    text=f"Refund of {back} recorded by the owner"
                    + (f" · {note}" if isinstance(note, str) and note else ""),
                )
            )
    if cancellation is not None:
        events.append(
            TimelineEvent(
                at=cancellation.created_at,
                kind="cancellation",
                text=f"Customer asked to cancel: “{cancellation.reason}”",
            )
        )
        if cancellation.resolved_at is not None:
            if cancellation.status == CancellationStatus.APPROVED:
                refund = cancellation.refund_paise or 0
                text = "Cancellation approved — seats freed · " + (
                    f"refund {inr(refund // 100)} agreed" if refund else "no refund"
                )
            else:
                text = "Cancellation request rejected — the booking stands"
            events.append(TimelineEvent(at=cancellation.resolved_at, kind="resolved", text=text))
    if b.status == BookingStatus.CANCELLED:
        if b.cancel_reason in (CancelReason.HOLD_EXPIRED, None):
            events.append(
                TimelineEvent(
                    at=b.hold_expires_at, kind="lapsed", text="Hold lapsed — seats released"
                )
            )
        reason = b.cancel_reason
        # An approved request is already the "resolved" event, dated when it was decided —
        # `updated_at` moves again when the refund is recorded.
        if reason != CancelReason.CANCELLATION_APPROVED:
            events.append(
                TimelineEvent(
                    at=b.updated_at,
                    kind="cancelled",
                    text=CANCEL_TEXT.get(reason, "Cancelled") if reason else "Cancelled",
                )
            )
    elif b.status == BookingStatus.PENDING and not live:
        events.append(
            TimelineEvent(at=b.hold_expires_at, kind="lapsed", text="Hold lapsed — seats released")
        )
    elif b.status == BookingStatus.COMPLETED:
        start = dt.datetime.combine(departs, dt.time.min, tzinfo=IST)
        events.append(TimelineEvent(at=start, kind="completed", text="Departed — completed"))
    return sorted(events, key=lambda e: e.at)


async def _load(db: AsyncSession, ref: str) -> Booking:
    booking = (
        await db.execute(
            select(Booking)
            .where(Booking.ref == ref)
            .options(
                selectinload(Booking.travellers),
                selectinload(Booking.payments),
                selectinload(Booking.cancellation),
            )
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if booking is None:
        raise ApiError("not_found", NOT_FOUND)
    return booking


def _payment_out(p: Payment) -> AdminPayment:
    return AdminPayment(
        id=p.id,
        provider=p.provider,
        status=p.status,
        amount_paise=p.amount_paise,
        order_id=p.razorpay_order_id,
        payment_id=p.razorpay_payment_id,
        reference=offline_reference(p) if p.provider == PaymentProvider.OFFLINE else None,
        via=payment_via(p),
        refunded_paise=_refunded_paise(p),
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def _refunded_paise(p: Payment) -> int | None:
    """B10 refunds gave back whole payments and did not store an amount; B11's may be part."""
    if p.status != PaymentStatus.REFUNDED:
        return None
    back = _refund_info(p).get("amountPaise")
    return back if isinstance(back, int) else p.amount_paise


def _admin_cancellation(
    asked: BookingCancellation, b: Booking, departs: dt.date
) -> AdminCancellation:
    # IST day of the request → departure, as B9's acknowledgement counted it.
    days_out = max((departs - asked.created_at.astimezone(IST).date()).days, 0)
    return AdminCancellation(
        id=asked.id,
        status=asked.status,
        reason=asked.reason,
        requested_at=asked.created_at,
        refund_note=asked.refund_note,
        refund_paise=asked.refund_paise,
        resolved_at=asked.resolved_at,
        days_out=days_out,
        tier=refund_tier(days_out),
        suggested_refund_paise=suggested_refund_paise(
            days_out, paid_paise=b.paid_paise, total_paise=b.total_paise
        ),
        can_approve=asked.status == CancellationStatus.REQUESTED and b.status in CANCELLABLE,
    )


async def get_booking(db: AsyncSession, ref: str) -> AdminBooking:
    b = await _load(db, ref)
    pkg = (await db.execute(select(Package).where(Package.id == b.package_id))).scalar_one()
    seats = await departure_seats(db, b.departure_id)
    assert seats is not None  # bookings.departure_id is ON DELETE RESTRICT
    live = bool((await db.execute(select(hold_live()).where(Booking.id == b.id))).scalar_one())
    payable = awaiting_payment(b)
    short = await seats_short(db, b, hold_live=live) if payable else 0
    asked = b.cancellation
    return AdminBooking(
        ref=b.ref,
        status=b.status,
        cancel_reason=b.cancel_reason,
        refund_needed=b.refund_needed,
        hold_expires_at=b.hold_expires_at,
        hold_live=live,
        booked_at=b.created_at,
        package=BookingPackage(
            id=pkg.id,
            name=pkg.name,
            slug=pkg.slug,
            nights=pkg.nights,
            days=pkg.days,
            departure_city=pkg.departure_city,
        ),
        departure=seats,
        departs=seats.date,
        returns=seats.date + dt.timedelta(days=pkg.nights),
        travellers=[
            AccountTraveller(name=t.name, age=t.age, occupancy=t.occupancy) for t in b.travellers
        ],
        quote=Quote.model_validate(b.quote),
        total_paise=b.total_paise,
        paid_paise=b.paid_paise,
        lead_name=b.contact_name,
        lead_phone=b.contact_phone,
        lead_email=b.contact_email,
        payments=[_payment_out(p) for p in b.payments],
        timeline=timeline(b, seats.date, asked, live=live),
        cancellation=_admin_cancellation(asked, b, seats.date) if asked else None,
        has_voucher=b.status in HAS_VOUCHER,
        can_mark_paid=payable,
        can_release=b.status == BookingStatus.PENDING,
        seats_short=short,
    )


# --- writes -------------------------------------------------------------------------------------


async def mark_paid(
    db: AsyncSession, ref: str, reference: str | None, notify: Notify | None
) -> AdminBooking:
    """Mark paid (offline), full total only: a pending booking (hold live or lapsed) or one the
    sweep cancelled as `hold_expired`. The seats are re-checked under the departure lock — the
    hold has usually lapsed by the time a bank transfer lands — and a party that no longer fits
    is refused with the shortfall, recording nothing. Otherwise an `offline` payment is recorded
    and applied through `settle_capture`, and `on_new_capture` sends the confirmation + voucher,
    as for any first capture."""
    try:
        booking, live = await lock_booking(db, ref)
        if not awaiting_payment(booking):
            raise ApiError("conflict", NOT_PAYABLE, reason="not_payable")
        short = await seats_short(db, booking, hold_live=live)
        if short:
            left = (
                await db.execute(
                    select(departure_availability.c.seats_left).where(
                        departure_availability.c.departure_id == booking.departure_id
                    )
                )
            ).scalar_one()
            party = int(left) + short
            raise ApiError(
                "conflict",
                f"Only {left} seat{'s' if left != 1 else ''} left on this date — the party of "
                f"{party} is {short} short",
                reason="seats_short",
            )
        amount = booking.total_paise - booking.paid_paise
        db.add(
            Payment(
                booking_id=booking.id,
                provider=PaymentProvider.OFFLINE,
                amount_paise=amount,
                status=PaymentStatus.CAPTURED,
                raw={"reference": reference} if reference else None,
            )
        )
        await db.flush()
        settled = await settle_capture(db, booking, hold_live=live, amount_paise=amount)
        if settled != Settled.CONFIRMED:  # unreachable: seats checked under the same lock
            raise RuntimeError(f"Offline payment on {ref} settled as {settled}")
        package_id = booking.package_id
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    capture = Capture(settled, offline_label(reference), amount, offline=True)
    await on_new_capture(
        db, ref, capture, package_id=package_id, after=f"offline payment on {ref}", notify=notify
    )
    return await get_booking(db, ref)


async def release_hold(db: AsyncSession, ref: str) -> AdminBooking:
    """Cancel a pending booking as `owner_released`: its seats free at once, no email. A payment
    that still lands on it is a refund (`settle_capture`'s not-pending path)."""
    try:
        booking, live = await lock_booking(db, ref)
        if booking.status != BookingStatus.PENDING:
            raise ApiError("conflict", NOT_PENDING, reason="not_pending")
        await db.execute(
            update(Booking)
            .where(Booking.id == booking.id, Booking.status == BookingStatus.PENDING)
            .values(
                status=BookingStatus.CANCELLED,
                cancel_reason=CancelReason.OWNER_RELEASED,
                hold_expires_at=func.least(Booking.hold_expires_at, func.now()),
                updated_at=func.now(),
            )
            .execution_options(synchronize_session=False)
        )
        package_id = booking.package_id
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    if live:  # the seats just came back: "from ₹" and the page may change
        await refresh_quietly(db, {package_id}, after=f"releasing {ref}")
    return await get_booking(db, ref)


async def record_refund(db: AsyncSession, ref: str, note: str | None) -> AdminBooking:
    """'Refund made': the owner refunded by hand in the Razorpay dashboard. A cancellation the
    owner approved gives back the refund agreed then (B11 — a policy tier may keep part); any
    other cancelled booking everything captured; a live one only what it holds beyond its total
    (a second payment). Payments are taken newest first and become `refunded` — the last one
    possibly only in part, its `raw.refund.amountPaise` saying how much — `paid_paise` drops by
    the amount given back, and `refund_needed` clears. No email and no Razorpay call."""
    try:
        booking, _ = await lock_booking(db, ref)
        if not booking.refund_needed:
            raise ApiError("conflict", NO_REFUND, reason="no_refund")
        captured = list(
            (
                await db.execute(
                    select(Payment)
                    .where(
                        Payment.booking_id == booking.id, Payment.status == PaymentStatus.CAPTURED
                    )
                    .order_by(Payment.created_at.desc())
                    .with_for_update()
                )
            ).scalars()
        )
        approval = (
            await db.execute(
                select(BookingCancellation.refund_paise, BookingCancellation.resolved_at).where(
                    BookingCancellation.booking_id == booking.id,
                    BookingCancellation.status == CancellationStatus.APPROVED,
                )
            )
        ).one_or_none()
        if booking.cancel_reason == CancelReason.CANCELLATION_APPROVED and approval is not None:
            # The refund agreed on approval, until it is recorded once; plus, in full, any money
            # captured after the approval (no seat stands behind it). Newest first, so a late
            # payment is given back before the agreed part comes out of the older ones.
            agreed, approved_at = approval
            before = [p for p in captured if p.created_at <= approved_at]
            late = sum(p.amount_paise for p in captured if p.created_at > approved_at)
            agreed_done = (
                await db.execute(
                    select(func.count())
                    .select_from(Payment)
                    .where(
                        Payment.booking_id == booking.id,
                        Payment.status == PaymentStatus.REFUNDED,
                        Payment.created_at <= approved_at,
                    )
                )
            ).scalar_one() > 0
            held = sum(p.amount_paise for p in before)
            owed = late + (0 if agreed_done else min(agreed or 0, held))
        elif booking.status == BookingStatus.CANCELLED:
            owed = booking.paid_paise
        else:
            owed = booking.paid_paise - booking.total_paise
        now = dt.datetime.now(dt.UTC)
        refunded = 0
        for p in captured:
            if refunded >= owed:
                break
            back = min(p.amount_paise, owed - refunded)
            p.raw = {
                **(p.raw or {}),
                "refund": {
                    "at": now.isoformat(),
                    "note": note,
                    "capturedAt": p.updated_at.isoformat(),
                    "amountPaise": back,
                },
            }
            p.status = PaymentStatus.REFUNDED
            refunded += back
        await db.execute(
            update(Booking)
            .where(Booking.id == booking.id)
            .values(
                paid_paise=Booking.paid_paise - refunded,
                refund_needed=False,
                updated_at=func.now(),
            )
            .execution_options(synchronize_session=False)
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    return await get_booking(db, ref)


# --- manifest -----------------------------------------------------------------------------------


async def manifest(db: AsyncSession, departure_id: str) -> Manifest:
    seats = await departure_seats(db, departure_id)
    if seats is None:
        raise ApiError("not_found", "Departure not found")
    pkg = (await db.execute(select(Package).where(Package.id == seats.package_id))).scalar_one()
    bookings = (
        (
            await db.execute(
                select(Booking)
                .where(Booking.departure_id == departure_id, Booking.status.in_(SEAT_HOLDING))
                .options(selectinload(Booking.travellers), selectinload(Booking.cancellation))
                .order_by(Booking.created_at, Booking.id)
            )
        )
        .scalars()
        .all()
    )
    out = [
        ManifestBooking(
            ref=b.ref,
            status=b.status,
            lead_name=b.contact_name,
            lead_phone=b.contact_phone,
            cancellation_requested=(
                b.cancellation is not None and b.cancellation.status == CancellationStatus.REQUESTED
            ),
            travellers=[
                AccountTraveller(name=t.name, age=t.age, occupancy=t.occupancy)
                for t in b.travellers
            ],
        )
        for b in bookings
    ]
    return Manifest(
        seats=seats,
        package_slug=pkg.slug,
        nights=pkg.nights,
        days=pkg.days,
        departure_city=pkg.departure_city,
        returns=seats.date + dt.timedelta(days=pkg.nights),
        bookings=out,
        travellers=sum(len(b.travellers) for b in out),
        generated_at=dt.datetime.now(dt.UTC),
    )


# --- csv ----------------------------------------------------------------------------------------

CSV_MAX_ROWS = 10_000
CSV_HEADERS = (
    "Ref",
    "Booked (IST)",
    "Status",
    "Cancel reason",
    "Refund needed",
    "Cancellation",
    "Package",
    "Departs",
    "Travellers",
    "Names",
    "Lead name",
    "Phone",
    "Email",
    "Total (₹)",
    "Paid (₹)",
    "Payments",
)
STATUS_LABELS = {
    BookingStatus.PENDING: "Pending",
    BookingStatus.CONFIRMED: "Confirmed",
    BookingStatus.PARTIALLY_PAID: "Part paid",
    BookingStatus.CANCELLED: "Cancelled",
    BookingStatus.COMPLETED: "Completed",
}
CANCEL_LABELS = {
    CancelReason.HOLD_EXPIRED: "Hold expired",
    CancelReason.PAYMENT_FAILED: "Payment failed",
    CancelReason.SEATS_GONE: "Seats gone",
    CancelReason.CANCELLATION_APPROVED: "Cancellation approved",
    CancelReason.OWNER_RELEASED: "Released by owner",
}
CANCELLATION_LABELS = {
    CancellationStatus.REQUESTED: "Requested",
    CancellationStatus.APPROVED: "Approved",
    CancellationStatus.REJECTED: "Rejected",
}


def csv_record(b: Booking, pkg: str, departs: dt.date) -> list[str]:
    """One booking per line; the travellers' names in entry order, each with their room."""
    names = "; ".join(f"{t.name} ({t.age}, {OCCUPANCY_LABEL[t.occupancy]})" for t in b.travellers)
    payments = "; ".join(
        f"{label} {p.status.value}"
        for p in b.payments
        if p.status != PaymentStatus.CREATED and (label := payment_label(p))
    )
    fields = [
        b.ref,
        b.created_at.astimezone(IST).strftime("%Y-%m-%d %H:%M"),
        STATUS_LABELS[b.status],
        CANCEL_LABELS[b.cancel_reason] if b.cancel_reason else "",
        "Yes" if b.refund_needed else "",
        CANCELLATION_LABELS[b.cancellation.status] if b.cancellation else "",
        pkg,
        departs.isoformat(),
        str(len(b.travellers)),
        names,
        b.contact_name,
        b.contact_phone,
        b.contact_email,
        str(b.total_paise // 100),
        str(b.paid_paise // 100),
        payments,
    ]
    return [csv_safe(field) for field in fields]


async def csv_records(db: AsyncSession, f: BookingFilters) -> list[list[str]]:
    """The whole filtered view, materialised before streaming (see the inbox's `csv_records`)."""
    stmt = cast(
        "Select[tuple[Booking, str, dt.date]]",
        _filtered(
            select(Booking, Package.name, Departure.date)
            .join(Package, Package.id == Booking.package_id)
            .join(Departure, Departure.id == Booking.departure_id),
            f,
        )
        .options(
            selectinload(Booking.travellers),
            selectinload(Booking.payments),
            selectinload(Booking.cancellation),
        )
        .order_by(Booking.created_at.desc(), Booking.id.desc())
        .limit(CSV_MAX_ROWS),
    )
    rows = await db.execute(stmt)
    return [csv_record(b, pkg, departs) for b, pkg, departs in rows.all()]


def bookings_csv(records: Sequence[Sequence[str]]) -> Iterator[str]:
    return csv_lines(records, headers=CSV_HEADERS)


def csv_filename() -> str:
    return f"tripsmith-bookings-{ist_today().isoformat()}.csv"
