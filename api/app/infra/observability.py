"""Sentry — the only module that imports `sentry_sdk` (05 §3, 04 §10).

`init_sentry` runs once in `create_app()` before the middleware stack, so the SDK's Starlette /
FastAPI integrations wrap every request. No DSN = Sentry off (local dev, CI, tests).
"""

import os

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.transport import Transport
from sentry_sdk.utils import event_from_exception

from app.config import Settings

FLUSH_TIMEOUT_SECONDS = 2.0  # only paid on a 500


def init_sentry(settings: Settings, *, transport: Transport | None = None) -> bool:
    """Returns True when the SDK is active. `transport` (tests) replaces the HTTP transport."""
    if not settings.sentry_dsn:
        return False
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        # Vercel sets both; locally they are absent.
        environment=os.environ.get("VERCEL_ENV", "development"),
        release=os.environ.get("VERCEL_GIT_COMMIT_SHA"),
        send_default_pii=False,
        traces_sample_rate=0.1,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        transport=transport,
    )
    return True


def tag_request(request_id: str) -> None:
    """Tag everything Sentry captures for the current request with its id (no-op when off)."""
    if sentry_sdk.get_client().is_active():
        sentry_sdk.set_tag("request_id", request_id)


def capture_unhandled(exc: BaseException, *, request_id: str | None = None) -> None:
    """Report an error that escaped every handler, then flush (no-op when Sentry is off).

    Captured here — before Starlette re-raises it into the SDK's own ASGI middleware — so the
    request id tag and the *unhandled* mechanism are ours; the SDK's later copy of the same
    exception is dropped by DedupeIntegration. The flush is for Vercel: a serverless instance can
    be paused right after the response, before the background transport thread has sent anything.
    """
    client = sentry_sdk.get_client()
    if not client.is_active():
        return
    event, hint = event_from_exception(
        exc,
        client_options=client.options,
        mechanism={"type": "tripsmith.errors", "handled": False},
    )
    with sentry_sdk.new_scope() as scope:
        if request_id:
            scope.set_tag("request_id", request_id)
        sentry_sdk.capture_event(event, hint=hint)
    sentry_sdk.flush(timeout=FLUSH_TIMEOUT_SECONDS)
