"""The booking voucher PDF (B7, R17), rendered on demand and never stored.

- `GET /bookings/{ref}/voucher.pdf?exp=&sig=` — the success sheet's 30-minute signed link, for a
  visitor who is not signed in. A missing, wrong or expired signature is a 403.
- `GET /account/bookings/{ref}/voucher.pdf` — signed in: the owner (admin), or the customer the
  booking belongs to (services/account.py). Anyone else signed in is a 403, nobody signed in a
  401.

Either way the booking must be confirmed (or completed): a pending or cancelled booking has no
voucher (404). `private, no-store`: it carries names, ages and a phone number.
"""

import asyncio
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.infra.db import get_session
from app.models import Session
from app.models.enums import UserRole
from app.routers.site.bookings import BookingRef
from app.services.account import owns_booking
from app.services.auth.deps import current_session
from app.services.booking.voucher import HAS_VOUCHER, link_is_valid, load_booking_facts
from app.services.pdf.voucher import render_voucher, voucher_filename

NO_VOUCHER = "This booking has no voucher yet"
BAD_LINK = "This voucher link has expired — WhatsApp us the reference and we'll send it"

PDF_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {"content": {"application/pdf": {}}, "description": "The voucher PDF"},
    403: {"description": "Signature missing, wrong or expired / not this booking's account"},
    404: {"description": "Unknown booking, or not confirmed"},
}

router = APIRouter(tags=["public"])


async def _voucher(db: AsyncSession, ref: str, settings: Settings) -> Response:
    try:
        facts = await load_booking_facts(db, ref)
    finally:
        await db.rollback()  # the render below holds no connection
    if facts is None or facts.status not in HAS_VOUCHER:
        raise ApiError("not_found", NO_VOUCHER)
    pdf = await asyncio.to_thread(
        render_voucher, facts, site_url=settings.site_url, whatsapp_number=settings.whatsapp_number
    )
    return Response(
        pdf,
        media_type="application/pdf",
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": f'attachment; filename="{voucher_filename(ref)}"',
        },
    )


@router.get(
    "/bookings/{ref}/voucher.pdf",
    operation_id="getVoucherPdf",
    response_class=Response,
    responses=PDF_RESPONSES,
)
async def get_signed_voucher(
    ref: BookingRef,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
    exp: Annotated[int, Query()] = 0,
    sig: Annotated[str, Query(max_length=128)] = "",
) -> Response:
    settings: Settings = request.app.state.settings
    secret = settings.session_secret.get_secret_value() if settings.session_secret else None
    if not link_is_valid(ref, exp, sig, secret):
        raise ApiError("forbidden", BAD_LINK)
    return await _voucher(db, ref, settings)


@router.get(
    "/account/bookings/{ref}/voucher.pdf",
    operation_id="getAccountVoucherPdf",
    response_class=Response,
    responses=PDF_RESPONSES,
)
async def get_account_voucher(
    ref: BookingRef,
    request: Request,
    session: Annotated[Session | None, Depends(current_session)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    if session is None:
        raise ApiError("unauthorized", "Sign in to continue")
    if session.user.role != UserRole.OWNER and not await owns_booking(db, session.user, ref):
        raise ApiError("forbidden", "This booking is not on your account")
    return await _voucher(db, ref, request.app.state.settings)
