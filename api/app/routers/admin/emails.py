"""The owner's automatic emails (R53, P15b) — `/admin/settings/emails` in the web.

- `GET /admin/emails` — each type: its switch, when it goes, how many went in 30 days;
- `PUT /admin/emails/{type}` — switch one on or off (the refund email has no switch);
- `GET /admin/emails/{type}/samples` — bookings it fits, to preview with;
- `GET /admin/emails/{type}/preview?ref=` — the email for that booking, as of the day it'd go;
- `POST /admin/emails/{type}/test` — the same email to the owner's inbox, `[Test]` in front.

A preview or a test never touches the ledger or the history: the real email still goes on its day.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.models import User
from app.models.enums import EmailType
from app.schemas.admin_emails import (
    EmailPreview,
    EmailSamples,
    EmailSettings,
    EmailSwitchInput,
    EmailTestInput,
    EmailTestSent,
    EmailTypeSetting,
)
from app.services.analytics import ist_today
from app.services.auth.deps import require_owner
from app.services.email import automatic, owner

router = APIRouter(prefix="/admin/emails", tags=["admin"], dependencies=[Depends(require_owner)])

Db = Annotated[AsyncSession, Depends(get_session)]
Ref = Annotated[str, Query(pattern=r"^TB-[A-Z0-9]{6}$")]
RESPONSES: dict[int | str, dict[str, Any]] = {
    404: {"description": "Unknown booking"},
    409: {
        "description": "The booking doesn't fit this email (not_fitting), no owner address "
        "(no_owner_email) or the send failed (send_failed)"
    },  # fmt: skip
}


@router.get("", operation_id="getEmailSettings")
async def get_settings(request: Request, response: Response, db: Db) -> EmailSettings:
    response.headers.update(NO_STORE)
    return await owner.settings_out(db, request.app.state.settings)


@router.put("/{kind}", operation_id="setEmailSwitch", responses={409: {"description": "No switch"}})
async def set_switch(
    kind: EmailType,
    body: EmailSwitchInput,
    request: Request,
    db: Db,
    user: Annotated[User, Depends(require_owner)],
) -> EmailTypeSetting:
    if kind not in automatic.SWITCHABLE:
        raise ApiError("conflict", "The refund email always goes", reason="no_switch")
    await automatic.set_switch(db, kind, body.on, by=user.id)
    return owner.setting_of(await owner.settings_out(db, request.app.state.settings), kind)


@router.get("/{kind}/samples", operation_id="getEmailSamples")
async def get_samples(kind: EmailType, response: Response, db: Db) -> EmailSamples:
    response.headers.update(NO_STORE)
    return EmailSamples(items=await owner.samples(db, kind, today=ist_today()))


@router.get("/{kind}/preview", operation_id="previewEmail", responses=RESPONSES)
async def get_preview(
    kind: EmailType, ref: Ref, request: Request, response: Response, db: Db
) -> EmailPreview:
    response.headers.update(NO_STORE)
    settings: Settings = request.app.state.settings
    return await owner.preview(db, kind, ref, settings, today=ist_today())


@router.post("/{kind}/test", operation_id="sendTestEmail", responses=RESPONSES)
async def send_test(
    kind: EmailType, body: EmailTestInput, request: Request, db: Db
) -> EmailTestSent:
    sent = await owner.send_test(
        db,
        request.app.state.email_sender,
        kind,
        body.ref,
        request.app.state.settings,
        today=ist_today(),
    )
    return EmailTestSent(to=sent.to, subject=sent.subject)
