"""Gmail SMTP (v2.5 P0) or Resend over REST (04 §6); null when unconfigured; failures raise,
never swallow."""

import base64
import json
import logging
import smtplib
from email.message import EmailMessage as MimeMessage

import httpx
import pytest

from app.infra.email import (
    EmailAttachment,
    EmailMessage,
    EmailSendError,
    NullSender,
    ResendSender,
    SmtpSender,
    build_email_sender,
)
from tests.settings import make_settings

MSG = EmailMessage(
    to="priya@example.com",
    subject="Your Tripsmith enquiry TS-ABC234",
    html="<p>Hi</p>",
    text="Hi",
    reply_to="hello@tripsmith.in",
)


def resend_transport(status: int = 200, body: dict | None = None) -> httpx.MockTransport:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(status, json=body if body is not None else {"id": "em_123"})

    transport = httpx.MockTransport(handler)
    transport.calls = calls  # type: ignore[attr-defined]
    return transport


def sender_with(transport: httpx.MockTransport) -> ResendSender:
    return ResendSender(
        "re_test",
        "Tripsmith <onboarding@resend.dev>",
        client=httpx.AsyncClient(transport=transport),
    )


async def test_resend_posts_the_message_and_returns_the_id() -> None:
    transport = resend_transport()
    assert await sender_with(transport).send(MSG) == "em_123"
    (req,) = transport.calls  # type: ignore[attr-defined]
    assert req.method == "POST" and str(req.url) == "https://api.resend.com/emails"
    assert req.headers["authorization"] == "Bearer re_test"
    assert json.loads(req.content) == {
        "from": "Tripsmith <onboarding@resend.dev>",
        "to": ["priya@example.com"],
        "subject": "Your Tripsmith enquiry TS-ABC234",
        "html": "<p>Hi</p>",
        "text": "Hi",
        "reply_to": "hello@tripsmith.in",
    }


async def test_resend_attachments_are_base64() -> None:
    transport = resend_transport()
    msg = EmailMessage(
        to="a@b.co",
        subject="s",
        html="h",
        text="t",
        attachments=(EmailAttachment("itinerary.pdf", b"%PDF-1.4"),),
    )
    await sender_with(transport).send(msg)
    body = json.loads(transport.calls[0].content)  # type: ignore[attr-defined]
    assert "reply_to" not in body
    assert body["attachments"] == [
        {"filename": "itinerary.pdf", "content": base64.b64encode(b"%PDF-1.4").decode()}
    ]


async def test_resend_non_2xx_raises_with_the_body() -> None:
    transport = resend_transport(
        403, {"message": "You can only send testing emails to your own email address"}
    )
    with pytest.raises(EmailSendError, match="403.*testing emails"):
        await sender_with(transport).send(MSG)


async def test_resend_transport_error_raises() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("dns")

    with pytest.raises(EmailSendError, match="dns"):
        await sender_with(httpx.MockTransport(boom)).send(MSG)


async def test_null_sender_returns_none_and_warns_once(caplog: pytest.LogCaptureFixture) -> None:
    NullSender._warned = False
    with caplog.at_level(logging.WARNING, logger="app.infra.email"):
        assert await NullSender().send(MSG) is None
        assert await NullSender().send(MSG) is None
    assert sum("emails are not sent" in r.message for r in caplog.records) == 1


def test_build_picks_resend_only_with_a_key() -> None:
    assert isinstance(build_email_sender(make_settings()), NullSender)
    s = build_email_sender(make_settings(resend_api_key="re_x", email_from="T <a@b.co>"))
    assert isinstance(s, ResendSender)


def test_build_prefers_smtp_only_with_host_user_and_password() -> None:
    smtp = {"smtp_host": "smtp.test", "smtp_user": "sender@mail.test", "smtp_password": "pw"}
    assert isinstance(build_email_sender(make_settings(**smtp, resend_api_key="re_x")), SmtpSender)
    for missing in smtp:
        partial = {k: v for k, v in smtp.items() if k != missing}
        s = build_email_sender(make_settings(**partial, resend_api_key="re_x"))
        assert isinstance(s, ResendSender)


