"""FastAPI dependencies: `current_session` (may be None) and `require_owner` (401 / 403 envelope).

Every `/admin/*` route depends on `require_owner` — the web's middleware gate is UX only (05 §Auth).
"""

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.db import get_session
from app.models import Session, User
from app.models.enums import UserRole
from app.services.auth.cookie import COOKIE_NAME
from app.services.auth.sessions import find_session


async def current_session(
    request: Request, db: Annotated[AsyncSession, Depends(get_session)]
) -> Session | None:
    token = request.cookies.get(COOKIE_NAME, "")
    return await find_session(db, token) if token else None


async def require_owner(
    session: Annotated[Session | None, Depends(current_session)],
) -> User:
    if session is None:
        raise ApiError("unauthorized", "Sign in to continue")
    if session.user.role != UserRole.OWNER:
        raise ApiError("forbidden", "Owner account required")
    return session.user
