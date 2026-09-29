"""The Money desk (R59, P20 · Dashboard C): read-only sums over payments and bookings.

A payment's money is dated by its capture — `updated_at` while it is captured, the capture time
kept in `raw.refund.capturedAt` once a pre-P13 hand-recorded refund marked it `refunded` — and a
refund by its `refunds` row (P13; 0012 turned the hand-recorded ones into rows): every refund
that has not failed, on the day it was started. Days are IST calendar days. "To send" is what
the booking's "Send refund" would send plus any offline refund waiting to be handed back — the
desk's own numbers, so the two cannot disagree.
"""

import datetime as dt
from collections import defaultdict
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.business import suggested_refund_paise
from app.models import Booking, BookingCancellation, Departure, Package, Payment, Refund
from app.models.enums import (
    BookingStatus,
    CancellationStatus,
    CancelReason,
    PaymentProvider,
    PaymentStatus,
    RefundStatus,
)
from app.schemas.money import (
    WINDOW_DEFAULT,
    MoneyDay,
    MoneyDesk,
    MoneyHold,
    MoneyLine,
    MoneyOwed,
    MoneyRefund,
    MoneyRisk,
)
from app.services.admin_enquiries import ist_day_start
from app.services.analytics import ist_today
from app.services.booking.desk import hold_live
from app.services.booking.refunds import refund_owed
from app.services.booking.voucher import offline_reference
from app.services.email.render import IST
from app.services.format import MONTHS, inr

LAPSED_DAYS = 3  # a hold that lapsed this recently is still worth a call


def _when(value: object, fallback: dt.datetime) -> dt.datetime:
    if isinstance(value, str):
        try:
            return dt.datetime.fromisoformat(value)
        except ValueError:
            pass
    return fallback


def _refund(p: Payment) -> dict[str, Any]:
    info = (p.raw or {}).get("refund")
    return info if isinstance(info, dict) else {}


def _label(p: Payment) -> str:
    if p.provider == PaymentProvider.OFFLINE:
        ref = offline_reference(p)
        return f"Offline · {ref}" if ref else "Offline"
    return "Razorpay"


def _why(b: Booking, resolved_at: dt.datetime | None, *, offline: bool = False) -> str:
    if offline and b.cancel_reason != CancelReason.CANCELLATION_APPROVED:
        return "Paid offline — hand the refund back by cash, UPI or bank"
    if b.cancel_reason == CancelReason.SEATS_GONE:
        return "Paid after the hold lapsed, and the seats had gone"
    if b.cancel_reason == CancelReason.CANCELLATION_APPROVED:
        day = resolved_at.astimezone(IST).date() if resolved_at else None
        return "Agreed when you approved the cancellation" + (
            f", {day.day} {MONTHS[day.month - 1]}" if day else ""
        )
    if b.cancel_reason == CancelReason.BALANCE_UNPAID:
        return "The policy's refund when the balance went unpaid"
    if b.status == BookingStatus.CANCELLED:
        return "Money arrived on a cancelled booking"
    return f"Paid more than the {inr(b.total_paise // 100)} price"


async def money_desk(
    db: AsyncSession, *, days: int = WINDOW_DEFAULT, today: dt.date | None = None
) -> MoneyDesk:
    today = today or ist_today()
    month_start = today.replace(day=1)
    window_start = today - dt.timedelta(days=days - 1)
    since = ist_day_start(min(month_start, window_start))

    rows = await db.execute(
        select(Payment, Booking.ref, Booking.contact_name)
        .join(Booking, Booking.id == Payment.booking_id)
        .where(
            Payment.status.in_((PaymentStatus.CAPTURED, PaymentStatus.REFUNDED)),
            # A refunded payment's capture is older than its `updated_at`, never newer.
            Payment.updated_at >= since,
        )
    )
    by_day: dict[dt.date, list[MoneyLine]] = defaultdict(list)
    collected = count = 0
    for p, ref, name in rows.all():
        info = _refund(p)
        captured_on = _when(info.get("capturedAt"), p.updated_at).astimezone(IST).date()
        who = name
        if captured_on >= window_start:
            by_day[captured_on].append(
                MoneyLine(
                    ref=ref, name=who, kind="in", label=_label(p), amount_paise=p.amount_paise
                )
            )
        if captured_on >= month_start:
            collected += p.amount_paise
            count += 1

    refunded = 0
    refunds: list[MoneyRefund] = []
    going = await db.execute(
        select(Refund, Booking.ref, Booking.contact_name)
        .join(Booking, Booking.id == Refund.booking_id)
        .where(Refund.status != RefundStatus.FAILED, Refund.created_at >= since)
    )
    for r, ref, name in going.all():
        if r.status == RefundStatus.REQUESTED and (r.by_hand or r.razorpay_refund_id is None):
            continue  # still to hand back, or never reached Razorpay: listed under "owe" below
        on = r.created_at.astimezone(IST).date()
        if on >= window_start:
            by_day[on].append(
                MoneyLine(
                    ref=ref,
                    name=name,
                    kind="out",
                    label=_refund_label(r),
                    amount_paise=r.amount_paise,
                )
            )
        if on >= month_start:
            refunded += r.amount_paise
            refunds.append(
                MoneyRefund(ref=ref, name=name, amount_paise=r.amount_paise, at=r.created_at)
            )

    owed = await _owed(db)
    for o in owed:
        by_day[today].append(
            MoneyLine(
                ref=o.ref,
                name=o.name,
                kind="owe",
                label="Refund to send",
                amount_paise=o.amount_paise,
            )
        )
    holds = await _holds(db)
    day_list = []
    for i in range(days):
        day = window_start + dt.timedelta(days=i)
        lines = by_day.get(day, [])
        day_list.append(
            MoneyDay(
                date=day,
                in_paise=sum(x.amount_paise for x in lines if x.kind == "in"),
                out_paise=sum(x.amount_paise for x in lines if x.kind == "out"),
                owe_paise=sum(x.amount_paise for x in lines if x.kind == "owe"),
                lines=lines,
            )
        )
    return MoneyDesk(
        today=today,
        month_start=month_start,
        window_start=window_start,
        collected_paise=collected,
        collected_count=count,
        refunded_paise=refunded,
        to_record_paise=sum(o.amount_paise for o in owed),
        holds_paise=sum(h.total_paise for h in holds),
        days=day_list,
        holds=holds,
        owed=owed,
        refunded=sorted(refunds, key=lambda r: r.at, reverse=True),
        at_risk=await _at_risk(db, today),
    )


