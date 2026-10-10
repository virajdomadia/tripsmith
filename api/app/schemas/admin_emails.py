"""The owner's automatic emails (R53, P15b): `/admin/settings/emails` and the booking's Emails
list. Its own module, like every new admin schema."""

import datetime as dt

from pydantic import Field

from app.models.enums import EmailType
from app.schemas import ApiModel


class EmailTypeSetting(ApiModel):
    type: EmailType
    label: str = Field(description='"Trip pack", "Review request"…')
    trigger: str = Field(description="When it goes, in plain words")
    switchable: bool = Field(description="False for the refund email, which always goes")
    on: bool
    unsubscribable: bool = Field(description="Carries an unsubscribe link (two promotional ones)")
    sent30d: int = Field(description="Sent (or held in demo mode) in the last 30 days")


class EmailSettings(ApiModel):
    types: list[EmailTypeSetting]
    owner_email: str | None = Field(description="Where a test goes; None = tests can't be sent")
    sends_at: str = Field(description='When the daily run goes, e.g. "09:00 IST"')


class EmailSwitchInput(ApiModel):
    on: bool


class EmailSample(ApiModel):
    ref: str
    label: str = Field(description="Ref · lead · package · date")


class EmailSamples(ApiModel):
    items: list[EmailSample] = Field(description="Bookings this email fits, newest first")


class EmailPreview(ApiModel):
    type: EmailType
    ref: str
    to: str
    subject: str
    html: str
    text: str
    attachments: list[str] = Field(description="File names (the trip pack's PDF)")
    as_of: dt.date = Field(description="The day it is rendered for — the day it would go")


class EmailTestInput(ApiModel):
    ref: str = Field(min_length=9, max_length=9, pattern=r"^TB-[A-Z0-9]{6}$")


class EmailTestSent(ApiModel):
    to: str
    subject: str


class UpcomingEmail(ApiModel):
    """One automatic email still to come for a booking, as the rules stand today."""

    type: EmailType
    label: str
    on: dt.date = Field(description="The IST day the 09:00 run sends it")
    switch_on: bool = Field(description="False: switched off in Settings, so it won't go")
    note: str | None = Field(default=None, description='e.g. "once the balance is paid"')
