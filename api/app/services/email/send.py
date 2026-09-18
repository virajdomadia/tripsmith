"""Send the owner notification and the visitor confirmation; map what happened to
`email_status` (06 A4). Never raises — a lost email must not cost a saved lead.

Resend test mode (no verified domain; EMAIL_FROM at @resend.dev) can only deliver to the
account's own inbox, so the visitor's copy is redirected to OWNER_NOTIFY_EMAIL with a
`[Test → visitor]` subject — the owner sees both emails; `visitor_emailed` stays false so the
thanks page does not claim otherwise. A verified EMAIL_FROM switches this off by itself.
"""

import asyncio
import logging
from dataclasses import dataclass, replace

import sentry_sdk

from app.config import Settings
from app.infra.email import EmailMessage, EmailSender
from app.models.enums import EmailStatus
from app.services.email.render import EnquiryEmailContext, render_owner, render_visitor

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmailOutcome:
    status: EmailStatus
    visitor_emailed: bool  # a real send to the visitor's own address succeeded


def is_test_mode(email_from: str) -> bool:
    address = email_from.rsplit("<", 1)[-1].rstrip("> ").strip().lower()
    return address.endswith("@resend.dev")


async def send_enquiry_emails(
    sender: EmailSender, settings: Settings, ctx: EnquiryEmailContext
) -> EmailOutcome:
    owner = render_owner(ctx, settings=settings) if settings.owner_notify_email else None
    visitor: EmailMessage | None = render_visitor(ctx, settings=settings)
    visitor_is_real = True
    if is_test_mode(settings.email_from) and visitor is not None:
        visitor_is_real = False
        if settings.owner_notify_email:
            visitor = replace(
                visitor,
                to=settings.owner_notify_email,
                subject=f"[Test → {ctx.email}] {visitor.subject}",
            )
        else:
            visitor = None

    messages = [m for m in (owner, visitor) if m is not None]
    if not messages:
        return EmailOutcome(EmailStatus.SKIPPED, False)

    results = await asyncio.gather(*(sender.send(m) for m in messages), return_exceptions=True)
    outcome = dict(zip(messages, results, strict=True))

    failures = [(m, r) for m, r in outcome.items() if isinstance(r, BaseException)]
    for m, exc in failures:
        log.error("Email to %s failed for enquiry %s: %s", m.to, ctx.ref, exc)
        sentry_sdk.capture_exception(exc)

    visitor_emailed = (
        visitor_is_real and visitor is not None and isinstance(outcome.get(visitor), str)
    )
    if failures:
        return EmailOutcome(EmailStatus.FAILED, visitor_emailed)
    if any(r is None for r in results):
        return EmailOutcome(EmailStatus.SKIPPED, False)
    return EmailOutcome(EmailStatus.SENT, visitor_emailed)
