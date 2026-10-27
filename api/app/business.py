"""The business's contact facts as the emails print them (mirror of web/src/lib/business.ts —
change both). The WhatsApp number comes from settings so preview/prod can differ."""

from typing import NamedTuple
from urllib.parse import quote

BUSINESS = {
    "name": "Tripsmith",
    "legal_name": "Tripsmith Holidays",
    "address": "14 Church Street, 2nd floor",
    "city": "Bengaluru 560001",
    "phone_display": "+91 98450 12345",
    "phone_e164": "+919845012345",
    "email": "hello@tripsmith.in",
    "hours": "10 am – 8 pm, every day",
    "after_hours": "After hours, WhatsApp us — we reply first thing next morning.",
    "callback_promise": "A person calls you back within two hours",
}


def whatsapp_href(number: str, text: str | None = None) -> str:
    """`https://wa.me/<number>[?text=…]` — same encoding as the web's `whatsappHref`."""
    base = f"https://wa.me/{number}"
    return f"{base}?text={quote(text, safe='')}" if text else base


class CancellationTier(NamedTuple):
    """One row of the cancellation schedule: from `from_days` before departure, the policy keeps
    `kept_percent` of the package price and says `refund` (served by `GET /meta`, Q-5)."""

    from_days: int
    kept_percent: int
    refund: str


# Newest-first by `from_days`, ending at 0; the web builds its schedule from /meta, never a copy.
CANCELLATION_TIERS: tuple[CancellationTier, ...] = (
    CancellationTier(
        30, 0, "full refund, minus any non-refundable flight or train tickets we bought for you"
    ),
    CancellationTier(15, 50, "50% of the package price is retained"),
    CancellationTier(0, 100, "no refund"),
)


def _tier(days_out: int) -> CancellationTier:
    return next(t for t in CANCELLATION_TIERS if max(days_out, 0) >= t.from_days)


def refund_tier(days_out: int) -> str:
    """What the policy refunds for a cancellation asked `days_out` days before departure."""
    return _tier(days_out).refund


def suggested_refund_paise(days_out: int, *, paid_paise: int, total_paise: int) -> int:
    """The tier applied to the money actually paid (B11) — only a starting point for the owner:
    the top tier can still keep non-refundable tickets, which the site knows nothing about.
    A tier that keeps everything refunds nothing, even of a surplus (that has its own refund)."""
    kept = _tier(days_out).kept_percent
    if kept >= 100:
        return 0
    return max(paid_paise - total_paise * kept // 100, 0)
