"""The owner's dashboard (F22, R12, mockup A2): six read-only aggregates over three tables.

Every window is an **IST** one — the owner reads "this week" as an Indian week, the same rule
`analytics.ist_today` applies to a page view and `admin_enquiries.ist_day_start` applies to the
inbox's date filter. Enquiry windows are measured on `created_at` (when it arrived), never on
`updated_at`, so every number here can be reproduced by filtering the inbox by date.

The queries run one after another rather than in a `gather`: they share one `AsyncSession`, and
a session is not safe to use from two coroutines at once. Six small aggregates against indexed
columns are well inside R12's one-second budget at portfolio scale.
"""

import datetime as dt
from dataclasses import dataclass

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Departure, Enquiry, Package, PackageView
from app.models.catalog import departure_availability
from app.models.enums import EnquiryStatus, PackageStatus
from app.schemas.admin_enquiries import EnquiryFilters
from app.schemas.dashboard import (
    MAX_DEPARTURES,
    TOP_N,
    UPCOMING_DAYS,
    VIEW_WINDOW_DAYS,
    WINDOW_DAYS,
    Dashboard,
    PackageCount,
    UpcomingDeparture,
)
from app.services.admin_enquiries import ist_day_start, status_counts
from app.services.analytics import ist_today
from app.services.catalog.pricing import badge_for
from app.services.reviews import count_pending


def week_start(day: dt.date) -> dt.date:
    """Monday. Indian travel agencies quote weeks Monday-to-Sunday, and so does mockup A2."""
    return day - dt.timedelta(days=day.weekday())


def window_start(day: dt.date, days: int) -> dt.date:
    """The first day of a `days`-long window ending on `day` inclusive — 30 days means 29 back."""
    return day - dt.timedelta(days=days - 1)


def window_end(day: dt.date, days: int) -> dt.date:
    """The last day of a `days`-long window starting on `day` inclusive — the mirror image."""
    return day + dt.timedelta(days=days - 1)


async def _count(db: AsyncSession, stmt: Select[tuple[int]]) -> int:
    return int((await db.execute(stmt)).scalar_one() or 0)


async def _enquiries_between(db: AsyncSession, start: dt.date, end: dt.date | None = None) -> int:
    """Enquiries received on or after IST midnight on `start`, and before it on `end`."""
    stmt = (
        select(func.count()).select_from(Enquiry).where(Enquiry.created_at >= ist_day_start(start))
    )
    if end is not None:
        stmt = stmt.where(Enquiry.created_at < ist_day_start(end))
    return await _count(db, stmt)


async def _views_between(db: AsyncSession, start: dt.date, end: dt.date) -> int:
    """`package_views` is already bucketed by IST day, so the window is a plain date range."""
    return await _count(
        db,
        select(func.coalesce(func.sum(PackageView.count), 0)).where(
            PackageView.day >= start, PackageView.day <= end
        ),
    )


async def _top_by_enquiries(db: AsyncSession, since: dt.date) -> list[PackageCount]:
    """Contact enquiries carry no package, and the inner join drops them by construction."""
    rows = await db.execute(
        select(Package.id, Package.slug, Package.name, func.count(Enquiry.id).label("n"))
        .join(Enquiry, Enquiry.package_id == Package.id)
        .where(Enquiry.created_at >= ist_day_start(since))
        .group_by(Package.id, Package.slug, Package.name)
        .order_by(func.count(Enquiry.id).desc(), Package.name)
        .limit(TOP_N)
    )
    return [PackageCount(id=id, slug=slug, name=name, count=int(n)) for id, slug, name, n in rows]


async def _top_by_views(db: AsyncSession, since: dt.date, until: dt.date) -> list[PackageCount]:
    total = func.sum(PackageView.count)
    rows = await db.execute(
        select(Package.id, Package.slug, Package.name, total.label("n"))
        .join(PackageView, PackageView.package_id == Package.id)
        .where(PackageView.day >= since, PackageView.day <= until)
        .group_by(Package.id, Package.slug, Package.name)
        .order_by(total.desc(), Package.name)
        .limit(TOP_N)
    )
    return [PackageCount(id=id, slug=slug, name=name, count=int(n)) for id, slug, name, n in rows]


@dataclass
class _Seats:
    """The two fields `pricing.badge_for` reads, so the admin table and the public one badge a
    departure by the very same rule."""

    seats_left: int
    guaranteed: bool
    price_double_paise: int = 0


