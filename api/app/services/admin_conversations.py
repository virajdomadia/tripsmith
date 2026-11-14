"""The owner's concierge log (R31, v3 C5): list, detail, and the dashboard tile.

Outcomes are written by C3's tools (`services/ai/outcome.py`); this module only reads them.
"""

import datetime as dt
import math

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.models import ChatBudget, Conversation, Enquiry
from app.models.enums import ConversationOutcome
from app.schemas.admin_conversations import (
    PAGE_SIZE,
    AdminConversation,
    ConciergeWeek,
    ConversationFilters,
    ConversationList,
    ConversationRow,
    HandoffEnquiry,
    OutcomeCounts,
)
from app.services.admin_enquiries import ist_day_start
from app.services.ai.transcript import transcript_for
from app.services.analytics import ist_today


def _row(c: Conversation) -> ConversationRow:
    return ConversationRow(
        id=c.id,
        created_at=c.created_at,
        updated_at=c.updated_at,
        outcome=c.outcome,
        message_count=c.message_count,
        tokens_in=c.tokens_in,
        tokens_out=c.tokens_out,
        first_message=c.first_user_message,
        has_error=bool(c.last_error),
    )


async def _by_outcome(
    db: AsyncSession, since: dt.date | None = None
) -> dict[ConversationOutcome, int]:
    stmt = select(Conversation.outcome, func.count()).group_by(Conversation.outcome)
    if since is not None:
        stmt = stmt.where(Conversation.created_at >= ist_day_start(since))
    return {outcome: int(n) for outcome, n in (await db.execute(stmt)).all()}


async def _counts(db: AsyncSession) -> OutcomeCounts:
    rows = await _by_outcome(db)
    open_ = rows.get(ConversationOutcome.OPEN, 0) + rows.get(ConversationOutcome.DROPPED, 0)
    return OutcomeCounts(
        all=sum(rows.values()),
        open=open_,
        booking_started=rows.get(ConversationOutcome.BOOKING_STARTED, 0),
        enquiry_created=rows.get(ConversationOutcome.ENQUIRY_CREATED, 0),
    )


async def list_conversations(db: AsyncSession, filters: ConversationFilters) -> ConversationList:
    stmt = select(Conversation)
    if filters.outcome == "open":
        stmt = stmt.where(
            Conversation.outcome.in_([ConversationOutcome.OPEN, ConversationOutcome.DROPPED])
        )
    elif filters.outcome is not None:
        stmt = stmt.where(Conversation.outcome == ConversationOutcome(filters.outcome))
    total = int((await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one())
    rows = (
        await db.execute(
            stmt.order_by(Conversation.created_at.desc(), Conversation.id)
            .limit(PAGE_SIZE)
            .offset((filters.page - 1) * PAGE_SIZE)
        )
    ).scalars()
    return ConversationList(
        items=[_row(c) for c in rows],
        page=filters.page,
        page_size=PAGE_SIZE,
        total=total,
        total_pages=max(1, math.ceil(total / PAGE_SIZE)),
        counts=await _counts(db),
    )


async def get_conversation(db: AsyncSession, id: str) -> AdminConversation:
    c = await db.get(Conversation, id)
    if c is None:
        raise ApiError("not_found", "Conversation not found")
    enquiry = (
        await db.execute(
            select(Enquiry)
            .where(Enquiry.conversation_id == id)
            .order_by(Enquiry.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return AdminConversation(
        **_row(c).model_dump(),
        model=c.model,
        last_error=c.last_error,
        signed_in=c.user_id is not None,
        enquiry=HandoffEnquiry(
            id=enquiry.id,
            name=enquiry.name,
            status=enquiry.status.value,
            created_at=enquiry.created_at,
        )
        if enquiry
        else None,
        transcript=await transcript_for(db, id, raw=True),
    )


async def concierge_week(
    db: AsyncSession, *, monday: dt.date, today: dt.date | None = None
) -> ConciergeWeek:
    day = today or ist_today()
    outcome_counts = await _by_outcome(db, monday)
    tokens = (
        await db.execute(
            select(
                func.coalesce(func.sum(Conversation.tokens_in + Conversation.tokens_out), 0)
            ).where(Conversation.created_at >= ist_day_start(monday))
        )
    ).scalar_one()
    turns_today = (
        await db.execute(select(ChatBudget.turns).where(ChatBudget.day == day))
    ).scalar_one_or_none()
    cap_hit_days = (
        await db.execute(
            select(func.count())
            .select_from(ChatBudget)
            .where(
                ChatBudget.day >= day.replace(day=1),
                ChatBudget.day <= day,
                ChatBudget.cap_hit_at.is_not(None),
            )
        )
    ).scalar_one()
    return ConciergeWeek(
        conversations=sum(outcome_counts.values()),
        booking_started=outcome_counts.get(ConversationOutcome.BOOKING_STARTED, 0),
        enquiry_created=outcome_counts.get(ConversationOutcome.ENQUIRY_CREATED, 0),
        tokens=int(tokens),
        turns_today=int(turns_today or 0),
        cap_hit_days=int(cap_hit_days),
    )
