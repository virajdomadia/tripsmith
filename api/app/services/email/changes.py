"""The date-change emails (R45, P7), sent once per change after its transaction commits:

- moved → the customer's "Your trip has moved" with the new voucher (and the tax invoice the
  change brought: a supplementary one for a rise paid after the first invoice, or the first
  invoice when the change's payment cleared a deposit booking), and the owner's notice;
- a payment that came too late for the new date's seats → the customer hears the trip stays
  and the money is coming back; the owner hears it is being refunded.

The voucher render, the invoice and the sends run with no transaction open. Never raises — the
change is already committed.
"""

import logging
from dataclasses import replace

import sentry_sdk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.email import EmailAttachment, EmailMessage
from app.models import DateChange, Payment
from app.models.enums import PaymentStatus
from app.services.booking.after_capture import Notify, voucher_attachment
from app.services.booking.changes import departure_dates
from app.services.booking.voucher import load_booking_facts
from app.services.email.bookings import _message, _vars, deliver
from app.services.format import inr, long_date
from app.services.gst.files import extras_invoice_attachment, invoice_attachment

NO_PAYMENT_NOTE = "Demo site: no trip is booked, and no money moved."

log = logging.getLogger(__name__)


async def send_change_emails(
    db: AsyncSession,
    notify: Notify | None,
    ref: str,
    change_id: str,
    *,
    refund_paise: int = 0,
    razorpay_payment_id: str | None = None,
    lapsed: bool = False,
) -> None:
    """`razorpay_payment_id` = the payment these emails are about (after a capture); `lapsed` =
    that payment did not move the booking and is going back."""
    if notify is None:
        return
    try:
        change = (
            await db.execute(select(DateChange).where(DateChange.id == change_id))
        ).scalar_one()
        dates = await departure_dates(db, [change.from_departure_id, change.to_departure_id])
        paid = select(Payment.razorpay_payment_id, Payment.amount_paise).where(
            Payment.date_change_id == change_id,
            Payment.status.in_((PaymentStatus.CAPTURED, PaymentStatus.REFUNDED)),
        )
        if razorpay_payment_id is not None:
            paid = paid.where(Payment.razorpay_payment_id == razorpay_payment_id)
        payment = (await db.execute(paid.order_by(Payment.created_at.desc()).limit(1))).first()
        moved = change.state.value == "done" and not lapsed
        invoiced, fee = change.invoiced, change.fee_paise
        old_date = dates[change.from_departure_id]
        new_date = dates[change.to_departure_id]
        actor = change.actor
        facts = await load_booking_facts(db, ref)
    except Exception as exc:
        log.exception("Could not load date change %s for its emails", change_id)
        sentry_sdk.capture_exception(exc)
        return
    finally:
        await db.rollback()
    if facts is None:
        return
    voucher: EmailAttachment | None = None
    invoice: EmailAttachment | None = None
    if moved:
        voucher = await voucher_attachment(facts, notify.settings)
        if payment is not None and invoiced and payment[0]:
            invoice = await extras_invoice_attachment(db, ref, payment[0])
        elif not invoiced and facts.paid_paise >= facts.total_paise:
            invoice = await invoice_attachment(db, ref)  # the change cleared the balance
    files = tuple(f for f in (voucher, invoice) if f is not None)
    vars = _vars(facts, notify.settings)
    paid_now = inr(payment[1] // 100) if payment else None
    if payment is None:
        vars["demo_note"] = NO_PAYMENT_NOTE
    customer = _message(
        facts.lead_email,
        f"Your trip has moved to {long_date(new_date)} — {facts.ref}"
        if moved
        else f"About your date change for {facts.ref} — your payment is coming back",
        "date_changed",
        {
            **vars,
            "moved": moved,
            "old_date": long_date(old_date),
            "fee": inr(fee // 100) if fee else None,
            "paid_now": paid_now,
            "refund": inr(refund_paise // 100) if refund_paise else None,
            "voucher_attached": voucher is not None,
            "invoice_attached": invoice is not None,
        },
    )
    if files:
        customer = replace(customer, attachments=files)
    labelled: list[tuple[str, EmailMessage]] = [("customer", customer)]
    settings = notify.settings
    if settings.owner_notify_email and actor == "customer":
        heading = (
            f"Date changed on {facts.ref} — {long_date(old_date)} → {long_date(new_date)} · "
            f"{facts.lead_name}"
            if moved
            else f"Refunding {paid_now} on {facts.ref} · date change too late for its seats"
        )
        owner = _message(
            settings.owner_notify_email,
            heading,
            "booking_owner",
            {
                **vars,
                "heading": heading,
                "refund": None if moved else paid_now,
                "refund_why": "The change's hold had ended when the payment arrived."
                if not moved
                else "",
                "payment_id": payment[0] if payment and payment[0] else "no payment needed",
            },
        )
        labelled.append(("owner", replace(owner, reply_to=facts.lead_email)))
    await deliver(notify.sender, settings, labelled, ref=ref, what="date change", db=db)


async def send_change_emails_for_payment(
    db: AsyncSession,
    notify: Notify | None,
    ref: str,
    razorpay_payment_id: str,
    *,
    lapsed: bool = False,
) -> None:
    """After a change's difference was captured (`on_new_capture`): the emails of the change
    that payment paid for."""
    try:
        change_id = (
            await db.execute(
                select(Payment.date_change_id).where(
                    Payment.razorpay_payment_id == razorpay_payment_id
                )
            )
        ).scalar_one_or_none()
    except Exception as exc:
        log.exception("Could not find the date change paid by %s", razorpay_payment_id)
        sentry_sdk.capture_exception(exc)
        return
    finally:
        await db.rollback()
    if change_id is not None:
        await send_change_emails(
            db, notify, ref, change_id, razorpay_payment_id=razorpay_payment_id, lapsed=lapsed
        )
