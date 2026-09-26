"""Reply from the inbox (R23, B11): `POST /admin/enquiries/{id}/reply` and "Send again".

The owner writes a subject and a plain-text body, and may attach any live package's itinerary PDF
(the same `PdfService` as the enquiry email). It goes to the enquiry's email through the usual
sender, with the usual demo-mode rule (send.py): while `EMAIL_FROM` is @resend.dev the
customer's copy lands in `OWNER_NOTIFY_EMAIL` under a `[Test → …]` subject.

Every try is kept as an `enquiry_messages` row — a sent one with Resend's id, a failed one with
`resend_id` null and a short `error`, so the thread shows it and "Send again" can retry it with
the same attachment. The send happens outside any transaction (a PDF render and Resend can take
seconds); the row is written after. A successful send moves a `new` enquiry to `contacted`, with
the usual status note; any other status is left alone.
"""

import asyncio
import logging
from dataclasses import replace

import sentry_sdk
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.business import BUSINESS
from app.config import Settings
from app.errors import ApiError
from app.infra.email import EmailAttachment, EmailMessage, EmailSender, EmailSendError
from app.models import EnquiryMessage, EnquiryNote, Package
from app.models.enums import EnquiryStatus, MessageDirection, PackageStatus
from app.schemas.admin_enquiries import AdminEnquiry, EnquiryReplyInput
from app.services.admin_enquiries import get_enquiry, load_enquiry, status_note
from app.services.email.render import _env, _one_line
from app.services.email.send import is_test_mode
from app.services.enquiries import PDF_ATTACHMENT_TIMEOUT, package_for_pdf
from app.services.pdf.service import PdfService

log = logging.getLogger(__name__)

ERR_OFF = "Email sending is switched off on this server"
ERR_REJECTED = "Resend refused it"
ERR_UNREACHABLE = "Resend could not be reached"
ERR_PDF = "The itinerary PDF could not be made"
NOT_A_LIVE_PACKAGE = "Pick a live package, or no attachment"


def render_reply(
    *,
    to: str,
    subject: str,
    body: str,
    package_name: str | None,
    settings: Settings,
) -> EmailMessage:
    site = settings.site_url.rstrip("/")
    vars = {"body": body, "package_name": package_name, "business": BUSINESS, "site_url": site}
    return EmailMessage(
        to=to,
        subject=_one_line(subject),
        html=_env.get_template("enquiry_reply.html").render(**vars),
        text=_env.get_template("enquiry_reply.txt").render(**vars),
        reply_to=settings.owner_notify_email or None,
    )


async def _attachment(
    db: AsyncSession, pdf: PdfService | None, slug: str
) -> EmailAttachment | None:
    detail = await package_for_pdf(db, slug)
    await db.rollback()  # end the read before the render: it can take seconds
    if pdf is None or detail is None:
        return None
    try:
        return await asyncio.wait_for(pdf.attachment_for(detail), timeout=PDF_ATTACHMENT_TIMEOUT)
    except TimeoutError:
        log.warning("Itinerary PDF for %s timed out on an inbox reply", slug)
        return None


async def _deliver(
    db: AsyncSession,
    *,
    sender: EmailSender,
    settings: Settings,
    pdf: PdfService | None,
    enquiry_ref: str,
    to: str,
    subject: str,
    body: str,
    package: tuple[str, str] | None,
) -> tuple[str | None, str | None]:
    """`(resend_id, error)` — exactly one is set. Never raises."""
    attachment = None
    if package is not None:
        attachment = await _attachment(db, pdf, package[0])
        if attachment is None:
            return None, ERR_PDF
    try:
        message = render_reply(
            to=to,
            subject=subject,
            body=body,
            package_name=package[1] if package else None,
            settings=settings,
        )
    except Exception as exc:
        log.exception("Could not render the reply to %s", enquiry_ref)
        sentry_sdk.capture_exception(exc)
        return None, ERR_REJECTED
    if attachment is not None:
        message = replace(message, attachments=(attachment,))
    if is_test_mode(settings.email_from):
        if not settings.owner_notify_email:
            return None, ERR_OFF
        message = replace(
            message, to=settings.owner_notify_email, subject=f"[Test → {to}] {message.subject}"
        )
    try:
        sent = await sender.send(message)
    except Exception as exc:
        # The kind, never the address.
        log.error("Inbox reply failed for %s: %s", enquiry_ref, exc)
        sentry_sdk.capture_exception(exc)
        unreachable = isinstance(exc, EmailSendError) and "unreachable" in str(exc)
        return None, ERR_UNREACHABLE if unreachable else ERR_REJECTED
    if sent is None:
        return None, ERR_OFF
    return sent or "sent", None  # Resend always returns an id; never store "" as "not sent"


