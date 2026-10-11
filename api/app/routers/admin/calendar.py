"""`/admin/calendar` (R50, P11): the owner's month of departures and one departure's panel."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.schemas.admin_calendar import MONTH_PATTERN, CalendarMonth, CalendarPanel
from app.services import admin_calendar as svc
from app.services.auth.deps import require_owner

router = APIRouter(prefix="/admin/calendar", tags=["admin"], dependencies=[Depends(require_owner)])

Db = Annotated[AsyncSession, Depends(get_session)]


@router.get("", operation_id="getCalendarMonth", response_model_by_alias=True)
async def month_route(
    response: Response,
    db: Db,
    month: Annotated[
        str | None, Query(pattern=MONTH_PATTERN, description="YYYY-MM; omitted = this IST month")
    ] = None,
) -> CalendarMonth:
    response.headers.update(NO_STORE)
    return await svc.get_month(db, month)


@router.get("/departures/{id}", operation_id="getCalendarDeparture", response_model_by_alias=True)
async def panel_route(id: str, response: Response, db: Db) -> CalendarPanel:
    response.headers.update(NO_STORE)
    return await svc.get_panel(db, id)
