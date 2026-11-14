"""`/admin/conversations*` (06 §C-REST, R31, v3 C5): the owner's concierge log."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.routers.site.guards import same_origin_write
from app.schemas.admin_conversations import (
    AdminConversation,
    ConversationFilters,
    ConversationList,
)
from app.services import admin_conversations as svc
from app.services.auth.deps import require_owner

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(same_origin_write), Depends(require_owner)],
)

Db = Annotated[AsyncSession, Depends(get_session)]


@router.get("/conversations", operation_id="listAdminConversations", response_model_by_alias=True)
async def list_route(
    response: Response, db: Db, filters: Annotated[ConversationFilters, Query()]
) -> ConversationList:
    response.headers.update(NO_STORE)
    return await svc.list_conversations(db, filters)


@router.get(
    "/conversations/{id}", operation_id="getAdminConversation", response_model_by_alias=True
)
async def get_route(id: str, response: Response, db: Db) -> AdminConversation:
    response.headers.update(NO_STORE)
    return await svc.get_conversation(db, id)
