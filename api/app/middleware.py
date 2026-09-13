"""Pure-ASGI request-id middleware: honour incoming `X-Request-Id`, else uuid4; echo it."""

import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

HEADER = b"x-request-id"


class RequestIdMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = next((v for k, v in scope["headers"] if k == HEADER), None)
        request_id = incoming.decode("latin-1") if incoming else str(uuid.uuid4())
        scope.setdefault("state", {})["request_id"] = request_id

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((HEADER, request_id.encode("latin-1")))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_id)
