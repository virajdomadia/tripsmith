"""`GET /health` — the process answers (UptimeRobot every 5 min, the web's build); `GET
/health/ready` (V4, OP-1) — and so does the database: `SELECT 1`, never cached, a 503 when
the database is down or the pool is exhausted. UptimeRobot checks it hourly. Not in the
contract: the web never calls it."""

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.cache import NO_STORE
from app.infra.db import get_session

log = logging.getLogger(__name__)

router = APIRouter(tags=["public"])


class Health(BaseModel):
    status: Literal["ok"]


@router.get("/health", operation_id="getHealth")
async def get_health() -> Health:
    return Health(status="ok")


@router.get("/health/ready", include_in_schema=False)
async def get_ready(
    response: Response, db: Annotated[AsyncSession, Depends(get_session)]
) -> Health:
    response.headers.update(NO_STORE)
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        # WARNING: the monitor's alert is the page; Sentry would get one issue per check.
        log.warning("Readiness check failed: %s", type(exc).__name__)
        raise ApiError(
            "internal", "Database unavailable", status=status.HTTP_503_SERVICE_UNAVAILABLE
        ) from None
    return Health(status="ok")
