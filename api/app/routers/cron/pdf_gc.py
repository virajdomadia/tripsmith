"""GET /cron/pdf-gc — delete itinerary PDFs whose key is no longer current (04 §5). Scheduled
as part of `/cron/daily`; this route stays for a run by hand. Blob errors surface as a 500 so
Vercel's cron log shows the failure."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db import get_session
from app.routers.cron import require_cron
from app.schemas.pdf import GcReport
from app.services.pdf.service import PdfService

router = APIRouter(tags=["cron"], dependencies=[Depends(require_cron)], include_in_schema=False)


@router.get("/cron/pdf-gc", operation_id="pdfGc")
async def pdf_gc(
    request: Request, response: Response, db: Annotated[AsyncSession, Depends(get_session)]
) -> GcReport:
    response.headers["Cache-Control"] = "no-store"
    service: PdfService = request.app.state.pdf
    return await service.gc(db)
