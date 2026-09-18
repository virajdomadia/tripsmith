"""submitEnquiry (06 C2): honeypot, package lookup, 60 s dedupe, ref, insert, then the two emails
(services/email). The PDF attaches in F11."""

import datetime as dt
import hashlib
import logging
import secrets

import sentry_sdk
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.infra.email import EmailSender
from app.models import Enquiry, Package
from app.models.enums import EmailStatus, EnquiryStatus, EnquiryType, PackageStatus
from app.schemas.enquiries import EnquiryCreate, EnquiryCreated, PackageRef
from app.services.email.render import PackageFacts, context_from
from app.services.email.send import EmailOutcome, send_enquiry_emails

REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I — refs are read out on the phone
DEDUPE_WINDOW = dt.timedelta(seconds=60)
PACKAGE_GONE = "That trip is no longer available"

log = logging.getLogger(__name__)


def make_ref() -> str:
    return "TS-" + "".join(secrets.choice(REF_ALPHABET) for _ in range(6))


def hash_ip(ip: str) -> str:
    """Abuse tracing without storing addresses (06 A4)."""
    return hashlib.sha256(ip.encode()).hexdigest()[:32]


async def _live_package(db: AsyncSession, slug: str) -> Package:
    pkg = (
        await db.execute(
            select(Package).where(Package.slug == slug, Package.status == PackageStatus.LIVE)
        )
    ).scalar_one_or_none()
    if pkg is None:
        raise ApiError(
            "validation", "Request validation failed", field_errors={"packageSlug": PACKAGE_GONE}
        )
    return pkg


async def _recent_duplicate(
    db: AsyncSession, phone: str, package_id: str | None, since: dt.datetime
) -> Enquiry | None:
    stmt = (
        select(Enquiry)
        .where(Enquiry.phone == phone, Enquiry.created_at >= since)
        .order_by(Enquiry.created_at.desc())
    )
    stmt = (
        stmt.where(Enquiry.package_id == package_id)
        if package_id
        else stmt.where(Enquiry.package_id.is_(None))
    )
    return (await db.execute(stmt.limit(1))).scalar_one_or_none()


async def submit_enquiry(
    db: AsyncSession,
    payload: EnquiryCreate,
    *,
    ip: str,
    user_agent: str | None,
    now: dt.datetime | None = None,
    sender: EmailSender | None = None,
    settings: Settings | None = None,
) -> EnquiryCreated:
    now = now or dt.datetime.now(dt.UTC)
    package = await _live_package(db, payload.package_slug) if payload.package_slug else None
    # Plain values: a rollback on the retry path below expires `package`, and touching an expired
    # instance on an AsyncSession raises MissingGreenlet.
    package_id = package.id if package else None
    ref_of = PackageRef(slug=package.slug, name=package.name) if package else None
    facts = PackageFacts.of(package) if package else None

    if payload.website:
        # A bot filled the honeypot: look successful, keep nothing.
        return EnquiryCreated(ref=make_ref(), first_name=payload.first_name, package=ref_of)

    existing = await _recent_duplicate(db, payload.phone, package_id, now - DEDUPE_WINDOW)
    if existing is not None:
        return EnquiryCreated(ref=existing.ref, first_name=payload.first_name, package=ref_of)

    for _attempt in range(5):
        enquiry = Enquiry(
            ref=make_ref(),
            type=EnquiryType(payload.type.value),
            package_id=package_id,
            name=payload.name,
            phone=payload.phone,
            email=payload.email,
            travel_month=payload.travel_month,
            adults=payload.adults,
            children=payload.children,
            message=payload.message,
            preferred_dates=payload.preferred_dates,
            budget_paise=payload.budget_paise,
            changes=payload.changes,
            status=EnquiryStatus.NEW,
            email_status=EmailStatus.SKIPPED,
            ip_hash=hash_ip(ip),
            user_agent=(user_agent or "")[:300] or None,
        )
        db.add(enquiry)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()  # ref collision (1 in 2^30) — draw again
            continue
        await db.refresh(enquiry, ["created_at"])  # server default, printed in the emails
        ctx = context_from(enquiry, facts)
        await db.commit()
        break
    else:
        raise ApiError("internal", "Could not allocate an enquiry reference")

    outcome = EmailOutcome(EmailStatus.SKIPPED, False)
    if sender is not None and settings is not None:
        outcome = await send_enquiry_emails(sender, settings, ctx)
        if outcome.status != EmailStatus.SKIPPED:
            try:
                await db.execute(
                    update(Enquiry).where(Enquiry.id == ctx.id).values(email_status=outcome.status)
                )
                await db.commit()
            except Exception as exc:
                log.exception("Could not record email_status for enquiry %s", ctx.ref)
                sentry_sdk.capture_exception(exc)
    return EnquiryCreated(
        ref=ctx.ref, first_name=payload.first_name, package=ref_of, emailed=outcome.visitor_emailed
    )
