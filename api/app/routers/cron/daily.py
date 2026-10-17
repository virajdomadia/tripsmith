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
   strikethrough leaves the prerendered pages without a deploy;
6. (P13) send again any Razorpay refund stuck `requested` for over an hour without a Razorpay
   id (a process that died mid-call) — under the same idempotency key, so never twice;
7. (P17) revalidate the pages of packages where an early-bird tier ended at IST midnight, so the
   "Early-bird savings" tag and the date labels move on without a deploy;
8. (P5) cancel bookings whose balance is past its 2-day grace (`balance_unpaid`, the policy's
   refund sent; services/booking/balance.py). The reminders moved to `/cron/emails` (P15, R53)
   at 09:00 IST with the other automatic emails.
9. (P6) walk every departure with a waitlist — the backstop behind the 15-minute
   `/cron/waitlist` — after the sweep, so seats an expired link gave back are offered, then
   send the emails that owes.
10. (P9) delete the traveller details of trips that came back 30 or more days ago (R49) —
   early, beside the balances, so a failing Blob GC never keeps ID numbers another day.
11. (P2) revalidate the pages of live packages whose day-counted urgency labels ("Last booked
   N days ago", the 30- and 14-day windows) move with the new IST day (R40).

Blob errors surface as a 500 so Vercel's cron log shows the failure.

V4 (OP-6): the run has a time budget under Vercel's 30 s limit. A balance cancellation can take a
Razorpay refund (10 s) and an SMTP send (15 s); the waitlist walk sends email; the GC and the
revalidations call out. So what only touches the database (prices, the details purge, the prunes,
the bookings sweep) always runs, and each slower step starts only while time is left — the rest
are reported in `deferred` and wait for tomorrow (the waitlist also has its 15-minute tick, the
emails their own cron). At the end it pings its healthchecks.io check: `/fail` when cut short.
"""

import datetime as dt
import time
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra import heartbeat
from app.infra.db import get_session
from app.routers.cron import require_cron
from app.schemas.pdf import DailyReport
from app.services.analytics import ist_today
from app.services.auth.otp import prune_codes
from app.services.auth.sessions import prune_sessions
from app.services.booking.after_capture import Notify
from app.services.booking.balance import sweep_balances
from app.services.booking.details import purge as purge_details
from app.services.booking.refunds import resend_stale
from app.services.booking.sweep import sweep_bookings
from app.services.catalog.admin_packages import (
    recompute_all_starting_prices,
    revalidate_ended_deals,
    revalidate_ended_early_birds,
    revalidate_urgency,
)
from app.services.email.waitlist import walk_and_send
from app.services.pdf.service import PdfService

BUDGET_SECONDS = 20.0

router = APIRouter(tags=["cron"], dependencies=[Depends(require_cron)], include_in_schema=False)


@router.get("/cron/daily", operation_id="daily")
async def daily(
    request: Request, response: Response, db: Annotated[AsyncSession, Depends(get_session)]
) -> DailyReport:
    response.headers["Cache-Control"] = "no-store"
    deadline = time.monotonic() + BUDGET_SECONDS
    state = request.app.state
    today = ist_today()
    report = DailyReport(prices_updated=await recompute_all_starting_prices(db, today=today))
    # P5 before the Blob GC, which can fail the run: a missed night would skip a reminder stage.
    balances = await sweep_balances(db, Notify.of(state), today=today, deadline=deadline)
    report.balances_cancelled = balances.cancelled
    if balances.more:
        report.deferred.append("balances")
    report.details_purged = await purge_details(db, today=today)
    report.sessions_pruned = await prune_sessions(db)
    report.codes_pruned = await prune_codes(db)
    swept = await sweep_bookings(db, today=today)
    report.holds_expired = swept.holds_expired
    report.bookings_completed = swept.completed
    report.links_expired = swept.links_expired

    async def gc() -> None:
        service: PdfService = state.pdf
        report.pdf = await service.gc(db)

    async def walk() -> None:
        walked, _ = await walk_and_send(db, None, Notify.of(state))
        report.waitlist_offers, report.waitlist_lapsed = walked.offered, walked.lapsed

    async def resend() -> None:
        report.refunds_resent = await resend_stale(db, state.razorpay, older_than_min=60)

    async def deals() -> None:
        report.deals_ended = await revalidate_ended_deals(db, now=dt.datetime.now(dt.UTC))

    async def early_birds() -> None:
        report.early_birds_ended = await revalidate_ended_early_birds(db, today=today)

    async def urgency() -> None:
        report.urgency_revalidated = await revalidate_urgency(db, today=today)

    slow: list[tuple[str, Callable[[], Awaitable[None]]]] = [
        ("pdf_gc", gc),
        ("waitlist", walk),
        ("refunds_resent", resend),
        ("deals_ended", deals),
        ("early_birds_ended", early_birds),
        ("urgency_revalidated", urgency),
    ]
    for name, step in slow:
        if time.monotonic() >= deadline:
            report.deferred.append(name)
        else:
            await step()
    report.more = bool(report.deferred)
    await heartbeat.ping(state.settings.healthcheck_daily_url, ok=not report.more)
    return report
