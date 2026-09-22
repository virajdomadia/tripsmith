"""Pure-ASGI middleware shared by every route.

- RequestIdMiddleware: honour a well-formed incoming `X-Request-Id`, else uuid4; echo it.
- BlankQueryParamsMiddleware: `?page=&q=` → params absent (docs/06 C0), so no-JS GET forms
  that submit empty selects validate as "not provided" rather than as bad input.
- FreshQueryMiddleware: `?fresh=1` forces `Cache-Control: no-store` so the web's tag-revalidated
  reads skip the Vercel edge cache in front of this api (docs/06, cache-header convention).
"""

import re
import uuid
from urllib.parse import parse_qsl, urlencode

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.infra import observability

REQUEST_ID_HEADER = b"x-request-id"
# Bounded and log-safe: what we accept from a caller before it reaches logs and Sentry tags.
REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")

CACHE_CONTROL_HEADER = b"cache-control"
# Mirrored in web/src/lib/api.ts as a comment (Python and TS don't share constants).
FRESH_PARAM = "fresh"


class RequestIdMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = next((v for k, v in scope["headers"] if k == REQUEST_ID_HEADER), None)
        request_id = incoming.decode("latin-1") if incoming else ""
        if not REQUEST_ID_RE.match(request_id):
            request_id = str(uuid.uuid4())
        scope.setdefault("state", {})["request_id"] = request_id
        # Sentry's ASGI middleware wraps this one, so the tag lands on this request's scope.
        observability.tag_request(request_id)

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((REQUEST_ID_HEADER, request_id.encode("latin-1")))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_id)


class BlankQueryParamsMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope.get("query_string"):
            pairs = parse_qsl(scope["query_string"].decode("latin-1"), keep_blank_values=True)
            kept = [(k, v) for k, v in pairs if v != ""]
            if len(kept) != len(pairs):
                scope["query_string"] = urlencode(kept).encode("latin-1")
        await self.app(scope, receive, send)


class FreshQueryMiddleware:
    """GET/HEAD with `?fresh=1` in the query string get `Cache-Control: no-store` on the way
    out, overriding whatever the route set (`PUBLIC_CACHE_CONTROL` and friends). Vercel's edge
    cache is keyed by the full URL including the query, so this gives the web's tag-revalidated
    server reads (`web/src/lib/api.ts`) their own entry that is never stored — the on-demand
    revalidation `POST {WEB_URL}/revalidate` triggers is then visible in seconds, not up to the
    ~5.5 minutes `s-maxage=60` + `stale-while-revalidate=300` otherwise allows. Anyone can
    already bust the edge cache with any random query string, so this adds no new exposure.

    `fresh` is left in the query string rather than stripped from `scope["query_string"]`: none
    of the query models here (`SearchParams` included) set `extra="forbid"` on `ApiModel`, so
    pydantic ignores an unrecognised key instead of rejecting it — confirmed by calling
    `GET /packages?fresh=1` directly, which reaches the route rather than 400ing. If a future
    query model does set `extra="forbid"`, strip the pair here before calling `self.app`.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in ("GET", "HEAD"):
            await self.app(scope, receive, send)
            return

        pairs = parse_qsl(scope.get("query_string", b"").decode("latin-1"), keep_blank_values=True)
        if not any(k == FRESH_PARAM for k, _ in pairs):
            await self.app(scope, receive, send)
            return

        async def send_no_store(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers = [(k, v) for k, v in headers if k != CACHE_CONTROL_HEADER]
                headers.append((CACHE_CONTROL_HEADER, b"no-store"))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_no_store)
