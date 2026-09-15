from fastapi import APIRouter, Response

from app.schemas.meta import Meta, build_meta

router = APIRouter(tags=["public"])

# Every public GET is edge-cacheable (06 C0); the catalog routes reuse this value.
PUBLIC_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300"


@router.get("/meta", operation_id="getMeta", response_model_by_alias=True)
async def get_meta(response: Response) -> Meta:
    response.headers["Cache-Control"] = PUBLIC_CACHE_CONTROL
    return build_meta()
