"""GET /cron/emails — the automatic trip emails (R53, P15; services/email/automatic.py).

Scheduled `30 3 * * *` (api/vercel.json): 09:00 IST, within the hour on Hobby — a reminder at a
civil hour, after the 01:00 tidy has cancelled what it cancels. cron-job.org calls it too every
15 minutes between 09:00 and 21:00 IST (V4; before, a GitHub schedule), so a run that
stopped at its limit, or a failed send, goes on within minutes. Each email is claimed in the
ledger before it is sent: any number of runs sends nothing twice."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra import heartbeat
from app.infra.db import get_session
from app.routers.cron import require_cron
from app.schemas.emails import EmailsReport
from app.services.analytics import ist_today
from app.services.booking.after_capture import Notify
from app.services.email.automatic import run_due

router = APIRouter(tags=["cron"], dependencies=[Depends(require_cron)], include_in_schema=False)


@router.get("/cron/emails", operation_id="emailsTick")
async def emails(
    request: Request, response: Response, db: Annotated[AsyncSession, Depends(get_session)]
) -> EmailsReport:
    response.headers["Cache-Control"] = "no-store"
    run = await run_due(db, Notify.of(request.app.state), today=ist_today())
    # V4 (OP-1): `more` is normal here (the next tick goes on), so the heartbeat is always a
    # success; a run that never gets this far is the alert.
    await heartbeat.ping(request.app.state.settings.healthcheck_emails_url)
    return EmailsReport(
        sent=dict(run.sent),
        failed=run.failed,
        skipped=run.skipped,
        retried=run.retried,
        more=run.more,
    )
