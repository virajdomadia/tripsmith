"""`on_new_capture`: what happens once a payment has been applied for the first time.

Checkout's callback (`confirm_payment`), the sync on close (`sync_payment`) and the webhook all
reach it the same way — after their transaction has committed, and only when
`capture_razorpay_payment` returned a `Capture` (never on a replay). That is what makes R16's
"5 replays → 1 payment, 1 email" hold: the emails live here and nowhere else.

1. Freshness: recompute the package's "from ₹" and revalidate its pages (B3).
2. Emails (B7): the booking's facts are read in a short transaction and ended before the voucher
   render and the sends, so no pooled connection waits on Resend.

Never raises: the money is already recorded.
"""

import asyncio
import contextlib
import logging
from dataclasses import dataclass

import sentry_sdk
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.infra.email import EmailAttachment, EmailSender
from app.services.booking.freshness import refresh_quietly
from app.services.booking.settled import Capture, Settled
from app.services.booking.voucher import BookingFacts, load_booking_facts
from app.services.email.bookings import send_booking_emails
from app.services.pdf.voucher import render_voucher, voucher_filename

VOUCHER_TIMEOUT = 5.0  # R17 asks < 3 s; a render is ~0.2 s, so this only catches a stuck thread

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Notify:
    """What the emails need from the app; the routers build it from `app.state`."""

    sender: EmailSender
    settings: Settings


async def voucher_attachment(facts: BookingFacts, settings: Settings) -> EmailAttachment | None:
    """The voucher PDF for the confirmation email, or None (logged) — never raises."""
    try:
        pdf = await asyncio.wait_for(
            asyncio.to_thread(
                render_voucher,
                facts,
                site_url=settings.site_url,
                whatsapp_number=settings.whatsapp_number,
            ),
            timeout=VOUCHER_TIMEOUT,
        )
    except Exception as exc:
        log.exception("Voucher for %s could not be rendered; emailing without it", facts.ref)
        sentry_sdk.capture_exception(exc)
        return None
    return EmailAttachment(filename=voucher_filename(facts.ref), content=pdf)


async def on_new_capture(
    db: AsyncSession,
    ref: str,
    capture: Capture,
    *,
    package_id: str,
    after: str,
    notify: Notify | None,
) -> None:
    await refresh_quietly(db, {package_id}, after=after)
    if notify is None or capture.settled == Settled.PART_PAID:
        return
    try:
        facts = await load_booking_facts(db, ref)
    except Exception as exc:
        log.exception("Could not load booking %s for its emails", ref)
        sentry_sdk.capture_exception(exc)
        return
    finally:
        with contextlib.suppress(Exception):
            await db.rollback()  # read-only; the connection goes back before the sends
    if facts is None:
        return
    voucher = None
    if capture.settled == Settled.CONFIRMED:
        voucher = await voucher_attachment(facts, notify.settings)
    await send_booking_emails(notify.sender, notify.settings, facts, capture, voucher=voucher)
