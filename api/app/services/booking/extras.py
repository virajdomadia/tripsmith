"""Add-ons after booking (R46, P8b): "Add extras" in My trips, and the owner taking one off.

**Add extras.** A confirmed booking can buy more of its package's switched-on add-ons until
IST departure − 7 days, unless a cancellation request is open. The server prices the choices
(`pricing.price_addons`, over the add-ons the booking does not have yet) and opens a Razorpay
order for exactly that amount; the order's `payments` row carries the priced lines
(`payments.extras`). Nothing changes on the booking until the money is captured.

**Capture** goes through the same locked function as every payment (`payments.settle_capture`
→ `settle_extras` here), idempotent on the Razorpay payment id, so the Checkout callback, the
sync and every webhook replay apply it once: the lines become `booking_addons` rows tied to the
payment, and the total and the paid amount both rise. A line the booking already holds by then
(two orders paid for the same add-on) is not added again; its money is refunded at once, like
any money the booking does not need. A capture on a booking no longer confirmed is refunded in
full by `settle_capture`'s existing rule. A capture after the −7-day cut-off stands: the money
is in, and the rule only closes the door to new orders.

**Taking one off (owner).** The add-on row keeps its copy with `removed_at`; the booking's total
drops by its amount, and what the booking then holds beyond its total is refunded through the
one refund function (`refunds.plan_refund` → `send_refunds`), which issues the credit note.
"""

import datetime as dt
import logging

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import ApiError
from app.infra.razorpay import Razorpay, RazorpayError
from app.models import (
    Booking,
    BookingAddon,
    BookingCancellation,
    BookingTraveller,
    Departure,
    PackageAddon,
    Payment,
    User,
)
from app.models.enums import (
    BookingActor,
    BookingStatus,
    CancellationStatus,
    PaymentProvider,
    PaymentStatus,
)
from app.schemas.bookings import QuoteAddon
from app.schemas.catalog import AddonOut, ImageOut
from app.schemas.extras import BookedAddon, ExtrasOffer, ExtrasOrder, ExtrasQuote, ExtrasRequest
from app.services.booking import history
from app.services.booking.addons import addon_rows, detail, from_quote, summary
from app.services.booking.history import PaymentLog, money
from app.services.booking.locking import lock_booking
from app.services.booking.pricing import ADDON_GONE_REASON, price_addons
from app.services.booking.refunds import plan_refund, send_refunds
from app.services.booking.settled import Settled
from app.services.gst.documents import issue_due_safely

EXTRAS_DAYS = 7
TAKES_EXTRAS = (BookingStatus.CONFIRMED, BookingStatus.PARTIALLY_PAID)
NOT_YOURS = "No booking with that reference on your account"
PAYMENTS_DOWN = "Payments are not reachable right now — try again in a minute, or WhatsApp us"
NO_SUCH_ADDON = "That add-on is not on this booking"
ALREADY_REMOVED = "That add-on was already taken off"
CANT_REMOVE = "Add-ons can only be taken off a confirmed booking"

log = logging.getLogger(__name__)


def closes_on(departs: dt.date) -> dt.date:
    """The last IST day to add extras."""
    return departs - dt.timedelta(days=EXTRAS_DAYS)


def refusal(booking: Booking, departs: dt.date, today: dt.date, *, asked: bool) -> str | None:
    """Why this booking cannot take extras today, in the customer's words — or None."""
    if booking.status not in TAKES_EXTRAS:
        return "Extras can be added to a confirmed booking"
    if asked:
        return "You've asked to cancel this booking, so extras are closed"
    if today > closes_on(departs):
        return (
            f"Extras closed {EXTRAS_DAYS} days before departure — WhatsApp us and we'll see "
            "what we can arrange"
        )
    return None


async def _held(db: AsyncSession, booking_id: str) -> set[str]:
    """The package add-ons the booking has had — held now, or taken off by the owner (who took
    it off for a reason, so it is not offered again, and a late order for it is refunded)."""
    rows = await db.execute(
        select(BookingAddon.addon_id).where(
            BookingAddon.booking_id == booking_id,
            BookingAddon.addon_id.is_not(None),
        )
    )
    return {str(a) for a in rows.scalars()}


async def _package_addons(db: AsyncSession, package_id: str) -> list[PackageAddon]:
    return list(
        (
            await db.execute(
                select(PackageAddon)
                .where(PackageAddon.package_id == package_id)
                .options(selectinload(PackageAddon.image))
                .order_by(PackageAddon.position, PackageAddon.id)
            )
        ).scalars()
    )


async def _open_request(db: AsyncSession, booking_id: str) -> bool:
    return (
        await db.execute(
            select(BookingCancellation.id).where(
                BookingCancellation.booking_id == booking_id,
                BookingCancellation.status == CancellationStatus.REQUESTED,
            )
        )
    ).first() is not None


