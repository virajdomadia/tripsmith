"""The upkeep the nightly cron used to do, now done when someone reads (2026-11-04: every
scheduled job was removed — a portfolio project on free tiers keeps no background work).

Both are FastAPI dependencies, put first on their routers so they run before any auth lookup
(a rollback here must not expire a loaded user). Both are best effort: a failure is logged and
the read goes on with what the database has.

- `fresh_prices` (the catalog and compare routers): once per process per IST day, recompute
  every package's cached "from ₹" (`starting_price_paise`) so a departed date stops counting —
  `admin_packages.recompute_all_starting_prices`. Owner saves and booking events keep it right
  in between, as before.
- `swept_bookings` (My trips, the owner's bookings desk and dashboard): at most every
  `SWEEP_EVERY_SECONDS` per process, cancel checkouts abandoned over an hour ago
  (`hold_expired`) and complete confirmed bookings whose trip has left (`completed` — what the
  review form, My trips' past list and the desk's counts read) — `sweep.sweep_bookings`.

The guards are per process: a cold start does each once more, which is cheap (a few queries).
Tests turn both off (conftest) and call them directly.
"""

import datetime as dt
import logging
import time
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db import get_session
from app.services.analytics import ist_today
from app.services.booking.sweep import sweep_bookings
from app.services.catalog.admin_packages import recompute_all_starting_prices

log = logging.getLogger(__name__)

SWEEP_EVERY_SECONDS = 600.0

prices_fresh_on: dt.date | None = None  # the IST day prices were last recomputed in this process
next_sweep_at = 0.0  # `time.monotonic()` after which the next read sweeps


async def refresh_prices_if_stale(db: AsyncSession) -> None:
    global prices_fresh_on
    today = ist_today()
    if prices_fresh_on is not None and prices_fresh_on >= today:
        return
    try:
        await recompute_all_starting_prices(db, today=today)
    except Exception:
        await db.rollback()
        log.exception("On-demand starting-price refresh failed")
        return
    prices_fresh_on = today


async def sweep_if_due(db: AsyncSession) -> None:
    global next_sweep_at
    now = time.monotonic()
    if now < next_sweep_at:
        return
    next_sweep_at = now + SWEEP_EVERY_SECONDS
    try:
        await sweep_bookings(db, today=ist_today())
    except Exception:
        await db.rollback()
        log.exception("On-demand bookings sweep failed")


async def fresh_prices(db: Annotated[AsyncSession, Depends(get_session)]) -> None:
    await refresh_prices_if_stale(db)


async def swept_bookings(db: Annotated[AsyncSession, Depends(get_session)]) -> None:
    await sweep_if_due(db)
