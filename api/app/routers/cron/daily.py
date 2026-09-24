"""GET /cron/daily — scheduled `30 19 * * *` (api/vercel.json): 01:00 IST. Hobby crons fire
anywhere within the scheduled hour, so the job runs between 01:00 and 01:59 IST — always after
IST midnight, so `ist_today()` is the new day:

1. recompute every package's starting price, since yesterday's departures no longer count, and
   revalidate the pages whose price moved;
2. the PDF GC (`/cron/pdf-gc`, still callable by hand): with the new prices and the departed
   dates gone, yesterday's PDFs are stale keys.

Blob errors surface as a 500 so Vercel's cron log shows the failure.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db import get_session
from app.routers.cron import require_cron
from app.schemas.pdf import DailyReport
from app.services.analytics import ist_today
from app.services.catalog.admin_packages import recompute_all_starting_prices
from app.services.pdf.service import PdfService

router = APIRouter(tags=["cron"], dependencies=[Depends(require_cron)], include_in_schema=False)


@router.get("/cron/daily", operation_id="daily")
async def daily(
    request: Request, response: Response, db: Annotated[AsyncSession, Depends(get_session)]
) -> DailyReport:
    response.headers["Cache-Control"] = "no-store"
    changed = await recompute_all_starting_prices(db, today=ist_today())
    service: PdfService = request.app.state.pdf
    return DailyReport(prices_updated=changed, pdf=await service.gc(db))
