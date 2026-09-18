"""The business's contact facts as the emails print them (mirror of web/src/lib/business.ts —
change both). The WhatsApp number comes from settings so preview/prod can differ."""

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
