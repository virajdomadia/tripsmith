"""Pure-ASGI middleware shared by every route.

- RequestIdMiddleware: honour a well-formed incoming `X-Request-Id`, else uuid4; echo it.
- BlankQueryParamsMiddleware: `?page=&q=` → params absent (docs/06 C0), so no-JS GET forms
  that submit empty selects validate as "not provided" rather than as bad input.
- FreshQueryMiddleware: `?fresh=1` forces `Cache-Control: no-store` so the web's tag-revalidated
  reads skip the Vercel edge cache in front of this api (docs/06, cache-header convention).
- SecurityHeadersMiddleware: the defence-in-depth headers (H4, docs/12).
- HeadAsGetMiddleware: `HEAD` is answered as the `GET` it mirrors, minus the body (RFC 9110
  §9.3.2) — FastAPI routes declare GET only, so uptime monitors' `HEAD /health` was a 404.
  It wraps the finished app (main.py `TripsmithApi`), not the `add_middleware` list.
"""

import re
import uuid
from urllib.parse import parse_qsl, urlencode

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.infra import observability

REQUEST_ID_HEADER = b"x-request-id"
# Bounded and log-safe: what we accept from a caller before it reaches logs and Sentry tags.
REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")

HEAD_STATE_KEY = "head"  # `request.state.head`, set by HeadAsGetMiddleware

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


class HeadAsGetMiddleware:
    """Route a `HEAD` as `GET` and drop every body chunk on the way out. The headers — including
    the GET's `Content-Length` — pass through untouched, which is exactly what HEAD promises.
    A path with no GET still ends in the 405 → `not_found` envelope, headers only.

    `request.state.head` is True for the rewritten request: a route whose GET is expensive (the
    itinerary PDF renders and uploads) answers from what it already has instead.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != "HEAD":
            await self.app(scope, receive, send)
            return

        async def send_without_body(message: Message) -> None:
            if message["type"] == "http.response.body":
                message = {**message, "body": b""}
            await send(message)

        state = scope.setdefault("state", {})
        state[HEAD_STATE_KEY] = True
        await self.app({**scope, "method": "GET"}, receive, send_without_body)


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


# --- Security headers (H4) -------------------------------------------------------------------
#
# The api is reachable on its own origin as well as through the web's `/api/:path*` rewrite, so
# it sets these itself rather than inheriting the web's. HSTS is deliberately absent: Vercel
# already sends `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` on
# every response from both projects (verified on production in H4) and a second copy from here
# would be a duplicate header, not a stronger one. Recorded in docs/12.

# JSON, PDFs, redirects: nothing here is a document that may load anything.
JSON_CSP = b"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
# `/docs` is the one HTML response: FastAPI's Swagger UI pulls its bundle and stylesheet from
# jsdelivr, its favicon from fastapi.tiangolo.com, and boots from an inline <script>. The JSON
# policy above would render a blank page, so the docs page gets its own — still framed by no one.
DOCS_CSP = (
    b"default-src 'self'; "
    b"script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    b"style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    b"img-src 'self' data: https://fastapi.tiangolo.com; "
    b"font-src 'self' data:; "
    b"connect-src 'self'; "
    b"frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)
# `/docs` plus the OAuth2 redirect helper FastAPI mounts beside it — also HTML, also booting from
# an inline script. It is unreachable while the api declares no OAuth2 scheme, but the day one is
# added the JSON policy would blank it. `/openapi.json` is not here on purpose: Swagger fetches it
# under the docs page's own `connect-src 'self'`, and the file itself is JSON.
DOCS_PATHS = ("/docs", "/docs/oauth2-redirect")

SECURITY_HEADERS: tuple[tuple[bytes, bytes], ...] = (
    (b"x-content-type-options", b"nosniff"),
    # The api is called by the web's server-side fetch and by the browser through the rewrite;
    # neither needs a referrer, and enquiry/admin URLs should not leak into anyone's logs.
    (b"referrer-policy", b"no-referrer"),
    (b"x-frame-options", b"DENY"),  # for browsers older than `frame-ancestors`
    # Same list as web/next.config.ts, minus nothing: kept in step so the two origins answer
    # alike. `interest-cohort` is left out — FLoC is gone and browsers log it as unrecognized.
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=(), usb=()"),
    (b"cross-origin-opener-policy", b"same-origin"),
)


def security_headers(path: str = "") -> dict[str, str]:
    """The same headers as text, for a response built outside this middleware.

    Starlette's `ServerErrorMiddleware` — which renders the unhandled-exception envelope — sits
    *outside* every user middleware, so a 500 never passes through the class below.
    `app.errors.envelope` merges this in instead; the middleware then leaves those keys alone.
    """
    csp = DOCS_CSP if path in DOCS_PATHS else JSON_CSP
    out = {k.decode(): v.decode() for k, v in SECURITY_HEADERS}
    out["content-security-policy"] = csp.decode()
    return out


class SecurityHeadersMiddleware:
    """Adds the headers above to every response the middleware stack can reach.

    Pure-ASGI like its neighbours, and header-by-header: the error handlers build their own
    `JSONResponse` (already carrying `security_headers()`), and a key that is already present is
    never doubled.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        csp = DOCS_CSP if scope.get("path", "") in DOCS_PATHS else JSON_CSP

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                present = {k.lower() for k, _ in headers}
                for key, value in (*SECURITY_HEADERS, (b"content-security-policy", csp)):
                    if key not in present:
                        headers.append((key, value))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)
