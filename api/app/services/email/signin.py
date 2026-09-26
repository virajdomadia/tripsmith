"""The sign-in code email (B8, R18). Sent only outside demo mode: while EMAIL_FROM is on
Resend's test domain the code is shown on screen instead (`OtpSent.demoCode`), since the
customer's inbox is unreachable and every visitor's code landing in the owner's is noise."""

from app.business import BUSINESS
from app.config import Settings
from app.infra.email import EmailMessage
from app.services.email.render import _render


def render_signin_code(to: str, code: str, *, settings: Settings) -> EmailMessage:
    vars: dict[str, object] = {
        "code": code,
        "business": BUSINESS,
        "site_url": settings.site_url.rstrip("/"),
    }
    return EmailMessage(
        to=to,
        subject=f"{code} is your Tripsmith sign-in code",
        html=_render("signin_code.html", **vars),
        text=_render("signin_code.txt", **vars),
    )
