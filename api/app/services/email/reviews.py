"""The new-review email (B13): the owner hears of each review as it arrives, with a link to the
moderation queue. The customer gets no email — their booking page says it is waiting.

Same never-raise contract as the other booking emails (`deliver`); no owner address, no email.
"""

import logging
from dataclasses import replace

import sentry_sdk

from app.config import Settings
from app.infra.email import EmailMessage, EmailSender
from app.services.booking.voucher import BookingFacts
from app.services.email.bookings import _message, _vars, deliver

log = logging.getLogger(__name__)


def stars_text(rating: int) -> str:
    return "★" * rating + "☆" * (5 - rating)


def render_review_email(
    facts: BookingFacts, *, rating: int, text: str, settings: Settings
) -> list[tuple[str, EmailMessage]]:
    if not settings.owner_notify_email:
        return []
    site = settings.site_url.rstrip("/")
    heading = f"New review · ★ {rating} · {facts.package_name}"
    vars = {
        **_vars(facts, settings),
        "heading": heading,
        "rating": rating,
        "stars": stars_text(rating),
        "text": text,
        "moderate_url": f"{site}/admin/reviews",
    }
    owner = _message(settings.owner_notify_email, heading, "review_owner", vars)
    return [("owner", replace(owner, reply_to=facts.lead_email))]


async def send_review_email(
    sender: EmailSender, settings: Settings, facts: BookingFacts, *, rating: int, text: str
) -> None:
    try:
        labelled = render_review_email(facts, rating=rating, text=text, settings=settings)
    except Exception as exc:
        log.exception("Could not render the review email for %s", facts.ref)
        sentry_sdk.capture_exception(exc)
        return
    await deliver(sender, settings, labelled, ref=facts.ref, what="review")
