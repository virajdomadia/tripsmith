"""Responses of the cron endpoints: `GET /cron/pdf-gc` and `GET /cron/daily`."""

from pydantic import Field

from app.schemas import ApiModel


class GcReport(ApiModel):
    deleted: int
    kept: int
    configured: bool = Field(description="False when no Blob store is configured (nothing to do)")


class DailyReport(ApiModel):
    prices_updated: int = Field(description="Packages whose starting price moved today")
    pdf: GcReport
