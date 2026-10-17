"""`/admin/reports` (R55, P12): every report for one IST departure range, and a CSV per section."""

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.routers.site.guards import same_origin_write
from app.schemas.reports import Reports, ReportSection
from app.services import reports as svc
from app.services.admin_enquiries import csv_lines
from app.services.auth.deps import require_owner

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(same_origin_write), Depends(require_owner)],
)

Db = Annotated[AsyncSession, Depends(get_session)]
From = Annotated[
    dt.date | None,
    Query(alias="from", description="First departure day; omit both for this financial year"),
]
To = Annotated[dt.date | None, Query(description="Last departure day (inclusive)")]
Demo = Annotated[bool, Query(description="Include the seeded demo history (seed.py --history)")]


@router.get("/reports", operation_id="getReports", response_model_by_alias=True)
async def reports_route(
    response: Response, db: Db, from_: From = None, to: To = None, demo: Demo = True
) -> Reports:
    response.headers.update(NO_STORE)
    return await svc.get_reports(db, from_, to, demo=demo)


@router.get(
    "/reports/{section}.csv",
    operation_id="exportReportCsv",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/csv": {}}, "description": "One section's table as CSV"}},
)
async def export_route(
    section: ReportSection, db: Db, from_: From = None, to: To = None, demo: Demo = True
) -> StreamingResponse:
    report = await svc.get_reports(db, from_, to, demo=demo)
    head, rows = svc.section_csv(report, section)
    return StreamingResponse(
        csv_lines(rows, headers=head),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{svc.csv_filename(report, section)}"',
            **NO_STORE,
        },
    )
