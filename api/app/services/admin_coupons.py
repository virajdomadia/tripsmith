"""The admin Coupons page (R26, B15): list, create, edit, pause/resume, delete.

Once a coupon is **in use** — a captured use or a live hold carrying it — its code, kind and
amount are locked: vouchers already issued carry that code and discount, and a hold must be
able to pay what it was quoted. Dates, cap, minimum, limit (never below the uses), packages and
the switch stay editable; bookings are never re-priced (each keeps its quote snapshot). A coupon
can be deleted only while it is not in use; after that it can only be paused.

Every write locks the coupon row, the same lock a hold takes to check the limit.

What a coupon did (R59, P20 · Coupons B) is read from the bookings that carry it, by the same
rule as its uses — money captured — never stored: the discount comes from each booking's quote
snapshot, and a use is dated by when its booking was made.
"""

import datetime as dt
from dataclasses import dataclass, field

from sqlalchemy import ColumnElement, Integer, and_, cast, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import ApiError
from app.infra.db import constraint_name
from app.models import Booking, BookingTraveller, Coupon, Package, PackageImage
from app.models.enums import BookingStatus, CouponKind
from app.schemas.coupons import (
    LATEST_USES,
    TOP_TRIPS,
    WEEKS,
    AdminCoupon,
    AdminCouponList,
    CouponInput,
    CouponPackage,
    CouponResults,
    CouponState,
    CouponTrip,
    CouponUse,
)
from app.services.admin_enquiries import ist_day_start
from app.services.analytics import ist_today
from app.services.booking.coupons import starts_on
from app.services.catalog.deals import end_of_ist_day, ends_on
from app.services.email.render import IST

NOT_FOUND = "That coupon no longer exists"
DUPLICATE_CODE = "Another coupon already uses this code"
LOCKED = "Locked: the coupon is in use"
IN_USE = "This coupon has been used — pause it instead"
CODE_CONSTRAINT = "uq_coupons_code"


def start_of_ist_day(day: dt.date) -> dt.datetime:
    return dt.datetime.combine(day, dt.time(), IST).astimezone(dt.UTC)


USED = Booking.paid_paise > 0
# services/booking/coupons.py's live hold
HOLDING = and_(
    Booking.status == BookingStatus.PENDING,
    Booking.paid_paise == 0,
    Booking.hold_expires_at > func.now(),
)


def _off() -> ColumnElement[int]:
    """The coupon's discount in the booking's quote snapshot (voucher.coupon_off_of in SQL)."""
    return func.coalesce(cast(Booking.quote["coupon"]["offPaise"].astext, Integer), 0)


@dataclass
class _Figures:
    uses: int = 0
    holds: int = 0
    given: int = 0
    booked: int = 0
    weekly: list[int] = field(default_factory=lambda: [0] * WEEKS)


def _first_week(now: dt.datetime | None) -> dt.date:
    """The Monday that starts the sparkline's oldest IST week."""
    today = ist_today(now)
    return today - dt.timedelta(days=today.weekday(), weeks=WEEKS - 1)


async def _counts(
    db: AsyncSession, codes: list[str], *, now: dt.datetime | None = None
) -> dict[str, _Figures]:
    """Uses, live holds, ₹ given back, bookings value and uses per week, per code."""
    if not codes:
        return {}
    out = {c: _Figures() for c in codes}
    rows = (
        await db.execute(
            select(
                Booking.coupon_code,
                func.count().filter(USED),
                func.count().filter(HOLDING),
                func.coalesce(func.sum(_off()).filter(USED), 0),
                func.coalesce(func.sum(Booking.total_paise).filter(USED), 0),
            )
            .where(Booking.coupon_code.in_(codes))
            .group_by(Booking.coupon_code)
        )
    ).all()
    for code, uses, holds, given, booked in rows:
        f = out[str(code)]
        f.uses, f.holds, f.given, f.booked = int(uses), int(holds), int(given), int(booked)
    first = _first_week(now)
    week = func.date_trunc("week", func.timezone("Asia/Kolkata", Booking.created_at))
    weeks = (
        await db.execute(
            select(Booking.coupon_code, week, func.count())
            .where(
                Booking.coupon_code.in_(codes),
                USED,
                Booking.created_at >= ist_day_start(first),
            )
            .group_by(Booking.coupon_code, week)
        )
    ).all()
    for code, starts, n in weeks:
        i = (starts.date() - first).days // 7
        if 0 <= i < WEEKS:
            out[str(code)].weekly[i] = int(n)
    return out