async def _live_package(db: AsyncSession, slug: str) -> Package:
    package = (
        await db.execute(
            select(Package).where(Package.slug == slug, Package.status == PackageStatus.LIVE)
        )
    ).scalar_one_or_none()
    if package is None:
        await db.rollback()
        raise ApiError(
            "validation", NOT_A_LIVE_PACKAGE, field_errors={"packageSlug": NOT_A_LIVE_PACKAGE}
        )
    return package


async def _contacted(db: AsyncSession, id: str) -> None:
    """R24's first move, made for the owner: replying is contacting."""
    row = await load_enquiry(db, id)
    if row.status == EnquiryStatus.NEW:
        db.add(
            EnquiryNote(enquiry_id=row.id, body=status_note(row.status, EnquiryStatus.CONTACTED))
        )
        row.status = EnquiryStatus.CONTACTED


async def send_reply(
    db: AsyncSession,
    id: str,
    payload: EnquiryReplyInput,
    *,
    sender: EmailSender,
    settings: Settings,
    pdf: PdfService | None,
) -> AdminEnquiry:
    row = await load_enquiry(db, id)
    to, enquiry_ref = row.email, row.ref
    package = await _live_package(db, payload.package_slug) if payload.package_slug else None
    attach = (package.id, package.slug, package.name) if package else None
    await db.rollback()
    resend_id, error = await _deliver(
        db,
        sender=sender,
        settings=settings,
        pdf=pdf,
        enquiry_ref=enquiry_ref,
        to=to,
        subject=payload.subject,
        body=payload.body,
        package=(attach[1], attach[2]) if attach else None,
    )
    db.add(
        EnquiryMessage(
            enquiry_id=id,
            direction=MessageDirection.OUTBOUND,
            subject=payload.subject,
            body=payload.body,
            resend_id=resend_id,
            error=error,
            package_id=attach[0] if attach else None,
        )
    )
    if resend_id is not None:
        await _contacted(db, id)
    await db.commit()
    return await get_enquiry(db, id)


async def resend_reply(
    db: AsyncSession,
    id: str,
    message_id: str,
    *,
    sender: EmailSender,
    settings: Settings,
    pdf: PdfService | None,
) -> AdminEnquiry:
    """Send a failed reply again, as it was written, with the same attachment. 409 when it
    already went. The row keeps its id; `sent_at` becomes this try's time."""
    found = (
        await db.execute(
            select(EnquiryMessage, Package.slug, Package.name)
            .outerjoin(Package, Package.id == EnquiryMessage.package_id)
            .where(EnquiryMessage.id == message_id, EnquiryMessage.enquiry_id == id)
        )
    ).one_or_none()
    if found is None:
        await db.rollback()
        raise ApiError("not_found", "Reply not found")
    msg, slug, name = found
    if msg.resend_id is not None:
        await db.rollback()
        raise ApiError("conflict", "This reply was already sent", reason="sent")
    enquiry = await load_enquiry(db, id)
    to, enquiry_ref, subject, body = enquiry.email, enquiry.ref, msg.subject, msg.body
    # The package was deleted since (the FK set it null): send without it rather than never.
    package = (slug, name) if slug and name else None
    await db.rollback()
    resend_id, error = await _deliver(
        db,
        sender=sender,
        settings=settings,
        pdf=pdf,
        enquiry_ref=enquiry_ref,
        to=to,
        subject=subject,
        body=body,
        package=package,
    )
    msg = (
        await db.execute(
            select(EnquiryMessage)
            .where(EnquiryMessage.id == message_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    if msg.resend_id is None:  # a second click that got here first keeps its result
        msg.resend_id, msg.error = resend_id, error
        msg.sent_at = func.now()
        if resend_id is not None:
            await _contacted(db, id)
    await db.commit()
    return await get_enquiry(db, id)
