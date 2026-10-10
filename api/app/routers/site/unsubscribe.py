"""Unsubscribe (R53, P15) — only the review request and the still-thinking email carry the link.

- `GET /unsubscribe/{token}` — whose address (masked) and which email; the site's
  `/unsubscribe?t=` page shows it with one button.
- `POST /unsubscribe/{token}` — unsubscribes; idempotent. It is also the `List-Unsubscribe`
  target, so Gmail's one-click button POSTs here (form body `List-Unsubscribe=One-Click`, read
  and ignored).

A token that doesn't verify is a 404 — the same answer for a forged and a mangled link.
"""

from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, Path, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.infra.db import get_session
from app.models.enums import EmailType
from app.schemas.emails import Unsubscribe, UnsubscribeKind
from app.services.email import unsubscribe

BAD_LINK = "This unsubscribe link isn't valid — reply to any of our emails and we'll take you off"
LABELS = {
    EmailType.REVIEW_REQUEST: "review requests",
    EmailType.STILL_THINKING: "still-thinking reminders",
}
RESPONSES: dict[int | str, dict[str, Any]] = {404: {"description": "The link doesn't verify"}}
Token = Annotated[str, Path(min_length=10, max_length=400)]

router = APIRouter(tags=["public"])


def _read(request: Request, token: str) -> tuple[str, EmailType]:
    settings: Settings = request.app.state.settings
    secret = settings.session_secret.get_secret_value() if settings.session_secret else None
    found = unsubscribe.read_token(token, secret)
    if found is None:
        raise ApiError("not_found", BAD_LINK)
    return found


async def _out(db: AsyncSession, email: str, kind: EmailType) -> Unsubscribe:
    done = await unsubscribe.is_suppressed(db, email, kind)
    await db.rollback()
    return Unsubscribe(
        email=unsubscribe.mask(email),
        kind=cast(UnsubscribeKind, kind.value),
        label=LABELS[kind],
        unsubscribed=done,
    )


@router.get("/unsubscribe/{token}", operation_id="getUnsubscribe", responses=RESPONSES)
async def get_unsubscribe(
    token: Token, request: Request, db: Annotated[AsyncSession, Depends(get_session)]
) -> Unsubscribe:
    email, kind = _read(request, token)
    return await _out(db, email, kind)


@router.post("/unsubscribe/{token}", operation_id="unsubscribe", responses=RESPONSES)
async def post_unsubscribe(
    token: Token, request: Request, db: Annotated[AsyncSession, Depends(get_session)]
) -> Unsubscribe:
    email, kind = _read(request, token)
    await unsubscribe.suppress(db, email, kind)
    return await _out(db, email, kind)
