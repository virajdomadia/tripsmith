"""Reviews (R21, R24, B13): a customer reviews a `completed` booking once; the owner publishes or
hides it; the package page shows the published ones and their aggregate.

State lives in two columns (see `models.Review`): `moderated_at` null = pending, then `approved`
says published or hidden. The owner can move a moderated review either way at any time; the
customer can never change or delete theirs.

The aggregate is cached on `packages.rating_avg / rating_count` and recomputed from the
published rows on every moderation — never from testimonials. The package row is locked first,
so two moderations on the same package never compute from each other's half-done state.
"""

import datetime as dt
import math
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import ColumnElement, and_, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import ApiError
from app.infra.revalidate import revalidate
from app.models import Booking, Departure, Package, Review, User
from app.models.enums import BookingStatus, PackageStatus
from app.schemas.reviews import (
    ADMIN_PAGE_SIZE,
    PUBLIC_PAGE_SIZE,
    AccountReview,
    AdminReview,
    AdminReviewList,
    PublicReview,
    PublicReviewPage,
    RatingOut,
    ReviewCounts,
    ReviewInput,
    ReviewState,
)
from app.services.account import account_review, owned_by
from app.services.catalog.admin_packages import revalidate_tags

NOT_COMPLETED = "You can review this trip once you're back from it"
ALREADY_REVIEWED = "You've already reviewed this trip — thank you"
NOT_FOUND = "No booking with that reference on your account"


def in_state(state: ReviewState) -> ColumnElement[bool]:
    if state is ReviewState.PENDING:
        return Review.moderated_at.is_(None)
    return and_(
        Review.moderated_at.is_not(None), Review.approved.is_(state is ReviewState.PUBLISHED)
    )


PUBLISHED = in_state(ReviewState.PUBLISHED)


def public_name(full: str) -> str:
    """'asha  bhat' → 'Asha B.'; a single name stays as it is."""
    parts = full.split()
    if not parts:
        return "A traveller"
    first = parts[0][:1].upper() + parts[0][1:]
    return f"{first} {parts[-1][:1].upper()}." if len(parts) > 1 else first


def rating_out(avg: Decimal | None, count: int) -> RatingOut | None:
    return RatingOut(avg=float(avg), count=count) if count and avg is not None else None


def pages(total: int, size: int) -> int:
    return max(1, math.ceil(total / size))


# ── the customer ───────────────────────────────────────────────────────────────────────────


