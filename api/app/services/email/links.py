"""The counter's payment link by email (R56, P18b): the link, what it holds and until when.

Same rules as the booking emails: demo mode redirects the customer's copy to the owner's inbox,
the send lands in the booking's history, and nothing here raises.
"""

import datetime as dt
import logging

import sentry_sdk
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.infra.email import EmailMessage, EmailSender
from app.services.booking.voucher import BookingFacts
from app.services.email.bookings import _message, _vars, deliver
from app.services.email.render import IST
from app.services.format import inr, long_date

log = logging.getLogger(__name__)


def ist_moment(at: dt.datetime) -> str:
    """When a link's hold ends, as "14:12 IST, Thu 1 Oct"."""
    local = at.astimezone(IST)
    return f"{local:%H:%M} IST, {long_date(local.date())}"


def render_payment_link(
    facts: BookingFacts, settings: Settings, *, url: str, amount_paise: int, expires: dt.datetime
) -> list[tuple[str, EmailMessage]]:
    on_deposit = amount_paise < facts.total_paise
    vars = {
        **_vars(facts, settings),
        "url": url,
        "amount": inr(amount_paise // 100),
        "on_deposit": on_deposit,
        "balance": inr((facts.total_paise - amount_paise) // 100),
        "due": long_date(facts.balance_due_on) if facts.balance_due_on else None,
        "expires": ist_moment(expires),
    }
    subject = f"Your payment link for {facts.ref} — {vars['amount']} · {facts.package_name}"
    return [("customer", _message(facts.lead_email, subject, "payment_link", vars))]


async def send_payment_link(
    sender: EmailSender,
    settings: Settings,
    facts: BookingFacts,
    *,
    url: str,
    amount_paise: int,
    expires: dt.datetime,
    db: AsyncSession | None = None,
) -> None:
    try:
        labelled = render_payment_link(
            facts, settings, url=url, amount_paise=amount_paise, expires=expires
        )
    except Exception as exc:
        log.exception("Could not render the payment link email for %s", facts.ref)
        sentry_sdk.capture_exception(exc)
        return
    await deliver(sender, settings, labelled, ref=facts.ref, what="payment link", db=db)
