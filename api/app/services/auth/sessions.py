"""Opaque 30-day sessions in the `sessions` table (06 §A2).

The token is the cookie value; the table stores only its SHA-256 (`token_hash`), so a leaked
backup or a read-only SQL hole yields no usable cookie. A plain hash is enough — the token is
256 random bits, so there is nothing to brute-force and no need for a slow or keyed hash.
"""

import asyncio
import datetime as dt
import hashlib
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


def hash_token(token: str) -> str:
    """What `sessions.token_hash` holds. Mirrored in SQL by migration 0002
    (`encode(sha256(convert_to(token, 'UTF8')), 'hex')`), which hashed the rows in place."""
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


async def login(
    db: AsyncSession, email: str, password: str, *, ip: str | None, user_agent: str | None
) -> tuple[Session, str] | None:
    """Verify and open a session → `(row, token)`; the token exists only in this return value
    and the cookie. `None` on a bad email or password (indistinguishable)."""
    user = (
        await db.execute(select(User).where(User.email == email.strip().lower()))
    ).scalar_one_or_none()
    stored = user.password_hash if user else None
    ok = await asyncio.to_thread(verify_password, stored, password)
    if not ok or user is None:
        return None
    if stored and needs_rehash(stored):
        user.password_hash = await asyncio.to_thread(hash_password, password)
    token = new_token()
    session = Session(
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=_now() + SESSION_TTL,
        ip=ip,
        user_agent=(user_agent or "")[:USER_AGENT_MAX] or None,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    session.user = user
    return session, token


async def find_session(
    db: AsyncSession, token: str, *, now: dt.datetime | None = None
) -> Session | None:
    """The live session for a cookie value, with its user loaded; expired rows are deleted here."""
    if not token:
        return None
    session = (
        await db.execute(
            select(Session)
            .options(selectinload(Session.user))
            .where(Session.token_hash == hash_token(token))
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
    await db.execute(delete(Session).where(Session.token_hash == hash_token(token)))
    await db.commit()


def session_info(session: Session, *, new_enquiries: int) -> SessionInfo:
    u = session.user
    return SessionInfo(
        user=SessionUser(id=u.id, name=u.name, email=u.email, role=u.role),
        expires_at=session.expires_at,
        new_enquiries=new_enquiries,
    )
