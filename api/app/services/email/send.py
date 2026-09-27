"""Send the owner notification and the visitor confirmation; map what happened to
`email_status` (06 A4). Never raises — a lost email must not cost a saved lead.

Demo mode holds a customer's copy back and redirects it to OWNER_NOTIFY_EMAIL with a
`[Test → visitor]` subject — the owner sees both emails; `visitor_emailed` stays false so the
thanks page does not claim otherwise. It applies (`held_back`) in two cases:

- site-wide while EMAIL_FROM is Resend's test sender (@resend.dev), which can deliver only to
  the account's own inbox — a real sender (Gmail SMTP since v2.5 P0) switches this off by itself;
- always for the reserved demo domains (example.com/.org/.net, RFC 2606): the seeded demo
  traveller and made-up addresses never produce a real send, and their sign-in code shows on
  screen.
"""

import asyncio
import logging
from dataclasses import dataclass, replace

import sentry_sdk

from app.config import Settings
from app.infra.email import EmailAttachment, EmailMessage, EmailSender
from app.models.enums import EmailStatus
from app.services.email.render import EnquiryEmailContext, render_owner, render_visitor

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmailOutcome:
    status: EmailStatus
    visitor_emailed: bool  # a real send to the visitor's own address succeeded


DEMO_DOMAINS = frozenset({"example.com", "example.org", "example.net"})


def _address(value: str) -> str:
    return value.rsplit("<", 1)[-1].rstrip("> ").strip().lower()


def is_test_mode(email_from: str) -> bool:
    return _address(email_from).endswith("@resend.dev")


def is_demo_address(email: str) -> bool:
    return _address(email).rsplit("@", 1)[-1] in DEMO_DOMAINS


def held_back(settings: Settings, to: str) -> bool:
    """True when a customer email to `to` must not be really sent (see the module docstring)."""
    return is_test_mode(settings.email_from) or is_demo_address(to)


async def send_enquiry_emails(
    sender: EmailSender,
    settings: Settings,
    ctx: EnquiryEmailContext,
    *,
    attachment: EmailAttachment | None = None,
) -> EmailOutcome:
    try:
        owner = render_owner(ctx, settings=settings) if settings.owner_notify_email else None
        visitor: EmailMessage | None = render_visitor(
            ctx, settings=settings, attached=attachment is not None
        )
        if attachment is not None and visitor is not None:
            visitor = replace(visitor, attachments=(attachment,))  # the owner gets a link instead
        visitor_is_real = True
        if visitor is not None and held_back(settings, visitor.to):
            visitor_is_real = False
            if settings.owner_notify_email:
                visitor = replace(
                    visitor,
                    to=settings.owner_notify_email,
                    subject=f"[Test → {ctx.email}] {visitor.subject}",
                )
            else:
                visitor = None
    except Exception as exc:
        log.exception("Could not render enquiry emails for %s", ctx.ref)
        sentry_sdk.capture_exception(exc)
        return EmailOutcome(EmailStatus.FAILED, False)

    # (role, message) pairs — never log the recipient address, only the role (`owner`/`visitor`).
    labelled = [(role, m) for role, m in (("owner", owner), ("visitor", visitor)) if m is not None]
    if not labelled:
        return EmailOutcome(EmailStatus.SKIPPED, False)

    results = await asyncio.gather(*(sender.send(m) for _, m in labelled), return_exceptions=True)

    visitor_result: str | None = None
    failures: list[tuple[str, BaseException]] = []
    for (role, _), result in zip(labelled, results, strict=True):
        if isinstance(result, BaseException):
            failures.append((role, result))
        elif role == "visitor":
            visitor_result = result

    for role, exc in failures:
        log.error("%s email failed for enquiry %s: %s", role, ctx.ref, exc)
        sentry_sdk.capture_exception(exc)

    visitor_emailed = visitor_is_real and isinstance(visitor_result, str)
    if failures:
        return EmailOutcome(EmailStatus.FAILED, visitor_emailed)
    if any(r is None for r in results):
        return EmailOutcome(EmailStatus.SKIPPED, False)
    return EmailOutcome(EmailStatus.SENT, visitor_emailed)
