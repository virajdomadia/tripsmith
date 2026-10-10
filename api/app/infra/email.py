"""Transactional email (04 §6): SMTP when `SMTP_HOST`, `SMTP_USER` and `SMTP_PASSWORD` are set
(v2.5 P0: Gmail), else Resend's REST API, else nothing.

Gmail is sent with the stdlib `smtplib` in a worker thread (STARTTLS on 587, a Google app
password) — no new dependency for one blocking call. Resend's official SDK is synchronous
(requests); its API is one POST, so it is called with the httpx client the rest of infra/
already uses. With neither configured (dev, CI) `NullSender` sends nothing and says so once.
Sending never swallows: callers decide what a failure means (services/email/send.py maps it to
`email_status`).
"""

import asyncio
import base64
import logging
import os
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage
from email.utils import formatdate, make_msgid
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
    # P15: extra headers, e.g. List-Unsubscribe + List-Unsubscribe-Post on the promotional two
    headers: tuple[tuple[str, str], ...] = ()


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
            log.warning("No SMTP_USER/SMTP_PASSWORD or RESEND_API_KEY — emails are not sent")
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
        if message.headers:
            payload["headers"] = dict(message.headers)
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


SMTP_TIMEOUT_SECONDS = 15.0


class SmtpSender:
    """Gmail (or any STARTTLS server). The message id is the one we mint, so a failed send
    still has nothing to store and a sent one always has an id (enquiry_reply relies on it)."""

    def __init__(self, host: str, port: int, user: str, password: str, sender: str) -> None:
        self._host, self._port = host, port
        self._user, self._password = user, password
        self._from = sender

    def _mime(self, message: EmailMessage) -> tuple[MimeMessage, str]:
        mime = MimeMessage()
        msg_id = make_msgid(domain=self._user.rsplit("@", 1)[-1])
        mime["From"] = self._from
        mime["To"] = message.to
        mime["Subject"] = message.subject
        mime["Date"] = formatdate(localtime=False)
        mime["Message-ID"] = msg_id
        if message.reply_to:
            mime["Reply-To"] = message.reply_to
        for name, value in message.headers:
            mime[name] = value
        mime.set_content(message.text)
        mime.add_alternative(message.html, subtype="html")
        for a in message.attachments:
            maintype, subtype = (
                ("application", "pdf")
                if a.filename.lower().endswith(".pdf")
                else ("application", "octet-stream")
            )
            mime.add_attachment(a.content, maintype=maintype, subtype=subtype, filename=a.filename)
        return mime, msg_id.strip("<>")

    def _send_blocking(self, mime: MimeMessage) -> None:
        with smtplib.SMTP(self._host, self._port, timeout=SMTP_TIMEOUT_SECONDS) as smtp:
            smtp.starttls()
            smtp.login(self._user, self._password)
            smtp.send_message(mime)

    async def send(self, message: EmailMessage) -> str | None:
        mime, msg_id = self._mime(message)
        try:
            await asyncio.to_thread(self._send_blocking, mime)
        except smtplib.SMTPException as exc:
            # Refused: bad login, rejected recipient, over Gmail's daily cap. Never the address.
            raise EmailSendError(f"SMTP refused: {type(exc).__name__}") from exc
        except OSError as exc:  # DNS, connect, timeout
            raise EmailSendError(f"SMTP unreachable: {type(exc).__name__}") from exc
        return msg_id


def build_email_sender(settings: Settings) -> EmailSender:
    if settings.smtp_host and settings.smtp_user and settings.smtp_password:
        return SmtpSender(
            settings.smtp_host,
            settings.smtp_port,
            settings.smtp_user,
            settings.smtp_password.get_secret_value(),
            settings.email_from,
        )
    if settings.resend_api_key:
        return ResendSender(settings.resend_api_key.get_secret_value(), settings.email_from)
    if os.environ.get("VERCEL"):
        # Enquiries still save, but nobody hears about them. ERROR so Sentry carries it.
        log.error(
            "No SMTP_USER/SMTP_PASSWORD or RESEND_API_KEY on a deployment: no email is being "
            "sent (enquiries, bookings, sign-in codes). Set them on this project."
        )
    return NullSender()
