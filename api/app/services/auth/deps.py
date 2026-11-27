"""FastAPI dependencies: `current_session` (may be None), `require_user` (any signed-in role,
401 otherwise) and `require_owner` (401 / 403 envelope).

Every `/admin/*` route depends on `require_owner`, every `/account/*` route on `require_user` —
the web's middleware gate is UX only (05 §Auth).

QA 2026-11-19: `require_owner` is also where a read-only owner is stopped — one place, so no
admin route can forget it (`require_user` does the same for `/account/*`). An owner whose
email is in `DEMO_READ_ONLY_EMAILS` (the published demo login) may read every `/admin/*` page,
but any write answers `403 forbidden` with `reason: "demo_read_only"`;
the web shows a banner for that session (`SessionInfo.readOnly`).
"""

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.db import get_session
from app.models import Session, User
from app.models.enums import UserRole
from app.routers.site.guards import UNSAFE
from app.services.auth.cookie import COOKIE_NAME
from app.services.auth.sessions import find_session


async def current_session(
    request: Request, db: Annotated[AsyncSession, Depends(get_session)]
) -> Session | None:
    token = request.cookies.get(COOKIE_NAME, "")
    return await find_session(db, token) if token else None


async def require_user(
    request: Request,
    session: Annotated[Session | None, Depends(current_session)],
) -> User:
    if session is None:
        raise ApiError("unauthorized", "Sign in to continue")
    # Review 2026-11-27 (L1): the demo email is public, so a booking a visitor made with it must
    # not be changeable from the demo login either.
    if request.method in UNSAFE and is_read_only(request, session.user):
        raise ApiError("forbidden", READ_ONLY_MESSAGE, reason=READ_ONLY_REASON)
    return session.user


READ_ONLY_MESSAGE = (
    "The demo owner account is read-only — you can look around, but changes aren't saved."
)
READ_ONLY_REASON = "demo_read_only"


def is_read_only(request: Request, user: User) -> bool:
    """True for an owner listed in `DEMO_READ_ONLY_EMAILS`."""
    return user.email.lower() in request.app.state.settings.read_only_emails()


async def require_owner(
    request: Request,
    session: Annotated[Session | None, Depends(current_session)],
) -> User:
    if session is None:
        raise ApiError("unauthorized", "Sign in to continue")
    if session.user.role != UserRole.OWNER:
        raise ApiError("forbidden", "Owner account required")
    if request.method in UNSAFE and is_read_only(request, session.user):
        raise ApiError("forbidden", READ_ONLY_MESSAGE, reason=READ_ONLY_REASON)
    return session.user
