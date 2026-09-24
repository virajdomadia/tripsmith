"""Resend over REST (04 §6); null when unconfigured; failures raise, never swallow."""

import base64
import json
import logging

import httpx
import pytest

from app.infra.email import (
    EmailAttachment,
    EmailMessage,
    EmailSendError,
    NullSender,
    ResendSender,
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
    assert sum("RESEND_API_KEY unset" in r.message for r in caplog.records) == 1


def test_build_picks_resend_only_with_a_key() -> None:
    assert isinstance(build_email_sender(make_settings()), NullSender)
    s = build_email_sender(make_settings(resend_api_key="re_x", email_from="T <a@b.co>"))
    assert isinstance(s, ResendSender)


def test_build_logs_an_error_on_vercel_without_a_key(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("VERCEL", "1")
    with caplog.at_level(logging.ERROR, logger="app.infra.email"):
        build_email_sender(make_settings())
    assert "RESEND_API_KEY is unset on a deployment" in caplog.text
