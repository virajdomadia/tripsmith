"""GET /cron/daily — scheduled `30 19 * * *` (api/vercel.json): 01:00 IST. Hobby crons fire
anywhere within the scheduled hour, so the job runs between 01:00 and 01:59 IST — always after
IST midnight, so `ist_today()` is the new day:

1. recompute every package's starting price, since yesterday's departures no longer count, and
   revalidate the pages whose price moved;
2. the PDF GC (`/cron/pdf-gc`, still callable by hand): with the new prices and the departed
   dates gone, yesterday's PDFs are stale keys;
3. (B8) delete expired sessions and sign-in codes that expired over a day ago;
4. (B10) cancel checkouts abandoned over an hour ago (`hold_expired`) and complete departed
   confirmed bookings (services/booking/sweep.py);
5. (B12) revalidate the pages of packages whose deal ended (at IST midnight), so the
   strikethrough leaves the prerendered pages without a deploy.

Blob errors surface as a 500 so Vercel's cron log shows the failure.
"""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db import get_session
from app.routers.cron import require_cron
from app.schemas.pdf import DailyReport
from app.services.analytics import ist_today
from app.services.auth.otp import prune_codes
from app.services.auth.sessions import prune_sessions
from app.services.booking.sweep import sweep_bookings
from app.services.catalog.admin_packages import (
    recompute_all_starting_prices,
    revalidate_ended_deals,
)
from app.services.pdf.service import PdfService

router = APIRouter(tags=["cron"], dependencies=[Depends(require_cron)], include_in_schema=False)


@router.get("/cron/daily", operation_id="daily")
async def daily(
    request: Request, response: Response, db: Annotated[AsyncSession, Depends(get_session)]
) -> DailyReport:
    response.headers["Cache-Control"] = "no-store"
    today = ist_today()
    changed = await recompute_all_starting_prices(db, today=today)
    service: PdfService = request.app.state.pdf
    gc = await service.gc(db)
    swept = await sweep_bookings(db, today=today)
    ended = await revalidate_ended_deals(db, now=dt.datetime.now(dt.UTC))
    return DailyReport(
        prices_updated=changed,
        pdf=gc,
        sessions_pruned=await prune_sessions(db),
        codes_pruned=await prune_codes(db),
        holds_expired=swept.holds_expired,
        bookings_completed=swept.completed,
        deals_ended=ended,
    )
