"""`/admin/packages` (06 §C-REST, §C4): owner CRUD, publish and duplicate.

Route order matters — `/{id}/status` and `/{id}/duplicate` are declared before `/{id}` so
`status` is never matched as an id.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.schemas.catalog import (
    AdminPackage,
    AdminPackageList,
    PackageInput,
    PackageStatusInput,
)
from app.services.auth.deps import require_owner
from app.services.catalog import admin_packages as svc

router = APIRouter(prefix="/admin/packages", tags=["admin"], dependencies=[Depends(require_owner)])

Db = Annotated[AsyncSession, Depends(get_session)]


@router.get("", operation_id="listAdminPackages", response_model_by_alias=True)
async def list_route(response: Response, db: Db) -> AdminPackageList:
    response.headers.update(NO_STORE)
    return AdminPackageList(items=await svc.list_packages(db))


@router.post(
    "",
    operation_id="createPackage",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def create_route(payload: PackageInput, response: Response, db: Db) -> AdminPackage:
    response.headers.update(NO_STORE)
    return await svc.create_package(db, payload)


@router.post("/{id}/status", operation_id="setPackageStatus", response_model_by_alias=True)
async def set_status_route(
    id: str, payload: PackageStatusInput, response: Response, db: Db
) -> AdminPackage:
    response.headers.update(NO_STORE)
    return await svc.set_status(db, id, payload.status)


@router.post(
    "/{id}/duplicate",
    operation_id="duplicatePackage",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def duplicate_route(id: str, response: Response, db: Db) -> AdminPackage:
    response.headers.update(NO_STORE)
    return await svc.duplicate_package(db, id)


@router.get("/{id}", operation_id="getAdminPackage", response_model_by_alias=True)
async def get_route(id: str, response: Response, db: Db) -> AdminPackage:
    response.headers.update(NO_STORE)
    return await svc.get_package(db, id)


@router.put("/{id}", operation_id="updatePackage", response_model_by_alias=True)
async def update_route(id: str, payload: PackageInput, response: Response, db: Db) -> AdminPackage:
    response.headers.update(NO_STORE)
    return await svc.update_package(db, id, payload)


@router.delete(
    "/{id}",
    operation_id="deletePackage",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_route(id: str, db: Db) -> Response:
    await svc.delete_package(db, id)
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers=NO_STORE)
