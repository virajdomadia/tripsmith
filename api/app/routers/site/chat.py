"""POST /chat — the AI concierge (v3 C1, 03 R26–R28, 06 C6).

Called by the browser on the api domain directly, not through the web's `/api` rewrite: the
rewrite hides the visitor's address from the per-IP limit and may buffer the stream. CORS for the
web origin only (`ChatCorsMiddleware`).
"""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.cache import NO_STORE
from app.infra.client_ip import client_ip
from app.infra.db import get_session
from app.models import Conversation
from app.models.enums import ConversationOutcome
from app.schemas.chat import ChatBooking, ChatBookingRequest, ChatLimitReason, ChatRequest
from app.services.ai.chat import open_turn, stream_turn
from app.services.ai.handoff import start_booking
from app.services.ai.model import ChatModel
from app.services.ai.outcome import set_outcome

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
- `replace` `{text}` — the guardrail stopped the reply: drop the text shown so far for this turn
  and show `text` instead (cards stay); a forced search's `tool-call`/`tool-result` may follow
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


@router.post(
    "/chat/booking",
    operation_id="chatBooking",
    response_model_by_alias=True,
    responses={404: {"description": "Unknown conversation, or the trip is gone"}},
)
async def chat_booking(
    payload: ChatBookingRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> ChatBooking:
    """A "Book" button on a chat's departure list (C3): checks the date for the party, marks the
    conversation `booking_started` and returns where the Book-now sheet opens. No model call, so
    no turn is spent. Same-origin through the web's `/api` rewrite (no visitor IP is needed)."""
    response.headers.update(NO_STORE)
    if await db.get(Conversation, payload.conversation_id) is None:
        raise ApiError("not_found", "That chat has ended — start a new one")
    started = await start_booking(
        db, payload.departure_id, adults=payload.adults, children=payload.children
    )
    await set_outcome(db, payload.conversation_id, ConversationOutcome.BOOKING_STARTED)
    await db.commit()
    return ChatBooking(
        package_slug=started.package_slug,
        package_name=started.package_name,
        departure_id=started.departure_id,
        date=started.date,
        adults=started.adults,
        children=started.children,
        total_paise=started.total_paise,
        url=started.url,
    )
