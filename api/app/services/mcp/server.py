"""v4: Tripsmith as a remote MCP server (docs/04-technical-design-v2-v3.md §v4.1).

The SDK's Streamable HTTP endpoint is added to the existing FastAPI app as one route, so it runs
in the same Vercel function behind the same middleware. Stateless with JSON responses: every tool
is request/response, so no session store and no server-to-client stream.

The SDK's session manager must run for the endpoint to work, and a sub-app's lifespan never runs,
so `app.main.lifespan` enters it (`app.state.mcp_session_manager`).

4.0.2: the tools come from `services/mcp/adapter.py` (over the chat's tool registry). Each call
gets its own database session that is never committed: MCP reads, it never writes.
"""

import datetime as dt
import json
import logging
from collections.abc import Mapping
from typing import Any

from fastapi import FastAPI
from mcp.server import MCPServer
from mcp.server.mcpserver import Context
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import CallToolResult, TextContent
from mcp.types import Tool as MCPTool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.infra.db import DatabaseNotConfigured, session_factory
from app.services.ai.tools import ToolContext
from app.services.analytics import ist_today
from app.services.mcp import adapter

log = logging.getLogger(__name__)

SERVER_NAME = "tripsmith"
PATH = "/mcp"

# Vercel's system variables (set on every deployment): the production domain (the shortest
# custom one), this deployment's own URL and the branch alias. Hosts only, no scheme.
_VERCEL_HOST_VARS = ("VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "VERCEL_BRANCH_URL")
_LOCAL_HOSTS = ["127.0.0.1:*", "localhost:*", "[::1]:*"]
_LOCAL_ORIGINS = ["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*"]


def allowed_hosts(settings: Settings, environ: Mapping[str, str]) -> list[str]:
    """Host headers /mcp answers (anything else gets 421; DNS-rebinding protection).

    On Vercel: the deployment's own hosts plus `MCP_HOSTS`, never localhost. Off Vercel: localhost
    on any port too, for the MCP Inspector and local clients.
    """
    hosts = {h.strip() for h in settings.mcp_hosts.split(",") if h.strip()}
    if environ.get("VERCEL"):
        hosts |= {environ[v] for v in _VERCEL_HOST_VARS if environ.get(v)}
    else:
        hosts |= set(_LOCAL_HOSTS)
    return sorted(hosts)


def allowed_origins(environ: Mapping[str, str]) -> list[str]:
    """Origin headers /mcp accepts. A request without one (server-to-server clients such as
    Claude's connectors) always passes; a browser page on another origin gets 403. Off Vercel,
    localhost pages (the Inspector) are allowed."""
    return [] if environ.get("VERCEL") else list(_LOCAL_ORIGINS)


UNAVAILABLE = "Tripsmith's catalogue is unavailable right now. Try again shortly."


class TripsmithServer(MCPServer):
    """The SDK server with Tripsmith's four tools, served from `adapter` rather than registered
    one by one, so their schemas are the chat's and every call goes through `run_tool`."""

    def __init__(self, app: FastAPI) -> None:
        super().__init__(name=SERVER_NAME, version=_version())
        self._app = app

    async def list_tools(self) -> list[MCPTool]:
        return [
            MCPTool(name=t.name, description=t.description, input_schema=t.input_schema)
            for t in adapter.tool_list()
        ]

    async def call_tool(
        self, name: str, arguments: dict[str, Any], context: Context[Any, Any] | None = None
    ) -> CallToolResult:
        settings: Settings = self._app.state.settings
        now = dt.datetime.now(dt.UTC)
        try:
            sessions = self._sessions(settings)
        except DatabaseNotConfigured:
            log.error("MCP %s: DATABASE_URL is not set", name)
            return _result({"error": UNAVAILABLE})
        async with sessions() as db:  # never committed: MCP only reads
            ctx = ToolContext(db=db, today=ist_today(now), now=now)
            return _result(await adapter.call(ctx, settings.site_url, name, arguments))

    def _sessions(self, settings: Settings) -> async_sessionmaker[AsyncSession]:
        """Tests point MCP at their database with `app.state.mcp_sessions` (MCP calls don't go
        through FastAPI's dependencies, so `get_session` overrides don't reach them)."""
        return getattr(self._app.state, "mcp_sessions", None) or session_factory(settings)


def _result(payload: dict[str, Any]) -> CallToolResult:
    """A tool result as text (for any client) and structured content; `error` → isError."""
    return CallToolResult(
        content=[TextContent(type="text", text=json.dumps(payload, ensure_ascii=False))],
        structured_content=payload,
        is_error="error" in payload,
    )


def mount(
    app: FastAPI, settings: Settings, environ: Mapping[str, str]
) -> StreamableHTTPSessionManager:
    """Add POST/GET/DELETE /mcp to `app`; return the session manager the lifespan must run."""
    server = TripsmithServer(app)
    sub = server.streamable_http_app(
        streamable_http_path=PATH,
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=allowed_hosts(settings, environ),
            allowed_origins=allowed_origins(environ),
        ),
    )
    # Without auth the SDK app is exactly one route; take it, not a Mount (no /mcp/ redirect).
    app.router.routes.extend(sub.routes)
    return server.session_manager


def _version() -> str:
    from importlib.metadata import PackageNotFoundError, version

    try:
        return version("tripsmith-api")
    except PackageNotFoundError:  # running from a source tree that was never installed
        return "0.0.0"
