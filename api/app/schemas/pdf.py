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
    sessions_pruned: int = Field(default=0, description="Expired sessions deleted (B8)")
    codes_pruned: int = Field(default=0, description="Sign-in codes expired over a day (B8)")
    holds_expired: int = Field(
        default=0, description="Pending bookings lapsed over an hour, cancelled (B10)"
    )
    bookings_completed: int = Field(default=0, description="Departed confirmed bookings (B10)")
