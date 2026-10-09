"""Add to calendar (R48, P10): the two signed buttons — `services/booking/calendar.py` has the
rules.

- `GET /calendar/{ref}.ics?exp=&sig=` — the event as a file (Apple Calendar, Outlook, or an
  import into Google). Its UID is the booking's, so a newer file replaces the event.
- `GET /calendar/{ref}/google?exp=&sig=` — a redirect to Google Calendar's "add event" page.

Both record the click first. A missing, wrong or expired signature is a 403; a booking with
nothing to put in a calendar (pending, cancelled) a 404.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import ApiError
from app.infra.db import get_session
from app.routers.site.bookings import BookingRef
from app.schemas.trip_pack import CalendarVia
from app.services.booking import calendar
from app.services.booking.calendar import TripEvent

BAD_LINK = "This calendar link has expired — open the trip in My trips and add it from there"
NO_EVENT = "This booking has nothing to add to a calendar"

RESPONSES: dict[int | str, dict[str, Any]] = {
    403: {"description": "Signature missing, wrong or expired"},
    404: {"description": "Unknown booking, or pending / cancelled"},
}

router = APIRouter(tags=["public"])


async def _clicked(
    db: AsyncSession, request: Request, ref: str, exp: int, sig: str, via: CalendarVia
) -> TripEvent:
    settings: Settings = request.app.state.settings
    secret = settings.session_secret.get_secret_value() if settings.session_secret else None
    if not calendar.link_is_valid(ref, exp, sig, secret):
        raise ApiError("forbidden", BAD_LINK)
    event = await calendar.load_event(db, ref, settings.site_url)
    await db.rollback()
    if event is None:
        raise ApiError("not_found", NO_EVENT)
    await calendar.mark_added(db, ref, via)
    return event


@router.get(
    "/calendar/{ref}.ics",
    operation_id="getCalendarFile",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {}}, "description": "The event"}, **RESPONSES},
)
async def get_calendar_file(
    ref: BookingRef,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
    exp: Annotated[int, Query()] = 0,
    sig: Annotated[str, Query(max_length=128)] = "",
) -> Response:
    event = await _clicked(db, request, ref, exp, sig, "ics")
    return Response(
        calendar.ics(event),
        media_type="text/calendar; charset=utf-8",
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": f'attachment; filename="{calendar.ics_filename(ref)}"',
        },
    )


@router.get(
    "/calendar/{ref}/google",
    operation_id="openGoogleCalendar",
    response_class=RedirectResponse,
    status_code=302,
    responses={302: {"description": "To Google Calendar's add-event page"}, **RESPONSES},
)
async def open_google_calendar(
    ref: BookingRef,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
    exp: Annotated[int, Query()] = 0,
    sig: Annotated[str, Query(max_length=128)] = "",
) -> RedirectResponse:
    event = await _clicked(db, request, ref, exp, sig, "google")
    return RedirectResponse(
        calendar.google_url(event), status_code=302, headers={"Cache-Control": "no-store"}
    )