def _state(c: Coupon, uses: int, now: dt.datetime) -> CouponState:
    if not c.active:
        return CouponState.PAUSED
    if now < c.starts_at:
        return CouponState.SCHEDULED
    if c.ends_at is not None and now >= c.ends_at:
        return CouponState.EXPIRED
    if c.use_limit is not None and uses >= c.use_limit:
        return CouponState.USED_UP
    return CouponState.ACTIVE


def _out(c: Coupon, f: _Figures, now: dt.datetime) -> AdminCoupon:
    uses, holds = f.uses, f.holds
    return AdminCoupon(
        id=c.id,
        code=c.code,
        kind=c.kind,
        amount_paise=c.amount_paise,
        percent=c.percent,
        cap_paise=c.cap_paise,
        min_paise=c.min_paise,
        starts_on=starts_on(c.starts_at),
        ends_on=ends_on(c.ends_at) if c.ends_at else None,
        use_limit=c.use_limit,
        all_packages=c.all_packages,
        packages=[CouponPackage(id=p.id, name=p.name) for p in c.packages],
        active=c.active,
        state=_state(c, uses, now),
        uses=uses,
        live_holds=holds,
        locked=uses + holds > 0,
        created_at=c.created_at,
        given_paise=f.given,
        booked_paise=f.booked,
        weekly=f.weekly,
    )


async def list_coupons(db: AsyncSession, *, now: dt.datetime | None = None) -> AdminCouponList:
    now = now or dt.datetime.now(dt.UTC)
    coupons = list(
        (
            await db.execute(
                select(Coupon)
                .options(selectinload(Coupon.packages))
                .order_by(Coupon.created_at.desc(), Coupon.code)
            )
        ).scalars()
    )
    counts = await _counts(db, [c.code for c in coupons], now=now)
    return AdminCouponList(items=[_out(c, counts[c.code], now) for c in coupons])


async def _by_id(db: AsyncSession, id: str, *, lock: bool) -> Coupon:
    stmt = select(Coupon).where(Coupon.id == id).options(selectinload(Coupon.packages))
    if lock:
        stmt = stmt.with_for_update(of=Coupon)
    coupon = (await db.execute(stmt)).scalar_one_or_none()
    if coupon is None:
        raise ApiError("not_found", NOT_FOUND)
    return coupon


async def get_coupon(db: AsyncSession, id: str, *, now: dt.datetime | None = None) -> AdminCoupon:
    now = now or dt.datetime.now(dt.UTC)
    c = await _by_id(db, id, lock=False)
    return _out(c, (await _counts(db, [c.code], now=now))[c.code], now)


async def coupon_results(db: AsyncSession, id: str) -> CouponResults:
    """What the code did: the trips it sold and its latest uses and live holds. Read-only."""
    code = (await _by_id(db, id, lock=False)).code
    cover = PackageImage.__table__.alias("cover")
    trips = (
        await db.execute(
            select(Package.id, Package.name, cover.c.url, func.count())
            .join(Booking, Booking.package_id == Package.id)
            .outerjoin(cover, cover.c.id == Package.cover_image_id)
            .where(Booking.coupon_code == code, USED)
            .group_by(Package.id, Package.name, cover.c.url)
            .order_by(func.count().desc(), Package.name)
        )
    ).all()
    travellers = (
        select(func.count())
        .select_from(BookingTraveller)
        .where(BookingTraveller.booking_id == Booking.id)
        .scalar_subquery()
    )
    latest = (
        await db.execute(
            select(Booking, Package.name, travellers, _off())
            .join(Package, Package.id == Booking.package_id)
            .where(Booking.coupon_code == code, or_(USED, HOLDING))
            .order_by(Booking.created_at.desc(), Booking.id.desc())
            .limit(LATEST_USES)
        )
    ).all()
    return CouponResults(
        trips=[
            CouponTrip(package_id=i, name=n, cover_url=u, uses=k)
            for i, n, u, k in trips[:TOP_TRIPS]
        ],
        other_trip_uses=sum(k for *_, k in trips[TOP_TRIPS:]),
        latest=[
            CouponUse(
                at=b.created_at,
                ref=b.ref,
                name=b.contact_name,
                email=b.contact_email,
                package_name=name,
                travellers=n,
                off_paise=off,
                holding=b.paid_paise == 0,
            )
            for b, name, n, off in latest
        ],
    )


