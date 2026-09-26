"""Own auth tables (06 A2). `verification` holds the customer sign-in codes (B8, R18)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, SmallInteger, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedMixin, IdMixin, TimestampsMixin, pg_enum
from app.models.enums import UserRole


class User(IdMixin, TimestampsMixin, Base):
    __tablename__ = "users"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str | None] = mapped_column(Text)  # argon2; null for OTP-only (v2)
    role: Mapped[UserRole] = mapped_column(
        pg_enum(UserRole, "user_role"), nullable=False, server_default=UserRole.CUSTOMER.value
    )

    sessions: Mapped[list["Session"]] = relationship(back_populates="user")


class Session(IdMixin, CreatedMixin, Base):
    __tablename__ = "sessions"
    __table_args__ = (Index("ix_sessions_user_id", "user_id"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # The legacy raw `token` column (pre-v1.0.1) is deliberately unmapped: it is still in the
    # table, nullable and unwritten, until migration 0004_v2 drops it.
    # sha256 hex of the cookie value (services/auth/sessions.py::hash_token) — what lookups use.
    # Nullable only because 0003 is expand-only; every row the current code writes has one.
    token_hash: Mapped[str | None] = mapped_column(Text, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ip: Mapped[str | None] = mapped_column(Text)
    user_agent: Mapped[str | None] = mapped_column(Text)

    user: Mapped[User] = relationship(back_populates="sessions")


class Verification(IdMixin, CreatedMixin, Base):
    __tablename__ = "verification"
    __table_args__ = (Index("ix_verification_identifier_created_at", "identifier", "created_at"),)

    identifier: Mapped[str] = mapped_column(Text, nullable=False)  # email, lower-cased
    code_hash: Mapped[str] = mapped_column(Text, nullable=False)  # HMAC, services/auth/otp.py
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Set on success, on the fifth wrong try, and when a newer code replaces this one.
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
