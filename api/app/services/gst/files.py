"""A GST document as a PDF: issue its number (committed), read what it prints in a short
transaction, then render with no connection held — the voucher's pattern (B7)."""

import asyncio
import logging

import sentry_sdk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.email import EmailAttachment
from app.models import Booking, BookingAddon, GstDocument, Payment, Refund
from app.models.enums import PaymentProvider
from app.services.booking.addons import AddonFact
from app.services.booking.voucher import load_booking_facts, offline_reference
from app.services.gst.documents import NO_DOCUMENT, DocRef, issue
from app.services.pdf.gst import GstFacts, gst_filename, render_gst_document

RENDER_TIMEOUT = 5.0

log = logging.getLogger(__name__)


async def gst_facts(db: AsyncSession, ref: str, doc: DocRef) -> GstFacts:
    try:
        booking = (await db.execute(select(Booking).where(Booking.ref == ref))).scalar_one()
        facts = await load_booking_facts(db, ref)
        if facts is None:
            raise ApiError("not_found", NO_DOCUMENT)
        payment_label = invoice_number = invoice_dated = reason = None
        if doc.payment_id:
            p = (await db.execute(select(Payment).where(Payment.id == doc.payment_id))).scalar_one()
            if p.provider == PaymentProvider.OFFLINE:
                offline = offline_reference(p)
                payment_label = f"Offline · {offline}" if offline else "Offline"
            else:
                payment_label = f"Razorpay · {p.razorpay_payment_id}"
        if doc.refund_id:
            r = (await db.execute(select(Refund).where(Refund.id == doc.refund_id))).scalar_one()
            reason = r.reason
        if doc.kind == "credit_note":  # cites the booking's first invoice (P8b: not an extras one)
            inv = (
                await db.execute(
                    select(GstDocument).where(
                        GstDocument.booking_id == booking.id,
                        GstDocument.kind == "invoice",
                        GstDocument.payment_id.is_(None),
                    )
                )
            ).scalar_one_or_none()
            if inv is not None:
                invoice_number, invoice_dated = inv.number, inv.dated
        invoice_addons: tuple[AddonFact, ...] = ()
        if doc.kind == "invoice":
            covered = BookingAddon.payment_id.is_(None)
            if doc.payment_id is not None:
                covered = BookingAddon.payment_id == doc.payment_id
            rows = (
                await db.execute(
                    select(BookingAddon)
                    .where(BookingAddon.booking_id == booking.id, covered)
                    .order_by(BookingAddon.position, BookingAddon.id)
                )
            ).scalars()
            invoice_addons = tuple(
                AddonFact(r.name, r.basis, r.travellers, r.nights, r.amount_paise) for r in rows
            )
        return GstFacts(
            doc=doc,
            booking=facts,
            billing_state=booking.billing_state,
            gstin=booking.gstin,
            company_name=booking.company_name,
            payment_label=payment_label,
            invoice_number=invoice_number,
            invoice_dated=invoice_dated,
            refund_reason=reason,
            invoice_addons=invoice_addons,
        )
    finally:
        await db.rollback()


async def document_pdf(
    db: AsyncSession, ref: str, key: str, *, timeout: float | None = None
) -> tuple[bytes, str]:
    """(PDF bytes, filename) for document `key` of booking `ref`, numbering it if the event
    missed it. `timeout` bounds the render only — never the issue and its commit."""
    doc = await issue(db, ref, key)
    facts = await gst_facts(db, ref, doc)
    render = asyncio.to_thread(render_gst_document, facts)
    pdf = await (asyncio.wait_for(render, timeout) if timeout else render)
    return pdf, gst_filename(ref, doc.number or key)


async def extras_invoice_attachment(
    db: AsyncSession, ref: str, razorpay_payment_id: str
) -> EmailAttachment | None:
    """P8b: the tax invoice for one Add extras payment, or None (logged) — never raises."""
    try:
        payment_id = (
            await db.execute(
                select(Payment.id).where(Payment.razorpay_payment_id == razorpay_payment_id)
            )
        ).scalar_one_or_none()
        await db.rollback()
        if payment_id is None:
            return None
        pdf, name = await document_pdf(db, ref, f"invoice-{payment_id}", timeout=RENDER_TIMEOUT)
    except ApiError:
        return None  # nothing it paid for joined the booking: no invoice
    except Exception as exc:
        log.exception("Extras invoice for %s could not be issued; emailing without it", ref)
        sentry_sdk.capture_exception(exc)
        return None
    return EmailAttachment(filename=name, content=pdf)


async def invoice_attachment(db: AsyncSession, ref: str) -> EmailAttachment | None:
    """The tax invoice for the fully-paid email, or None (logged) — never raises."""
    try:
        pdf, name = await document_pdf(db, ref, "invoice", timeout=RENDER_TIMEOUT)
    except ApiError:
        return None  # not fully paid: no invoice yet
    except Exception as exc:
        log.exception("Invoice for %s could not be issued; emailing without it", ref)
        sentry_sdk.capture_exception(exc)
        return None
    return EmailAttachment(filename=name, content=pdf)
