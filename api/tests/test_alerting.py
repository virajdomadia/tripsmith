"""V4 (OP-4, OP-7, OP-1) — what pages the owner: no recipients chained into an email error, one
ERROR log line for a forged webhook, a readiness probe that touches the database. Nothing here
needs a database or the network."""

import logging
import smtplib
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.infra.db import get_session
from app.infra.email import EmailSendError
from app.main import create_app
from tests.settings import make_settings
from tests.test_booking_webhook import deliver, event, with_webhook_secret
from tests.test_email_sender import MSG, FakeSmtp, fake_smtp, smtp_sender

__all__ = ["fake_smtp"]


# --- OP-4: no recipients ---------------------------------------------------------------


async def test_a_refused_smtp_send_does_not_chain_the_recipients(
    fake_smtp: type[FakeSmtp],
) -> None:
    """SMTPRecipientsRefused carries every refused address; a traceback would print it."""
    fake_smtp.fail_with = smtplib.SMTPRecipientsRefused({"priya@customer.in": (550, b"no")})
    with pytest.raises(EmailSendError) as caught:
        await smtp_sender().send(MSG)
    assert str(caught.value) == "SMTP refused: SMTPRecipientsRefused"
    assert caught.value.__cause__ is None and caught.value.__suppress_context__


async def test_an_unreachable_smtp_server_does_not_chain_either(
    fake_smtp: type[FakeSmtp],
) -> None:
    fake_smtp.fail_with = OSError("connect to smtp.gmail.com failed")
    with pytest.raises(EmailSendError) as caught:
        await smtp_sender().send(MSG)
    assert caught.value.__cause__ is None and caught.value.__suppress_context__


# --- OP-7: a forged webhook is one ERROR line ----------------------------------------------------


async def test_a_wrong_webhook_signature_logs_one_error_without_the_ip(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = create_app(settings=make_settings())
    with_webhook_secret(app)
    body = event("payment.captured", "order_A", "pay_B")
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    with caplog.at_level(logging.WARNING, logger="app.routers.site.webhooks"):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/webhooks/razorpay",
                content=body,
                headers={"x-razorpay-signature": "0" * 64, "X-Forwarded-For": "203.0.113.9"},
            )
    assert res.status_code == 400
    found = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert [r.getMessage() for r in found] == ["Razorpay webhook signature did not verify"]
    assert "203.0.113.9" not in caplog.text


async def test_a_webhook_call_without_a_signature_is_not_an_alert(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """No header at all is a scanner, not a misconfigured secret: a warning, never an ERROR."""
    app = create_app(settings=make_settings())
    with_webhook_secret(app)
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    with caplog.at_level(logging.WARNING, logger="app.routers.site.webhooks"):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await deliver(client, event("payment.captured", "order_A", "pay_B"), signature="")
    assert res.status_code == 400
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


# --- OP-1: readiness ---------------------------------------------------------------


class BrokenSession:
    async def execute(self, *_: object) -> None:
        raise OSError("connection refused")


async def test_ready_answers_503_when_the_database_does_not(app: FastAPI) -> None:
    async def broken() -> Any:
        yield BrokenSession()

    app.dependency_overrides[get_session] = broken
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/health/ready")
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "internal"
    assert res.headers["cache-control"] == "no-store"


def test_ready_is_not_in_the_public_contract(app: FastAPI) -> None:
    assert "/health/ready" not in app.openapi()["paths"]
