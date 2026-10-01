"""The waitlist (R44, P6; migration 0018).

One row per person waiting for a sold-out departure. `position` orders the list; moving to the
back is the departure's highest position + 1. An `offered` row holds its party's seats until
`offer_expires_at` — the `departure_availability` view subtracts them, so an offer lapses by
itself exactly like a hold. `mail_due` is the email the row still owes; the sender claims it
with one guarded UPDATE, so a race never sends it twice. `events` is the row's own short log
(joined, offered, lapsed, emailed, removed) for the owner's list.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TextEnum, TimestampsMixin
from app.models.enums import WaitlistMail, WaitlistState

LIVE_STATES = "state IN ('waiting', 'offered', 'claimed')"


class WaitlistEntry(IdMixin, TimestampsMixin, Base):
    __tablename__ = "waitlist_entries"
    __table_args__ = (
        CheckConstraint("party BETWEEN 1 AND 12", name="party"),
        CheckConstraint(
            "state IN ('waiting', 'offered', 'claimed', 'booked', 'removed', 'closed')",
            name="state",
        ),
        CheckConstraint("mail_due IS NULL OR mail_due IN ('offer', 'lapse')", name="mail_due"),
        CheckConstraint("state <> 'offered' OR offer_expires_at IS NOT NULL", name="offer_ends"),
        Index(
            "uq_waitlist_entries_departure_email",
            "departure_id",
            "email",
            unique=True,
            postgresql_where=text(LIVE_STATES),
        ),
        Index("ix_waitlist_entries_departure_state_position", "departure_id", "state", "position"),
        Index("ix_waitlist_entries_email", "email"),
        Index(
            "ix_waitlist_entries_mail_due",
            "mail_due",
            postgresql_where=text("mail_due IS NOT NULL"),
        ),
    )

    departure_id: Mapped[str] = mapped_column(
        ForeignKey("departures.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)  # lower case
    party: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    position: Mapped[int] = mapped_column(BigInteger, nullable=False)
    state: Mapped[WaitlistState] = mapped_column(
        TextEnum(WaitlistState), nullable=False, server_default=WaitlistState.WAITING.value
    )
    offer_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    offer_no: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    offered_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    booking_id: Mapped[str | None] = mapped_column(ForeignKey("bookings.id", ondelete="SET NULL"))
    joined_ip: Mapped[str | None] = mapped_column(Text)
    mail_due: Mapped[WaitlistMail | None] = mapped_column(TextEnum(WaitlistMail))
    events: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
