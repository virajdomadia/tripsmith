"""send_enquiry_emails: both sends, test-mode redirect, and the email_status mapping (04 §6)."""

import logging

import pytest

from app.infra.email import EmailAttachment, EmailMessage, EmailSendError
from app.models.enums import EmailStatus
from app.services.email.send import is_test_mode, send_enquiry_emails
from tests.settings import make_settings
from tests.test_email_render import ctx

LIVE = make_settings(
    email_from="Tripsmith <hello@tripsmith.in>",
    owner_notify_email="owner@example.com",
    site_url="https://tripsmith.vercel.app",
)
TEST_MODE = make_settings(
    email_from="Tripsmith <onboarding@resend.dev>",
    owner_notify_email="owner@example.com",
    site_url="https://tripsmith.vercel.app",
)


class FakeSender:
    def __init__(self, fail_for: frozenset[str] = frozenset(), off: bool = False) -> None:
        self.sent: list[EmailMessage] = []
        self.fail_for, self.off = fail_for, off

    async def send(self, message: EmailMessage) -> str | None:
        if message.to in self.fail_for:
            raise EmailSendError("Resend 500")
        self.sent.append(message)
        return None if self.off else f"em_{len(self.sent)}"


def test_is_test_mode_reads_the_address_part() -> None:
    assert is_test_mode("Tripsmith <onboarding@resend.dev>")
    assert is_test_mode("onboarding@resend.dev")
    assert not is_test_mode("Tripsmith <hello@tripsmith.in>")


async def test_live_sends_both_and_reports_sent() -> None:
    sender = FakeSender()
    out = await send_enquiry_emails(sender, LIVE, ctx())
    assert out.status == EmailStatus.SENT and out.visitor_emailed
    assert sorted(m.to for m in sender.sent) == ["owner@example.com", "priya@example.com"]
    owner = next(m for m in sender.sent if m.to == "owner@example.com")
    assert owner.reply_to == "priya@example.com"


async def test_test_mode_redirects_the_visitor_copy_to_the_owner() -> None:
    sender = FakeSender()
    out = await send_enquiry_emails(sender, TEST_MODE, ctx())
    assert out.status == EmailStatus.SENT and not out.visitor_emailed
    assert [m.to for m in sender.sent] == ["owner@example.com", "owner@example.com"]
    visitor_copy = sender.sent[1]
    assert visitor_copy.subject.startswith("[Test → priya@example.com] Your Tripsmith enquiry")


async def test_test_mode_without_owner_address_sends_nothing() -> None:
    sender = FakeSender()
    settings = make_settings(email_from="T <onboarding@resend.dev>", owner_notify_email=None)
    out = await send_enquiry_emails(sender, settings, ctx())
    assert out.status == EmailStatus.SKIPPED and not out.visitor_emailed
    assert sender.sent == []


async def test_owner_failure_is_failed_but_visitor_still_counts(
    caplog: pytest.LogCaptureFixture,
) -> None:
    sender = FakeSender(fail_for=frozenset({"owner@example.com"}))
    with caplog.at_level(logging.ERROR, logger="app.services.email.send"):
        out = await send_enquiry_emails(sender, LIVE, ctx())
    assert out.status == EmailStatus.FAILED and out.visitor_emailed
    assert any("owner email failed" in r.message for r in caplog.records)
    assert not any("owner@example.com" in r.message for r in caplog.records)


async def test_live_without_owner_address_sends_only_the_visitor() -> None:
    settings = make_settings(
        email_from="Tripsmith <hello@tripsmith.in>",
        owner_notify_email=None,
        site_url="https://tripsmith.vercel.app",
    )
    sender = FakeSender()
    out = await send_enquiry_emails(sender, settings, ctx())
    assert out.status == EmailStatus.SENT and out.visitor_emailed is True
    assert [m.to for m in sender.sent] == ["priya@example.com"]


async def test_visitor_failure_is_failed_and_not_emailed() -> None:
    sender = FakeSender(fail_for=frozenset({"priya@example.com"}))
    out = await send_enquiry_emails(sender, LIVE, ctx())
    assert out.status == EmailStatus.FAILED and not out.visitor_emailed


async def test_null_sender_is_skipped() -> None:
    out = await send_enquiry_emails(FakeSender(off=True), LIVE, ctx())
    assert out.status == EmailStatus.SKIPPED and not out.visitor_emailed


async def test_render_failure_is_failed_and_sends_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def boom(*args: object, **kwargs: object) -> None:
        raise RuntimeError("boom")

    monkeypatch.setattr("app.services.email.send.render_visitor", boom)
    sender = FakeSender()
    out = await send_enquiry_emails(sender, LIVE, ctx())
    assert out.status == EmailStatus.FAILED and out.visitor_emailed is False
    assert sender.sent == []


async def test_attachment_goes_to_the_visitor_only() -> None:
    sender = FakeSender()
    att = EmailAttachment(filename="Tripsmith-north-goa-beaches-itinerary.pdf", content=b"%PDF-")
    settings = make_settings(
        email_from="Tripsmith <hello@tripsmith.in>", owner_notify_email="owner@example.com"
    )
    out = await send_enquiry_emails(sender, settings, ctx(), attachment=att)
    assert out.status == EmailStatus.SENT
    by_to = {m.to: m for m in sender.sent}
    assert by_to["priya@example.com"].attachments == (att,)
    assert by_to["owner@example.com"].attachments == ()


async def test_no_attachment_when_none_given() -> None:
    sender = FakeSender()
    settings = make_settings(email_from="Tripsmith <hello@tripsmith.in>")
    await send_enquiry_emails(sender, settings, ctx())
    assert sender.sent[0].attachments == ()
