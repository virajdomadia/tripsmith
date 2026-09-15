from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db import get_session
from app.routers.site.meta import PUBLIC_CACHE_CONTROL
from app.schemas.catalog import PackageList
from app.services.catalog.search import search_packages

router = APIRouter(tags=["public"])

Session = Annotated[AsyncSession, Depends(get_session)]


@router.get("/packages", operation_id="searchPackages")
async def get_packages(db: Session, response: Response) -> PackageList:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    items = await search_packages(db)
    return PackageList(items=items, total=len(items))
