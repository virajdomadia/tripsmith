"""Owner-side concierge log (R31, v3 C5): `GET /admin/conversations*`.

`ip_hash` is left out of every model, as on the enquiry inbox: a hash is useless to the owner.
"""

import datetime as dt
from typing import Literal

from pydantic import Field

from app.models.enums import ConversationOutcome
from app.schemas import ApiModel
from app.schemas.chat import TranscriptLine

PAGE_SIZE = 50
MAX_PAGE = 10_000

# What the owner filters by. `dropped` is in the column's check constraint but nothing sets it,
# so a chat that never handed off reads as `open` ("No hand-off").
OutcomeFilter = Literal["open", "booking_started", "enquiry_created"]


class ConversationFilters(ApiModel):
    outcome: OutcomeFilter | None = None
    page: int = Field(default=1, ge=1, le=MAX_PAGE)


class OutcomeCounts(ApiModel):
    all: int
    open: int
    booking_started: int
    enquiry_created: int


class ConversationRow(ApiModel):
    id: str
    created_at: dt.datetime
    updated_at: dt.datetime
    outcome: ConversationOutcome
    message_count: int
    tokens_in: int
    tokens_out: int
    first_message: str
    has_error: bool = Field(description="The latest turn recorded an error")


class ConversationList(ApiModel):
    items: list[ConversationRow]
    page: int
    page_size: int
    total: int = Field(description="Rows matching the outcome filter")
    total_pages: int = Field(ge=1)
    counts: OutcomeCounts


class HandoffEnquiry(ApiModel):
    """The enquiry a `createEnquiry` hand-off made from this chat."""

    id: str
    name: str
    status: str
    created_at: dt.datetime


class AdminConversation(ConversationRow):
    model: str | None = Field(description="The model that answered the latest turn")
    last_error: str | None = Field(description="The latest turn's errors (guardrail, model, tool)")
    signed_in: bool = Field(description="The visitor was signed in")
    enquiry: HandoffEnquiry | None
    transcript: list[TranscriptLine] = Field(
        description="Oldest first; lookup lines carry the raw tool args and result"
    )


class ConciergeWeek(ApiModel):
    """The dashboard's concierge tile (R31): this IST week, Monday to now."""

    conversations: int
    booking_started: int
    enquiry_created: int
    tokens: int = Field(description="Tokens in + out across this week's conversations")
    turns_today: int = Field(description="Turns counted against today's site-wide cap")
    cap_hit_days: int = Field(description="Days this IST month the site-wide cap was reached")
