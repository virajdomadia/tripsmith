"""The booking emails (R16, R17), sent once per newly captured payment:

- confirmed → the customer's confirmation with the voucher attached, and the owner's
  new-booking email;
- a late capture with no seats (`seats_gone`) → the customer hears "we couldn't hold your seat;
  your ₹X will be refunded", the owner gets the refund to make — neither says "confirmed";
- money on a booking that was no longer pending → the owner gets the refund to make; the
  customer also hears "we couldn't hold your seat" when the booking was cancelled (a second
  payment on a confirmed booking is the owner's to sort out by hand);
- marked paid offline on the desk (B10) → the customer's confirmation only, its demo note
  saying so; the owner did it and gets no email about it.

Demo mode is the enquiry emails' rule (send.py): while `EMAIL_FROM` is @resend.dev, the
customer's copy goes to `OWNER_NOTIFY_EMAIL` with a `[Test → …]` subject. Never raises — the
payment is already committed; a lost email is logged and sent to Sentry.
"""

import asyncio
import logging
from dataclasses import replace

import sentry_sdk

from app.business import BUSINESS, whatsapp_href
from app.config import Settings
from app.infra.email import EmailAttachment, EmailMessage, EmailSender
from app.models.enums import BookingStatus
from app.services.booking.settled import Capture, Settled
from app.services.booking.voucher import BookingFacts
from app.services.email.render import _env, _ist, _one_line
from app.services.email.send import is_test_mode
from app.services.format import duration, inr, long_date

log = logging.getLogger(__name__)

DEMO_NOTE = "Demo site: this was a Razorpay test payment — no money moved, and no trip is booked."
OFFLINE_DEMO_NOTE = (
    "Demo site: the owner marked this booking paid offline — no money moved, and no trip is booked."
)
REFUND_WHY = {  # never the word "confirmed": R16 — a seats-gone booking must not read as one
    Settled.SEATS_GONE: "Paid after the hold lapsed, and the last seats had gone — the booking "
    "is cancelled (seats gone).",
    Settled.NOT_PENDING: "The booking was no longer waiting for payment when this money arrived.",
}


def _vars(facts: BookingFacts, settings: Settings) -> dict[str, object]:
    site = settings.site_url.rstrip("/")
    return {
        "b": facts,
        "business": BUSINESS,
        "site_url": site,
        "package_url": f"{site}/packages/{facts.package_slug}",
        "duration": duration(facts.nights, facts.days),
        "departs": long_date(facts.departs),
        "returns": long_date(facts.returns),
        "paid": inr(facts.paid_paise // 100),
        "total": inr(facts.total_paise // 100),
        "booked_at": _ist(facts.booked_at),
        "demo_note": DEMO_NOTE,
        "whatsapp_url": whatsapp_href(
            settings.whatsapp_number,
            f"Hi Tripsmith, about my booking {facts.ref} ({facts.package_name}).",
        ),
    }


def _message(to: str, subject: str, template: str, vars: dict[str, object]) -> EmailMessage:
    return EmailMessage(
        to=to,
        subject=_one_line(subject),
        html=_env.get_template(f"{template}.html").render(**vars),
        text=_env.get_template(f"{template}.txt").render(**vars),
    )


def render_booking_emails(
    facts: BookingFacts,
    capture: Capture,
    *,
    settings: Settings,
    voucher: EmailAttachment | None = None,
) -> list[tuple[str, EmailMessage]]:
    """`(role, message)` pairs for this capture — `customer` and/or `owner`; none for a part
    payment. The customer's address is the booking's, before the demo-mode redirect."""
    vars = _vars(facts, settings)
    if capture.offline:
        vars["demo_note"] = OFFLINE_DEMO_NOTE
    settled = capture.settled
    out: list[tuple[str, EmailMessage]] = []
    if settled == Settled.PART_PAID:
        return out

    if settled == Settled.CONFIRMED:
        confirmed = _message(
            facts.lead_email,
            f"Booking {facts.ref} confirmed — {facts.package_name}, {long_date(facts.departs)}",
            "booking_confirmed",
            {**vars, "voucher_attached": voucher is not None},
        )
        if voucher is not None:
            confirmed = replace(confirmed, attachments=(voucher,))
        out.append(("customer", confirmed))
    elif settled == Settled.SEATS_GONE or facts.status == BookingStatus.CANCELLED:
        refund_vars = {**vars, "refund": inr(capture.amount_paise // 100)}
        out.append(
            (
                "customer",
                _message(
                    facts.lead_email,
                    f"About your payment for {facts.ref} — we couldn't hold your seat",
                    "booking_seats_gone",
                    refund_vars,
                ),
            )
        )

    # B10: an offline payment is the owner's own act on the desk — no "New booking" email.
    if settings.owner_notify_email and not capture.offline:
        refund = None if settled == Settled.CONFIRMED else inr(capture.amount_paise // 100)
        heading = (
            f"New booking {facts.ref} — {facts.lead_name} · {facts.package_name}"
            if refund is None
            else f"Refund needed on {facts.ref} — {refund} · {facts.package_name}"
        )
        owner = _message(
            settings.owner_notify_email,
            heading,
            "booking_owner",
            {
                **vars,
                "heading": heading,
                "refund": refund,
                "refund_why": REFUND_WHY.get(settled, ""),
                "payment_id": capture.payment_id,
            },
        )
        out.append(("owner", replace(owner, reply_to=facts.lead_email)))
    return out


async def send_booking_emails(
    sender: EmailSender,
    settings: Settings,
    facts: BookingFacts,
    capture: Capture,
    *,
    voucher: EmailAttachment | None = None,
) -> None:
    try:
        labelled = render_booking_emails(facts, capture, settings=settings, voucher=voucher)
    except Exception as exc:
        log.exception("Could not render booking emails for %s", facts.ref)
        sentry_sdk.capture_exception(exc)
        return
    await deliver(sender, settings, labelled, ref=facts.ref, what="booking")


async def deliver(
    sender: EmailSender,
    settings: Settings,
    labelled: list[tuple[str, EmailMessage]],
    *,
    ref: str,
    what: str,
) -> None:
    """Send `(role, message)` pairs: in demo mode the customer's copy is redirected to the
    owner's inbox; a failed send is logged by role (never the address) and reported."""
    if is_test_mode(settings.email_from):
        redirected = []
        for role, m in labelled:
            if role == "customer":
                if not settings.owner_notify_email:
                    continue
                m = replace(
                    m, to=settings.owner_notify_email, subject=f"[Test → {m.to}] {m.subject}"
                )
            redirected.append((role, m))
        labelled = redirected
    if not labelled:
        return
    results = await asyncio.gather(*(sender.send(m) for _, m in labelled), return_exceptions=True)
    for (role, _), result in zip(labelled, results, strict=True):
        if isinstance(result, BaseException):
            # The role, never the address.
            log.error("%s %s email failed for %s: %s", role, what, ref, result)
            sentry_sdk.capture_exception(result)
