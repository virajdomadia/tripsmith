"""The balance emails (R43, P5): the reminders (7 and 3 days before the due day, and on it — sent
by `/cron/emails` since P15, services/email/automatic.py) and the cancellation for an unpaid
balance the daily tidy sends (the customer, and the owner).

Same rules as the booking emails: demo mode redirects the customer's copy to the owner's inbox,
every send lands in the booking's history, and nothing here raises.
"""

import datetime as dt
import logging
from dataclasses import replace

import sentry_sdk
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.infra.email import EmailMessage, EmailSender
from app.services.booking.deposit import overdue_after
from app.services.booking.voucher import BookingFacts
from app.services.email.bookings import _message, _vars, deliver
from app.services.format import inr, long_date

log = logging.getLogger(__name__)


def render_balance_reminder(
    facts: BookingFacts, settings: Settings, *, today: dt.date
) -> list[tuple[str, EmailMessage]]:
    due = facts.balance_due_on
    if due is None or not facts.balance_paise:
        return []
    days_left = (due - today).days
    vars = {
        **_vars(facts, settings),
        "days_left": max(days_left, 0),
        "overdue": days_left < 0,
        "last_day": long_date(overdue_after(due)),
    }
    balance = vars["balance"]
    if days_left < 0:
        subject = f"Your balance for {facts.ref} is overdue — {balance} by {vars['last_day']}"
    elif days_left == 0:
        subject = f"Your balance for {facts.ref} is due today — {balance}"
    else:
        subject = f"{balance} due in {days_left} days for {facts.ref} — {facts.package_name}"
    return [("customer", _message(facts.lead_email, subject, "balance_reminder", vars))]


def render_balance_cancelled(
    facts: BookingFacts,
    settings: Settings,
    *,
    paid_before_paise: int,
    refund_paise: int,
    days_out: int,
    tier: str,
) -> list[tuple[str, EmailMessage]]:
    refund = inr(refund_paise // 100) if refund_paise else None
    vars = {
        **_vars(facts, settings),
        "paid_before": inr(paid_before_paise // 100),
        "refund": refund,
        "days_out": days_out,
        "tier": tier,
    }
    out = [
        (
            "customer",
            _message(
                facts.lead_email,
                f"Booking {facts.ref} cancelled — the balance wasn't paid",
                "balance_cancelled",
                vars,
            ),
        )
    ]
    if settings.owner_notify_email:
        heading = (
            f"Cancelled for an unpaid balance: {facts.ref} — {facts.lead_name} · "
            f"{facts.package_name}"
        )
        owner = _message(
            settings.owner_notify_email,
            heading,
            "booking_owner",
            {
                **vars,
                "heading": heading,
                "refund_why": f"The balance was due {vars['due']}; {days_out} days before "
                f"departure the policy gives {tier}.",
                "payment_id": ", ".join(facts.payment_ids) or "—",
            },
        )
        out.append(("owner", replace(owner, reply_to=facts.lead_email)))
    return out


async def send_balance_cancelled(
    sender: EmailSender,
    settings: Settings,
    facts: BookingFacts,
    *,
    paid_before_paise: int,
    refund_paise: int,
    days_out: int,
    tier: str,
    db: AsyncSession | None = None,
) -> None:
    try:
        labelled = render_balance_cancelled(
            facts,
            settings,
            paid_before_paise=paid_before_paise,
            refund_paise=refund_paise,
            days_out=days_out,
            tier=tier,
        )
    except Exception as exc:
        log.exception("Could not render the balance cancellation for %s", facts.ref)
        sentry_sdk.capture_exception(exc)
        return
    await deliver(sender, settings, labelled, ref=facts.ref, what="balance cancellation", db=db)
