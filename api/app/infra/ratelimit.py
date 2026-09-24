"""Rate limiting over Upstash Redis REST (04 §rate limiting) as a sliding-window log.

One round trip per hit, atomic in a Lua script: drop entries older than the window, count, and
only when under the limit record this hit and refresh the TTL. Rejected hits are not recorded —
otherwise a client that keeps retrying keeps its own window full and is locked out for good —
and `retry_after` is when the oldest recorded hit leaves the window, not the whole window.
Upstash being down never blocks a visitor — the limiter fails open and reports. When the
Upstash env is unset (dev, CI) `NullRateLimiter` allows everything and says so once (and on a
Vercel deployment `build_rate_limiter` logs an ERROR at startup).
"""

import logging
import math
import os
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


# KEYS[1] the log · ARGV now_ms, cutoff_ms, limit, member, window_ms → {1, ""} allowed, or
# {0, oldest score} rejected. Scores travel as strings: Lua numbers would lose them to %.14g.
SLIDING_WINDOW_LUA = """
redis.call('ZREMRANGEBYSCORE', KEYS[1], '0', ARGV[2])
if redis.call('ZCARD', KEYS[1]) < tonumber(ARGV[3]) then
  redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
  redis.call('PEXPIRE', KEYS[1], ARGV[5])
  return {1, ''}
end
local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
return {0, oldest[2] or ARGV[1]}
"""


class UpstashRateLimiter:
    def __init__(self, url: str, token: str, *, client: httpx.AsyncClient | None = None) -> None:
        self._url = url.rstrip("/") + "/pipeline"
        self._headers = {"Authorization": f"Bearer {token}"}
        self._client = client or httpx.AsyncClient(timeout=3.0)

    async def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult:
        now_ms = int(time.time() * 1000)
        window_ms = window_seconds * 1000
        member = f"{now_ms}-{uuid.uuid4().hex[:8]}"
        command = ["EVAL", SLIDING_WINDOW_LUA, "1", key]
        command += [str(now_ms), str(now_ms - window_ms), str(limit), member, str(window_ms)]
        try:
            res = await self._client.post(self._url, json=[command], headers=self._headers)
            res.raise_for_status()
            allowed, oldest = res.json()[0]["result"]
            if int(allowed) == 1:
                return RateLimitResult(allowed=True)
            oldest_ms = int(float(oldest))
        except Exception as exc:  # noqa: BLE001 — any failure fails open, by design
            log.error("Rate limiter unavailable, allowing request: %s", exc)
            sentry_sdk.capture_exception(exc)
            return RateLimitResult(allowed=True)
        wait_ms = oldest_ms + window_ms - now_ms
        return RateLimitResult(allowed=False, retry_after=max(1, math.ceil(wait_ms / 1000)))


def build_rate_limiter(settings: Settings) -> RateLimiter:
    if settings.upstash_redis_rest_url and settings.upstash_redis_rest_token:
        return UpstashRateLimiter(
            settings.upstash_redis_rest_url, settings.upstash_redis_rest_token.get_secret_value()
        )
    if os.environ.get("VERCEL"):
        # A deployment without Upstash takes unlimited enquiries, logins and views, and the
        # NullRateLimiter WARNING only shows on the first hit. ERROR so Sentry carries it.
        log.error(
            "UPSTASH_REDIS_REST_URL/TOKEN unset on a deployment: rate limiting is OFF for "
            "enquiries, sign-in and page views. Set both on this project."
        )
    return NullRateLimiter()
