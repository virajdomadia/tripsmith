"""submitEnquiry (06 C2): honeypot, package lookup, 60 s dedupe, ref, insert, then the two emails
(services/email); the visitor copy carries the itinerary PDF (services/pdf).

Transactions stay short: the insert commits, the package page for the PDF is read in its own
transaction that ends before any network call, and `email_status` is written in a third. No
connection is held through the photo fetch, the render, Blob or Resend.
"""

import asyncio
import contextlib
import datetime as dt
import hashlib
import logging
import secrets

import sentry_sdk
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.infra.db import constraint_name
from app.infra.email import EmailSender
from app.models import Enquiry, Package
from app.models.enums import EmailStatus, EnquiryStatus, EnquiryType, PackageStatus
from app.schemas.catalog import PackageDetail
from app.schemas.enquiries import EnquiryCreate, EnquiryCreated, PackageRef
from app.services.catalog.reads import get_package
from app.services.email.render import PackageFacts, context_from
from app.services.email.send import EmailOutcome, send_enquiry_emails
from app.services.pdf.service import PdfService

REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I — refs are read out on the phone
DEDUPE_WINDOW = dt.timedelta(seconds=60)
PACKAGE_GONE = "That trip is no longer available"
REF_CONSTRAINT = "uq_enquiries_ref"
PACKAGE_FK = "fk_enquiries_package_id_packages"
REF_ATTEMPTS = 5
# Budget for the itinerary PDF on the enquiry path: photo fetch ≤ 5 s + Blob put ≤ 10 s + Resend
# ≤ 13 s can otherwise approach Vercel's `maxDuration 30` on the api function; drop the PDF, not
# the lead, past this.
PDF_ATTACHMENT_TIMEOUT = 8.0

log = logging.getLogger(__name__)


def make_ref() -> str:
    return "TS-" + "".join(secrets.choice(REF_ALPHABET) for _ in range(6))


def hash_ip(ip: str, *, secret: str | None) -> str:
    """Abuse tracing without storing addresses (06 A4), keyed so it cannot be enumerated (H4).

    IPv4 has ~4.3 billion values, so a plain digest is reversible by anyone who can read the
    column — it identifies the visitor as surely as the address would. `SESSION_SECRET` (already
    provisioned, otherwise unused until v2's OTP) keys it instead. Unset, in dev and CI, the
    digest stays plain: there is nothing there to protect, and the column shape does not change.

    blake2b takes a key of at most 64 bytes and raises past that, so the secret is first reduced
    to a fixed 32-byte key — a long `SESSION_SECRET` must not turn every enquiry into a 500.
    """
    key = hashlib.sha256(secret.encode()).digest() if secret else b""
    return hashlib.blake2b(ip.encode(), key=key, digest_size=16).hexdigest()


async def count_new_enquiries(db: AsyncSession) -> int:
    """Rows still in `new` — the sidebar badge (F16); the inbox (F21) filters on the same status."""
    return (
        await db.execute(
            select(func.count()).select_from(Enquiry).where(Enquiry.status == EnquiryStatus.NEW)
        )
    ).scalar_one()


def _package_gone() -> ApiError:
    return ApiError(
        "validation", "Request validation failed", field_errors={"packageSlug": PACKAGE_GONE}
    )


async def _live_package(db: AsyncSession, slug: str) -> Package:
    pkg = (
        await db.execute(
            select(Package).where(Package.slug == slug, Package.status == PackageStatus.LIVE)
        )
    ).scalar_one_or_none()
    if pkg is None:
        raise _package_gone()
    return pkg


