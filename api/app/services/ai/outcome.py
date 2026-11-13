"""A conversation's outcome (06 A7; R31): `open` → `booking_started` / `enquiry_created`.

Its own module, free of the booking and enquiry services, because both of those set it (the
enquiry pipeline on a chat handoff, the chat's booking hand-off through the quote).
"""

import datetime as dt

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Conversation
from app.models.enums import ConversationOutcome


async def set_outcome(db: AsyncSession, conversation_id: str, outcome: ConversationOutcome) -> None:
    """The latest hand-off wins: a chat that started a booking and then asked for a person reads
    as a handoff. Not committed — the caller's transaction carries it."""
    await db.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(outcome=outcome, updated_at=dt.datetime.now(dt.UTC))
    )
