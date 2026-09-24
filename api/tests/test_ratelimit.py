"""Sliding-window limiter over Upstash REST; fails open; null when unconfigured (04 §rate limit)."""

import json
import logging

import httpx
import pytest

from app.infra.ratelimit import (
    SLIDING_WINDOW_LUA,
    NullRateLimiter,
    UpstashRateLimiter,
    build_rate_limiter,
)
from tests.settings import make_settings


def eval_transport(results: list[list[object]], *, status: int = 200) -> httpx.MockTransport:
    """Answers each /pipeline call with the next script result (`[allowed, oldest score]`)."""
    calls: list[list[list[str]]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(json.loads(request.content))
        if status != 200:
            return httpx.Response(status, text="boom")
        return httpx.Response(200, json=[{"result": results.pop(0)}])

    transport = httpx.MockTransport(handler)
    transport.calls = calls  # type: ignore[attr-defined]
    return transport


async def test_upstash_allows_under_the_limit_in_one_atomic_script() -> None:
    transport = eval_transport([[1, ""]])
    limiter = UpstashRateLimiter(
        "https://x.upstash.io", "tok", client=httpx.AsyncClient(transport=transport)
    )
    result = await limiter.hit("enquiry:1.2.3.4", limit=5, window_seconds=600)
    assert result.allowed and result.retry_after == 0
    [command] = transport.calls[0]  # type: ignore[attr-defined]
    assert command[0] == "EVAL" and command[2:4] == ["1", "enquiry:1.2.3.4"]
    now_ms, cutoff_ms, limit, _member, window_ms = command[4:]
    assert int(now_ms) - int(cutoff_ms) == 600_000 and limit == "5" and window_ms == "600000"


def test_the_script_records_only_allowed_hits() -> None:
    # The ZADD sits behind the limit check: a rejected retry must not refill its own window.
    script = SLIDING_WINDOW_LUA
    assert script.index("ZCARD") < script.index("ZADD") < script.index("end")


async def test_upstash_retry_after_is_when_the_oldest_hit_leaves_the_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = 1_800_000_000.0
    monkeypatch.setattr("app.infra.ratelimit.time.time", lambda: now)
    oldest_ms = int(now * 1000) - 590_500  # 9.5 s before it expires out of a 600 s window
    limiter = UpstashRateLimiter(
        "https://x.upstash.io",
        "tok",
        client=httpx.AsyncClient(transport=eval_transport([[0, str(oldest_ms)]])),
    )
    blocked = await limiter.hit("enquiry:1.2.3.4", limit=5, window_seconds=600)
    assert not blocked.allowed and blocked.retry_after == 10


async def test_upstash_retry_after_is_at_least_a_second(monkeypatch: pytest.MonkeyPatch) -> None:
    now = 1_800_000_000.0
    monkeypatch.setattr("app.infra.ratelimit.time.time", lambda: now)
    limiter = UpstashRateLimiter(
        "https://x.upstash.io",
        "tok",
        client=httpx.AsyncClient(transport=eval_transport([[0, str(int(now * 1000) - 600_000)]])),
    )
    assert (await limiter.hit("k", limit=1, window_seconds=600)).retry_after == 1


async def test_upstash_sends_the_bearer_token() -> None:
    seen: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("authorization"))
        return httpx.Response(200, json=[{"result": [1, ""]}])

    limiter = UpstashRateLimiter(
        "https://x.upstash.io/",
        "tok",
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    await limiter.hit("k", limit=1, window_seconds=1)
    assert seen == ["Bearer tok"]


async def test_upstash_fails_open_on_a_script_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"error": "ERR unknown command"}])

    limiter = UpstashRateLimiter(
        "https://x.upstash.io",
        "tok",
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    assert (await limiter.hit("k", limit=1, window_seconds=1)).allowed


async def test_upstash_fails_open_on_errors(caplog: pytest.LogCaptureFixture) -> None:
    limiter = UpstashRateLimiter(
        "https://x.upstash.io",
        "tok",
        client=httpx.AsyncClient(transport=eval_transport([], status=500)),
    )
    with caplog.at_level(logging.ERROR):
        result = await limiter.hit("k", limit=1, window_seconds=1)
    assert result.allowed
    assert "rate limiter" in caplog.text.lower()


async def test_null_limiter_always_allows() -> None:
    r = await NullRateLimiter().hit("k", limit=1, window_seconds=1)
    assert r.allowed and r.retry_after == 0


def test_build_picks_upstash_only_when_both_values_are_set() -> None:
    assert isinstance(build_rate_limiter(make_settings()), NullRateLimiter)
    assert isinstance(
        build_rate_limiter(
            make_settings(
                upstash_redis_rest_url="https://x.upstash.io", upstash_redis_rest_token="t"
            )
        ),
        UpstashRateLimiter,
    )


def test_build_logs_an_error_on_vercel_without_upstash(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("VERCEL", "1")
    with caplog.at_level(logging.ERROR, logger="app.infra.ratelimit"):
        build_rate_limiter(make_settings())
    assert "rate limiting is OFF" in caplog.text


def test_build_stays_quiet_locally_without_upstash(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.delenv("VERCEL", raising=False)
    with caplog.at_level(logging.ERROR, logger="app.infra.ratelimit"):
        build_rate_limiter(make_settings())
    assert caplog.text == ""
