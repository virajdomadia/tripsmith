"""Unsubscribe (R53, P15): only the review request and the still-thinking email carry it, per
address and per type. The link is signed — `<email, base64url>.<type>.<sig>` under
SESSION_SECRET — so nobody can unsubscribe someone else by guessing; the page asks for one click
(a POST), and the emails also carry `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058), so
Gmail's own button unsubscribes straight away.
"""

import base64
import binascii
import hashlib
import hmac

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EmailSuppression
from app.models.enums import EmailType

UNSUBSCRIBABLE = (EmailType.REVIEW_REQUEST, EmailType.STILL_THINKING)


def _b64(email: str) -> str:
    return base64.urlsafe_b64encode(email.encode()).decode().rstrip("=")


def _signature(email: str, kind: EmailType, secret: str) -> str:
    msg = f"unsub:{email}:{kind.value}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()[:32]


def token_for(email: str, kind: EmailType, secret: str | None) -> str | None:
    """None without a SESSION_SECRET (local dev) — the email then carries no unsubscribe link."""
    if not secret or kind not in UNSUBSCRIBABLE:
        return None
    email = email.strip().lower()
    return f"{_b64(email)}.{kind.value}.{_signature(email, kind, secret)}"


def read_token(token: str, secret: str | None) -> tuple[str, EmailType] | None:
    """(email, type) when the signature holds, else None."""
    parts = token.split(".")
    if not secret or len(parts) != 3:
        return None
    raw, kind_value, sig = parts
    try:
        kind = EmailType(kind_value)
        email = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)).decode()
    except (ValueError, binascii.Error, UnicodeDecodeError):
        return None
    if kind not in UNSUBSCRIBABLE:
        return None
    if not hmac.compare_digest(sig.encode(), _signature(email, kind, secret).encode()):
        return None
    return email, kind


def page_url(site_url: str, token: str) -> str:
    return f"{site_url.rstrip('/')}/unsubscribe?t={token}"


def headers(site_url: str, token: str | None) -> tuple[tuple[str, str], ...]:
    """The one-click pair: a POST to the api (through the site's /api rewrite) unsubscribes."""
    if token is None:
        return ()
    return (
        ("List-Unsubscribe", f"<{site_url.rstrip('/')}/api/unsubscribe/{token}>"),
        ("List-Unsubscribe-Post", "List-Unsubscribe=One-Click"),
    )


def mask(email: str) -> str:
    """The address as a***@gmail.com: the page confirms whose it is without printing it whole."""
    name, _, domain = email.partition("@")
    return f"{name[:1]}***@{domain}" if domain else "***"


async def suppress(db: AsyncSession, email: str, kind: EmailType) -> None:
    await db.execute(
        insert(EmailSuppression)
        .values(email=email.strip().lower(), type=kind)
        .on_conflict_do_nothing()
    )
    await db.commit()


async def is_suppressed(db: AsyncSession, email: str, kind: EmailType) -> bool:
    found = await db.execute(
        select(EmailSuppression.email).where(
            EmailSuppression.email == email.strip().lower(), EmailSuppression.type == kind
        )
    )
    return found.first() is not None
