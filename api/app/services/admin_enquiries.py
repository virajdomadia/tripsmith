"""The owner's enquiry inbox (F21, 06 §A4 / §C-REST).

Read-mostly: the only writes are a status change and an appended note. Nothing public reads
enquiries, so — unlike every catalog service — **no `revalidate` call belongs in this module**.
The sidebar's new-enquiry badge rides along on `GET /auth/session` (F16) and refreshes when the
page does.

Filtering, searching and paging are server-side, the opposite of F18's packages table: the
catalogue is a dozen rows, the inbox grows without bound.
"""

import datetime as dt
import math
import re
from typing import Any, cast

from sqlalchemy import ColumnElement, Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import ApiError
from app.models import Enquiry, Package, PackageImage
from app.models.enums import EnquiryStatus
from app.schemas.admin_enquiries import (
    PAGE_SIZE,
    AdminEnquiry,
    Device,
    EnquiryFilters,
    EnquiryList,
    EnquiryNoteOut,
    EnquiryPackage,
    EnquiryRow,
    RelatedEnquiry,
    StatusCounts,
)
from app.schemas.enquiries import PackageRef, normalise_phone
from app.schemas.meta import EnquiryType
from app.services.email.render import IST

# A query made only of digits and the punctuation people put in phone numbers is a phone search.
PHONE_QUERY_RE = re.compile(r"^[0-9 +\-.()]+$")


def ist_day_start(day: dt.date) -> dt.datetime:
    """Midnight IST on `day`, as the aware UTC instant `created_at` is compared against.

    The owner reads "received today" as an Indian business day — the same rule
    `analytics.ist_today` applies to page views.
    """
    return dt.datetime.combine(day, dt.time.min, tzinfo=IST).astimezone(dt.UTC)


def like_escape(value: str) -> str:
    r"""Escape LIKE wildcards so a `%` typed into the search box matches a literal `%`."""
    return value.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")


def search_clause(q: str) -> ColumnElement[bool]:
    """Mockup A6: "Search name or phone". A phone is normalised the way the enquiry form
    normalises a submitted number, so `+91 98450-22110` finds the row stored as `9845022110`."""
    text = q.strip()
    if PHONE_QUERY_RE.match(text):
        digits = normalise_phone(text)
        if digits:
            # No escaping needed: PHONE_QUERY_RE already excludes `%` and `_`.
            return Enquiry.phone.contains(digits)
    return Enquiry.name.ilike(f"%{like_escape(text)}%")


def _filtered[S: Select[Any]](stmt: S, filters: EnquiryFilters, *, with_status: bool) -> S:
    """Every filter except `status`, which the tab counts deliberately leave out (A6)."""
    if with_status and filters.status is not None:
        stmt = stmt.where(Enquiry.status == filters.status)
    if filters.type is not None:
        stmt = stmt.where(Enquiry.type == filters.type)
    if filters.package_id is not None:
        stmt = stmt.where(Enquiry.package_id == filters.package_id)
    if filters.from_ is not None:
        stmt = stmt.where(Enquiry.created_at >= ist_day_start(filters.from_))
    if filters.to is not None:
        # Exclusive upper bound at midnight IST the next day: `to` is an inclusive day.
        stmt = stmt.where(Enquiry.created_at < ist_day_start(filters.to + dt.timedelta(days=1)))
    if filters.q:
        stmt = stmt.where(search_clause(filters.q))
    return stmt


def _row(row: Enquiry, package_slug: str | None, package_name: str | None) -> EnquiryRow:
    package = (
        PackageRef(slug=package_slug, name=package_name) if package_slug and package_name else None
    )
    return EnquiryRow(
        id=row.id,
        ref=row.ref,
        # `Enquiry.type` is the ORM's `app.models.enums.EnquiryType`; the wire schema has its own
        # (identical-valued) enum — same string values, so this round-trips by value.
        type=EnquiryType(row.type.value),
        status=row.status,
        name=row.name,
        phone=row.phone,
        package=package,
        travel_month=row.travel_month,
        adults=row.adults,
        children=row.children,
        created_at=row.created_at,
    )


async def _counts(db: AsyncSession, filters: EnquiryFilters) -> StatusCounts:
    rows = await db.execute(
        _filtered(
            select(Enquiry.status, func.count()).select_from(Enquiry), filters, with_status=False
        ).group_by(Enquiry.status)
    )
    by_status = {status: int(n) for status, n in rows.all()}
    return StatusCounts(
        new=by_status.get(EnquiryStatus.NEW, 0),
        contacted=by_status.get(EnquiryStatus.CONTACTED, 0),
        converted=by_status.get(EnquiryStatus.CONVERTED, 0),
        closed=by_status.get(EnquiryStatus.CLOSED, 0),
        all=sum(by_status.values()),
    )


