"""Opaque 30-day sessions in the `sessions` table (06 §A2). The token *is* the cookie value."""

import asyncio
import datetime as dt
import secrets

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Session, User
from app.schemas.auth import SessionInfo, SessionUser
from app.services.auth.passwords import hash_password, needs_rehash, verify_password

SESSION_TTL = dt.timedelta(days=30)
USER_AGENT_MAX = 300


def new_token() -> str:
    return secrets.token_urlsafe(32)


def _now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


async def login(
    db: AsyncSession, email: str, password: str, *, ip: str | None, user_agent: str | None
) -> Session | None:
    """Verify and open a session; `None` on a bad email or password (indistinguishable)."""
    user = (
        await db.execute(select(User).where(User.email == email.strip().lower()))
    ).scalar_one_or_none()
    stored = user.password_hash if user else None
    ok = await asyncio.to_thread(verify_password, stored, password)
    if not ok or user is None:
        return None
    if stored and needs_rehash(stored):
        user.password_hash = await asyncio.to_thread(hash_password, password)
    session = Session(
        user_id=user.id,
        token=new_token(),
        expires_at=_now() + SESSION_TTL,
        ip=ip,
        user_agent=(user_agent or "")[:USER_AGENT_MAX] or None,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    session.user = user
    return session


async def find_session(
    db: AsyncSession, token: str, *, now: dt.datetime | None = None
) -> Session | None:
    """The live session for a cookie value, with its user loaded; expired rows are deleted here."""
    if not token:
        return None
    session = (
        await db.execute(
            select(Session).options(selectinload(Session.user)).where(Session.token == token)
        )
    ).scalar_one_or_none()
    if session is None:
        return None
    if session.expires_at <= (now or _now()):
        await db.delete(session)
        await db.commit()
        return None
    return session


async def delete_session(db: AsyncSession, token: str) -> None:
    await db.execute(delete(Session).where(Session.token == token))
    await db.commit()


def session_info(session: Session, *, new_enquiries: int) -> SessionInfo:
    u = session.user
    return SessionInfo(
        user=SessionUser(id=u.id, name=u.name, email=u.email, role=u.role),
        expires_at=session.expires_at,
        new_enquiries=new_enquiries,
    )
