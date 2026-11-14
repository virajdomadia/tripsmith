"""POST /chat (v3 C1, 06 C6). The response is an SSE stream, documented on the route."""

import datetime as dt
from enum import StrEnum
from typing import Any, Self

from pydantic import Field, field_validator, model_validator

from app.schemas import ApiModel
from app.schemas.meta import MAX_TRAVELLERS

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


class ChatBookingRequest(ApiModel):
    """A "Book" button on a chat's departure list (C3): the same hand-off as the model's
    `startBooking`, without spending a turn."""

    conversation_id: str = Field(min_length=1, max_length=40)
    departure_id: str = Field(min_length=1, max_length=40)
    adults: int = Field(default=2, ge=1, le=MAX_TRAVELLERS)
    children: int = Field(default=0, ge=0, le=MAX_TRAVELLERS - 1)

    @model_validator(mode="after")
    def _party(self) -> Self:
        if self.adults + self.children > MAX_TRAVELLERS:
            raise ValueError(f"Up to {MAX_TRAVELLERS} travellers per booking")
        return self


class ChatBooking(ApiModel):
    package_slug: str
    package_name: str
    departure_id: str
    date: dt.date
    adults: int
    children: int
    total_paise: int
    url: str = Field(description="The package page with the Book-now sheet open and pre-filled")


class TranscriptRole(StrEnum):
    VISITOR = "visitor"
    CONCIERGE = "concierge"
    LOOKUP = "lookup"  # a tool call and what it found, as one sentence


class TranscriptLine(ApiModel):
    """One line of a concierge chat as the owner reads it (R29, R31)."""

    role: TranscriptRole
    text: str
    at: dt.datetime
    tool: str | None = Field(default=None, description="C5: the tool a lookup line ran")
    args: dict[str, Any] | None = Field(
        default=None, description="C5 owner log only: the tool call's arguments, as the model sent"
    )
    result: dict[str, Any] | None = Field(
        default=None, description="C5 owner log only: what the tool returned"
    )
    failed: bool = Field(default=False, description="The tool returned an error")
