"""`/admin/enquiries*` (06 §C-REST): the owner's inbox — list, detail, status, notes, CSV.

Mounted under a plain `/admin` prefix rather than `/admin/enquiries`, because the export lives
at `/admin/enquiries.csv`, a sibling of the collection and not a child of it. `.csv` is declared
before `/enquiries/{id}` so the intent is obvious, though the two cannot collide: a path
parameter never matches across a `/`.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.schemas.admin_enquiries import (
    AdminEnquiry,
    EnquiryFilters,
    EnquiryList,
    EnquiryNoteInput,
    EnquiryStatusInput,
)
from app.services import admin_enquiries as svc
from app.services.auth.deps import require_owner

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_owner)])

Db = Annotated[AsyncSession, Depends(get_session)]
Filters = Annotated[EnquiryFilters, Query()]


@router.get("/enquiries", operation_id="listAdminEnquiries", response_model_by_alias=True)
async def list_route(response: Response, db: Db, filters: Filters) -> EnquiryList:
    response.headers.update(NO_STORE)
    return await svc.list_enquiries(db, filters)


@router.get(
    "/enquiries.csv",
    operation_id="exportEnquiriesCsv",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/csv": {}}, "description": "The filtered inbox as CSV"}},
)
async def export_route(db: Db, filters: Filters) -> StreamingResponse:
    """Streamed, never stored: no Blob object to create and no garbage to collect."""
    records = await svc.csv_records(db, filters)
    return StreamingResponse(
        svc.csv_lines(records),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{svc.csv_filename()}"',
            **NO_STORE,
        },
    )


@router.get("/enquiries/{id}", operation_id="getAdminEnquiry", response_model_by_alias=True)
async def get_route(id: str, response: Response, db: Db) -> AdminEnquiry:
    response.headers.update(NO_STORE)
    return await svc.get_enquiry(db, id)


@router.patch(
    "/enquiries/{id}/status", operation_id="setEnquiryStatus", response_model_by_alias=True
)
async def set_status_route(
    id: str, payload: EnquiryStatusInput, response: Response, db: Db
) -> AdminEnquiry:
    response.headers.update(NO_STORE)
    return await svc.set_status(db, id, payload.status)


@router.post(
    "/enquiries/{id}/notes",
    operation_id="addEnquiryNote",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def add_note_route(
    id: str, payload: EnquiryNoteInput, response: Response, db: Db
) -> AdminEnquiry:
    """201 with the whole enquiry, not just the note: the client renders the fresh timeline."""
    response.headers.update(NO_STORE)
    return await svc.add_note(db, id, payload.body)
