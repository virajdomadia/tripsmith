"""v4: Tripsmith as a remote MCP server (docs/04-technical-design-v2-v3.md §v4.1).

The SDK's Streamable HTTP endpoint is added to the existing FastAPI app as one route, so it runs
in the same Vercel function behind the same middleware. Stateless with JSON responses: every tool
is request/response, so no session store and no server-to-client stream.

The SDK's session manager must run for the endpoint to work, and a sub-app's lifespan never runs,
so `app.main.lifespan` enters it (`app.state.mcp_session_manager`).
"""

from collections.abc import Mapping

from fastapi import FastAPI
from mcp.server import MCPServer
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings

from app.config import Settings

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


def build_server(settings: Settings) -> MCPServer:
    return MCPServer(name=SERVER_NAME, version=_version())


def mount(
    app: FastAPI, settings: Settings, environ: Mapping[str, str]
) -> StreamableHTTPSessionManager:
    """Add POST/GET/DELETE /mcp to `app`; return the session manager the lifespan must run."""
    server = build_server(settings)
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
