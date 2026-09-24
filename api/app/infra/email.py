"""Transactional email over Resend's REST API (04 §6).

The official `resend` SDK is synchronous (requests); the API is one POST, so it is called with
the httpx client the rest of infra/ already uses. When `RESEND_API_KEY` is unset (dev, CI)
`NullSender` sends nothing and says so once. Sending never swallows: callers decide what a
failure means (services/email/send.py maps it to `email_status`).
"""

import base64
import logging
import os
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.config import Settings

log = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"


@dataclass(frozen=True)
class EmailAttachment:
    filename: str
    content: bytes


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    html: str
    text: str
    reply_to: str | None = None
    attachments: tuple[EmailAttachment, ...] = ()


class EmailSendError(Exception):
    """A send that did not happen — HTTP error, transport error, or a rejected payload."""


class EmailSender(Protocol):
    async def send(self, message: EmailMessage) -> str | None:
        """Returns the provider's message id, or None when sending is switched off."""
        ...


class NullSender:
    _warned = False

    async def send(self, message: EmailMessage) -> str | None:
        if not NullSender._warned:
            NullSender._warned = True
            log.warning("RESEND_API_KEY unset — emails are not sent")
        return None


class ResendSender:
    def __init__(
        self, api_key: str, sender: str, *, client: httpx.AsyncClient | None = None
    ) -> None:
        self._from = sender
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._client = client or httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=3.0))

    async def send(self, message: EmailMessage) -> str | None:
        payload: dict[str, Any] = {
            "from": self._from,
            "to": [message.to],
            "subject": message.subject,
            "html": message.html,
            "text": message.text,
        }
        if message.reply_to:
            payload["reply_to"] = message.reply_to
        if message.attachments:
            payload["attachments"] = [
                {"filename": a.filename, "content": base64.b64encode(a.content).decode()}
                for a in message.attachments
            ]
        try:
            res = await self._client.post(RESEND_URL, json=payload, headers=self._headers)
        except httpx.HTTPError as exc:
            raise EmailSendError(f"Resend unreachable: {exc}") from exc
        if res.status_code // 100 != 2:
            raise EmailSendError(f"Resend {res.status_code}: {res.text[:300]}")
        return str(res.json().get("id", ""))


def build_email_sender(settings: Settings) -> EmailSender:
    if settings.resend_api_key:
        return ResendSender(settings.resend_api_key.get_secret_value(), settings.email_from)
    if os.environ.get("VERCEL"):
        # Enquiries still save, but nobody hears about them. ERROR so Sentry carries it.
        log.error(
            "RESEND_API_KEY is unset on a deployment: enquiry emails (owner alert and visitor "
            "confirmation) are not being sent. Set it on this project."
        )
    return NullSender()
