"""Automatic trip emails (R53, P15; migration 0023).

- `email_sends` is the ledger: one row per email the cron (or the refund webhook) owes, keyed by
  `key` — `<type>:<booking>:<stage>:<anchor>` for a booking's email (the anchor is the departure
  day, or the balance's due day, so a date change re-arms every stage), `refund:<refund id>`, and
  `still_thinking:<email>:<package>` (once per address per package, ever). The row is inserted
  and committed BEFORE the send, so a re-run or a race never sends twice.
- `email_switches`: the owner's on/off per automatic type; no row = on.
- `email_suppressions`: an address that unsubscribed from a type (review request, still-thinking).
"""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TextEnum, TimestampsMixin
from app.models.enums import EmailSendState, EmailType

TYPES = (
    "'balance_reminder', 'details_reminder', 'trip_pack', 'review_request', 'still_thinking', "
    "'refund'"
)


class EmailSend(IdMixin, TimestampsMixin, Base):
    __tablename__ = "email_sends"
    __table_args__ = (
        CheckConstraint(f"type IN ({TYPES})", name="type"),
        CheckConstraint("state IN ('sending', 'sent', 'held', 'failed', 'skipped')", name="state"),
        Index("uq_email_sends_key", "key", unique=True),
        Index("ix_email_sends_booking_id", "booking_id"),
        Index(
            "ix_email_sends_retry",
            "state",
            postgresql_where=text("state = 'failed'"),
        ),
    )

    key: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[EmailType] = mapped_column(TextEnum(EmailType), nullable=False)
    booking_id: Mapped[str | None] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"))
    email: Mapped[str] = mapped_column(Text, nullable=False)  # lower case
    package_id: Mapped[str | None] = mapped_column(ForeignKey("packages.id", ondelete="CASCADE"))
    stage: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    anchor: Mapped[date | None] = mapped_column(Date)
    state: Mapped[EmailSendState] = mapped_column(
        TextEnum(EmailSendState), nullable=False, server_default=EmailSendState.SENDING.value
    )
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="1")
    error: Mapped[str | None] = mapped_column(Text)  # the kind only, never an address
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EmailSwitch(Base):
    __tablename__ = "email_switches"
    __table_args__ = (CheckConstraint(f"type IN ({TYPES})", name="type"),)

    type: Mapped[EmailType] = mapped_column(TextEnum(EmailType), primary_key=True)
    on: Mapped[bool] = mapped_column(Boolean, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class EmailSuppression(Base):
    __tablename__ = "email_suppressions"
    __table_args__ = (CheckConstraint(f"type IN ({TYPES})", name="type"),)

    email: Mapped[str] = mapped_column(Text, primary_key=True)  # lower case
    type: Mapped[EmailType] = mapped_column(TextEnum(EmailType), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
