"""The cancellation-request emails (B9, R19): the owner gets the request to decide on — reason,
days to departure, the policy tier that applies today — and the customer an acknowledgement
("nothing is cancelled yet; we reply within a day"). B11: the owner's decision reaches the
customer only (the owner made it) — approved with the refund agreed, or rejected, each with the
owner's note.

Same demo-mode rule and never-raise contract as the booking emails (`deliver`).
"""

import datetime as dt
import logging
from dataclasses import replace

import sentry_sdk

from app.business import refund_tier
from app.config import Settings
from app.infra.email import EmailMessage, EmailSender
from app.services.booking.voucher import BookingFacts
from app.services.email.bookings import _message, _vars, deliver
from app.services.email.render import _ist
from app.services.format import inr

log = logging.getLogger(__name__)

RESOLUTION_DEMO_NOTE = "Demo site: no money moves and no refund is made."


def render_cancellation_emails(
    facts: BookingFacts,
    *,
    reason: str,
    requested_at: dt.datetime,
    today: dt.date,
    settings: Settings,
) -> list[tuple[str, EmailMessage]]:
    days_out = max((facts.departs - today).days, 0)
    site = settings.site_url.rstrip("/")
    vars = {
        **_vars(facts, settings),
        "reason": reason,
        "days_out": days_out,
        "tier": refund_tier(days_out),
        "requested_at": _ist(requested_at),
        "policy_url": f"{site}/cancellation-policy",
        "trip_url": f"{site}/account/bookings/{facts.ref}",
    }
    out = [
        (
            "customer",
            _message(
                facts.lead_email,
                f"We have your cancellation request — {facts.ref}, {facts.package_name}",
                "cancellation_customer",
                vars,
            ),
        )
    ]
    if settings.owner_notify_email:
        heading = f"Cancellation requested — {facts.ref} · {facts.lead_name} · {facts.package_name}"
        owner = _message(
            settings.owner_notify_email,
            heading,
            "cancellation_owner",
            {**vars, "heading": heading},
        )
        out.append(("owner", replace(owner, reply_to=facts.lead_email)))
    return out


async def send_cancellation_emails(
    sender: EmailSender,
    settings: Settings,
    facts: BookingFacts,
    *,
    reason: str,
    requested_at: dt.datetime,
    today: dt.date,
) -> None:
    try:
        labelled = render_cancellation_emails(
            facts, reason=reason, requested_at=requested_at, today=today, settings=settings
        )
    except Exception as exc:
        log.exception("Could not render cancellation emails for %s", facts.ref)
        sentry_sdk.capture_exception(exc)
        return
    await deliver(sender, settings, labelled, ref=facts.ref, what="cancellation")


def render_resolution_email(
    facts: BookingFacts,
    *,
    approved: bool,
    note: str,
    refund_paise: int | None,
    settings: Settings,
) -> list[tuple[str, EmailMessage]]:
    site = settings.site_url.rstrip("/")
    vars = {
        **_vars(facts, settings),
        "approved": approved,
        "note": note,
        "refund": inr(refund_paise // 100) if refund_paise else None,
        "demo_note": RESOLUTION_DEMO_NOTE,
        "policy_url": f"{site}/cancellation-policy",
        "trip_url": f"{site}/account/bookings/{facts.ref}",
    }
    subject = (
        f"Booking {facts.ref} cancelled — {facts.package_name}"
        if approved
        else f"About your cancellation request — {facts.ref}, {facts.package_name}"
    )
    return [("customer", _message(facts.lead_email, subject, "cancellation_resolved", vars))]


async def send_resolution_email(
    sender: EmailSender,
    settings: Settings,
    facts: BookingFacts,
    *,
    approved: bool,
    note: str,
    refund_paise: int | None,
) -> None:
    try:
        labelled = render_resolution_email(
            facts, approved=approved, note=note, refund_paise=refund_paise, settings=settings
        )
    except Exception as exc:
        log.exception("Could not render the resolution email for %s", facts.ref)
        sentry_sdk.capture_exception(exc)
        return
    await deliver(sender, settings, labelled, ref=facts.ref, what="cancellation resolution")
