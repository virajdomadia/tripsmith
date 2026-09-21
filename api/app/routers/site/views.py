"""POST /views — the package page's view beacon (06 C3). Always 204."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db import get_session
from app.schemas.analytics import ViewCreate
from app.services.analytics import record_view

router = APIRouter(tags=["public"])


@router.post(
    "/views",
    operation_id="recordView",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def post_view(
    payload: ViewCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    await record_view(db, payload.slug, user_agent=request.headers.get("user-agent"))
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers={"Cache-Control": "no-store"})
