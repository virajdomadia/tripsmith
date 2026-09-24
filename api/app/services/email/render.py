"""Jinja2 rendering of the two enquiry emails from a plain context — templates never see ORM
rows, so they can be rendered in a unit test and (F11) attached to without a session."""

import datetime as dt
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.business import BUSINESS, whatsapp_href
from app.config import Settings
from app.infra.email import EmailMessage
from app.models import Enquiry, Package
from app.models.enums import EnquiryType
from app.services.format import inr  # re-exported; tests import it from here

IST = dt.timezone(dt.timedelta(hours=5, minutes=30), "IST")
TYPE_LABEL = {
    EnquiryType.STANDARD: "Standard",
    EnquiryType.CUSTOM: "Customise this trip",
    EnquiryType.CONTACT: "General enquiry",
}

# A FileSystemLoader (not PackageLoader) so a missing templates dir cannot fail API boot at
# import time — it only raises TemplateNotFound lazily, at render, which send_enquiry_emails
# already maps to `failed`.
TEMPLATES_DIR = Path(__file__).with_name("templates")
_env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    autoescape=select_autoescape(["html"]),  # .txt templates are verbatim
    trim_blocks=True,
    lstrip_blocks=True,
)


def _ist(when: dt.datetime) -> str:
    """`18 Sep 2026, 3:42 pm IST` — no zero padding on the day or the hour."""
    local = when.astimezone(IST)
    hour = local.hour % 12 or 12
    ampm = "am" if local.hour < 12 else "pm"
    return f"{local.day} {local:%b %Y}, {hour}:{local:%M} {ampm} IST"


class PackageFacts(NamedTuple):
    """What the emails need from a package — plain values, so a session rollback (which expires
    ORM instances) cannot bite when the context is built on the ref-collision retry path."""

    slug: str
    name: str
    nights: int
    days: int

    @classmethod
    def of(cls, package: Package) -> "PackageFacts":
        return cls(package.slug, package.name, package.nights, package.days)


@dataclass(frozen=True)
class EnquiryEmailContext:
    id: str
    ref: str
    type: str  # enum value: standard / custom / contact
    name: str
    first_name: str
    phone: str
    email: str
    travel_month: str | None
    adults: int
    children: int
    message: str | None
    preferred_dates: str | None
    budget: str | None  # already formatted, e.g. ₹25,000
    changes: str | None
    package_slug: str | None
    package_name: str | None
    package_nights: int | None
    package_days: int | None
    created_at: str  # "18 Sep 2026, 3:42 pm IST"

    @property
    def type_label(self) -> str:
        return TYPE_LABEL[EnquiryType(self.type)]

    @property
    def party(self) -> str:
        a = f"{self.adults} adult{'s' if self.adults != 1 else ''}"
        if not self.children:
            return a
        return f"{a}, {self.children} child{'ren' if self.children != 1 else ''}"


def context_from(enquiry: Enquiry, package: PackageFacts | None) -> EnquiryEmailContext:
    created = enquiry.created_at or dt.datetime.now(dt.UTC)
    return EnquiryEmailContext(
        id=enquiry.id,
        ref=enquiry.ref,
        type=EnquiryType(enquiry.type).value,
        name=enquiry.name,
        first_name=enquiry.name.split()[0],
        phone=enquiry.phone,
        email=enquiry.email,
        travel_month=enquiry.travel_month.strftime("%B %Y") if enquiry.travel_month else None,
        adults=enquiry.adults,
        children=enquiry.children or 0,
        message=enquiry.message,
        preferred_dates=enquiry.preferred_dates,
        budget=inr(enquiry.budget_paise // 100) if enquiry.budget_paise else None,
        changes=enquiry.changes,
        package_slug=package.slug if package else None,
        package_name=package.name if package else None,
        package_nights=package.nights if package else None,
        package_days=package.days if package else None,
        created_at=_ist(created),
    )


def _render(name: str, **vars: object) -> str:
    return _env.get_template(name).render(**vars)


def _common(ctx: EnquiryEmailContext, settings: Settings) -> dict[str, object]:
    site = settings.site_url.rstrip("/")
    about = f" about {ctx.package_name}" if ctx.package_name else ""
    return {
        "e": ctx,
        "business": BUSINESS,
        "site_url": site,
        "package_url": f"{site}/packages/{ctx.package_slug}" if ctx.package_slug else None,
        # The web's download handler (web/src/lib/pdf.ts), not the /api rewrite: it forwards the
        # visitor's address, so the api's per-IP ceiling is per visitor.
        "pdf_url": f"{site}/packages/{ctx.package_slug}/itinerary.pdf"
        if ctx.package_slug
        else None,
        "admin_url": f"{site}/admin/enquiries/{ctx.id}",
        "whatsapp_url": whatsapp_href(
            settings.whatsapp_number,
            f"Hi Tripsmith, this is {ctx.first_name}{about} (enquiry {ctx.ref}).",
        ),
    }


def _one_line(subject: str) -> str:
    """Any whitespace run (CR/LF included) → one space. The schema already refuses control
    characters in a name; this keeps a subject a single header line whatever reaches it."""
    return " ".join(subject.split())


def render_owner(ctx: EnquiryEmailContext, *, settings: Settings) -> EmailMessage:
    assert settings.owner_notify_email, "caller checks OWNER_NOTIFY_EMAIL"
    vars = _common(ctx, settings)
    return EmailMessage(
        to=settings.owner_notify_email,
        reply_to=ctx.email,
        subject=_one_line(
            f"New enquiry {ctx.ref} — {ctx.name} · {ctx.package_name or 'General enquiry'}"
        ),
        html=_render("enquiry_owner.html", **vars),
        text=_render("enquiry_owner.txt", **vars),
    )


def render_visitor(
    ctx: EnquiryEmailContext, *, settings: Settings, attached: bool = False
) -> EmailMessage:
    vars = _common(ctx, settings)
    vars["pdf_attached"] = attached
    return EmailMessage(
        to=ctx.email,
        subject=f"Your Tripsmith enquiry {ctx.ref} — we'll call you within 2 hours",
        html=_render("enquiry_visitor.html", **vars),
        text=_render("enquiry_visitor.txt", **vars),
    )
