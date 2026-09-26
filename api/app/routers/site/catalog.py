from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.cache import PUBLIC_CACHE_CONTROL
from app.infra.db import get_session
from app.schemas.catalog import (
    MONTH_PATTERN,
    DepartureList,
    DestinationDetail,
    DestinationList,
    HomeData,
    PackageDetail,
    PackageList,
    SearchParams,
)
from app.schemas.reviews import MAX_PAGE, PublicReviewPage
from app.services.catalog.home import get_home_data
from app.services.catalog.reads import (
    get_departures_for_month,
    get_destination,
    get_package,
    list_destinations,
)
from app.services.catalog.search import search_packages
from app.services.reviews import public_reviews_for_slug

router = APIRouter(tags=["public"])

Session = Annotated[AsyncSession, Depends(get_session)]


@router.get("/packages", operation_id="searchPackages")
async def get_packages(
    db: Session, response: Response, params: Annotated[SearchParams, Query()]
) -> PackageList:
    """R3 search. Every filter lives in `search_packages`; this only adds the cache header."""
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    return await search_packages(db, params)


@router.get("/packages/{slug}", operation_id="getPackage")
async def get_package_route(slug: str, db: Session, response: Response) -> PackageDetail:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    detail = await get_package(db, slug)
    if detail is None:
        raise ApiError("not_found", "Package not found")
    return detail


@router.get("/packages/{slug}/departures", operation_id="getDeparturesForMonth")
async def get_departures_route(
    slug: str,
    db: Session,
    response: Response,
    month: Annotated[
        str | None,
        Query(pattern=MONTH_PATTERN, description="YYYY-MM; omitted or blank = all upcoming"),
    ] = None,
) -> DepartureList:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    items = await get_departures_for_month(db, slug, month)
    if items is None:
        raise ApiError("not_found", "Package not found")
    return DepartureList(items=items)


@router.get("/packages/{slug}/reviews", operation_id="listPackageReviews")
async def get_reviews_route(
    slug: str,
    db: Session,
    response: Response,
    page: Annotated[int, Query(ge=1, le=MAX_PAGE, description="1-based; six a page")] = 1,
) -> PublicReviewPage:
    """R21: published reviews only, newest first. Page 1 also rides on `GET /packages/{slug}`."""
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    found = await public_reviews_for_slug(db, slug, page=page)
    if found is None:
        raise ApiError("not_found", "Package not found")
    return found


@router.get("/destinations", operation_id="listDestinations")
async def get_destinations(db: Session, response: Response) -> DestinationList:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    return DestinationList(items=await list_destinations(db))


@router.get("/destinations/{slug}", operation_id="getDestination")
async def get_destination_route(slug: str, db: Session, response: Response) -> DestinationDetail:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    detail = await get_destination(db, slug)
    if detail is None:
        raise ApiError("not_found", "Destination not found")
    return detail


@router.get("/home", operation_id="getHomeData")
async def get_home_route(db: Session, response: Response) -> HomeData:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    return await get_home_data(db)