def booked_out(rows: list[BookingAddon]) -> list[BookedAddon]:
    return [
        BookedAddon(
            id=r.id,
            name=r.name,
            basis=r.basis,
            travellers=r.travellers,
            nights=r.nights,
            unit_paise=r.unit_paise,
            amount_paise=r.amount_paise,
            added_later=r.payment_id is not None,
            added_at=r.created_at,
            removed_at=r.removed_at,
        )
        for r in rows
    ]


async def booked(db: AsyncSession, booking_id: str) -> list[BookedAddon]:
    rows = (
        await db.execute(
            select(BookingAddon)
            .where(BookingAddon.booking_id == booking_id)
            .order_by(BookingAddon.created_at, BookingAddon.position, BookingAddon.id)
        )
    ).scalars()
    return booked_out(list(rows))


async def offer(
    db: AsyncSession, booking: Booking, departs: dt.date, today: dt.date
) -> ExtrasOffer:
    """What My trips offers under Add extras."""
    why = refusal(booking, departs, today, asked=await _open_request(db, booking.id))
    offered: list[AddonOut] = []
    if why is None:
        held = await _held(db, booking.id)
        for a in await _package_addons(db, booking.package_id):
            if not a.active or a.id in held:
                continue
            image = a.image
            offered.append(
                AddonOut(
                    id=a.id,
                    name=a.name,
                    description=a.description,
                    price_paise=a.price_paise,
                    basis=a.basis,
                    max_nights=a.max_nights,
                    image=ImageOut(
                        url=image.url, alt=image.alt, width=image.width, height=image.height
                    )
                    if image
                    else None,
                )
            )
        if not offered:
            why = "Every add-on this trip offers is already on your booking"
    return ExtrasOffer(open=why is None, closes_on=closes_on(departs), reason=why, offered=offered)


# --- the customer's order -----------------------------------------------------------------------


async def _owned(db: AsyncSession, user: User, ref: str) -> Booking:
    from app.services.account import owned_by  # account imports this module for My trips

    booking = (
        await db.execute(select(Booking).where(Booking.ref == ref, owned_by(user)))
    ).scalar_one_or_none()
    if booking is None:
        raise ApiError("not_found", NOT_YOURS)
    return booking


async def _price(
    db: AsyncSession, booking: Booking, req: ExtrasRequest, today: dt.date
) -> list[QuoteAddon]:
    """Price the choices for this booking now, or refuse with the reason (409)."""
    departs = (
        await db.execute(select(Departure.date).where(Departure.id == booking.departure_id))
    ).scalar_one()
    if why := refusal(booking, departs, today, asked=await _open_request(db, booking.id)):
        raise ApiError("conflict", why, reason="extras_closed")
    held = await _held(db, booking.id)
    for i, c in enumerate(req.addons):
        if c.addon_id in held:
            message = "That add-on is already on your booking"
            raise ApiError(
                "conflict", message, reason=ADDON_GONE_REASON, field_errors={f"addons.{i}": message}
            )
    party = (
        await db.execute(
            select(func.count())
            .select_from(BookingTraveller)
            .where(BookingTraveller.booking_id == booking.id)
        )
    ).scalar_one()
    if any(c.travellers is not None and c.travellers > party for c in req.addons):
        message = "An add-on can't be taken by more travellers than are booked"
        raise ApiError("validation", message, field_errors={"addons": message})
    return price_addons(await _package_addons(db, booking.package_id), req.addons, party=party)


async def quote_extras(
    db: AsyncSession, user: User, ref: str, req: ExtrasRequest, *, today: dt.date
) -> ExtrasQuote:
    try:
        lines = await _price(db, await _owned(db, user, ref), req, today)
    finally:
        await db.rollback()
    return ExtrasQuote(addons=lines, total_paise=sum(a.amount_paise for a in lines))