async def _packages(db: AsyncSession, payload: CouponInput) -> list[Package]:
    if payload.all_packages:
        return []
    ids = list(dict.fromkeys(payload.package_ids))
    found = list((await db.execute(select(Package).where(Package.id.in_(ids)))).scalars())
    if not ids or len(found) != len(ids):
        message = "Choose at least one package" if not ids else "A chosen package no longer exists"
        raise ApiError("validation", message, field_errors={"packageIds": message})
    return found


def _validate(payload: CouponInput) -> None:
    errors: dict[str, str] = {}
    if payload.kind == CouponKind.FLAT:
        if payload.amount_paise is None:
            errors["amountPaise"] = "Enter the ₹ off"
        if payload.percent is not None:
            errors["percent"] = "A flat coupon has no percent"
        if payload.cap_paise is not None:
            errors["capPaise"] = "Only a % coupon has a cap"
    else:
        if payload.percent is None:
            errors["percent"] = "Enter the % off (1–90)"
        if payload.amount_paise is not None:
            errors["amountPaise"] = "A % coupon has no flat amount"
    if payload.ends_on is not None and payload.ends_on < payload.starts_on:
        errors["endsOn"] = "Ends before it starts"
    if errors:
        raise ApiError("validation", next(iter(errors.values())), field_errors=errors)


def _apply(c: Coupon, payload: CouponInput, packages: list[Package]) -> None:
    c.code = payload.code
    c.kind = payload.kind
    c.amount_paise = payload.amount_paise
    c.percent = payload.percent
    c.cap_paise = payload.cap_paise
    c.min_paise = payload.min_paise
    c.starts_at = start_of_ist_day(payload.starts_on)
    c.ends_at = end_of_ist_day(payload.ends_on) if payload.ends_on else None
    c.use_limit = payload.use_limit
    c.all_packages = payload.all_packages
    c.packages = packages
    c.active = payload.active


async def _commit(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if CODE_CONSTRAINT in constraint_name(exc):
            dup = {"code": DUPLICATE_CODE}
            raise ApiError("conflict", DUPLICATE_CODE, field_errors=dup) from None
        raise


async def create_coupon(
    db: AsyncSession, payload: CouponInput, *, now: dt.datetime | None = None
) -> AdminCoupon:
    _validate(payload)
    coupon = Coupon()
    _apply(coupon, payload, await _packages(db, payload))
    db.add(coupon)
    await _commit(db)
    return await get_coupon(db, coupon.id, now=now)


async def update_coupon(
    db: AsyncSession, id: str, payload: CouponInput, *, now: dt.datetime | None = None
) -> AdminCoupon:
    _validate(payload)
    coupon = await _by_id(db, id, lock=True)
    f = (await _counts(db, [coupon.code]))[coupon.code]
    uses, holds = f.uses, f.holds
    if uses + holds:
        errors = {
            field: LOCKED
            for field, saved, new in (
                ("code", coupon.code, payload.code),
                ("kind", coupon.kind, payload.kind),
                ("amountPaise", coupon.amount_paise, payload.amount_paise),
                ("percent", coupon.percent, payload.percent),
            )
            if saved != new
        }
        if errors:
            await db.rollback()
            raise ApiError("conflict", LOCKED, field_errors=errors)
    if payload.use_limit is not None and payload.use_limit < uses:
        await db.rollback()
        message = f"Already used {uses} times — the limit can't go below that"
        raise ApiError("validation", message, field_errors={"useLimit": message})
    _apply(coupon, payload, await _packages(db, payload))
    await _commit(db)
    return await get_coupon(db, id, now=now)


async def set_active(
    db: AsyncSession, id: str, active: bool, *, now: dt.datetime | None = None
) -> AdminCoupon:
    coupon = await _by_id(db, id, lock=True)
    coupon.active = active
    await db.commit()
    return await get_coupon(db, id, now=now)


async def delete_coupon(db: AsyncSession, id: str) -> None:
    coupon = await _by_id(db, id, lock=True)
    f = (await _counts(db, [coupon.code]))[coupon.code]
    uses, holds = f.uses, f.holds
    if uses + holds:
        await db.rollback()
        raise ApiError("conflict", IN_USE)
    await db.execute(delete(Coupon).where(Coupon.id == id))
    await db.commit()
