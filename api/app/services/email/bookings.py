"""The booking emails (R16, R17), sent once per newly captured payment:

- confirmed → the customer's confirmation with the voucher attached, and the owner's
  new-booking email;
- a late capture with no seats (`seats_gone`) → the customer hears "we couldn't hold your seat;
  your ₹X will be refunded", the owner hears it is being refunded (P13 sends it on its own) —
  neither says "confirmed";
- money on a booking that was no longer pending → the owner hears it is being refunded; the
  customer also hears "we couldn't hold your seat" when the booking was cancelled (a second
  payment on a confirmed booking goes back on its own, and the history says so);
- marked paid offline on the desk (B10) → the customer's confirmation only, its demo note
  saying so; the owner did it and gets no email about it;
- a deposit (P5) → the same confirmation and new-booking emails, saying what is still due and
  by when; a part of the balance → the customer's receipt email (the owner reads it on the
  desk), and the part that clears it → "paid in full" with the voucher and the tax invoice.

Demo mode is the enquiry emails' rule (send.py `held_back`): while `EMAIL_FROM` is @resend.dev,
or always for an @example.com/.org/.net customer, the customer's copy goes to
`OWNER_NOTIFY_EMAIL` with a `[Test → …]` subject. Never raises — the
payment is already committed; a lost email is logged and sent to Sentry.
"""

import asyncio
import logging
from dataclasses import replace

import sentry_sdk
from sqlalchemy.ext.asyncio import AsyncSession

from app.business import BUSINESS, whatsapp_href
from app.config import Settings
from app.infra.email import EmailAttachment, EmailMessage, EmailSender
from app.models.enums import BookingStatus
from app.services.booking.calendar import calendar_path, trip_link_exp
from app.services.booking.history import EmailLine, record_emails
from app.services.booking.settled import Capture, Settled
from app.services.booking.trip_pack import opens_on
from app.services.booking.voucher import BookingFacts
from app.services.email.render import _env, _ist, _one_line
from app.services.email.send import held_back
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


def _calendar(facts: BookingFacts, settings: Settings, site: str) -> dict[str, str | None]:
    """P10 (R48): the Add to calendar buttons — signed api links that live until 30 days
    after the trip (they record the click, then send the event)."""
    secret = settings.session_secret.get_secret_value() if settings.session_secret else None
    exp = trip_link_exp(facts.returns)
    paths = {via: calendar_path(facts.ref, via, secret, exp=exp) for via in ("google", "ics")}
    return {
        f"calendar_{via}_url": f"{site}/api{path}" if path else None for via, path in paths.items()
    }


