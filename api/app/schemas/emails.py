"""Automatic trip emails on the wire (R53, P15): the cron's report and the unsubscribe page."""

from typing import Literal

from pydantic import Field

from app.schemas import ApiModel

UnsubscribeKind = Literal["review_request", "still_thinking"]


class EmailsReport(ApiModel):
    """`/cron/emails`'s report."""

    sent: dict[str, int] = Field(description="Sent (or held in demo mode) per type")
    failed: int
    skipped: int = Field(description="No longer due when rendered, or delivery is off")
    retried: int = Field(description="Failed sends tried again this run")
    more: bool = Field(
        description="Stopped at the run's limit or time budget; the next tick goes on"
    )


class Unsubscribe(ApiModel):
    """What an unsubscribe link names — the address masked."""

    email: str = Field(description='Masked, e.g. "a***@gmail.com"')
    kind: UnsubscribeKind
    label: str = Field(description='"review requests" / "still-thinking reminders"')
    unsubscribed: bool