def test_build_logs_an_error_on_vercel_without_a_key(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("VERCEL", "1")
    with caplog.at_level(logging.ERROR, logger="app.infra.email"):
        build_email_sender(make_settings())
    assert "RESEND_API_KEY on a deployment" in caplog.text


class FakeSmtp:
    """Stands in for `smtplib.SMTP`: records the conversation instead of dialling Gmail."""

    sent: list[MimeMessage] = []
    calls: list[str] = []
    fail_with: BaseException | None = None

    def __init__(self, host: str, port: int, timeout: float) -> None:
        FakeSmtp.calls.append(f"connect {host}:{port}")

    def __enter__(self) -> "FakeSmtp":
        return self

    def __exit__(self, *exc: object) -> None:
        FakeSmtp.calls.append("quit")

    def starttls(self) -> None:
        FakeSmtp.calls.append("starttls")

    def login(self, user: str, password: str) -> None:
        FakeSmtp.calls.append(f"login {user}")
        if FakeSmtp.fail_with is not None:
            raise FakeSmtp.fail_with

    def send_message(self, msg: MimeMessage) -> None:
        FakeSmtp.sent.append(msg)


@pytest.fixture
def fake_smtp(monkeypatch: pytest.MonkeyPatch) -> type[FakeSmtp]:
    FakeSmtp.sent, FakeSmtp.calls, FakeSmtp.fail_with = [], [], None
    monkeypatch.setattr(smtplib, "SMTP", FakeSmtp)
    return FakeSmtp


def smtp_sender() -> SmtpSender:
    return SmtpSender(
        "smtp.test",
        587,
        "sender@mail.test",
        "pw",
        "Tripsmith <sender@mail.test>",
    )


async def test_smtp_sends_over_starttls_with_text_html_and_reply_to(
    fake_smtp: type[FakeSmtp],
) -> None:
    msg_id = await smtp_sender().send(MSG)
    assert fake_smtp.calls == [
        "connect smtp.test:587",
        "starttls",
        "login sender@mail.test",
        "quit",
    ]
    (mime,) = fake_smtp.sent
    assert mime["From"] == "Tripsmith <sender@mail.test>"
    assert mime["To"] == "priya@example.com"
    assert mime["Subject"] == "Your Tripsmith enquiry TS-ABC234"
    assert mime["Reply-To"] == "hello@tripsmith.in"
    assert msg_id and mime["Message-ID"] == f"<{msg_id}>" and msg_id.endswith("@mail.test")
    parts = {p.get_content_type(): p.get_content() for p in mime.walk() if not p.is_multipart()}
    assert parts["text/plain"].strip() == "Hi" and parts["text/html"].strip() == "<p>Hi</p>"


async def test_smtp_attaches_a_pdf(fake_smtp: type[FakeSmtp]) -> None:
    msg = EmailMessage(
        to="a@b.co",
        subject="s",
        html="h",
        text="t",
        attachments=(EmailAttachment("itinerary.pdf", b"%PDF-1.4"),),
    )
    await smtp_sender().send(msg)
    (att,) = list(fake_smtp.sent[0].iter_attachments())
    assert att.get_filename() == "itinerary.pdf"
    assert att.get_content_type() == "application/pdf"
    assert att.get_content() == b"%PDF-1.4"


async def test_smtp_refusal_raises_refused(fake_smtp: type[FakeSmtp]) -> None:
    fake_smtp.fail_with = smtplib.SMTPAuthenticationError(535, b"bad credentials")
    with pytest.raises(EmailSendError, match="SMTP refused: SMTPAuthenticationError"):
        await smtp_sender().send(MSG)


async def test_smtp_network_error_raises_unreachable(fake_smtp: type[FakeSmtp]) -> None:
    fake_smtp.fail_with = TimeoutError()
    with pytest.raises(EmailSendError, match="SMTP unreachable"):
        await smtp_sender().send(MSG)