async def create_extras_order(
    db: AsyncSession,
    user: User,
    ref: str,
    req: ExtrasRequest,
    razorpay: Razorpay,
    *,
    today: dt.date,
) -> ExtrasOrder:
    """Price the extras, then open a Razorpay order for exactly that and record its `created`
    payment row with the priced lines. The Razorpay call is made with no transaction open."""
    try:
        booking = await _owned(db, user, ref)
        lines = await _price(db, booking, req, today)
        booking_id = booking.id
    finally:
        await db.rollback()
    amount = sum(a.amount_paise for a in lines)
    try:
        order_id = await razorpay.create_order(amount_paise=amount, receipt=ref)
    except RazorpayError:
        log.exception("Razorpay order for extras on %s failed", ref)
        raise ApiError("internal", PAYMENTS_DOWN, status=502) from None
    try:
        db.add(
            Payment(
                booking_id=booking_id,
                provider=PaymentProvider.RAZORPAY,
                razorpay_order_id=order_id,
                amount_paise=amount,
                status=PaymentStatus.CREATED,
                extras=[a.model_dump(mode="json", by_alias=True) for a in lines],
            )
        )
        history.record(
            db,
            booking_id,
            "order.extras",
            actor=BookingActor.CUSTOMER,
            text=f"Add extras started · {summary(from_quote(lines))} · {money(amount)} · "
            f"Razorpay order {order_id}",
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    return ExtrasOrder(
        booking_ref=ref,
        order_id=order_id,
        key_id=razorpay.key_id,
        amount_paise=amount,
        addons=lines,
    )


# --- capture --------------------------------------------------------------------------------------


async def settle_extras(
    db: AsyncSession,
    booking: Booking,
    *,
    amount_paise: int,
    extras: list[dict[str, object]],
    payment_id: str,
    entry: PaymentLog,
) -> Settled:
    """Apply a captured Add extras payment to a confirmed booking locked by `lock_booking`.
    Called once per payment by `settle_capture` (never on a replay); the caller commits."""
    held = await _held(db, booking.id)
    lines = [QuoteAddon.model_validate(x) for x in extras]
    kept = [a for a in lines if a.addon_id is None or a.addon_id not in held]
    added = sum(a.amount_paise for a in kept)
    count = (
        await db.execute(
            select(func.count())
            .select_from(BookingAddon)
            .where(BookingAddon.booking_id == booking.id)
        )
    ).scalar_one()
    before = {"totalPaise": booking.total_paise, "paidPaise": booking.paid_paise}
    await db.execute(
        update(Booking)
        .where(Booking.id == booking.id)
        .values(
            total_paise=Booking.total_paise + added,
            paid_paise=Booking.paid_paise + amount_paise,
            updated_at=func.now(),
        )
        .execution_options(synchronize_session=False)
    )
    db.add_all(addon_rows(kept, booking_id=booking.id, payment_id=payment_id, start=int(count)))
    await db.flush()
    await db.refresh(booking)
    what = summary(from_quote(kept)) or "nothing new"
    history.record(
        db,
        booking.id,
        entry.kind,
        actor=entry.actor,
        by=entry.by,
        text=f"{entry.text} — extras added: {what}",
        customer=f"Payment of {money(amount_paise)} received — extras added: {what}",
        before=before,
        after={"totalPaise": booking.total_paise, "paidPaise": booking.paid_paise},
    )
    if amount_paise > added:  # a line the booking already had: its money is not needed
        await plan_refund(
            db, booking, amount_paise - added, reason="surplus", actor=BookingActor.SYSTEM
        )
    await issue_due_safely(db, booking)  # the receipt, and this payment's own tax invoice
    # Nothing new joined (every line already held): the money is simply going back.
    return Settled.EXTRAS if kept else Settled.NOT_PENDING


# --- the owner takes one off ---------------------------------------------------------------------


async def remove_addon(
    db: AsyncSession,
    ref: str,
    row_id: str,
    *,
    by: str | None,
    note: str | None,
    razorpay: Razorpay | None,
) -> int:
    """Take an add-on off a confirmed booking and refund it in full. Returns the refund."""
    try:
        booking, _ = await lock_booking(db, ref)
        row = (
            await db.execute(
                select(BookingAddon)
                .where(BookingAddon.id == row_id, BookingAddon.booking_id == booking.id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if row is None:
            raise ApiError("not_found", NO_SUCH_ADDON)
        if row.removed_at is not None:
            raise ApiError("conflict", ALREADY_REMOVED)
        if booking.status not in TAKES_EXTRAS:
            raise ApiError("conflict", CANT_REMOVE)
        before = {"totalPaise": booking.total_paise}
        row.removed_at = func.now()
        await db.execute(
            update(Booking)
            .where(Booking.id == booking.id)
            .values(total_paise=Booking.total_paise - row.amount_paise, updated_at=func.now())
            .execution_options(synchronize_session=False)
        )
        await db.flush()
        await db.refresh(booking)
        label = f"{row.name} ({detail(row.basis, row.travellers, row.nights)})"
        # The line itself, in full (R46) — never more (older surplus stays flagged on the desk)
        # and never more than the booking holds.
        owed = min(row.amount_paise, booking.paid_paise)
        history.record(
            db,
            booking.id,
            "addon.removed",
            actor=BookingActor.OWNER,
            by=by,
            text=f"Add-on taken off: {label} · {money(owed)} refunded"
            + (f" · note: {note}" if note else ""),
            customer=f"{label} was taken off your booking — {money(owed)} is on its way "
            "back" + (f". {note}" if note else ""),
            before=before,
            after={"totalPaise": booking.total_paise},
        )
        refunds = await plan_refund(
            db, booking, owed, reason="addon", actor=BookingActor.OWNER, by=by, note=note
        )
        if refunds:
            row.refund_id = refunds[0].id
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    await send_refunds(db, ref, razorpay)
    return owed
