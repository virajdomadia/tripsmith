"""POST /chat (v3 C1, 06 C6). The response is an SSE stream, documented on the route."""

from enum import StrEnum

from pydantic import Field, field_validator

from app.schemas import ApiModel

MAX_MESSAGE_CHARS = 500  # R28


class ChatRequest(ApiModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    conversation_id: str | None = Field(
        default=None, max_length=40, description="From the previous turn's `done`; omit to start"
    )

    @field_validator("message", mode="before")
    @classmethod
    def _strip(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class ChatLimitReason(StrEnum):
    """`error.reason` on a 429 (or 503) from POST /chat — the panel then offers the no-AI quick
    finder, the enquiry form and WhatsApp (R28)."""

    CONVERSATION_FULL = "conversation_full"  # 30 visitor messages in this chat
    IP_LIMIT = "ip_limit"  # 20 messages from this connection today (IST)
    DAILY_CAP = "daily_cap"  # the site's turns for today are used up
    MONTHLY_CAP = "monthly_cap"  # the site's turns for this month are used up
    AI_OFF = "ai_off"  # no model key on this deployment (503)