def _vars(facts: BookingFacts, settings: Settings) -> dict[str, object]:
    site = settings.site_url.rstrip("/")
    return {
        **_calendar(facts, settings, site),
        "pack_opens": long_date(opens_on(facts.departs)),
        "b": facts,
        "business": BUSINESS,
        "site_url": site,
        "package_url": f"{site}/packages/{facts.package_slug}",
        "duration": duration(facts.nights, facts.days),
        "departs": long_date(facts.departs),
        "returns": long_date(facts.returns),
        "paid": inr(facts.paid_paise // 100),
        "total": inr(facts.total_paise // 100),
        "coupon": (
            f"{facts.coupon_code} (−{inr(facts.coupon_off_paise // 100)})"
            if facts.coupon_code
            else None
        ),
        "discount": (
            f"−{inr(facts.manual_off_paise // 100)} · {facts.manual_reason}"
            if facts.manual_off_paise
            else None
        ),
        "addons": [(a.label, inr(a.amount_paise // 100)) for a in facts.addons],
        "booked_at": _ist(facts.booked_at),
        # P5: still on its deposit — the balance and its due day
        "balance": inr(facts.balance_paise // 100)
        if facts.balance_paise and facts.balance_due_on
        else None,
        "due": long_date(facts.balance_due_on) if facts.balance_due_on else None,
        "trip_url": f"{site}/account/bookings/{facts.ref}",
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
    invoice: EmailAttachment | None = None,
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

    if settled == Settled.EXTRAS:  # P8b: Add extras paid on a confirmed booking
        added = _message(
            facts.lead_email,
            f"Extras added to {facts.ref} — {facts.package_name}",
            "extras_added",
            {
                **vars,
                "amount": inr(capture.amount_paise // 100),
                "invoice_attached": invoice is not None,
            },
        )
        if invoice is not None:
            added = replace(added, attachments=(invoice,))
        out.append(("customer", added))
        if settings.owner_notify_email:
            heading = f"Extras added on {facts.ref} — {facts.lead_name} · {facts.package_name}"
            owner = _message(
                settings.owner_notify_email,
                heading,
                "booking_owner",
                {
                    **vars,
                    "heading": heading,
                    "refund": None,
                    "refund_why": "",
                    "payment_id": capture.payment_id,
                },
            )
            out.append(("owner", replace(owner, reply_to=facts.lead_email)))
        return out

    if settled in (Settled.BALANCE_PART, Settled.PAID_IN_FULL):  # P5
        full = settled == Settled.PAID_IN_FULL
        paid_msg = _message(
            facts.lead_email,
            f"{facts.ref} is paid in full — {facts.package_name}, {long_date(facts.departs)}"
            if full
            else f"Payment received for {facts.ref} — {vars['balance']} left to pay",
            "balance_paid",
            {
                **vars,
                "amount": inr(capture.amount_paise // 100),
                "full": full,
                "voucher_attached": voucher is not None,
                "invoice_attached": invoice is not None,
            },
        )
        files = tuple(a for a in (voucher, invoice) if a is not None)
        if files:
            paid_msg = replace(paid_msg, attachments=files)
        out.append(("customer", paid_msg))
        return out

    if settled in (Settled.CONFIRMED, Settled.DEPOSIT):
        confirmed = _message(
            facts.lead_email,
            f"Booking {facts.ref} confirmed — {facts.package_name}, {long_date(facts.departs)}",
            "booking_confirmed",
            {
                **vars,
                "voucher_attached": voucher is not None,
                "invoice_attached": invoice is not None,
            },
        )
        files = tuple(a for a in (voucher, invoice) if a is not None)
        if files:  # P13b: the tax invoice rides with the voucher on the fully-paid email
            confirmed = replace(confirmed, attachments=files)
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
        booked = settled in (Settled.CONFIRMED, Settled.DEPOSIT)
        refund = None if booked else inr(capture.amount_paise // 100)
        on_deposit = (
            f" (deposit · {vars['balance']} due by {vars['due']})" if vars["balance"] else ""
        )
        heading = (
            f"New booking {facts.ref} — {facts.lead_name} · {facts.package_name}{on_deposit}"
            if refund is None
            else f"Refunding {refund} on {facts.ref} · {facts.package_name}"
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
    invoice: EmailAttachment | None = None,
    db: AsyncSession | None = None,
) -> None:
    try:
        labelled = render_booking_emails(
            facts, capture, settings=settings, voucher=voucher, invoice=invoice
        )
    except Exception as exc:
        log.exception("Could not render booking emails for %s", facts.ref)
        sentry_sdk.capture_exception(exc)
        return
    await deliver(sender, settings, labelled, ref=facts.ref, what="booking", db=db)


async def deliver(
    sender: EmailSender,
    settings: Settings,
    labelled: list[tuple[str, EmailMessage]],
    *,
    ref: str,
    what: str,
    db: AsyncSession | None = None,
) -> None:
    """Send `(role, message)` pairs: in demo mode the customer's copy is redirected to the
    owner's inbox; a failed send is logged by role (never the address) and reported. With `db`,
    each email lands in the booking's history (P16) — its subject, never its address."""
    redirected: list[tuple[str, EmailMessage, str, bool]] = []
    skipped: list[EmailLine] = []
    for role, m in labelled:
        held = role == "customer" and held_back(settings, m.to)
        if held:
            if not settings.owner_notify_email:
                skipped.append(EmailLine(role, m.subject, "skipped"))
                continue
            subject = m.subject
            m = replace(m, to=settings.owner_notify_email, subject=f"[Test → {m.to}] {m.subject}")
            redirected.append((role, m, subject, True))
        else:
            redirected.append((role, m, m.subject, False))
    if not redirected:
        if db is not None:
            await record_emails(db, ref, skipped)
        return
    results = await asyncio.gather(
        *(sender.send(m) for _, m, _, _ in redirected), return_exceptions=True
    )
    lines = list(skipped)
    for (role, _, subject, held), result in zip(redirected, results, strict=True):
        failed = isinstance(result, BaseException)
        outcome = "failed" if failed else "off" if result is None else "held" if held else "sent"
        lines.append(EmailLine(role, subject, outcome))
        if isinstance(result, BaseException):
            # The role, never the address.
            log.error("%s %s email failed for %s: %s", role, what, ref, result)
            sentry_sdk.capture_exception(result)
    if db is not None:
        await record_emails(db, ref, lines)
