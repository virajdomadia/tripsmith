from fastapi import APIRouter, Response

from app.infra.cache import PUBLIC_CACHE_CONTROL
from app.schemas.meta import Meta, build_meta

router = APIRouter(tags=["public"])


@router.get("/meta", operation_id="getMeta", response_model_by_alias=True)
async def get_meta(response: Response) -> Meta:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    return build_meta()
