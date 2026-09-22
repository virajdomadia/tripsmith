"""`/admin/destinations` (06 §C-REST): owner CRUD; the cover upload proxy lives here too (C3)."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.db import get_session
from app.models.base import new_id
from app.schemas.catalog import (
    AdminDestination,
    AdminDestinationList,
    DestinationInput,
    UploadedImage,
)
from app.services.auth.deps import require_owner
from app.services.catalog import admin_destinations as svc
from app.services.images import MAX_BYTES, ImageError, prepare_image

NO_STORE = {"Cache-Control": "no-store"}

router = APIRouter(
    prefix="/admin/destinations", tags=["admin"], dependencies=[Depends(require_owner)]
)

Db = Annotated[AsyncSession, Depends(get_session)]


@router.get("", operation_id="listAdminDestinations", response_model_by_alias=True)
async def list_route(response: Response, db: Db) -> AdminDestinationList:
    response.headers.update(NO_STORE)
    return AdminDestinationList(items=await svc.list_destinations(db))


@router.post(
    "/cover",
    operation_id="uploadDestinationCover",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def upload_cover_route(
    request: Request, response: Response, file: Annotated[UploadFile, File()]
) -> UploadedImage:
    """Multipart proxy (06 C3): validate + resize in a thread, then one Blob PUT."""
    response.headers.update(NO_STORE)
    store = request.app.state.store
    if store is None:
        raise ApiError("internal", "Image storage is not configured")
    if file.size is not None and file.size > MAX_BYTES:
        # Client reports a `Content-Length` bigger than our cap: refuse before `await file.read()`
        # buffers the whole thing into memory.
        msg = "Images must be 4 MB or smaller"
        raise ApiError("validation", msg, field_errors={"file": msg})
    data = await file.read()
    try:
        image = await asyncio.to_thread(prepare_image, data, file.content_type or "")
    except ImageError as exc:
        raise ApiError("validation", str(exc), field_errors={"file": str(exc)}) from exc
    pathname = f"destinations/uploads/{new_id()}.{image.ext}"
    url = await store.put(pathname, image.data, image.content_type)
    return UploadedImage(url=url, width=image.width, height=image.height)


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
