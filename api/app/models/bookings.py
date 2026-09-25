"""Booking engine tables (06 A6, v2): bookings, their travellers, payments, cancellations, reviews.

Seats are never stored: the `departure_availability` view (0004_v2) subtracts confirmed
travellers and live pending holds from `departures.seats_total`. Add-on D's `split` column is here
from the start; its `payments.share_id` arrives with the `booking_shares` table.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedMixin, IdMixin, TimestampsMixin, pg_enum
from app.models.enums import (
    BookingStatus,
    CancellationStatus,
    CancelReason,
    Occupancy,
    PaymentProvider,
    PaymentStatus,
)


class Booking(IdMixin, TimestampsMixin, Base):
    __tablename__ = "bookings"
    __table_args__ = (
        Index("ix_bookings_departure_id_status", "departure_id", "status"),
        Index("ix_bookings_user_id_created_at", "user_id", "created_at"),
        Index("ix_bookings_status_hold_expires_at", "status", "hold_expires_at"),
    )

    ref: Mapped[str] = mapped_column(Text, nullable=False, unique=True)  # TB-XXXXXX
    package_id: Mapped[str] = mapped_column(
        ForeignKey("packages.id", ondelete="RESTRICT"), nullable=False
    )
    departure_id: Mapped[str] = mapped_column(
        ForeignKey("departures.id", ondelete="RESTRICT"), nullable=False
    )
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))  # attached at checkout
    status: Mapped[BookingStatus] = mapped_column(
        pg_enum(BookingStatus, "booking_status"),
        nullable=False,
        server_default=BookingStatus.PENDING.value,
    )
    hold_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    contact_name: Mapped[str] = mapped_column(Text, nullable=False)
    contact_phone: Mapped[str] = mapped_column(Text, nullable=False)
    contact_email: Mapped[str] = mapped_column(Text, nullable=False)
    origin_city: Mapped[str | None] = mapped_column(Text)  # ⏩ departure-city add-on
    quote: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)  # breakdown snapshot
    total_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    paid_paise: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    cancel_reason: Mapped[CancelReason | None] = mapped_column(
        pg_enum(CancelReason, "cancel_reason")
    )  # set in the same UPDATE as `cancelled`
    refund_needed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )  # late capture with no seats left
    split: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")  # add-on D

    travellers: Mapped[list["BookingTraveller"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan", order_by="BookingTraveller.id"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="booking", order_by="Payment.created_at"
    )
    cancellation: Mapped["BookingCancellation | None"] = relationship(back_populates="booking")


class BookingTraveller(IdMixin, Base):
    __tablename__ = "booking_travellers"
    __table_args__ = (Index("ix_booking_travellers_booking_id", "booking_id"),)

    booking_id: Mapped[str] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    age: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    occupancy: Mapped[Occupancy] = mapped_column(pg_enum(Occupancy, "occupancy"), nullable=False)

    booking: Mapped[Booking] = relationship(back_populates="travellers")


class Payment(IdMixin, TimestampsMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (
        Index("ix_payments_booking_id", "booking_id"),
        Index("ix_payments_razorpay_order_id", "razorpay_order_id"),
    )

    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    provider: Mapped[PaymentProvider] = mapped_column(
        pg_enum(PaymentProvider, "payment_provider"), nullable=False
    )
    razorpay_order_id: Mapped[str | None] = mapped_column(Text)
    # Unique so a replayed webhook can never record the same capture twice (nulls don't clash).
    razorpay_payment_id: Mapped[str | None] = mapped_column(Text, unique=True)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        pg_enum(PaymentStatus, "payment_status"),
        nullable=False,
        server_default=PaymentStatus.CREATED.value,
    )
    raw: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # last webhook payload

    booking: Mapped[Booking] = relationship(back_populates="payments")


class BookingCancellation(IdMixin, CreatedMixin, Base):
    __tablename__ = "booking_cancellations"

    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), nullable=False, unique=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)  # the customer's words
    status: Mapped[CancellationStatus] = mapped_column(
        pg_enum(CancellationStatus, "cancellation_status"),
        nullable=False,
        server_default=CancellationStatus.REQUESTED.value,
    )
    refund_note: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    booking: Mapped[Booking] = relationship(back_populates="cancellation")


class Review(IdMixin, CreatedMixin, Base):
    """One per `completed` booking; hidden until the owner approves. No photo (R21)."""

    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint("rating between 1 and 5", name="rating_range"),
        Index("ix_reviews_package_id_approved", "package_id", "approved"),
    )

    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), nullable=False, unique=True)
    package_id: Mapped[str] = mapped_column(ForeignKey("packages.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    approved: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
