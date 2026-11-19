"""v4: Tripsmith as a remote MCP server (docs/04-technical-design-v2-v3.md §v4.1).

The SDK's Streamable HTTP endpoint is added to the existing FastAPI app as one route, so it runs
in the same Vercel function behind the same middleware. Stateless with JSON responses: every tool
is request/response, so no session store and no server-to-client stream.

The SDK's session manager must run for the endpoint to work, and a sub-app's lifespan never runs,
so `app.main.lifespan` enters it (`app.state.mcp_session_manager`).

4.0.2: the tools come from `services/mcp/adapter.py` (over the chat's tool registry). Each call
gets its own database session that is never committed: MCP reads, it never writes.

4.0.4: each call is first counted against `mcp:{ip}` (60 an hour on the server-derived address).
The limiter fails **closed** here: a `degraded` result (Upstash down, or no Upstash on a
deployment) refuses the call, unlike the site. A served call then writes one `mcp_requests` row
(`services/mcp/log.py`); a refused one only reaches the function log, so a flood can't fill the
table.
"""

import datetime as dt
import json
import logging
import math
import time
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
from starlette.requests import Request

from app.config import Settings
from app.infra.client_ip import client_ip
from app.infra.db import DatabaseNotConfigured, session_factory
from app.infra.ratelimit import RateLimiter
from app.services.ai.tools import ToolContext
from app.services.analytics import ist_today
from app.services.enquiries import hash_ip
from app.services.mcp import adapter
from app.services.mcp import log as mcp_log

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
LIMITER_DOWN = "Tripsmith can't take requests right now. Try again shortly."
MCP_LIMIT = 60  # tool calls per address per hour (R36)
HOUR = 3600


def too_many(retry_after: int) -> str:
    minutes = max(1, math.ceil(retry_after / 60))
    unit = "minute" if minutes == 1 else "minutes"
    return (
        f"Too many requests to Tripsmith from this connection. Try again in {minutes} {unit}, "
        "or browse the site directly."
    )


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
        started = time.perf_counter()
        settings: Settings = self._app.state.settings
        request = _http_request(context)
        ip = client_ip(request) if request is not None else "unknown"
        refusal = await _refusal(self._app.state.rate_limiter, ip)
        if refusal is not None:
            log.warning("MCP %s refused for an address: %s", name, refusal)
            return _result({"error": refusal})

        try:
            sessions = self._sessions(settings)
        except DatabaseNotConfigured:
            log.error("MCP %s: DATABASE_URL is not set", name)
            return _result({"error": UNAVAILABLE})
        now = dt.datetime.now(dt.UTC)
        async with sessions() as db:  # never committed: MCP only reads
            ctx = ToolContext(db=db, today=ist_today(now), now=now)
            payload = await adapter.call(ctx, settings.site_url, name, arguments)

        client_name, client_version = _client_info(context)
        secret = settings.session_secret.get_secret_value() if settings.session_secret else None
        await mcp_log.record(
            sessions,
            method="tools/call",
            name=name,
            args=arguments,
            latency_ms=round((time.perf_counter() - started) * 1000),
            error=str(payload["error"]) if "error" in payload else None,
            ip_hash=hash_ip(ip, secret=secret),
            client_name=client_name,
            client_version=client_version,
            user_agent=request.headers.get("user-agent") if request is not None else None,
        )
        return _result(payload)

    def _sessions(self, settings: Settings) -> async_sessionmaker[AsyncSession]:
        """Tests point MCP at their database with `app.state.mcp_sessions` (MCP calls don't go
        through FastAPI's dependencies, so `get_session` overrides don't reach them)."""
        return getattr(self._app.state, "mcp_sessions", None) or session_factory(settings)


async def _refusal(limiter: RateLimiter, ip: str) -> str | None:
    """Why this call is refused, or None. Fails closed: no real limiter answer, no call."""
    hit = await limiter.hit(f"mcp:{ip}", limit=MCP_LIMIT, window_seconds=HOUR)
    if hit.degraded:
        return LIMITER_DOWN
    return None if hit.allowed else too_many(hit.retry_after)


def _http_request(context: Context[Any, Any] | None) -> Request | None:
    """The HTTP request this call came on (Streamable HTTP attaches it to the context)."""
    if context is None:
        return None
    try:
        request = context.request_context.request
    except ValueError:  # no request context (called outside a request)
        return None
    return request if isinstance(request, Request) else None


def _client_info(context: Context[Any, Any] | None) -> tuple[str | None, str | None]:
    """The client's name and version as it reported them (diagnostic only), if it did."""
    try:
        params = context.request_context.session.client_params if context else None
    except ValueError:
        return None, None
    if params is None:
        return None, None
    return params.client_info.name, params.client_info.version


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
