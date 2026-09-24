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
from app.infra.observability import _scrub, build_before_send, init_sentry
from app.main import create_app
from tests.settings import make_settings


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
    return make_settings(sentry_dsn=dsn) if dsn else make_settings()


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
    app = create_app(settings=make_settings())
    assert sentry_sdk.get_client().is_active() is False
    assert app is not None


async def test_secret_visitor_ip_and_cookie_headers_never_reach_sentry(
    events: list[dict[str, Any]],
) -> None:
    # The web forwards REVALIDATE_SECRET as X-Internal-Secret and the visitor's address as
    # X-Client-Ip; neither is in the SDK's own sensitive-header list.
    init_sentry(_settings("https://key@o1.ingest.sentry.io/1"), transport=Sink(events))
    app = create_app(settings=_settings(None))

    @app.get("/_test/boom")
    async def _route() -> None:
        raise RuntimeError("kaboom")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/_test/boom",
            headers={
                "X-Internal-Secret": "shh-internal-secret",
                "x-client-ip": "203.0.113.77",
                "X-Forwarded-For": "198.51.100.9",
                "X-Real-Ip": "198.51.100.10",
                "Cookie": "ts_session=raw-session-token",
                "Authorization": "Bearer bearer-token-value",
                "User-Agent": "kept-agent",
            },
        )
    sentry_sdk.flush()

    assert res.status_code == 500
    errors = [e for e in events if "exception" in e]
    assert errors
    dumped = repr(errors)
    for leaked in (
        "shh-internal-secret",
        "203.0.113.77",
        "198.51.100.9",
        "198.51.100.10",
        "raw-session-token",
        "bearer-token-value",
    ):
        assert leaked not in dumped, leaked
    headers = {k.lower() for k in errors[0]["request"]["headers"]}
    assert "user-agent" in headers  # the request context itself survives
    assert not headers & {"x-internal-secret", "x-client-ip", "cookie", "authorization"}


def test_scrub_filters_headers_case_insensitively_and_drops_addresses() -> None:
    event: dict[str, Any] = {
        "request": {
            "headers": {"X-INTERNAL-SECRET": "s", "X-Client-IP": "1.2.3.4", "Accept": "*/*"},
            "cookies": {"ts_session": "t"},
            "env": {"REMOTE_ADDR": "1.2.3.4", "SERVER_NAME": "api"},
        },
        "user": {"id": "u1", "ip_address": "1.2.3.4"},
    }
    out = _scrub(event, {})
    assert out["request"]["headers"] == {"Accept": "*/*"}
    assert "cookies" not in out["request"]
    assert out["request"]["env"] == {"SERVER_NAME": "api"}
    assert out["user"] == {"id": "u1"}
    assert _scrub({"type": "transaction"}, {}) == {"type": "transaction"}  # nothing to scrub


def test_scrubbing_is_wired_for_events_and_transactions(events: list[dict[str, Any]]) -> None:
    init_sentry(_settings("https://key@o1.ingest.sentry.io/1"), transport=Sink(events))
    opts = sentry_sdk.get_client().options
    assert opts["before_send"] is opts["before_send_transaction"]
    tx = opts["before_send_transaction"](
        {"type": "transaction", "request": {"headers": {"X-Client-Ip": "1.2.3.4"}}}, {}
    )
    assert tx["request"]["headers"] == {}
    denylist = opts["event_scrubber"].denylist
    assert {"x-internal-secret", "x_internal_secret", "x-client-ip", "headers"} <= set(denylist)
    # Frame locals carried the ASGI scope's raw headers and `key="pdf:<ip>"`: off entirely.
    assert opts["include_local_variables"] is False


async def test_frame_locals_never_reach_sentry(events: list[dict[str, Any]]) -> None:
    init_sentry(_settings("https://key@o1.ingest.sentry.io/1"), transport=Sink(events))
    app = create_app(settings=_settings(None))

    @app.get("/_test/boom")
    async def _route() -> None:
        # Built at runtime: Sentry ships the source lines around a frame as context.
        key = "pdf:" + ".".join(["203", "0", "113", "99"])
        raise RuntimeError(f"kaboom {len(key)}")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.get("/_test/boom")
    sentry_sdk.flush()
    errors = [e for e in events if "exception" in e]
    assert errors and "203.0.113.99" not in repr(errors)
    frames = errors[0]["exception"]["values"][0]["stacktrace"]["frames"]
    assert frames and not any("vars" in f for f in frames)


@pytest.mark.parametrize(
    ("text", "masked"),
    [
        ("prefix rv-secret-value-123 suffix", True),
        ("trimmed rv-secret-v...", True),  # the SDK's own truncation
        ("trimmed rv-secret-v… and more", True),
        ("ends rv-secre", True),  # cut short at the very end
        ("rv-secr...", False),  # 7 characters: too short to be told from ordinary text
        ("an ordinary rv-secret mention elsewhere", False),
    ],
)
def test_mask_catches_whole_and_truncated_secrets(text: str, masked: bool) -> None:
    before_send = build_before_send(make_settings(revalidate_secret="rv-secret-value-123"))
    out = before_send({"message": text, "extra": {text: "v"}}, {})
    assert (out["message"] == "[Filtered]") is masked
    assert (list(out["extra"]) == ["[Filtered]"]) is masked  # keys are masked too


def test_configured_secret_values_are_masked_wherever_they_appear(
    events: list[dict[str, Any]],
) -> None:
    settings = make_settings(
        sentry_dsn="https://key@o1.ingest.sentry.io/1", revalidate_secret="rv-secret-value-123"
    )
    init_sentry(settings, transport=Sink(events))
    with sentry_sdk.new_scope() as scope:
        scope.set_extra("odd_key", {"nested": ["prefix rv-secret-value-123 suffix", "kept"]})
        sentry_sdk.capture_message("hello")
    sentry_sdk.flush()
    assert events and "rv-secret-value-123" not in repr(events)
    assert events[-1]["extra"]["odd_key"]["nested"] == ["[Filtered]", "kept"]
