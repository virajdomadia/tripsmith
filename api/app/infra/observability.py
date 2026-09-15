"""Sentry — the only module that imports `sentry_sdk` (05 §3, 04 §10).

`init_sentry` runs once in `create_app()` before the middleware stack, so the SDK's Starlette /
FastAPI integrations wrap every request. No DSN = Sentry off (local dev, CI, tests).
"""

import os

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.transport import Transport

from app.config import Settings


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


def capture_exception(exc: BaseException, *, request_id: str | None = None) -> None:
    """Report an unhandled error with the request id as a tag (no-op when Sentry is off).

    The SDK's DedupeIntegration drops the copy its own middleware captures, so calling this from
    the `Exception` handler reports each error exactly once.
    """
    if not sentry_sdk.get_client().is_active():
        return
    with sentry_sdk.new_scope() as scope:
        if request_id:
            scope.set_tag("request_id", request_id)
        sentry_sdk.capture_exception(exc)
