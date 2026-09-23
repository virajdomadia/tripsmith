"""`GET /admin/dashboard` (06 §C-REST): the numbers behind `/admin` (F22, mockup A2)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.schemas.dashboard import Dashboard
from app.services import dashboard as svc
from app.services.auth.deps import require_owner

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_owner)])

Db = Annotated[AsyncSession, Depends(get_session)]


@router.get("/dashboard", operation_id="getDashboard", response_model_by_alias=True)
async def dashboard_route(response: Response, db: Db) -> Dashboard:
    """Never cached: the owner refreshes this page to see the enquiry that just landed."""
    response.headers.update(NO_STORE)
    return await svc.get_dashboard(db)
