"""Sliding-window limiter over Upstash REST; fails open; null when unconfigured (04 §rate limit)."""

import json
import logging

import httpx
import pytest

from app.infra.ratelimit import NullRateLimiter, UpstashRateLimiter, build_rate_limiter
from tests.settings import make_settings


def pipeline_transport(counts: list[int], *, status: int = 200) -> httpx.MockTransport:
    """Answers each /pipeline call with ZCARD = the next value in `counts`."""
    calls: list[list[list[str]]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(json.loads(request.content))
        if status != 200:
            return httpx.Response(status, text="boom")
        n = counts.pop(0)
        return httpx.Response(
            200, json=[{"result": 0}, {"result": 1}, {"result": n}, {"result": 1}]
        )

    transport = httpx.MockTransport(handler)
    transport.calls = calls  # type: ignore[attr-defined]
    return transport


async def test_upstash_allows_up_to_the_limit_then_blocks() -> None:
    transport = pipeline_transport([1, 5, 6])
    limiter = UpstashRateLimiter(
        "https://x.upstash.io", "tok", client=httpx.AsyncClient(transport=transport)
    )
    first = await limiter.hit("enquiry:1.2.3.4", limit=5, window_seconds=600)
    fifth = await limiter.hit("enquiry:1.2.3.4", limit=5, window_seconds=600)
    sixth = await limiter.hit("enquiry:1.2.3.4", limit=5, window_seconds=600)
    assert first.allowed and fifth.allowed and not sixth.allowed
    assert sixth.retry_after == 600
    commands = transport.calls[0]  # type: ignore[attr-defined]
    assert [c[0] for c in commands] == ["ZREMRANGEBYSCORE", "ZADD", "ZCARD", "PEXPIRE"]
    assert commands[1][1] == "enquiry:1.2.3.4" and commands[3][2] == "600000"


async def test_upstash_sends_the_bearer_token() -> None:
    seen: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("authorization"))
        return httpx.Response(
            200, json=[{"result": 0}, {"result": 1}, {"result": 1}, {"result": 1}]
        )

    limiter = UpstashRateLimiter(
        "https://x.upstash.io/",
        "tok",
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    await limiter.hit("k", limit=1, window_seconds=1)
    assert seen == ["Bearer tok"]


async def test_upstash_fails_open_on_errors(caplog: pytest.LogCaptureFixture) -> None:
    limiter = UpstashRateLimiter(
        "https://x.upstash.io",
        "tok",
        client=httpx.AsyncClient(transport=pipeline_transport([], status=500)),
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
