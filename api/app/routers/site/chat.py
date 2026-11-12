"""POST /chat — the AI concierge (v3 C1, 03 R26–R28, 06 C6).

Called by the browser on the api domain directly, not through the web's `/api` rewrite: the
rewrite hides the visitor's address from the per-IP limit and may buffer the stream. CORS for the
web origin only (`ChatCorsMiddleware`).
"""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.client_ip import client_ip
from app.infra.db import get_session
from app.schemas.chat import ChatLimitReason, ChatRequest
from app.services.ai.chat import open_turn, stream_turn
from app.services.ai.model import ChatModel

router = APIRouter(tags=["public"])


def chat_models(request: Request) -> list[ChatModel]:
    """Runs before the DB session opens: with no model key there is nothing to do."""
    models: list[ChatModel] | None = request.app.state.chat_models
    if not models:
        raise ApiError(
            "internal",
            "The concierge is off right now — the quick finder still works",
            reason=ChatLimitReason.AI_OFF,
            status=503,
        )
    return models


STREAM_DOC = """Server-sent events, each `event: <name>` + `data: <json>`:

- `text-delta` `{text}` — the next piece of the reply
- `tool-call` `{id, name, args}` — the concierge is looking something up
- `tool-result` `{id, name, result}` — cards to render (`result.packages`, `result.departures`)
- `done` `{conversationId, model, tokensIn, tokensOut}` — send `conversationId` next time
- `error` `{reason: busy | internal, message}` — the turn ended early

Refusals before the stream opens are the usual envelope: 429 with `reason` = `conversation_full`,
`ip_limit`, `daily_cap` or `monthly_cap`; 503 `ai_off`; 404 for an unknown conversation."""


@router.post(
    "/chat",
    operation_id="chat",
    description=STREAM_DOC,
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {"schema": {"type": "string"}}}}},
)
async def chat(
    payload: ChatRequest,
    request: Request,
    models: Annotated[list[ChatModel], Depends(chat_models)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> StreamingResponse:
    state = request.app.state
    now = dt.datetime.now(dt.UTC)
    conversation, history = await open_turn(
        db,
        payload,
        ip=client_ip(request),
        limiter=state.rate_limiter,
        settings=state.settings,
        now=now,
    )
    return StreamingResponse(
        stream_turn(db, models, conversation.id, history, now=now),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
            "X-Conversation-Id": conversation.id,
        },
    )
