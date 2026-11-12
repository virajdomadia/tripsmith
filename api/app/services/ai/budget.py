"""The site-wide cap (R28): `CHAT_DAILY_LIMIT` turns per IST day and `CHAT_MONTHLY_LIMIT` per IST
calendar month, in Postgres so it holds when the per-IP limiter (Upstash) fails open.

One `chat_budget` row per IST day. A turn takes the day's row lock (`SELECT … FOR UPDATE`), so
two concurrent turns can never both take the 100th slot. The month is the sum of this month's
rows; only today's row ever grows, and it is the locked one.
"""

import datetime as dt
from enum import StrEnum

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatBudget


class CapReason(StrEnum):
    DAY = "daily_cap"
    MONTH = "monthly_cap"


async def take_turn(
    db: AsyncSession, *, today: dt.date, now: dt.datetime, daily: int, monthly: int
) -> CapReason | None:
    """Count one turn and commit, or return why the site is out of turns (and note the first
    time today the cap was hit, for the owner's dashboard)."""
    await db.execute(insert(ChatBudget).values(day=today).on_conflict_do_nothing())
    row = (
        await db.execute(select(ChatBudget).where(ChatBudget.day == today).with_for_update())
    ).scalar_one()
    earlier_this_month = (
        await db.execute(
            select(func.coalesce(func.sum(ChatBudget.turns), 0)).where(
                ChatBudget.day >= today.replace(day=1), ChatBudget.day < today
            )
        )
    ).scalar_one()
    reason = None
    if row.turns >= daily:
        reason = CapReason.DAY
    elif earlier_this_month + row.turns >= monthly:
        reason = CapReason.MONTH
    if reason is None:
        row.turns += 1
    elif row.cap_hit_at is None:
        row.cap_hit_at = now
    await db.commit()
    return reason
