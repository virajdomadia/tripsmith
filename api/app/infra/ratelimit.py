"""Rate limiting over Upstash Redis REST (04 §rate limiting) as a sliding-window log.

One `/pipeline` round trip per hit: drop entries older than the window, add this hit, count,
refresh the TTL. Upstash being down never blocks a visitor — the limiter fails open and reports.
When the Upstash env is unset (dev, CI) `NullRateLimiter` allows everything and says so once.
"""

import logging
import time
import uuid
from dataclasses import dataclass
from typing import Protocol

import httpx
import sentry_sdk

from app.config import Settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    retry_after: int = 0  # seconds; 0 when allowed


class RateLimiter(Protocol):
    async def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult: ...


class NullRateLimiter:
    _warned = False

    async def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult:
        if not NullRateLimiter._warned:
            NullRateLimiter._warned = True
            log.warning("UPSTASH_REDIS_REST_URL/TOKEN unset — rate limiting is off")
        return RateLimitResult(allowed=True)


class UpstashRateLimiter:
    def __init__(self, url: str, token: str, *, client: httpx.AsyncClient | None = None) -> None:
        self._url = url.rstrip("/") + "/pipeline"
        self._headers = {"Authorization": f"Bearer {token}"}
        self._client = client or httpx.AsyncClient(timeout=3.0)

    async def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult:
        now_ms = int(time.time() * 1000)
        window_ms = window_seconds * 1000
        commands = [
            ["ZREMRANGEBYSCORE", key, "0", str(now_ms - window_ms)],
            ["ZADD", key, str(now_ms), f"{now_ms}-{uuid.uuid4().hex[:8]}"],
            ["ZCARD", key],
            ["PEXPIRE", key, str(window_ms)],
        ]
        try:
            res = await self._client.post(self._url, json=commands, headers=self._headers)
            res.raise_for_status()
            count = int(res.json()[2]["result"])
        except Exception as exc:  # noqa: BLE001 — any failure fails open, by design
            log.error("Rate limiter unavailable, allowing request: %s", exc)
            sentry_sdk.capture_exception(exc)
            return RateLimitResult(allowed=True)
        if count > limit:
            return RateLimitResult(allowed=False, retry_after=window_seconds)
        return RateLimitResult(allowed=True)


def build_rate_limiter(settings: Settings) -> RateLimiter:
    if settings.upstash_redis_rest_url and settings.upstash_redis_rest_token:
        return UpstashRateLimiter(
            settings.upstash_redis_rest_url, settings.upstash_redis_rest_token.get_secret_value()
        )
    return NullRateLimiter()
