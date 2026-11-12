"""The AI concierge (06 A7, v3 C1; migration 0028).

- `conversations`: one per chat. The browser holds the id in React memory (no cookie, no
  storage); `ip_hash` is the keyed digest `services/enquiries.hash_ip` makes.
- `messages`: one row per visitor message and one per concierge turn. `parts` holds the same
  shapes the stream emits (text, tool-call, tool-result), plus the model's opaque thought
  signature where it gave one, so the next turn can replay the history exactly.
- `chat_budget`: the site-wide cap, one row per IST day, incremented under a row lock so the cap
  holds even when the per-IP limiter (Upstash) fails open.
- `departure_alerts`: "email me when new dates are added" (R30, C3) — one email, then closed.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedMixin, IdMixin, TextEnum, TimestampsMixin
from app.models.enums import ConversationOutcome, MessageRole


class Conversation(IdMixin, TimestampsMixin, Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint(
            "outcome IN ('open', 'booking_started', 'enquiry_created', 'dropped')", name="outcome"
        ),
        Index("ix_conversations_created_at", text("created_at DESC")),
        Index("ix_conversations_outcome_created_at", "outcome", text("created_at DESC")),
    )

    ip_hash: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    outcome: Mapped[ConversationOutcome] = mapped_column(
        TextEnum(ConversationOutcome), nullable=False, server_default=ConversationOutcome.OPEN
    )
    model: Mapped[str | None] = mapped_column(Text)  # the model that answered the latest turn
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    tokens_in: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    tokens_out: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    first_user_message: Mapped[str] = mapped_column(Text, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text)


class Message(IdMixin, CreatedMixin, Base):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="role"),
        Index("ix_messages_conversation_id_created_at", "conversation_id", "created_at"),
    )

    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[MessageRole] = mapped_column(TextEnum(MessageRole), nullable=False)
    parts: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)


class ChatBudget(Base):
    __tablename__ = "chat_budget"

    day: Mapped[date] = mapped_column(Date, primary_key=True)  # IST
    turns: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    cap_hit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DepartureAlert(IdMixin, CreatedMixin, Base):
    __tablename__ = "departure_alerts"
    __table_args__ = (
        CheckConstraint("num_nonnulls(package_id, destination_id) = 1", name="one_target"),
        Index(
            "uq_departure_alerts_open",
            "email",
            "package_id",
            "destination_id",
            unique=True,
            postgresql_where=text("sent_at IS NULL"),
            postgresql_nulls_not_distinct=True,
        ),
        Index("ix_departure_alerts_package_id", "package_id"),
        Index("ix_departure_alerts_destination_id", "destination_id"),
    )

    email: Mapped[str] = mapped_column(Text, nullable=False)  # lower-cased
    package_id: Mapped[str | None] = mapped_column(ForeignKey("packages.id", ondelete="CASCADE"))
    destination_id: Mapped[str | None] = mapped_column(
        ForeignKey("destinations.id", ondelete="CASCADE")
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
