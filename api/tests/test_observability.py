"""infra/observability.py — Sentry wiring (04 §10, S8). Never touches the network: a function
transport collects the events the SDK would send."""

from collections.abc import Iterator
from typing import Any, cast

import pytest
import sentry_sdk
from httpx import ASGITransport, AsyncClient
from sentry_sdk.envelope import Envelope
from sentry_sdk.transport import Transport

from app.config import Settings
from app.infra.observability import init_sentry
from app.main import create_app


class Sink(Transport):
    """Collects the events the SDK would send."""

    def __init__(self, events: list[dict[str, Any]]) -> None:
        super().__init__()
        self.events = events

    def capture_envelope(self, envelope: Envelope) -> None:
        event = envelope.get_event()
        if event is not None:
            self.events.append(cast(dict[str, Any], event))


@pytest.fixture
def events() -> Iterator[list[dict[str, Any]]]:
    collected: list[dict[str, Any]] = []
    yield collected
    # Drop the client we installed so later tests start from a clean SDK. `close()` alone is
    # not enough: a closed _Client still reports is_active() == True.
    sentry_sdk.get_client().close(timeout=0)
    sentry_sdk.get_global_scope().set_client(None)


def _settings(dsn: str | None) -> Settings:
    return Settings.model_validate({"sentry_dsn": dsn}) if dsn else Settings.model_validate({})


def test_without_a_dsn_sentry_stays_off() -> None:
    assert init_sentry(_settings(None)) is False
    assert sentry_sdk.get_client().is_active() is False


def test_with_a_dsn_sentry_is_active_without_pii(events: list[dict[str, Any]]) -> None:
    assert init_sentry(_settings("https://key@o1.ingest.sentry.io/1"), transport=Sink(events))
    client = sentry_sdk.get_client()
    assert client.is_active()
    assert client.options["send_default_pii"] is False


def test_environment_and_release_come_from_vercel(
    events: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setenv("VERCEL_GIT_COMMIT_SHA", "abc123")
    init_sentry(_settings("https://key@o1.ingest.sentry.io/1"), transport=Sink(events))
    opts = sentry_sdk.get_client().options
    assert opts["environment"] == "preview"
    assert opts["release"] == "abc123"


async def test_unhandled_error_is_reported_once_with_the_request_id(
    events: list[dict[str, Any]],
) -> None:
    init_sentry(_settings("https://key@o1.ingest.sentry.io/1"), transport=Sink(events))
    # DSN off here so create_app() does not re-init the SDK over the sink; the global client
    # (and the integrations it patched in) stay in place.
    app = create_app(settings=_settings(None))

    @app.get("/_test/boom")
    async def _route() -> None:
        raise RuntimeError("kaboom")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/_test/boom", headers={"X-Request-Id": "req-42"})
    sentry_sdk.flush()

    assert res.status_code == 500
    assert res.json() == {"error": {"code": "internal", "message": "Internal server error"}}
    errors = [e for e in events if "exception" in e]
    assert len(errors) == 1, [e.get("exception") for e in errors]
    exc = errors[0]["exception"]["values"][0]
    assert (exc["type"], exc["value"]) == ("RuntimeError", "kaboom")
    assert errors[0]["tags"]["request_id"] == "req-42"
    # Reported as *unhandled* (Sentry's "Unhandled" badge, `handled:no` alert filters), not as a
    # handled capture from inside the exception handler.
    assert exc["mechanism"]["handled"] is False


async def test_the_test_app_never_reports_to_sentry(events: list[dict[str, Any]]) -> None:
    # conftest builds the app with Sentry off even when .env.local carries a real DSN.
    app = create_app(settings=Settings.model_validate({"sentry_dsn": None}))
    assert sentry_sdk.get_client().is_active() is False
    assert app is not None
