"""v4 4.0.4: MCP's per-IP limit, its outage policy and the `mcp_requests` log
(03-requirements-v4 R36; docs/04-technical-design-v2-v3.md §v4.4).

- `mcp:{ip}` allows 60 tool calls an hour on the server-derived address (`infra/client_ip`).
- The limiter **fails closed** for MCP: Upstash unreachable, or a deployment with no Upstash at
  all, refuses calls with a "try again shortly" tool error. The site's limiters still fail open.
- Every served call writes one `mcp_requests` row with its args redacted. A refused call writes
  none (the function log has it), so a flood can't fill the table.
"""

import httpx
import pytest
from fastapi import FastAPI
from mcp.client import Client
from mcp.client.streamable_http import streamable_http_client
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.infra.ratelimit import (
    NullRateLimiter,
    RateLimitResult,
    UpstashRateLimiter,
    build_rate_limiter,
)
from app.models import McpRequest
from app.services.enquiries import hash_ip
from app.services.mcp.log import MAX_TEXT, clean_args
from app.services.mcp.server import HOUR, MCP_LIMIT
from scripts.seed import seed
from tests.settings import fixture_content, make_settings
from tests.test_catalog import RecordingStore
from tests.test_mcp_server import BASE, booted, mcp_app

IP = "203.0.113.9"
AGENT = "tripsmith-tests/1.0"


class WindowLimiter:
    """Counts hits per key against the limit the caller passes, as the real limiter does."""

    def __init__(self) -> None:
        self.hits: list[tuple[str, int, int]] = []

    async def hit(self, key: str, *, limit: int, window_seconds: int) -> RateLimitResult:
        self.hits.append((key, limit, window_seconds))
        n = sum(1 for k, _, _ in self.hits if k == key)
        return RateLimitResult(allowed=n <= limit, retry_after=0 if n <= limit else 1800)


def down_upstash() -> UpstashRateLimiter:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("upstash is down", request=request)

    return UpstashRateLimiter(
        "https://upstash.invalid",
        "token",
        client=httpx.AsyncClient(transport=httpx.MockTransport(down)),
    )


def client_for(http: object) -> Client:
    http.headers.update({"x-forwarded-for": IP, "user-agent": AGENT})  # type: ignore[attr-defined]
    return Client(streamable_http_client(f"{BASE}/mcp", http_client=http))  # type: ignore[arg-type]


def text_of(result: object) -> str:
    return result.content[0].text  # type: ignore[attr-defined]


# --- the limit ------------------------------------------------------------------------------------


async def test_the_61st_call_in_an_hour_is_refused_with_a_clear_tool_error() -> None:
    app = mcp_app()
    app.state.rate_limiter = limiter = WindowLimiter()
    async with booted(app) as http, client_for(http) as client:
        for _ in range(MCP_LIMIT):
            served = await client.call_tool("searchPackages", {"destination": "Goa"})
            assert "unavailable" in text_of(served).lower()  # served (no database here)
        refused = await client.call_tool("searchPackages", {"destination": "Goa"})
    assert refused.is_error
    assert "too many" in text_of(refused).lower()
    assert "30 minutes" in text_of(refused)  # retry_after 1800 s, in words
    # One key per server-derived address, 60 an hour.
    assert set(limiter.hits) == {(f"mcp:{IP}", 60, HOUR)}
    assert (MCP_LIMIT, HOUR) == (60, 3600)


async def test_listing_the_tools_is_not_counted() -> None:
    app = mcp_app()
    app.state.rate_limiter = limiter = WindowLimiter()
    async with booted(app) as http, client_for(http) as client:
        await client.list_tools()
    assert limiter.hits == []


# --- fails closed ---------------------------------------------------------------------------------


async def test_an_unreachable_upstash_is_reported_as_degraded_but_still_allows_the_site() -> None:
    result = await down_upstash().hit("enquiry:1.2.3.4", limit=5, window_seconds=600)
    assert result.allowed  # the site fails open, as before
    assert result.degraded


async def test_with_upstash_down_mcp_calls_are_refused_not_unlimited() -> None:
    app = mcp_app()
    app.state.rate_limiter = down_upstash()
    async with booted(app) as http, client_for(http) as client:
        result = await client.call_tool("searchPackages", {"destination": "Goa"})
    assert result.is_error
    assert "try again shortly" in text_of(result).lower()
    assert "unavailable" not in text_of(result).lower()  # refused before the catalogue


