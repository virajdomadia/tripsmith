"""The owner's bookings desk (R22, B10): list, one booking, mark paid (offline), release a
hold, CSV, and a departure's manifest. Refunds (P13) live in refunds.py.

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
    Enquiry,
    Package,
    Payment,
    Refund,
    User,
)
from app.models.catalog import departure_availability
from app.models.enums import (
    AddonBasis,
    BookingActor,
    BookingStatus,
    CancellationStatus,
    CancelReason,
    PaymentProvider,
    PaymentStatus,
    RefundStatus,
)
from app.schemas.account import AccountTraveller
from app.schemas.admin_bookings import (
    AdminBooking,
    AdminCancellation,
    AdminPayment,
    AdminRefund,
    BookingCounts,
    BookingFilters,
    BookingList,
    BookingPackage,
    BookingRow,
    DepartureOption,
    DepartureSeats,
    LinkedEnquiry,
    Manifest,
    ManifestAddon,
    ManifestBooking,
    PaymentVia,
)
from app.schemas.admin_enquiries import PAGE_SIZE
from app.schemas.bookings import Quote
from app.schemas.enquiries import normalise_phone
from app.services.account import CANCELLABLE
from app.services.admin_enquiries import PHONE_QUERY_RE, csv_lines, csv_safe, like_escape
from app.services.analytics import ist_today
from app.services.booking import extras, waitlist
from app.services.booking.addons import facts as addon_facts
from app.services.booking.after_capture import Notify, on_new_capture
from app.services.booking.balance import admin_balance, held_on_deposit
from app.services.booking.counter import CHANNEL_WORDS, EDITABLE
from app.services.booking.freshness import refresh_quietly
from app.services.booking.history import PaymentLog, booking_history, money, record
from app.services.booking.links import link_out
from app.services.booking.payments import (
    awaiting_payment,
    lock_booking,
    seats_short,
    settle_capture,
)
from app.services.booking.refunds import refund_owed, refundable_by_payment
from app.services.booking.settled import Capture, Settled
from app.services.booking.voucher import (
    HAS_VOUCHER,
    OCCUPANCY_LABEL,
    offline_label,
    offline_reference,
    payment_label,
)
from app.services.catalog.admin_leaders import departure_leader
from app.services.email.render import IST
from app.services.format import inr
from app.services.gst.documents import documents_out
from app.services.reviews import review_for_booking

log = logging.getLogger(__name__)

NOT_FOUND = "Booking not found"
# The view's rules (0004_v2): these statuses hold seats for good; `pending` only while live.
SEAT_HOLDING = (BookingStatus.CONFIRMED, BookingStatus.PARTIALLY_PAID, BookingStatus.COMPLETED)
NOT_PAYABLE = "Only a booking still waiting for payment can be marked paid"
NOT_PENDING = "Only a pending booking's hold can be released"


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
        waiting=(await waitlist.waiting_counts(db, [dep_id])).get(dep_id, 0),
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


def _balance_due() -> ColumnElement[bool]:
    """P5: on its deposit, with a balance still to pay."""
    return and_(
        Booking.status == BookingStatus.PARTIALLY_PAID, Booking.paid_paise < Booking.total_paise
    )


def _flag_clause(flag: str) -> ColumnElement[bool]:
    if flag == "balance":
        return _balance_due()
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
    if f.channel is not None:
        stmt = stmt.where(Booking.channel == f.channel)
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
                func.count().filter(_balance_due()),
            )
        )
    ).one()
    return BookingCounts(
        pending=by_status.get(BookingStatus.PENDING, 0),
        partially_paid=by_status.get(BookingStatus.PARTIALLY_PAID, 0),
        confirmed=by_status.get(BookingStatus.CONFIRMED, 0),
        completed=by_status.get(BookingStatus.COMPLETED, 0),
        cancelled=by_status.get(BookingStatus.CANCELLED, 0),
        all=sum(by_status.values()),
        refund=int(flags[0]),
        cancellation=int(flags[1]),
        balance=int(flags[2]),
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
        coupon_code=b.coupon_code,
        booked_at=b.created_at,
        balance_due_on=b.balance_due_on if b.status == BookingStatus.PARTIALLY_PAID else None,
        channel=b.channel,
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


async def _load(db: AsyncSession, ref: str) -> Booking:
    booking = (
        await db.execute(
            select(Booking)
            .where(Booking.ref == ref)
            .options(
                selectinload(Booking.travellers),
                selectinload(Booking.payments).selectinload(Payment.refunds),
                selectinload(Booking.cancellation),
            )
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if booking is None:
        raise ApiError("not_found", NOT_FOUND)
    return booking


def _payment_out(p: Payment, refundable: dict[str, int]) -> AdminPayment:
    given = sum(r.amount_paise for r in p.refunds if r.status != RefundStatus.FAILED)
    return AdminPayment(
        id=p.id,
        provider=p.provider,
        status=p.status,
        amount_paise=p.amount_paise,
        order_id=p.razorpay_order_id,
        payment_id=p.razorpay_payment_id,
        reference=offline_reference(p) if p.provider == PaymentProvider.OFFLINE else None,
        via=payment_via(p),
        refunded_paise=given or None,
        refundable_paise=refundable.get(p.id, 0),
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def _refund_out(r: Refund) -> AdminRefund:
    return AdminRefund(
        id=r.id,
        payment_id=r.payment_id,
        amount_paise=r.amount_paise,
        status=r.status,
        reason=r.reason,
        by_hand=r.by_hand,
        razorpay_refund_id=r.razorpay_refund_id,
        error=r.error,
        note=r.note,
        created_at=r.created_at,
        processed_at=r.processed_at,
    )


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
    link = link_out(b, live=live)  # P18b: read before later reads can expire `b.payments`
    payable = awaiting_payment(b)
    refundable = await refundable_by_payment(db, b.id)
    short = await seats_short(db, b, hold_live=live) if payable else 0
    asked = b.cancellation
    refunds = sorted((r for p in b.payments for r in p.refunds), key=lambda r: (r.created_at, r.id))
    waiting = [r for r in refunds if r.status == RefundStatus.REQUESTED]
    stuck = sum(r.amount_paise for r in waiting if not r.by_hand and r.razorpay_refund_id is None)
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
        leader=await departure_leader(db, b.departure_id),
        travellers=[
            AccountTraveller(name=t.name, age=t.age, occupancy=t.occupancy) for t in b.travellers
        ],
        quote=Quote.model_validate(b.quote),
        total_paise=b.total_paise,
        paid_paise=b.paid_paise,
        lead_name=b.contact_name,
        lead_phone=b.contact_phone,
        lead_email=b.contact_email,
        payments=[_payment_out(p, refundable) for p in b.payments],
        refunds=[_refund_out(r) for r in refunds],
        documents=await documents_out(db, b),
        refund_to_send_paise=await refund_owed(db, b) + stuck,
        refund_offline_paise=sum(r.amount_paise for r in waiting if r.by_hand),
        history=await booking_history(db, b.id),
        cancellation=_admin_cancellation(asked, b, seats.date) if asked else None,
        has_voucher=b.status in HAS_VOUCHER,
        can_mark_paid=payable,
        can_release=b.status == BookingStatus.PENDING,
        seats_short=short,
        review=await review_for_booking(db, b.id),
        addons=await extras.booked(db, b.id),
        can_remove_addons=b.status in extras.TAKES_EXTRAS,
        can_move=b.status in extras.TAKES_EXTRAS,  # the same two states as a date change
        balance=admin_balance(b, seats.date),
        channel=b.channel,
        created_by=(
            await db.execute(select(User.name).where(User.id == b.created_by_user_id))
        ).scalar_one_or_none()
        if b.created_by_user_id
        else None,
        enquiry=await _linked_enquiry(db, b.enquiry_id),
        payment_link=link,
        can_edit_travellers=b.status in EDITABLE,
    )


async def _linked_enquiry(db: AsyncSession, enquiry_id: str | None) -> LinkedEnquiry | None:
    if enquiry_id is None:
        return None
    ref = (
        await db.execute(select(Enquiry.ref).where(Enquiry.id == enquiry_id))
    ).scalar_one_or_none()
    return LinkedEnquiry(id=enquiry_id, ref=ref) if ref else None


# --- writes -------------------------------------------------------------------------------------


async def mark_paid(
    db: AsyncSession,
    ref: str,
    reference: str | None,
    notify: Notify | None,
    *,
    by: str | None = None,
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
        entry = PaymentLog(
            "payment.offline",
            BookingActor.OWNER,
            f"Marked paid offline · {money(amount)}" + (f" · {reference}" if reference else ""),
            by=by,
        )
        settled = await settle_capture(
            db, booking, hold_live=live, amount_paise=amount, entry=entry
        )
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


async def release_hold(db: AsyncSession, ref: str, *, by: str | None = None) -> AdminBooking:
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
        record(
            db,
            booking.id,
            "hold.released",
            actor=BookingActor.OWNER,
            by=by,
            text="Hold released — cancelled, seats freed"
            + ("" if live else " (the hold had already lapsed)"),
            before={"status": BookingStatus.PENDING.value},
            after={"status": BookingStatus.CANCELLED.value, "cancelReason": "owner_released"},
        )
        await waitlist.walk_locked(db, booking.departure_id)  # P6: the freed seats
        package_id = booking.package_id
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    if live:  # the seats just came back: "from ₹" and the page may change
        await refresh_quietly(db, {package_id}, after=f"releasing {ref}")
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
                .options(
                    selectinload(Booking.travellers),
                    selectinload(Booking.cancellation),
                    selectinload(Booking.addons),
                )
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
            addons=[a.label for a in addon_facts(b.addons)],
        )
        for b in bookings
    ]
    totals: dict[str, ManifestAddon] = {}
    for b in bookings:
        for a in addon_facts(b.addons):
            t = totals.setdefault(a.name, ManifestAddon(name=a.name, bookings=0, travellers=0))
            t.bookings += 1
            if a.basis != AddonBasis.BOOKING:
                t.travellers += a.travellers
    return Manifest(
        seats=seats,
        package_slug=pkg.slug,
        nights=pkg.nights,
        days=pkg.days,
        departure_city=pkg.departure_city,
        returns=seats.date + dt.timedelta(days=pkg.nights),
        leader=await departure_leader(db, departure_id),
        bookings=out,
        travellers=sum(len(b.travellers) for b in out),
        addons=list(totals.values()),
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
    "Coupon",
    "Add-ons",
    "Add-ons (₹)",
    "Deposit (₹)",
    "Balance due (₹)",
    "Balance due by",
    "Channel",
)
STATUS_LABELS = {
    BookingStatus.PENDING: "Pending",
    BookingStatus.CONFIRMED: "Confirmed",
    BookingStatus.PARTIALLY_PAID: "Deposit paid",
    BookingStatus.CANCELLED: "Cancelled",
    BookingStatus.COMPLETED: "Completed",
}
CANCEL_LABELS = {
    CancelReason.HOLD_EXPIRED: "Hold expired",
    CancelReason.PAYMENT_FAILED: "Payment failed",
    CancelReason.SEATS_GONE: "Seats gone",
    CancelReason.CANCELLATION_APPROVED: "Cancellation approved",
    CancelReason.OWNER_RELEASED: "Released by owner",
    CancelReason.BALANCE_UNPAID: "Balance unpaid",
}
CANCELLATION_LABELS = {
    CancellationStatus.REQUESTED: "Requested",
    CancellationStatus.APPROVED: "Approved",
    CancellationStatus.REJECTED: "Rejected",
}


def csv_record(b: Booking, pkg: str, departs: dt.date) -> list[str]:
    """One booking per line; the travellers' names in entry order, each with their room."""
    addons = addon_facts(b.addons)
    names = "; ".join(
        f"{t.name} ({'' if t.age is None else f'{t.age}, '}{OCCUPANCY_LABEL[t.occupancy]})"
        for t in b.travellers
    )
    payments = "; ".join(
        f"{label} {p.status.value}"
        for p in b.payments
        if p.status != PaymentStatus.CREATED and (label := payment_label(p))
    )
    on_deposit = b.status == BookingStatus.PARTIALLY_PAID  # P5: a balance still open
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
        b.coupon_code or "",
        "; ".join(f"{a.label} {inr(a.amount_paise // 100)}" for a in addons),
        str(sum(a.amount_paise for a in addons) // 100) if addons else "",
        str(b.deposit_paise // 100) if held_on_deposit(b) and b.deposit_paise else "",
        str((b.total_paise - b.paid_paise) // 100) if on_deposit else "",
        b.balance_due_on.isoformat() if on_deposit and b.balance_due_on else "",
        CHANNEL_WORDS[b.channel],
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
            selectinload(Booking.addons),
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
