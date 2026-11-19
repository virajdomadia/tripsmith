"""v4 4.0.1: the MCP server mounted at /mcp (docs/04-technical-design-v2-v3.md §v4.1).

The app is booted through its own lifespan, because a mounted MCP app's lifespan never runs: the
SDK's session manager has to be entered by FastAPI's. A real MCP client then talks to it over
Streamable HTTP, once with the legacy `initialize` handshake and once with the 2026-07-28 flow.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx2
import pytest
from fastapi import FastAPI
from mcp.client import Client
from mcp.client.streamable_http import streamable_http_client

from app.main import create_app
from app.services.mcp.server import allowed_hosts, allowed_origins
from tests.settings import make_settings

HOST = "tripsmith-api.test"
BASE = f"https://{HOST}"


def mcp_app() -> FastAPI:
    return create_app(settings=make_settings(mcp_hosts=HOST))


@asynccontextmanager
async def booted(app: FastAPI) -> AsyncIterator[httpx2.AsyncClient]:
    """Run the app's lifespan (as Vercel's runtime does) and hand back an in-process client."""
    async with app.router.lifespan_context(app):
        transport = httpx2.ASGITransport(app=app)
        async with httpx2.AsyncClient(transport=transport, base_url=BASE) as http:
            yield http


@pytest.mark.parametrize("mode", ["legacy", "auto"])
async def test_a_client_reaches_the_server_through_the_app_lifespan(mode: str) -> None:
    app = mcp_app()
    async with booted(app) as http:
        transport = streamable_http_client(f"{BASE}/mcp", http_client=http)
        async with Client(transport, mode=mode) as client:
            tools = await client.list_tools()
            assert client.server_info is not None
            assert client.server_info.name == "tripsmith"
    assert tools.tools == []  # 4.0.1 mounts the server; the tools arrive in 4.0.2


async def test_an_unlisted_origin_is_refused() -> None:
    app = mcp_app()
    async with booted(app) as http:
        r = await http.post(
            "/mcp",
            headers={
                "content-type": "application/json",
                "accept": "application/json, text/event-stream",
                "origin": "https://evil.example",
            },
            json={"jsonrpc": "2.0", "id": 1, "method": "ping"},
        )
    assert r.status_code == 403


async def test_an_unlisted_host_is_refused() -> None:
    app = mcp_app()
    async with booted(app) as http:
        r = await http.post(
            "/mcp",
            headers={
                "host": "attacker.example",
                "content-type": "application/json",
                "accept": "application/json, text/event-stream",
            },
            json={"jsonrpc": "2.0", "id": 1, "method": "ping"},
        )
    assert r.status_code == 421


def test_on_vercel_the_hosts_are_the_deployment_hosts_and_never_localhost() -> None:
    environ = {
        "VERCEL": "1",
        "VERCEL_PROJECT_PRODUCTION_URL": "tripsmith-api.virajdomadia.com",
        "VERCEL_URL": "tripsmith-api-abc123.vercel.app",
        "VERCEL_BRANCH_URL": "tripsmith-api-git-main.vercel.app",
    }
    hosts = allowed_hosts(make_settings(mcp_hosts="extra.example, "), environ)
    assert sorted(hosts) == [
        "extra.example",
        "tripsmith-api-abc123.vercel.app",
        "tripsmith-api-git-main.vercel.app",
        "tripsmith-api.virajdomadia.com",
    ]
    assert allowed_origins(environ) == []  # server-to-server clients send no Origin


def test_off_vercel_localhost_is_allowed_for_the_inspector() -> None:
    hosts = allowed_hosts(make_settings(), {})
    assert "localhost:*" in hosts and "127.0.0.1:*" in hosts
    assert "http://localhost:*" in allowed_origins({})
