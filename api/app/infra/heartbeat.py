"""Heartbeats to healthchecks.io (V4, OP-1): `/cron/daily` and `/cron/emails` ping their check
when they finish, and healthchecks.io emails the owner when a ping is late past its grace — a
cron that stopped firing, or one that keeps dying before its end. `ok=False` pings `/fail`, an
alert at once (the daily tidy cut short by its time budget).

A ping never raises and never waits long: monitoring must not fail the job it watches."""

import logging

import httpx
from pydantic import SecretStr

PING_TIMEOUT_SECONDS = 5.0
TRANSPORT: httpx.AsyncBaseTransport | None = None  # tests swap in a MockTransport

log = logging.getLogger(__name__)


async def ping(url: SecretStr | None, *, ok: bool = True) -> None:
    if url is None or not (target := url.get_secret_value().strip()):
        return
    if not ok:
        target = f"{target.rstrip('/')}/fail"
    try:
        async with httpx.AsyncClient(timeout=PING_TIMEOUT_SECONDS, transport=TRANSPORT) as client:
            (await client.post(target)).raise_for_status()
    except httpx.HTTPError as exc:
        # WARNING, not ERROR: the missed ping is itself the alert. Never the URL.
        log.warning("healthchecks.io ping failed: %s", type(exc).__name__)
