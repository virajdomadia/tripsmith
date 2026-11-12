"""One concierge turn for `POST /chat` (06 C6): limits → conversation → stream → persist.

Everything that can refuse a turn runs before the stream opens, so a refusal is an ordinary JSON
envelope (`429 { reason }`); once streaming, problems arrive as an `error` event. Order: the
conversation's own cap (free), the per-IP limit (Upstash), then the site-wide budget (Postgres) —
so a refused request never spends a slot of the budget.
"""

import datetime as dt
import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import anyio
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.infra.client_ip import RateLimited
from app.infra.ratelimit import RateLimiter
from app.models import Conversation, Message
from app.models.enums import MessageRole
from app.schemas.chat import ChatLimitReason, ChatRequest
from app.services.ai.budget import take_turn
from app.services.ai.loop import ChatUnavailable, Turn, run_turn
from app.services.ai.model import ChatModel
from app.services.ai.model import Message as HistoryMessage
from app.services.ai.tools import ToolContext
from app.services.analytics import ist_today
from app.services.enquiries import hash_ip

log = logging.getLogger(__name__)

MAX_VISITOR_MESSAGES = 30  # per conversation (R28); `conversations.message_count` counts these
IP_DAILY_LIMIT = 20  # per IP per IST day (R28)
HISTORY_MESSAGES = 20  # 04 v3 §4: the model sees the last 20 stored messages
ERROR_TEXT_MAX = 1_000

BUSY = (
    "The concierge is busy right now. Try again in a minute, or use the quick finder or "
    "“Talk to a person”."
)
FAILED = "Something went wrong on our side. Try again, or tap “Talk to a person”."


def sse(event: str, data: dict[str, Any]) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode()


def _limited(reason: ChatLimitReason, message: str, retry_after: int = 0) -> ApiError:
    exc = RateLimited(retry_after, message) if retry_after else ApiError("rate_limited", message)
    exc.reason = reason
    return exc


async def open_turn(
    db: AsyncSession,
    payload: ChatRequest,
    *,
    ip: str,
    limiter: RateLimiter,
    settings: Settings,
    now: dt.datetime,
) -> tuple[Conversation, list[HistoryMessage]]:
    """Check every limit, store the visitor's message, return the conversation and its history.
    Raises the 404 / 429 envelopes."""
    today = ist_today(now)
    conversation = None
    if payload.conversation_id:
        conversation = await db.get(Conversation, payload.conversation_id)
        if conversation is None:
            raise ApiError("not_found", "That chat has ended — start a new one")
        if conversation.message_count >= MAX_VISITOR_MESSAGES:
            raise _limited(
                ChatLimitReason.CONVERSATION_FULL,
                "This chat is full — start a new one, or talk to a person",
            )

    hit = await limiter.hit(
        f"chat:{ip}:{today.isoformat()}", limit=IP_DAILY_LIMIT, window_seconds=86_400
    )
    if not hit.allowed:
        raise _limited(
            ChatLimitReason.IP_LIMIT,
            "That's today's limit of messages from this connection — the quick finder still works",
            hit.retry_after,
        )

    cap = await take_turn(
        db,
        today=today,
        now=now,
        daily=settings.chat_daily_limit,
        monthly=settings.chat_monthly_limit,
    )
    if cap is not None:
        raise _limited(
            ChatLimitReason(cap.value),
            "The concierge has answered all it can for now — the quick finder still works",
        )

    if conversation is None:
        secret = settings.session_secret.get_secret_value() if settings.session_secret else None
        conversation = Conversation(
            ip_hash=hash_ip(ip, secret=secret), first_user_message=payload.message
        )
        db.add(conversation)
        await db.flush()
    conversation.message_count += 1
    db.add(
        Message(
            conversation_id=conversation.id,
            role=MessageRole.USER,
            parts=[{"type": "text", "text": payload.message}],
        )
    )
    await db.commit()

    rows = (
        await db.execute(
            select(Message.role, Message.parts)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(HISTORY_MESSAGES)
        )
    ).all()
    history: list[HistoryMessage] = [
        {"role": str(role), "parts": parts} for role, parts in reversed(rows)
    ]
    while history and history[0]["role"] != MessageRole.USER:
        history.pop(0)  # the window must open on a visitor message
    return conversation, history


async def save_turn(db: AsyncSession, conversation_id: str, turn: Turn) -> None:
    db.add(
        Message(
            conversation_id=conversation_id,
            role=MessageRole.ASSISTANT,
            parts=turn.parts,
            tokens_in=turn.tokens_in,
            tokens_out=turn.tokens_out,
        )
    )
    values: dict[str, Any] = {
        "tokens_in": Conversation.tokens_in + turn.tokens_in,
        "tokens_out": Conversation.tokens_out + turn.tokens_out,
    }
    if turn.model:
        values["model"] = turn.model
    if turn.errors:
        values["last_error"] = "; ".join(turn.errors)[:ERROR_TEXT_MAX]
    await db.execute(
        update(Conversation).where(Conversation.id == conversation_id).values(**values)
    )
    await db.commit()


async def stream_turn(
    db: AsyncSession,
    models: list[ChatModel],
    conversation_id: str,
    history: list[HistoryMessage],
    *,
    now: dt.datetime,
) -> AsyncIterator[bytes]:
    """The SSE body: `text-delta` · `tool-call` · `tool-result`, then `done` or `error`."""
    turn = Turn()
    failure: dict[str, str] | None = None
    ctx = ToolContext(db=db, today=ist_today(now), now=now)
    try:
        async for name, data in run_turn(models, history, ctx, turn):
            yield sse(name, data)
    except ChatUnavailable as exc:
        log.warning("Concierge unavailable: %s", exc)
        failure = {"reason": "busy", "message": BUSY}
    except Exception as exc:  # noqa: BLE001 — the stream is open; report it as an event
        log.exception("Concierge turn failed")
        turn.errors.append(f"turn: {type(exc).__name__}")
        failure = {"reason": "internal", "message": FAILED}
    finally:
        # Shielded: a visitor closing the tab mid-answer cancels the stream, not the transcript.
        with anyio.CancelScope(shield=True):
            try:
                await db.rollback()  # end the read transaction the tools used
                await save_turn(db, conversation_id, turn)
            except Exception:  # noqa: BLE001
                log.exception("Could not save the concierge turn for %s", conversation_id)
    if failure:
        yield sse("error", failure)
        return
    yield sse(
        "done",
        {
            "conversationId": conversation_id,
            "model": turn.model,
            "tokensIn": turn.tokens_in,
            "tokensOut": turn.tokens_out,
        },
    )
