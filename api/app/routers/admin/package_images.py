"""`/admin/packages/{id}/images` (06 §C-REST row 286): the multipart proxy and gallery ops.

Collection `PATCH` reorders and sets the cover; item `PATCH` edits alt text. Mounted on the
same prefix as `packages.py` but kept separate so that module stays about the package itself.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ApiError
from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.schemas.catalog import AdminImage, AdminPackage, ImageAltInput, ImageOrderInput
from app.services.auth.deps import require_owner
from app.services.catalog import admin_package_images as svc
from app.services.images import MAX_BYTES

router = APIRouter(prefix="/admin/packages", tags=["admin"], dependencies=[Depends(require_owner)])

Db = Annotated[AsyncSession, Depends(get_session)]


@router.post(
    "/{id}/images",
    operation_id="uploadPackageImage",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def upload_route(
    id: str, request: Request, response: Response, db: Db, file: Annotated[UploadFile, File()]
) -> AdminImage:
    response.headers.update(NO_STORE)
    store = request.app.state.store
    if store is None:
        raise ApiError("internal", "Image storage is not configured")
    if file.size is not None and file.size > MAX_BYTES:
        # The client reports a Content-Length over our cap: refuse before `await file.read()`
        # buffers the whole thing into memory.
        msg = "Images must be 4 MB or smaller"
        raise ApiError("validation", msg, field_errors={"file": msg})
    data = await file.read()
    return await svc.add_image(db, store, id, data, file.content_type or "")


@router.patch("/{id}/images", operation_id="reorderPackageImages", response_model_by_alias=True)
async def reorder_route(
    id: str, payload: ImageOrderInput, response: Response, db: Db
) -> AdminPackage:
    response.headers.update(NO_STORE)
    return await svc.reorder_images(db, id, payload.order, payload.cover_id)


@router.patch(
    "/{id}/images/{image_id}", operation_id="updatePackageImage", response_model_by_alias=True
)
async def alt_route(
    id: str, image_id: str, payload: ImageAltInput, response: Response, db: Db
) -> AdminImage:
    response.headers.update(NO_STORE)
    return await svc.set_alt(db, id, image_id, payload.alt)


@router.delete(
    "/{id}/images/{image_id}",
    operation_id="deletePackageImage",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_route(id: str, image_id: str, db: Db) -> Response:
    await svc.remove_image(db, id, image_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers=NO_STORE)
