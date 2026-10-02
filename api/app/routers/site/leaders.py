"""`/leaders` and `/leaders/{slug}` (R41, P3b): the public trip leaders. CDN-cached like the
catalogue; the web pages revalidate on the `leaders` / `leader:<slug>` tags."""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.cache import PUBLIC_CACHE_CONTROL
from app.infra.db import get_session
from app.schemas.catalog import LeaderDetail, LeaderList
from app.services.analytics import ist_today
from app.services.catalog import leaders

router = APIRouter(tags=["public"])

Session = Annotated[AsyncSession, Depends(get_session)]


@router.get("/leaders", operation_id="listLeaders")
async def list_route(db: Session, response: Response) -> LeaderList:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    return LeaderList(items=await leaders.list_public(db, ist_today()))


@router.get("/leaders/{slug}", operation_id="getLeader")
async def get_route(slug: str, db: Session, response: Response) -> LeaderDetail:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    now = dt.datetime.now(dt.UTC)
    detail = await leaders.get_public(db, slug, today=ist_today(now), now=now)
    if detail is None:
        raise ApiError("not_found", "Trip leader not found")
    return detail