async def _lock_submitter(db: AsyncSession, phone: str, package_id: str | None) -> None:
    """Serialise submissions per (phone, package) for the rest of this transaction.

    A double-tap posts twice within milliseconds: without the lock both requests run the
    duplicate check before either inserts, and the owner gets two leads. The second waits here
    until the first commits, then finds its row. `hashtext` folds the key into the lock's int
    space; a rare collision between two submitters only makes one wait a few milliseconds.
    """
    key = f"enquiry:{phone}:{package_id or ''}"
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": key})


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
    pdf: PdfService | None = None,
) -> EnquiryCreated:
    now = now or dt.datetime.now(dt.UTC)
    package = await _live_package(db, payload.package_slug) if payload.package_slug else None
    # Plain values: a rollback on the retry path below expires `package`, and touching an expired
    # instance on an AsyncSession raises MissingGreenlet.
    package_id = package.id if package else None
    ref_of = PackageRef(slug=package.slug, name=package.name) if package else None
    facts = PackageFacts.of(package) if package else None

    # `settings` is optional only because a couple of service-level tests build the call by hand;
    # every route passes it, so production always keys the hash.
    session_secret = (
        settings.session_secret.get_secret_value()
        if settings is not None and settings.session_secret
        else None
    )

    if payload.website:
        # A bot filled the honeypot: look successful, keep nothing.
        return EnquiryCreated(ref=make_ref(), first_name=payload.first_name, package=ref_of)

    await _lock_submitter(db, payload.phone, package_id)
    existing = await _recent_duplicate(db, payload.phone, package_id, now - DEDUPE_WINDOW)
    if existing is not None:
        ref = existing.ref
        await db.rollback()  # releases the lock
        return EnquiryCreated(ref=ref, first_name=payload.first_name, package=ref_of)

    for _attempt in range(REF_ATTEMPTS):
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
            ip_hash=hash_ip(ip, secret=session_secret),
            user_agent=(user_agent or "")[:300] or None,
        )
        try:
            # A savepoint, not the transaction: rolling back a ref collision must keep the lock.
            async with db.begin_nested():
                db.add(enquiry)
        except IntegrityError as exc:
            constraint = constraint_name(exc)
            if REF_CONSTRAINT in constraint:
                continue  # ref collision (1 in 2^30) — draw again
            await db.rollback()
            if PACKAGE_FK in constraint:  # the package was deleted since the lookup above
                raise _package_gone() from None
            raise
        await db.refresh(enquiry, ["created_at"])  # server default, printed in the emails
        ctx = context_from(enquiry, facts)
        await db.commit()
        break
    else:
        await db.rollback()
        raise ApiError("internal", "Could not allocate an enquiry reference")

    outcome = EmailOutcome(EmailStatus.SKIPPED, False)
    if sender is not None and settings is not None:
        # After the commit: the lead is safe whatever the renderer or Blob do (R6 attaches only
        # when a package is on the enquiry; `attachment_for` never raises, but a slow render or
        # Blob upload could otherwise block the request past Vercel's function budget).
        attachment = None
        detail = await package_for_pdf(db, facts.slug) if pdf and facts else None
        if pdf and facts and detail:
            try:
                attachment = await asyncio.wait_for(
                    pdf.attachment_for(detail), timeout=PDF_ATTACHMENT_TIMEOUT
                )
            except TimeoutError:
                log.warning(
                    "Itinerary PDF for %s timed out after %ss for enquiry %s; sending without it",
                    facts.slug,
                    PDF_ATTACHMENT_TIMEOUT,
                    ctx.ref,
                )
                sentry_sdk.capture_message(
                    f"Itinerary PDF timed out after {PDF_ATTACHMENT_TIMEOUT}s for enquiry {ctx.ref}"
                )
        outcome = await send_enquiry_emails(sender, settings, ctx, attachment=attachment)
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


async def package_for_pdf(db: AsyncSession, slug: str) -> PackageDetail | None:
    """The package page the PDF draws, read in its own short transaction and ended before the
    render, Blob and Resend (each can take seconds). Never raises: the lead is already saved,
    and a failed read only costs the attachment."""
    try:
        return await get_package(db, slug, with_related=False)
    except Exception as exc:
        log.exception("Could not load %s for the itinerary PDF", slug)
        sentry_sdk.capture_exception(exc)
        return None
    finally:
        with contextlib.suppress(Exception):  # a dead connection is the pool's problem now
            await db.rollback()  # read-only; hands the connection back to the pool
