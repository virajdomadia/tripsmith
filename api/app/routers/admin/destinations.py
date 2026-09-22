"""`/admin/destinations` (06 §C-REST): owner CRUD; the cover upload proxy lives here too (C3)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db import get_session
from app.schemas.catalog import AdminDestination, AdminDestinationList, DestinationInput
from app.services.auth.deps import require_owner
from app.services.catalog import admin_destinations as svc

NO_STORE = {"Cache-Control": "no-store"}

router = APIRouter(
    prefix="/admin/destinations", tags=["admin"], dependencies=[Depends(require_owner)]
)

Db = Annotated[AsyncSession, Depends(get_session)]


@router.get("", operation_id="listAdminDestinations", response_model_by_alias=True)
async def list_route(response: Response, db: Db) -> AdminDestinationList:
    response.headers.update(NO_STORE)
    return AdminDestinationList(items=await svc.list_destinations(db))


@router.get("/{id}", operation_id="getAdminDestination", response_model_by_alias=True)
async def get_route(id: str, response: Response, db: Db) -> AdminDestination:
    response.headers.update(NO_STORE)
    return await svc.get_destination(db, id)


@router.post(
    "",
    operation_id="createDestination",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def create_route(payload: DestinationInput, response: Response, db: Db) -> AdminDestination:
    response.headers.update(NO_STORE)
    return await svc.create_destination(db, payload)


@router.put("/{id}", operation_id="updateDestination", response_model_by_alias=True)
async def update_route(
    id: str, payload: DestinationInput, response: Response, db: Db
) -> AdminDestination:
    response.headers.update(NO_STORE)
    return await svc.update_destination(db, id, payload)


@router.delete(
    "/{id}",
    operation_id="deleteDestination",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_route(id: str, db: Db) -> Response:
    await svc.delete_destination(db, id)
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers=NO_STORE)