def _with_package(filters: EnquiryFilters) -> Select[tuple[Enquiry, str | None, str | None]]:
    """`package_id` is `ON DELETE SET NULL` and contact enquiries never have one, so the join
    to `packages` is always an outer one — SQLAlchemy's column typing doesn't track that
    nullability, so the cast just tells pyright what the outer join actually returns."""
    stmt = cast(
        "Select[tuple[Enquiry, str | None, str | None]]",
        select(Enquiry, Package.slug, Package.name).outerjoin(
            Package, Package.id == Enquiry.package_id
        ),
    )
    return _filtered(stmt, filters, with_status=True).order_by(
        Enquiry.created_at.desc(), Enquiry.id.desc()
    )


async def list_enquiries(db: AsyncSession, filters: EnquiryFilters) -> EnquiryList:
    total = (
        await db.execute(
            _filtered(select(func.count()).select_from(Enquiry), filters, with_status=True)
        )
    ).scalar_one()
    rows = await db.execute(
        _with_package(filters).limit(PAGE_SIZE).offset((filters.page - 1) * PAGE_SIZE)
    )
    return EnquiryList(
        items=[_row(e, slug, name) for e, slug, name in rows.all()],
        page=filters.page,
        page_size=PAGE_SIZE,
        total=total,
        total_pages=max(1, math.ceil(total / PAGE_SIZE)),
        counts=await _counts(db, filters),
    )


# --- detail ---------------------------------------------------------------------------------------

RELATED_LIMIT = 5
# Every mobile browser carries one of these; a desktop UA carries none of them.
MOBILE_UA_RE = re.compile(r"Mobi|Android|iPhone|iPad|iPod|Windows Phone", re.IGNORECASE)


def device_from(user_agent: str | None) -> Device:
    """ "Mobile" or "Desktop" from the UA, and "Unknown" when there is nothing to go on.

    This is all the "source" the owner gets: mockup A7 also showed a city, but there is no geo
    lookup anywhere in this app and `ip_hash` is a hash, so inventing one would be a lie.
    """
    if not user_agent:
        return "Unknown"
    return "Mobile" if MOBILE_UA_RE.search(user_agent) else "Desktop"


async def load_enquiry(db: AsyncSession, id: str) -> Enquiry:
    """`populate_existing=True` matters: the session runs with `expire_on_commit=False`, so an
    instance already in the identity map would otherwise answer with the notes it loaded before
    a status change appended one (the F18 stale-relationship bug)."""
    row = (
        await db.execute(
            select(Enquiry)
            .where(Enquiry.id == id)
            .options(selectinload(Enquiry.notes))
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None:
        raise ApiError("not_found", "Enquiry not found")
    return row


async def _package_card(db: AsyncSession, package_id: str | None) -> EnquiryPackage | None:
    if package_id is None:
        return None
    cover = PackageImage.__table__.alias("cover")
    found = (
        await db.execute(
            select(Package, cover.c.url)
            .outerjoin(cover, cover.c.id == Package.cover_image_id)
            .where(Package.id == package_id)
        )
    ).one_or_none()
    if found is None:
        return None
    pkg, cover_url = found
    return EnquiryPackage(
        slug=pkg.slug,
        name=pkg.name,
        nights=pkg.nights,
        days=pkg.days,
        starting_price_paise=pkg.starting_price_paise,
        cover_url=cover_url,
        status=pkg.status,
    )


async def _related(db: AsyncSession, row: Enquiry) -> list[RelatedEnquiry]:
    """A7's "other enquiries · same phone" — covered by ix_enquiries_phone_package_id_created_at."""
    rows = await db.execute(
        select(Enquiry.id, Enquiry.ref, Enquiry.status, Package.name, Enquiry.created_at)
        .outerjoin(Package, Package.id == Enquiry.package_id)
        .where(Enquiry.phone == row.phone, Enquiry.id != row.id)
        .order_by(Enquiry.created_at.desc())
        .limit(RELATED_LIMIT)
    )
    return [
        RelatedEnquiry(
            id=id, ref=ref, status=status, package_name=package_name, created_at=created_at
        )
        for id, ref, status, package_name, created_at in rows.all()
    ]


async def _detail(db: AsyncSession, row: Enquiry) -> AdminEnquiry:
    return AdminEnquiry(
        id=row.id,
        ref=row.ref,
        # Same by-value round-trip as `_row` above.
        type=EnquiryType(row.type.value),
        status=row.status,
        name=row.name,
        phone=row.phone,
        email=row.email,
        travel_month=row.travel_month,
        adults=row.adults,
        children=row.children,
        message=row.message,
        preferred_dates=row.preferred_dates,
        budget_paise=row.budget_paise,
        changes=row.changes,
        package=await _package_card(db, row.package_id),
        email_status=row.email_status,
        device=device_from(row.user_agent),
        user_agent=row.user_agent,
        created_at=row.created_at,
        updated_at=row.updated_at,
        # The relationship is ordered by `created_at` on the model — oldest first, as a
        # timeline reads.
        notes=[EnquiryNoteOut(id=n.id, body=n.body, created_at=n.created_at) for n in row.notes],
        related=await _related(db, row),
    )


async def get_enquiry(db: AsyncSession, id: str) -> AdminEnquiry:
    return await _detail(db, await load_enquiry(db, id))
