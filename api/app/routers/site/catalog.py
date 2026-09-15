from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.db import get_session
from app.routers.site.meta import PUBLIC_CACHE_CONTROL
from app.schemas.catalog import PackageDetail, PackageList
from app.services.catalog.reads import get_package
from app.services.catalog.search import search_packages

router = APIRouter(tags=["public"])

Session = Annotated[AsyncSession, Depends(get_session)]


@router.get("/packages", operation_id="searchPackages")
async def get_packages(db: Session, response: Response) -> PackageList:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    items = await search_packages(db)
    return PackageList(items=items, total=len(items))


@router.get("/packages/{slug}", operation_id="getPackage")
async def get_package_route(slug: str, db: Session, response: Response) -> PackageDetail:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    detail = await get_package(db, slug)
    if detail is None:
        raise ApiError("not_found", "Package not found")
    return detail
