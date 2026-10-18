"""GET /cron/waitlist — every 15 minutes from a GitHub Actions schedule
(.github/workflows/waitlist-tick.yml; the repo is public, so ₹0), with the same bearer secret as
`/cron/daily`. Walks every departure with a waitlist (services/booking/waitlist.py) so a lapsed
10-minute hold or a 24 h offer that ran out moves on even when nobody visits, then sends the
emails that owes. `/cron/daily` does the same as the backstop."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db import get_session
from app.routers.cron import require_cron
from app.schemas.waitlist import WaitlistTick
from app.services.booking.after_capture import Notify
from app.services.email.waitlist import walk_and_send

router = APIRouter(tags=["cron"], dependencies=[Depends(require_cron)], include_in_schema=False)


@router.get("/cron/waitlist", operation_id="waitlistTick")
async def tick(
    request: Request, response: Response, db: Annotated[AsyncSession, Depends(get_session)]
) -> WaitlistTick:
    response.headers["Cache-Control"] = "no-store"
    walked, emails = await walk_and_send(db, None, Notify.of(request.app.state))
    return WaitlistTick(
        offered=walked.offered, lapsed=walked.lapsed, closed=walked.closed, emails=emails
    )
