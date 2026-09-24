"""Sentry init and the unhandled-error capture path (05 §3, 04 §10). Other modules call
sentry_sdk.capture_exception directly for handled failures.

`init_sentry` runs once in `create_app()` before the middleware stack, so the SDK's Starlette /
FastAPI integrations wrap every request. No DSN = Sentry off (local dev, CI, tests).

Scrubbing: the web's server-side hops send `REVALIDATE_SECRET` as `X-Internal-Secret` and the
visitor's address as `X-Client-Ip` (infra/client_ip.py). The SDK's own header filter only knows
the standard names, so `_scrub` drops ours — plus the standard ones, belt and braces — from
every event and transaction. Stack-frame locals are off (`include_local_variables=False`):
they carried the raw ASGI header list (a middleware frame's `scope`) and visitor addresses
(`key="pdf:1.2.3.4"`), and there is no reliable way to scrub values by name. The
`EventScrubber` denylist still filters those header names (and any `headers` collection)
wherever a dict can land — breadcrumbs, extra, spans. Last, every configured secret's *value*
is masked wherever it appears in a string or a key, including a truncated copy ending in an
ellipsis (the SDK trims long strings that way).
"""

import os
import re
from collections.abc import Callable
from typing import Any

import sentry_sdk
from pydantic import SecretStr
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.scrubber import DEFAULT_DENYLIST, DEFAULT_PII_DENYLIST, EventScrubber
from sentry_sdk.transport import Transport
from sentry_sdk.utils import event_from_exception

from app.config import Settings

FLUSH_TIMEOUT_SECONDS = 2.0  # only paid on a 500

# Lower-case header names never sent to Sentry (compared case-insensitively).
SCRUBBED_HEADERS = frozenset(
    {
        "x-internal-secret",
        "x-client-ip",
        "cookie",
        "set-cookie",
        "authorization",
        "proxy-authorization",
        "x-forwarded-for",
        "x-real-ip",
        "x-vercel-forwarded-for",
        "x-vercel-proxied-for",
        "forwarded",
    }
)
# EventScrubber compares whole keys, lower-cased; headers appear both dashed and underscored.
# `headers` / `raw_headers` catch whole header collections in frame locals (the ASGI scope);
# the event's own `request.headers` is scrubbed by content, never by that key.
_EXTRA_DENYLIST = sorted(
    SCRUBBED_HEADERS | {h.replace("-", "_") for h in SCRUBBED_HEADERS} | {"headers", "raw_headers"}
)
FILTERED = "[Filtered]"
SECRET_MIN_LENGTH = 8  # shorter values (or prefixes) would mask ordinary words
ELLIPSIS_RE = re.compile("\\.\\.\\.|…")


def _scrub(event: Any, _hint: Any) -> Any:
    """Strip secret and visitor-identifying headers, the remote address and any user ip from
    the request payload. Never raises or drops the event."""
    request = event.get("request")
    if isinstance(request, dict):
        headers = request.get("headers")
        if isinstance(headers, dict):
            request["headers"] = {
                k: v for k, v in headers.items() if str(k).lower() not in SCRUBBED_HEADERS
            }
        request.pop("cookies", None)
        env = request.get("env")
        if isinstance(env, dict):
            env.pop("REMOTE_ADDR", None)
    user = event.get("user")
    if isinstance(user, dict):
        user.pop("ip_address", None)
    return event


def _leaks(text: str, secrets: tuple[str, ...]) -> bool:
    """A secret appears whole, or cut short: 8+ of its leading characters right before an
    ellipsis or at the very end of the string."""
    if any(s in text for s in secrets):
        return True
    cuts = [len(text), *(m.start() for m in ELLIPSIS_RE.finditer(text))]
    return any(
        text[:cut].endswith(s[:n])
        for s in secrets
        for cut in cuts
        for n in range(SECRET_MIN_LENGTH, len(s))
    )


def _mask(value: Any, secrets: tuple[str, ...]) -> Any:
    if isinstance(value, str):
        return FILTERED if _leaks(value, secrets) else value
    if isinstance(value, dict):
        return {_mask(k, secrets): _mask(v, secrets) for k, v in value.items()}
    if isinstance(value, list):
        return [_mask(v, secrets) for v in value]
    return value


def _secret_values(settings: Settings) -> tuple[str, ...]:
    """Every configured `SecretStr` setting's value (REVALIDATE_SECRET, SESSION_SECRET, …)."""
    values = (getattr(settings, name) for name in type(settings).model_fields)
    return tuple(
        s
        for v in values
        if isinstance(v, SecretStr) and len(s := v.get_secret_value()) >= SECRET_MIN_LENGTH
    )


def build_before_send(settings: Settings) -> Callable[[Any, Any], Any]:
    """`before_send` / `before_send_transaction`: `_scrub`, then mask secret values anywhere."""
    secrets = _secret_values(settings)

    def before_send(event: Any, hint: Any) -> Any:
        event = _scrub(event, hint)
        return _mask(event, secrets) if secrets else event

    return before_send


def init_sentry(settings: Settings, *, transport: Transport | None = None) -> bool:
    """Returns True when the SDK is active. `transport` (tests) replaces the HTTP transport."""
    if not settings.sentry_dsn:
        return False
    before_send = build_before_send(settings)
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        # Vercel sets both; locally they are absent.
        environment=os.environ.get("VERCEL_ENV", "development"),
        release=os.environ.get("VERCEL_GIT_COMMIT_SHA"),
        send_default_pii=False,
        traces_sample_rate=0.1,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        include_local_variables=False,
        event_scrubber=EventScrubber(
            denylist=DEFAULT_DENYLIST + _EXTRA_DENYLIST,
            pii_denylist=DEFAULT_PII_DENYLIST,
            recursive=True,
        ),
        before_send=before_send,
        before_send_transaction=before_send,
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
