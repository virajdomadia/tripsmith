"""Whether a coupon code may be used on this quote (R26, B15) — the seven refusal reasons.

Uses are counted, never stored:

- a **use** is a booking carrying the code with money captured (`paid_paise > 0`) — so it counts
  on capture, an abandoned checkout uses nothing, and a late capture that lands after someone
  else took the last use still counts (the customer paid what they were quoted; the limit shows
  101/100 and nobody is refunded);
- a **live hold** carrying the code reserves a use while its clock runs: "used up" is captured
  uses + other live holds ≥ the limit. At hold time the coupon row is locked (`FOR UPDATE`), so
  two checkouts racing for the last use serialise on it and the second sees the first's hold.
  Lock order everywhere: contact → departure → coupon.

"Already used by this email" = a captured booking with the code and that contact email. The
one-live-hold-per-email rule (R16) stops the same email *holding* it twice, but not paying twice:
a hold released by a newer one still has its Razorpay order, and a late capture on it (seats
permitting) keeps its quoted price like any late capture — so one email that pays both orders
uses the code twice (and can take a limit one past). Accepted, as with the limit above: refusing
money already taken would mean refunding a customer who paid the price they were shown.

The checks run in the order the customer can do something about them: unknown → not started →
expired → not for this trip → below the minimum → used up → used by this email. A paused code
reads as unknown: it does not exist for the customer.
"""

import datetime as dt

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import ApiError
from app.models import Booking, Coupon, Package
from app.models.enums import BookingStatus
from app.schemas.bookings import CouponReason, Quote
from app.services.catalog.deals import ends_on
from app.services.email.render import IST
from app.services.format import inr, long_date

MESSAGE = {
    CouponReason.UNKNOWN: "We don't recognise that code — check the spelling",
    CouponReason.USED_UP: "This code has been fully used",
    CouponReason.NOT_FOR_TRIP: "This code isn't valid for this trip",
    CouponReason.USED_BY_EMAIL: "This code has already been used with this email",
}


def refused(reason: CouponReason, message: str | None = None) -> ApiError:
    return ApiError("conflict", message or MESSAGE[reason], reason=reason.value)


def captured_uses_clause(code: str) -> ColumnElement[bool]:
    return (Booking.coupon_code == code) & (Booking.paid_paise > 0)


def live_hold_clause(code: str) -> ColumnElement[bool]:
    return (
        (Booking.coupon_code == code)
        & (Booking.status == BookingStatus.PENDING)
        & (Booking.paid_paise == 0)
        & (Booking.hold_expires_at > func.now())
    )


async def uses_of(db: AsyncSession, code: str) -> int:
    stmt = select(func.count()).select_from(Booking).where(captured_uses_clause(code))
    return int((await db.execute(stmt)).scalar_one())


async def live_holds_of(db: AsyncSession, code: str, *, except_email: str | None = None) -> int:
    stmt = select(func.count()).select_from(Booking).where(live_hold_clause(code))
    if except_email:
        stmt = stmt.where(Booking.contact_email != except_email)
    return int((await db.execute(stmt)).scalar_one())


async def load(db: AsyncSession, code: str, *, lock: bool = False) -> Coupon | None:
    stmt = select(Coupon).where(Coupon.code == code).options(selectinload(Coupon.packages))
    if lock:
        stmt = stmt.with_for_update(of=Coupon)
    return (await db.execute(stmt)).scalar_one_or_none()


def starts_on(starts_at: dt.datetime) -> dt.date:
    return starts_at.astimezone(IST).date()


def for_package(coupon: Coupon, package_id: str) -> bool:
    return coupon.all_packages or any(p.id == package_id for p in coupon.packages)


async def check(
    db: AsyncSession,
    code: str,
    pkg: Package,
    quote: Quote,
    *,
    email: str | None,
    now: dt.datetime,
    lock: bool,
) -> Coupon:
    """The coupon when `code` may be used on `quote` (built without it), else a 409 with the
    reason. `lock` at hold time only: the row lock is what makes the last use go to one hold."""
    coupon = await load(db, code, lock=lock)
    if coupon is None or not coupon.active:
        raise refused(CouponReason.UNKNOWN)
    if now < coupon.starts_at:
        raise refused(
            CouponReason.NOT_STARTED,
            f"This code starts on {long_date(starts_on(coupon.starts_at))}",
        )
    if coupon.ends_at is not None and now >= coupon.ends_at:
        raise refused(
            CouponReason.EXPIRED, f"This code expired on {long_date(ends_on(coupon.ends_at))}"
        )
    if not for_package(coupon, pkg.id):
        raise refused(CouponReason.NOT_FOR_TRIP)
    if coupon.min_paise and quote.total_paise < coupon.min_paise:
        raise refused(
            CouponReason.BELOW_MINIMUM,
            f"This code needs a booking of at least {inr(coupon.min_paise // 100)}",
        )
    if coupon.use_limit is not None:
        taken = await uses_of(db, code) + await live_holds_of(db, code, except_email=email)
        if taken >= coupon.use_limit:
            raise refused(CouponReason.USED_UP)
    if email:
        used = (
            await db.execute(
                select(func.count())
                .select_from(Booking)
                .where(captured_uses_clause(code), Booking.contact_email == email)
            )
        ).scalar_one()
        if used:
            raise refused(CouponReason.USED_BY_EMAIL)
    return coupon