async def _owed(db: AsyncSession) -> list[MoneyOwed]:
    rows = await db.execute(
        select(Booking, BookingCancellation.resolved_at)
        .outerjoin(BookingCancellation, BookingCancellation.booking_id == Booking.id)
        .where(Booking.refund_needed.is_(True))
        .order_by(Booking.updated_at)
    )
    out = []
    for b, resolved_at in rows.all():
        waiting = (
            await db.execute(
                select(Refund.amount_paise, Refund.by_hand).where(
                    Refund.booking_id == b.id,
                    Refund.status == RefundStatus.REQUESTED,
                    or_(Refund.by_hand.is_(True), Refund.razorpay_refund_id.is_(None)),
                )
            )
        ).all()
        to_send = await refund_owed(db, b) + sum(a for a, hand in waiting if not hand)
        by_hand = sum(a for a, hand in waiting if hand)
        if to_send + by_hand > 0:
            out.append(
                MoneyOwed(
                    ref=b.ref,
                    name=b.contact_name,
                    amount_paise=to_send + by_hand,
                    why=_why(b, resolved_at, offline=to_send == 0),
                    offline=to_send == 0,
                    offline_paise=by_hand,
                )
            )
    return out


def _refund_label(r: Refund) -> str:
    if r.by_hand:
        return "Refund · by hand"
    return "Refund" if r.status == RefundStatus.PROCESSED else "Refund · processing"


async def _holds(db: AsyncSession) -> list[MoneyHold]:
    rows = await db.execute(
        select(Booking, Package.name, Departure.date)
        .join(Package, Package.id == Booking.package_id)
        .join(Departure, Departure.id == Booking.departure_id)
        .where(hold_live())
        .order_by(Booking.hold_expires_at)
    )
    return [
        MoneyHold(
            ref=b.ref,
            name=b.contact_name,
            total_paise=b.total_paise,
            hold_expires_at=b.hold_expires_at,
            package_name=pkg,
            departs=departs,
        )
        for b, pkg, departs in rows.all()
    ]


async def _at_risk(db: AsyncSession, today: dt.date) -> list[MoneyRisk]:
    out: list[MoneyRisk] = []
    asked = await db.execute(
        select(Booking, BookingCancellation.created_at, Departure.date)
        .join(BookingCancellation, BookingCancellation.booking_id == Booking.id)
        .join(Departure, Departure.id == Booking.departure_id)
        .where(BookingCancellation.status == CancellationStatus.REQUESTED)
        .order_by(BookingCancellation.created_at)
    )
    for b, at, departs in asked.all():
        days_out = max((departs - at.astimezone(IST).date()).days, 0)
        back = suggested_refund_paise(days_out, paid_paise=b.paid_paise, total_paise=b.total_paise)
        out.append(
            MoneyRisk(
                ref=b.ref,
                name=b.contact_name,
                kind="cancellation",
                amount_paise=back,
                departs=departs,
                text=f"Asked to cancel {days_out} days out · the policy returns "
                f"{inr(back // 100)} of {inr(b.paid_paise // 100)}",
            )
        )
    lapsed = await db.execute(
        select(Booking, Package.name, Departure.date)
        .join(Package, Package.id == Booking.package_id)
        .join(Departure, Departure.id == Booking.departure_id)
        .where(
            Departure.date >= today,
            Booking.paid_paise == 0,
            Booking.hold_expires_at >= ist_day_start(today - dt.timedelta(days=LAPSED_DAYS)),
            or_(
                and_(Booking.status == BookingStatus.PENDING, ~hold_live()),
                and_(
                    Booking.status == BookingStatus.CANCELLED,
                    Booking.cancel_reason == CancelReason.HOLD_EXPIRED,
                ),
            ),
        )
        .order_by(Booking.hold_expires_at.desc())
    )
    for b, pkg, departs in lapsed.all():
        out.append(
            MoneyRisk(
                ref=b.ref,
                name=b.contact_name,
                kind="lapsed",
                amount_paise=b.total_paise,
                departs=departs,
                text=f"Hold lapsed, never paid · {pkg} · the seats are free again",
            )
        )
    return out
