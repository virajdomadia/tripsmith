"""Jinja2 email rendering (04 §6): both messages carry the ref, the facts, and escape input."""

import datetime as dt

from app.models import Enquiry
from app.models.enums import EmailStatus, EnquiryStatus, EnquiryType
from app.services.email.render import (
    EnquiryEmailContext,
    PackageFacts,
    context_from,
    inr,
    render_owner,
    render_visitor,
)
from tests.settings import make_settings

SETTINGS = make_settings(
    owner_notify_email="owner@example.com",
    site_url="https://tripsmith.vercel.app",
    whatsapp_number="919845012345",
)


def ctx(**over: object) -> EnquiryEmailContext:
    base = EnquiryEmailContext(
        id="ck1",
        ref="TS-ABC234",
        type="custom",
        name="Priya Sharma",
        first_name="Priya",
        phone="9845022110",
        email="priya@example.com",
        travel_month="November 2026",
        adults=2,
        children=1,
        message="Early check-in <b>please</b>",
        preferred_dates="12–16 Nov",
        budget="₹25,000",
        changes="Add a day in Palolem",
        package_slug="north-goa-beaches",
        package_name="North Goa Beaches",
        package_nights=3,
        package_days=4,
        created_at="18 Sep 2026, 3:42 pm IST",
    )
    return EnquiryEmailContext(**{**base.__dict__, **over})


def test_inr_uses_indian_grouping() -> None:
    assert inr(500) == "₹500"
    assert inr(25_000) == "₹25,000"
    assert inr(1_25_000) == "₹1,25,000"
    assert inr(12_34_567) == "₹12,34,567"


def test_owner_message_has_every_field_and_replies_to_the_visitor() -> None:
    msg = render_owner(ctx(), settings=SETTINGS)
    assert msg.to == "owner@example.com" and msg.reply_to == "priya@example.com"
    assert msg.subject == "New enquiry TS-ABC234 — Priya Sharma · North Goa Beaches"
    for needle in (
        "TS-ABC234",
        "Priya Sharma",
        "9845022110",
        "priya@example.com",
        "November 2026",
        "2 adults, 1 child",
        "12–16 Nov",
        "₹25,000",
        "Add a day in Palolem",
        "Customise this trip",
        "3 nights / 4 days",
        "https://tripsmith.vercel.app/admin/enquiries/ck1",
        "https://tripsmith.vercel.app/packages/north-goa-beaches",
        "Tripsmith Holidays",
        "+91 98450 12345",
    ):
        assert needle in msg.html, needle
        assert needle in msg.text, needle
    assert "Early check-in &lt;b&gt;please&lt;/b&gt;" in msg.html  # autoescaped
    assert "Early check-in <b>please</b>" in msg.text  # plain text is verbatim


def test_owner_subject_for_a_general_enquiry() -> None:
    msg = render_owner(
        ctx(
            type="contact",
            package_slug=None,
            package_name=None,
            package_nights=None,
            package_days=None,
            preferred_dates=None,
            budget=None,
            changes=None,
        ),
        settings=SETTINGS,
    )
    assert msg.subject == "New enquiry TS-ABC234 — Priya Sharma · General enquiry"
    assert "/packages/" not in msg.html


def test_visitor_message_promises_the_call_and_links_whatsapp() -> None:
    msg = render_visitor(ctx(), settings=SETTINGS)
    assert msg.to == "priya@example.com" and msg.reply_to is None
    assert msg.subject == "Your Tripsmith enquiry TS-ABC234 — we'll call you within 2 hours"
    for needle in (
        "Thanks, Priya",
        "TS-ABC234",
        "within 2 hours",
        "10 am – 8 pm",
        "+91 98450 12345",
        "North Goa Beaches",
        "https://tripsmith.vercel.app/packages/north-goa-beaches",
        "https://wa.me/919845012345?text=Hi%20Tripsmith%2C%20this%20is%20Priya%20about%20"
        "North%20Goa%20Beaches%20%28enquiry%20TS-ABC234%29.",
    ):
        assert needle in msg.html, needle
        assert needle in msg.text, needle
    assert "9845022110" not in msg.html  # the visitor's own phone is not echoed back


def test_visitor_message_without_a_package() -> None:
    msg = render_visitor(
        ctx(type="contact", package_slug=None, package_name=None), settings=SETTINGS
    )
    assert "Thanks, Priya" in msg.html
    assert "/packages/" not in msg.html
    assert "this%20is%20Priya%20%28enquiry%20TS-ABC234%29." in msg.html


def test_context_from_the_row() -> None:
    pkg = PackageFacts(slug="north-goa-beaches", name="North Goa Beaches", nights=3, days=4)
    row = Enquiry(
        id="ck1",
        ref="TS-ABC234",
        type=EnquiryType.STANDARD,
        name="Priya Sharma",
        phone="9845022110",
        email="priya@example.com",
        travel_month=dt.date(2026, 11, 1),
        adults=2,
        children=0,
        message=None,
        budget_paise=2_500_000,
        status=EnquiryStatus.NEW,
        email_status=EmailStatus.SKIPPED,
        created_at=dt.datetime(2026, 9, 18, 10, 12, tzinfo=dt.UTC),
    )
    c = context_from(row, pkg)
    assert c.first_name == "Priya" and c.travel_month == "November 2026"
    assert c.budget == "₹25,000" and c.package_days == 4
    assert c.created_at == "18 Sep 2026, 3:42 pm IST"
    assert context_from(row, None).package_name is None
