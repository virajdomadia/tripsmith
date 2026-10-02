"""`/admin/leaders` (R41, P3): the owner's trip leaders — CRUD, switch on/off, photo upload."""

import asyncio
import os
from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.models.base import new_id
from app.schemas.catalog import UploadedImage
from app.schemas.leaders import AdminLeader, AdminLeaderList, LeaderActiveInput, LeaderInput
from app.services.auth.deps import require_owner
from app.services.catalog import admin_leaders as svc
from app.services.images import MAX_BYTES, ImageError, prepare_image

router = APIRouter(prefix="/admin/leaders", tags=["admin"], dependencies=[Depends(require_owner)])

Db = Annotated[AsyncSession, Depends(get_session)]


def _check_photo(request: Request, payload: LeaderInput) -> None:
    svc.check_photo_url(
        payload.photo_url, request.app.state.settings, on_vercel=bool(os.environ.get("VERCEL"))
    )


@router.get("", operation_id="listAdminLeaders", response_model_by_alias=True)
async def list_route(response: Response, db: Db) -> AdminLeaderList:
    response.headers.update(NO_STORE)
    return AdminLeaderList(items=await svc.list_leaders(db))


@router.post(
    "/photo",
    operation_id="uploadLeaderPhoto",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def upload_photo_route(
    request: Request, response: Response, file: Annotated[UploadFile, File()]
) -> UploadedImage:
    """Multipart proxy, the destination cover's path: validate + resize in a thread, one PUT."""
    response.headers.update(NO_STORE)
    store = request.app.state.store
    if store is None:
        raise ApiError("internal", "Image storage is not configured")
    if file.size is not None and file.size > MAX_BYTES:
        msg = "Images must be 4 MB or smaller"
        raise ApiError("validation", msg, field_errors={"file": msg})
    data = await file.read()
    try:
        image = await asyncio.to_thread(prepare_image, data, file.content_type or "")
    except ImageError as exc:
        raise ApiError("validation", str(exc), field_errors={"file": str(exc)}) from exc
    pathname = f"leaders/uploads/{new_id()}.{image.ext}"
    url = await store.put(pathname, image.data, image.content_type)
    return UploadedImage(url=url, width=image.width, height=image.height)


@router.get("/{id}", operation_id="getAdminLeader", response_model_by_alias=True)
async def get_route(id: str, response: Response, db: Db) -> AdminLeader:
    response.headers.update(NO_STORE)
    return await svc.get_leader(db, id)


@router.post(
    "",
    operation_id="createLeader",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def create_route(
    payload: LeaderInput, request: Request, response: Response, db: Db
) -> AdminLeader:
    response.headers.update(NO_STORE)
    _check_photo(request, payload)
    return await svc.create_leader(db, payload)


@router.put("/{id}", operation_id="updateLeader", response_model_by_alias=True)
async def update_route(
    id: str, payload: LeaderInput, request: Request, response: Response, db: Db
) -> AdminLeader:
    response.headers.update(NO_STORE)
    _check_photo(request, payload)
    return await svc.update_leader(db, id, payload)


@router.post("/{id}/active", operation_id="setLeaderActive", response_model_by_alias=True)
async def active_route(
    id: str, payload: LeaderActiveInput, response: Response, db: Db
) -> AdminLeader:
    response.headers.update(NO_STORE)
    return await svc.set_active(db, id, payload.active)


@router.delete(
    "/{id}",
    operation_id="deleteLeader",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_route(id: str, db: Db) -> Response:
    await svc.delete_leader(db, id)
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers=NO_STORE)
