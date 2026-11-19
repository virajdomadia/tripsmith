"""v4 4.0.5: the `plan-a-trip` prompt (03-requirements-v4 R35; 06 MCP surface).

One guided planning message for the customer's own assistant: what they know so far (all
optional), then how to use the four tools. Arguments are strings (MCP prompts take strings),
bounded, with contact details redacted. Unknown arguments are refused, like the tools'
`extra="forbid"`. `prompts/get` counts against the same `mcp:{ip}` limit and is logged.
"""

import pytest
from fastapi import FastAPI
from mcp.client import Client
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.exceptions import MCPError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.infra.db import DatabaseNotConfigured, session_factory
from app.models import McpRequest
from app.services.mcp.prompts import MAX_ARG, PLAN_A_TRIP, render
from tests.settings import make_settings
from tests.test_mcp_limits import IP, WindowLimiter, down_upstash
from tests.test_mcp_server import BASE, booted, mcp_app

TOOLS = ("searchPackages", "checkAvailability", "startBooking", "startEnquiry")


def client_for(http: object, mode: str = "auto") -> Client:
    http.headers.update({"x-forwarded-for": IP})  # type: ignore[attr-defined]
    return Client(streamable_http_client(f"{BASE}/mcp", http_client=http), mode=mode)  # type: ignore[arg-type]


@pytest.mark.parametrize("mode", ["legacy", "auto"])
async def test_a_client_lists_and_gets_the_prompt(mode: str) -> None:
    async with booted(mcp_app()) as http, client_for(http, mode) as client:
        listed = (await client.list_prompts()).prompts
        got = await client.get_prompt(PLAN_A_TRIP, {"destination": "Goa", "party": "2 adults"})
    assert [p.name for p in listed] == [PLAN_A_TRIP]
    assert {a.name: a.required for a in listed[0].arguments or []} == {
        "destination": False,
        "month": False,
        "budget": False,
        "party": False,
    }
    assert len(got.messages) == 1 and got.messages[0].role == "user"
    text = got.messages[0].content.text  # type: ignore[union-attr]
    assert "Goa" in text and "2 adults" in text


def test_the_message_walks_through_the_four_tools_and_keeps_contacts_out() -> None:
    text = render({})
    for tool in TOOLS:
        assert tool in text
    assert "name, phone or email" in text  # the assistant is told not to ask for them
    assert "What I know so far" not in text  # nothing given, no empty list


def test_what_the_customer_knows_is_listed_bounded_and_redacted() -> None:
    text = render(
        {
            "destination": "  Goa ",
            "month": "December 2026",
            "budget": "₹40,000 each",
            "party": "2 adults, call 9845022110",
        }
    )
    assert "Goa" in text and "December 2026" in text and "₹40,000 each" in text
    assert "9845022110" not in text and "[phone removed]" in text
    long = render({"destination": "x" * 5000})
    assert "x" * MAX_ARG in long and "x" * (MAX_ARG + 1) not in long


def test_an_unknown_argument_or_prompt_is_refused() -> None:
    with pytest.raises(MCPError, match="Unknown argument"):
        render({"email": "a@b.io"})


async def test_an_unknown_prompt_is_an_error() -> None:
    async with booted(mcp_app()) as http, client_for(http) as client:
        with pytest.raises(MCPError, match="no prompt"):
            await client.get_prompt("book-everything", {})


async def test_the_prompt_counts_against_the_limit_and_fails_closed() -> None:
    app = mcp_app()
    app.state.rate_limiter = limiter = WindowLimiter()
    async with booted(app) as http, client_for(http) as client:
        await client.list_prompts()  # free, like tools/list
        await client.get_prompt(PLAN_A_TRIP, {})
    assert [k for k, _, _ in limiter.hits] == [f"mcp:{IP}"]

    app = mcp_app()
    app.state.rate_limiter = down_upstash()
    async with booted(app) as http, client_for(http) as client:
        with pytest.raises(MCPError, match="(?i)try again shortly"):
            await client.get_prompt(PLAN_A_TRIP, {})


@pytest.mark.db
async def test_a_prompt_get_is_logged(db: AsyncSession, db_engine: AsyncEngine) -> None:
    app: FastAPI = mcp_app()
    app.state.mcp_sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    app.state.rate_limiter = WindowLimiter()
    async with booted(app) as http, client_for(http) as client:
        await client.get_prompt(PLAN_A_TRIP, {"party": "2 adults, p@x.io"})
    (row,) = (await db.execute(select(McpRequest))).scalars()
    assert (row.method, row.name, row.ok) == ("prompts/get", PLAN_A_TRIP, True)
    assert row.args == {"party": "2 adults, [email removed]"}


@pytest.mark.parametrize("url", [None, "", "   "])
def test_an_unset_or_empty_database_url_is_not_configured(url: str | None) -> None:
    """An empty `DATABASE_URL=` (found by the smoke test) is "not set", not a SQLAlchemy parse
    error, so the prompt still works and tools say the catalogue is unavailable."""
    with pytest.raises(DatabaseNotConfigured):
        session_factory(make_settings(database_url=url))
