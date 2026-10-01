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
    links_expired: int = Field(
        default=0, description="P18b: counter payment links that lapsed unpaid (in holds_expired)"
    )
    deals_ended: int = Field(
        default=0, description="Live packages whose deal ended in the last 48 h, revalidated (B12)"
    )
    refunds_resent: int = Field(
        default=0, description="Bookings whose stuck Razorpay refunds were sent again (P13)"
    )
    early_birds_ended: int = Field(
        default=0,
        description="Live packages where an early-bird tier ended in the last 2 IST days, "
        "revalidated (P17)",
    )
    balances_cancelled: int = Field(
        default=0, description="Bookings cancelled for a balance unpaid past its grace (P5)"
    )
    waitlist_offers: int = Field(default=0, description="P6: waitlist offers made by the walk")
    waitlist_lapsed: int = Field(
        default=0, description="P6: offers or claims that ran out, sent to the back of the list"
    )
    balance_reminders: int = Field(default=0, description="Balance reminders sent (P5)")
