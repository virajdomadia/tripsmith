"""Enquiries (06 A4). `conversation_id` is a plain ⏩ column until 0003_v3 adds the FK."""

from datetime import date

from sqlalchemy import Date, ForeignKey, Index, Integer, SmallInteger, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedMixin, IdMixin, TimestampsMixin, pg_enum
from app.models.enums import EmailStatus, EnquiryStatus, EnquiryType


class Enquiry(IdMixin, TimestampsMixin, Base):
    __tablename__ = "enquiries"
    __table_args__ = (
        Index("ix_enquiries_status_created_at", "status", "created_at"),
        Index("ix_enquiries_package_id", "package_id"),
        Index("ix_enquiries_phone_package_id_created_at", "phone", "package_id", "created_at"),
    )

    ref: Mapped[str] = mapped_column(Text, nullable=False, unique=True)  # TS-XXXXXX
    type: Mapped[EnquiryType] = mapped_column(pg_enum(EnquiryType, "enquiry_type"), nullable=False)
    package_id: Mapped[str | None] = mapped_column(ForeignKey("packages.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[str] = mapped_column(Text, nullable=False)  # Indian mobile, validated in schema
    email: Mapped[str] = mapped_column(Text, nullable=False)
    travel_month: Mapped[date | None] = mapped_column(Date)  # first of month
    adults: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    children: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    message: Mapped[str | None] = mapped_column(Text)
    preferred_dates: Mapped[str | None] = mapped_column(Text)  # custom
    budget_paise: Mapped[int | None] = mapped_column(Integer)  # custom
    changes: Mapped[str | None] = mapped_column(Text)  # custom
    preferred_time: Mapped[str | None] = mapped_column(Text)  # ⏩ callback
    status: Mapped[EnquiryStatus] = mapped_column(
        pg_enum(EnquiryStatus, "enquiry_status"),
        nullable=False,
        server_default=EnquiryStatus.NEW.value,
    )
    email_status: Mapped[EmailStatus] = mapped_column(
        pg_enum(EmailStatus, "email_status"),
        nullable=False,
        server_default=EmailStatus.SKIPPED.value,
    )
    conversation_id: Mapped[str | None] = mapped_column(Text)  # ⏩ v3 handoff (FK in 0003)
    ip_hash: Mapped[str | None] = mapped_column(Text)
    user_agent: Mapped[str | None] = mapped_column(Text)

    notes: Mapped[list["EnquiryNote"]] = relationship(
        back_populates="enquiry", cascade="all, delete-orphan", order_by="EnquiryNote.created_at"
    )


class EnquiryNote(IdMixin, CreatedMixin, Base):
    """Append-only."""

    __tablename__ = "enquiry_notes"

    enquiry_id: Mapped[str] = mapped_column(
        ForeignKey("enquiries.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)

    enquiry: Mapped[Enquiry] = relationship(back_populates="notes")