async def submit_review(
    db: AsyncSession, user: User, ref: str, payload: ReviewInput
) -> AccountReview:
    """Under a row lock on the booking, so a double submit finds the first review rather than a
    unique-key 500. 404 for someone else's booking; 409 before the trip is completed or once
    reviewed. Commits."""
    booking = (
        await db.execute(
            select(Booking).where(Booking.ref == ref, owned_by(user)).with_for_update(of=Booking)
        )
    ).scalar_one_or_none()
    if booking is None:
        await db.rollback()
        raise ApiError("not_found", NOT_FOUND)
    if booking.status != BookingStatus.COMPLETED:
        await db.rollback()
        raise ApiError("conflict", NOT_COMPLETED, reason="not_completed")
    exists = await db.execute(select(Review.id).where(Review.booking_id == booking.id))
    if exists.first() is not None:
        await db.rollback()
        raise ApiError("conflict", ALREADY_REVIEWED, reason="already_reviewed")
    row = Review(
        booking_id=booking.id,
        package_id=booking.package_id,
        user_id=user.id,
        rating=payload.rating,
        text=payload.text,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ApiError("conflict", ALREADY_REVIEWED, reason="already_reviewed") from None
    await db.refresh(row)
    return account_review(row)


# ── the package page ───────────────────────────────────────────────────────────────────────


async def list_public_reviews(
    db: AsyncSession, package_id: str, *, page: int = 1, size: int = PUBLIC_PAGE_SIZE
) -> PublicReviewPage:
    """Published only, newest first. A page past the end is empty, not an error."""
    where = and_(Review.package_id == package_id, PUBLISHED)
    total = (await db.execute(select(func.count()).select_from(Review).where(where))).scalar_one()
    rows = await db.execute(
        select(Review, Booking.contact_name, Departure.date)
        .join(Booking, Booking.id == Review.booking_id)
        .join(Departure, Departure.id == Booking.departure_id)
        .where(where)
        .order_by(Review.created_at.desc(), Review.id.desc())
        .limit(size)
        .offset((page - 1) * size)
    )
    return PublicReviewPage(
        items=[
            PublicReview(
                id=r.id,
                rating=r.rating,
                text=r.text,
                name=public_name(name),
                travelled=departs,
                created_at=r.created_at,
            )
            for r, name, departs in rows
        ],
        page=page,
        total=total,
        total_pages=pages(total, size),
    )


async def public_reviews_for_slug(
    db: AsyncSession, slug: str, *, page: int
) -> PublicReviewPage | None:
    """`None` for drafts and unknown slugs, like the package page itself."""
    package_id = (
        await db.execute(
            select(Package.id).where(Package.slug == slug, Package.status == PackageStatus.LIVE)
        )
    ).scalar_one_or_none()
    if package_id is None:
        return None
    return await list_public_reviews(db, package_id, page=page)


# ── the owner ──────────────────────────────────────────────────────────────────────────────


async def review_counts(db: AsyncSession) -> ReviewCounts:
    counts = {
        state: (
            await db.execute(select(func.count()).select_from(Review).where(in_state(state)))
        ).scalar_one()
        for state in ReviewState
    }
    return ReviewCounts(
        pending=counts[ReviewState.PENDING],
        published=counts[ReviewState.PUBLISHED],
        hidden=counts[ReviewState.HIDDEN],
    )


async def count_pending(db: AsyncSession) -> int:
    return (
        await db.execute(
            select(func.count()).select_from(Review).where(in_state(ReviewState.PENDING))
        )
    ).scalar_one()


def _admin_query():  # noqa: ANN202 — a Select of four columns
    return (
        select(Review, Booking, Package.name, Package.slug, Departure.date)
        .join(Booking, Booking.id == Review.booking_id)
        .join(Package, Package.id == Review.package_id)
        .join(Departure, Departure.id == Booking.departure_id)
    )


def _admin_out(r: Review, b: Booking, name: str, slug: str, departs: dt.date) -> AdminReview:
    return AdminReview(
        id=r.id,
        rating=r.rating,
        text=r.text,
        state=ReviewState.of(r.approved, r.moderated_at),
        name=b.contact_name,
        email=b.contact_email,
        booking_ref=b.ref,
        package_name=name,
        package_slug=slug,
        travelled=departs,
        created_at=r.created_at,
        moderated_at=r.moderated_at,
    )


async def list_reviews(
    db: AsyncSession, state: ReviewState, *, page: int = 1, size: int = ADMIN_PAGE_SIZE
) -> AdminReviewList:
    """One tab of the moderation queue, newest first."""
    counts = await review_counts(db)
    total = getattr(counts, state.value)
    rows = await db.execute(
        _admin_query()
        .where(in_state(state))
        .order_by(Review.created_at.desc(), Review.id.desc())
        .limit(size)
        .offset((page - 1) * size)
    )
    return AdminReviewList(
        items=[_admin_out(*row) for row in rows],
        counts=counts,
        state=state,
        page=page,
        page_size=size,
        total=total,
        total_pages=pages(total, size),
    )


async def review_for_booking(db: AsyncSession, booking_id: str) -> AdminReview | None:
    row = (await db.execute(_admin_query().where(Review.booking_id == booking_id))).first()
    return _admin_out(*row) if row else None


async def recompute_rating(db: AsyncSession, package_id: str) -> None:
    """Rewrite the cached aggregate from the published rows. The caller holds the package lock
    and commits. `updated_at` is kept: a review is not an edit of the package (and the PDF
    cache does not read it)."""
    count, avg = (
        await db.execute(
            select(func.count(), func.avg(Review.rating)).where(
                Review.package_id == package_id, PUBLISHED
            )
        )
    ).one()
    rounded = Decimal(avg).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP) if count else None
    await db.execute(
        update(Package)
        .where(Package.id == package_id)
        .values(rating_avg=rounded, rating_count=count, updated_at=Package.updated_at)
        .execution_options(synchronize_session=False)
    )


async def moderate(
    db: AsyncSession, review_id: str, *, publish: bool, now: dt.datetime | None = None
) -> AdminReview:
    """Publish or hide one review, recompute its package's aggregate, commit, then revalidate
    the package's pages. Repeating the same move is harmless."""
    package_id = (
        await db.execute(select(Review.package_id).where(Review.id == review_id))
    ).scalar_one_or_none()
    if package_id is None:
        raise ApiError("not_found", "No such review")
    pkg = (
        await db.execute(
            select(Package)
            .where(Package.id == package_id)
            .options(selectinload(Package.destination))
            .with_for_update(of=Package)
        )
    ).scalar_one()
    review = (
        await db.execute(select(Review).where(Review.id == review_id).with_for_update())
    ).scalar_one()
    review.approved = publish
    review.moderated_at = now or dt.datetime.now(dt.UTC)
    await db.flush()
    await recompute_rating(db, package_id)
    slug, destination_slug = pkg.slug, pkg.destination.slug
    await db.commit()
    await revalidate(revalidate_tags(slug, destination_slug))
    out = await review_for_booking(db, review.booking_id)
    await db.rollback()
    assert out is not None
    return out