async def _upcoming(db: AsyncSession, today: dt.date) -> list[UpcomingDeparture]:
    """Seats come from the `departure_availability` view, so v2's bookings change nothing here.

    Sold-out departures stay in the list: "0 left" on a date a week away is exactly what the
    owner opened the dashboard to see. Drafts do not: a draft's dates (a fresh duplicate's
    included) are not on sale, so they are not departures the owner has to prepare for.
    """
    rows = await db.execute(
        select(
            Departure.id,
            Departure.date,
            Departure.seats_total,
            Departure.guaranteed,
            departure_availability.c.seats_left,
            Package.id,
            Package.slug,
            Package.name,
        )
        .join(departure_availability, departure_availability.c.departure_id == Departure.id)
        .join(Package, Package.id == Departure.package_id)
        .where(
            Package.status == PackageStatus.LIVE,
            Departure.date >= today,
            Departure.date <= window_end(today, UPCOMING_DAYS),
        )
        .order_by(Departure.date, Package.name)
        .limit(MAX_DEPARTURES)
    )
    return [
        UpcomingDeparture(
            id=id,
            package_id=package_id,
            package_slug=slug,
            package_name=name,
            date=date,
            seats_total=seats_total,
            seats_left=int(seats_left),
            guaranteed=guaranteed,
            badge=badge_for(_Seats(int(seats_left), guaranteed)),
        )
        for id, date, seats_total, guaranteed, seats_left, package_id, slug, name in rows
    ]


async def _upcoming_total(db: AsyncSession, today: dt.date) -> int:
    """What the window really holds: the table above stops at `MAX_DEPARTURES`, and a list that
    ends mid-month without saying so is worse than no list."""
    return await _count(
        db,
        select(func.count())
        .select_from(Departure)
        .join(Package, Package.id == Departure.package_id)
        .where(
            Package.status == PackageStatus.LIVE,
            Departure.date >= today,
            Departure.date <= window_end(today, UPCOMING_DAYS),
        ),
    )


async def _awaiting(db: AsyncSession) -> tuple[int, dt.datetime | None]:
    """The "awaiting first call" tile: how many are still `new`, and the oldest one's age."""
    row = (
        await db.execute(
            select(func.count(), func.min(Enquiry.created_at)).where(
                Enquiry.status == EnquiryStatus.NEW
            )
        )
    ).one()
    return int(row[0]), row[1]


async def get_dashboard(db: AsyncSession, *, today: dt.date | None = None) -> Dashboard:
    day = today or ist_today()
    monday = week_start(day)
    month_start = window_start(day, WINDOW_DAYS)
    week_ago = window_start(day, VIEW_WINDOW_DAYS)

    awaiting, oldest_new_at = await _awaiting(db)
    return Dashboard(
        today=day,
        week_start=monday,
        window_start=month_start,
        enquiries_this_week=await _enquiries_between(db, monday),
        # Monday to the same weekday last week. Comparing a part-week against seven full days
        # paints a healthy Monday morning red, so the delta on the tile uses this one.
        enquiries_last_week_to_date=await _enquiries_between(
            db, monday - dt.timedelta(days=7), day - dt.timedelta(days=6)
        ),
        enquiries_last_week=await _enquiries_between(db, monday - dt.timedelta(days=7), monday),
        awaiting_first_call=awaiting,
        oldest_new_at=oldest_new_at,
        converted_last_30_days=await _count(
            db,
            select(func.count())
            .select_from(Enquiry)
            .where(
                Enquiry.status == EnquiryStatus.CONVERTED,
                Enquiry.created_at >= ist_day_start(month_start),
            ),
        ),
        enquiries_last_30_days=await _enquiries_between(db, month_start),
        views_last_7_days=await _views_between(db, week_ago, day),
        views_previous_7_days=await _views_between(
            db, week_ago - dt.timedelta(days=VIEW_WINDOW_DAYS), week_ago - dt.timedelta(days=1)
        ),
        # The inbox's own query, unfiltered: the A2 panel and the A6 tabs can never disagree.
        by_status=await status_counts(db, EnquiryFilters()),
        top_by_enquiries=await _top_by_enquiries(db, month_start),
        top_by_views=await _top_by_views(db, month_start, day),
        upcoming_departures=await _upcoming(db, day),
        upcoming_departures_total=await _upcoming_total(db, day),
        reviews_pending=await count_pending(db),
    )