async def test_a_deployment_without_upstash_is_degraded_and_dev_is_not(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = make_settings()  # no Upstash

    async def hit() -> RateLimitResult:
        limiter = build_rate_limiter(settings)
        assert isinstance(limiter, NullRateLimiter)
        return await limiter.hit("mcp:1.2.3.4", limit=60, window_seconds=3600)

    monkeypatch.delenv("VERCEL", raising=False)
    dev = await hit()
    assert dev.allowed and not dev.degraded  # local MCP works without Upstash
    monkeypatch.setenv("VERCEL", "1")
    deployed = await hit()
    assert deployed.allowed and deployed.degraded  # the site still serves; MCP refuses


async def test_a_degraded_null_limiter_refuses_mcp() -> None:
    app = mcp_app()
    app.state.rate_limiter = NullRateLimiter(degraded=True)
    async with booted(app) as http, client_for(http) as client:
        result = await client.call_tool("checkAvailability", {"packageSlug": "x"})
    assert result.is_error
    assert "try again shortly" in text_of(result).lower()


# --- what is stored -------------------------------------------------------------------------------


def test_stored_args_have_contact_details_removed_and_are_bounded() -> None:
    args = {
        "summary": "Call me on +91 98450 22110 or mail priya@example.com about Goa",
        "adults": 2,
        "nested": {"note": ["write to a@b.io"]},
        "long": "x" * 5000,
        **{f"k{i}": i for i in range(40)},
    }
    cleaned = clean_args(args)
    text = str(cleaned)
    assert "98450" not in text and "@" not in text
    assert "[phone removed]" in cleaned["summary"] and "[email removed]" in cleaned["summary"]
    assert cleaned["adults"] == 2
    assert cleaned["nested"] == {"note": ["write to [email removed]"]}
    assert len(cleaned["long"]) == MAX_TEXT
    assert len(cleaned) <= 20


@pytest.fixture
async def catalog(db: AsyncSession) -> None:
    await seed(db, fixture_content(), RecordingStore(), make_settings())


@pytest.fixture
def logged_app(db_engine: AsyncEngine) -> FastAPI:
    app = mcp_app()
    app.state.mcp_sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    app.state.settings = app.state.settings.model_copy(update={"site_url": "https://ts.example"})
    app.state.rate_limiter = WindowLimiter()
    return app


async def rows(db: AsyncSession) -> list[McpRequest]:
    return list((await db.execute(select(McpRequest).order_by(McpRequest.created_at))).scalars())


@pytest.mark.db
async def test_every_served_call_writes_one_sanitised_row(
    catalog: None, db: AsyncSession, logged_app: FastAPI
) -> None:
    async with booted(logged_app) as http, client_for(http) as client:
        await client.call_tool("searchPackages", {"destination": "Goa"})
        await client.call_tool(
            "startEnquiry",
            {
                "summary": "Two adults, call 9845022110 or p@x.io",
                "packageSlug": "north-goa-beaches",
            },
        )
        await client.call_tool("startBooking", {"departureId": "x", "adults": 0})  # a tool error

    search, enquiry, bad = await rows(db)
    assert [r.name for r in (search, enquiry, bad)] == [
        "searchPackages",
        "startEnquiry",
        "startBooking",
    ]
    assert {r.method for r in (search, enquiry, bad)} == {"tools/call"}
    assert search.ok and search.error is None and search.args == {"destination": "Goa"}
    assert enquiry.ok
    assert "9845022110" not in str(enquiry.args) and "p@x.io" not in str(enquiry.args)
    assert "[phone removed]" in enquiry.args["summary"]
    assert not bad.ok and "Invalid arguments" in (bad.error or "")
    for row in (search, enquiry, bad):
        assert row.ip_hash == hash_ip(IP, secret=None)  # keyed digest, never the address
        assert IP not in str(row.args)
        assert row.user_agent == AGENT
        assert row.latency_ms >= 0


@pytest.mark.db
async def test_a_refused_call_writes_no_row(
    catalog: None, db: AsyncSession, logged_app: FastAPI
) -> None:
    logged_app.state.rate_limiter = down_upstash()
    async with booted(logged_app) as http, client_for(http) as client:
        result = await client.call_tool("searchPackages", {"destination": "Goa"})
    assert result.is_error
    assert await rows(db) == []
