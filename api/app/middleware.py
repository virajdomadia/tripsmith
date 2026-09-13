"""Pure-ASGI middleware shared by every route.

- RequestIdMiddleware: honour a well-formed incoming `X-Request-Id`, else uuid4; echo it.
- BlankQueryParamsMiddleware: `?page=&q=` → params absent (docs/06 C0), so no-JS GET forms
  that submit empty selects validate as "not provided" rather than as bad input.
"""

import re
import uuid
from urllib.parse import parse_qsl, urlencode

from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID_HEADER = b"x-request-id"
# Bounded and log-safe: what we accept from a caller before it reaches logs and Sentry tags.
REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


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
