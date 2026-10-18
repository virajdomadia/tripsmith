"""V4 (OP-4, OP-7, OP-1, OP-2) — what reaches Sentry, what pages the owner: no request bodies
or recipients in an event, one fingerprinted issue for a forged webhook, a readiness probe that
touches the database, heartbeats at the end of the two daily crons, and the 15-minute tick off
GitHub's schedule. Nothing here needs a database or the network."""

import smtplib
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import sentry_sdk
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.infra import heartbeat
from app.infra.db import get_session
from app.infra.email import EmailSendError
from app.infra.observability import init_sentry
from app.main import create_app
from tests.settings import make_settings
from tests.test_booking_webhook import deliver, event, with_webhook_secret
from tests.test_email_sender import MSG, FakeSmtp, fake_smtp, smtp_sender
from tests.test_enquiries import BODY
from tests.test_observability import Sink

__all__ = ["fake_smtp"]

DSN = "https://key@o1.ingest.sentry.io/1"
REPO = Path(__file__).resolve().parents[2]


async def no_session() -> Any:
    yield None


@pytest.fixture
def events() -> Iterator[list[dict[str, Any]]]:
    collected: list[dict[str, Any]] = []
    init_sentry(make_settings(sentry_dsn=DSN), transport=Sink(collected))
    yield collected
    sentry_sdk.get_client().close(timeout=0)
    sentry_sdk.get_global_scope().set_client(None)


def errors(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sentry_sdk.flush()
    return [e for e in events if e.get("level") == "error" or "exception" in e]


# --- OP-4: no bodies, no recipients ---------------------------------------------------------------


def test_the_sdk_never_attaches_a_request_body(events: list[dict[str, Any]]) -> None:
    assert sentry_sdk.get_client().options["max_request_body_size"] == "never"


async def test_a_forced_500_on_enquiries_reaches_sentry_without_the_body(
    events: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    """The V4 done-when: the visitor's name, email, phone and message stay out of the event."""
    app = create_app(settings=make_settings())  # DSN off: keep the sink's client

    async def boom(*_: object, **__: object) -> None:
        raise RuntimeError("enquiry store down")

    monkeypatch.setattr("app.routers.site.enquiries.submit_enquiry", boom)
    app.dependency_overrides[get_session] = no_session
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/enquiries", json=BODY)

    assert res.status_code == 500
    (error,) = [e for e in errors(events) if "exception" in e]
    assert error["exception"]["values"][0]["value"] == "enquiry store down"
    assert not error["request"].get("data")  # the SDK leaves an empty marker, never the body
    dumped = repr(error)
    for leaked in ("Priya", "Sharma", "Customer.in", "98450", "Early check-in"):
        assert leaked not in dumped, leaked


async def test_a_refused_smtp_send_does_not_chain_the_recipients(
    fake_smtp: type[FakeSmtp],
) -> None:
    """SMTPRecipientsRefused carries every refused address; chained in, Sentry would print it."""
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


# --- OP-7: a forged webhook is one Sentry issue ---------------------------------------------------


async def test_a_wrong_webhook_signature_is_one_fingerprinted_error_without_the_ip(
    events: list[dict[str, Any]],
) -> None:
    app = create_app(settings=make_settings())
    with_webhook_secret(app)
    body = event("payment.captured", "order_A", "pay_B")
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        for _ in range(2):
            res = await client.post(
                "/webhooks/razorpay",
                content=body,
                headers={"x-razorpay-signature": "0" * 64, "X-Forwarded-For": "203.0.113.9"},
            )
            assert res.status_code == 400

    found = errors(events)
    assert len(found) == 2  # one per delivery, grouped into one issue by the fingerprint
    assert {tuple(e["fingerprint"]) for e in found} == {("razorpay-webhook-bad-signature",)}
    assert "203.0.113.9" not in repr(found)
    messages = {(e.get("logentry") or {}).get("message") or e.get("message") for e in found}
    assert messages == {"Razorpay webhook signature did not verify"}  # no caller address


async def test_a_webhook_call_without_a_signature_is_not_an_alert(
    events: list[dict[str, Any]],
) -> None:
    """No header at all is a scanner, not a misconfigured secret: a log line, no Sentry issue."""
    app = create_app(settings=make_settings())
    with_webhook_secret(app)
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await deliver(client, event("payment.captured", "order_A", "pay_B"), signature="")
    assert res.status_code == 400
    assert errors(events) == []


# --- OP-1: readiness and heartbeats ---------------------------------------------------------------


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


@pytest.fixture
def pings(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    seen: list[str] = []

    def record(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, text="OK")

    monkeypatch.setattr(heartbeat, "TRANSPORT", httpx.MockTransport(record))
    return seen


async def test_a_heartbeat_pings_the_url_or_its_fail_endpoint(pings: list[str]) -> None:
    url = SecretStr("https://hc-ping.com/abc")
    await heartbeat.ping(url)
    await heartbeat.ping(url, ok=False)
    await heartbeat.ping(None)  # not configured: nothing
    assert pings == ["https://hc-ping.com/abc", "https://hc-ping.com/abc/fail"]


async def test_a_heartbeat_that_cannot_reach_the_service_never_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("hc-ping.com unreachable")

    monkeypatch.setattr(heartbeat, "TRANSPORT", httpx.MockTransport(down))
    await heartbeat.ping(SecretStr("https://hc-ping.com/abc"))


def test_the_heartbeat_urls_are_secrets() -> None:
    """Anyone holding a ping URL can report the job healthy: masked in Sentry like the rest."""
    s = make_settings(
        healthcheck_daily_url="https://hc-ping.com/daily-uuid",
        healthcheck_emails_url="https://hc-ping.com/emails-uuid",
    )
    assert isinstance(s.healthcheck_daily_url, SecretStr)
    assert isinstance(s.healthcheck_emails_url, SecretStr)


# --- OP-2: the 15-minute tick -------------------------------------------------------------------


def test_the_tick_runs_on_a_schedule_and_a_missing_secret_fails() -> None:
    """V4 kept the GitHub schedule (a portfolio project: about five runs a day is enough, and
    every booking, join and claim read walks the list too). What changed: a run without the
    secret goes red instead of passing as a no-op. Outside 09:00-21:00 IST a scheduled run
    skips the emails on purpose; a manual run always sends them."""
    text = (REPO / ".github/workflows/waitlist-tick.yml").read_text(encoding="utf-8")
    assert "schedule:" in text and "*/15 * * * *" in text and "workflow_dispatch:" in text
    secret_skips = text.count('if [ -z "$CRON_SECRET" ]; then')
    assert secret_skips == 2 and text.count("exit 1") == 2
    assert '"$GITHUB_EVENT_NAME" = "schedule"' in text  # the hour gate is the schedule's only
