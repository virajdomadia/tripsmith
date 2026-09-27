"""Booking engine tables (06 A6, v2): bookings, their travellers, payments, cancellations, reviews,
and (v2.5) each booking's append-only history (P16) and its refunds (P13).

Seats are never stored: the `departure_availability` view (0004_v2) subtracts confirmed
travellers and live pending holds from `departures.seats_total`. Add-on D's `split` column is here
from the start; its `payments.share_id` arrives with the `booking_shares` table.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    SmallInteger,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedMixin, IdMixin, TimestampsMixin, pg_enum
from app.models.enums import (
    BookingActor,
    BookingStatus,
    CancellationStatus,
    CancelReason,
    Occupancy,
    PaymentProvider,
    PaymentStatus,
    RefundStatus,
)


class Booking(IdMixin, TimestampsMixin, Base):
    __tablename__ = "bookings"
    __table_args__ = (
        Index("ix_bookings_departure_id_status", "departure_id", "status"),
        Index("ix_bookings_user_id_created_at", "user_id", "created_at"),
        Index("ix_bookings_status_hold_expires_at", "status", "hold_expires_at"),
        Index("ix_bookings_contact_email", "contact_email"),  # 0005: My trips by email
        Index(  # 0009: a coupon's uses, and its uses by one email
            "ix_bookings_coupon_code",
            "coupon_code",
            "contact_email",
            postgresql_where=text("coupon_code IS NOT NULL"),
        ),
    )

    ref: Mapped[str] = mapped_column(Text, nullable=False, unique=True)  # TB-XXXXXX
    package_id: Mapped[str] = mapped_column(
        ForeignKey("packages.id", ondelete="RESTRICT"), nullable=False
    )
    departure_id: Mapped[str] = mapped_column(
        ForeignKey("departures.id", ondelete="RESTRICT"), nullable=False
    )
    # Set when the customer verifies this email (B8); ownership rule in services/account.py.
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
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
    # 0009 (B15): the coupon the booking was quoted with, upper case; the discount is in `quote`.
    coupon_code: Mapped[str | None] = mapped_column(Text)
    split: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")  # add-on D

    travellers: Mapped[list["BookingTraveller"]] = relationship(
        back_populates="booking",
        cascade="all, delete-orphan",
        order_by="[BookingTraveller.position, BookingTraveller.id]",
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
    # 0006: the traveller's place in the booking form, 0 first (ids are random cuid2s).
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")

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
    refunds: Mapped[list["Refund"]] = relationship(
        back_populates="payment", order_by="Refund.created_at"
    )


class Refund(IdMixin, TimestampsMixin, Base):
    """Money going back from one payment (R51, P13, 0012) — written through
    `services/booking/refunds.py`, never directly.

    The row is committed before Razorpay is called, and its `id` is the call's idempotency key.
    Until it fails, its amount is already off `bookings.paid_paise`, so what is owed never counts
    it twice; a failure puts it back. `by_hand` = made outside the API: an offline payment's
    (`requested` until the owner records it) or one recorded by hand before P13.
    """

    __tablename__ = "refunds"
    __table_args__ = (
        Index("ix_refunds_booking_id", "booking_id"),
        Index("ix_refunds_payment_id", "payment_id"),
        CheckConstraint("amount_paise > 0", name="amount_positive"),
    )

    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    payment_id: Mapped[str] = mapped_column(ForeignKey("payments.id"), nullable=False)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[RefundStatus] = mapped_column(
        pg_enum(RefundStatus, "refund_status"),
        nullable=False,
        server_default=RefundStatus.REQUESTED.value,
    )
    # cancellation | seats_gone | surplus | owner — and, from later rows, date_change | balance
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    by_hand: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    razorpay_refund_id: Mapped[str | None] = mapped_column(Text, unique=True)
    error: Mapped[str | None] = mapped_column(Text)  # why the last try did not go through
    note: Mapped[str | None] = mapped_column(Text)  # the owner's, on a by-hand refund
    requested_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    raw: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # Razorpay's last refund entity
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    payment: Mapped[Payment] = relationship(back_populates="refunds")


class BookingCancellation(IdMixin, CreatedMixin, Base):
    __tablename__ = "booking_cancellations"

    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), nullable=False, unique=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)  # the customer's words
    status: Mapped[CancellationStatus] = mapped_column(
        pg_enum(CancellationStatus, "cancellation_status"),
        nullable=False,
        server_default=CancellationStatus.REQUESTED.value,
    )
    refund_note: Mapped[str | None] = mapped_column(Text)  # the owner's note to the customer
    refund_paise: Mapped[int | None] = mapped_column(Integer)  # agreed on approval (B11)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    booking: Mapped[Booking] = relationship(back_populates="cancellation")


class Review(IdMixin, CreatedMixin, Base):
    """One per `completed` booking; hidden until the owner approves. No photo (R21).

    State (B13): `moderated_at` null = pending; set + `approved` = published; set + not
    `approved` = hidden. Only published reviews count in `packages.rating_avg / rating_count`."""

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
    moderated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # 0008


class BookingEvent(Base):
    """One line of a booking's history (R54, P16) — append-only: a trigger (0010) refuses any
    UPDATE or DELETE, so an entry once written can never be edited or removed.

    `text` is the owner's wording; `customer_text` the customer's, or null when the entry is
    not theirs to see. `id` orders entries written in the same instant. `source` is `backfill`
    for entries 0010 rebuilt from v2 rows, where `approx` marks a time read off `updated_at`.
    Write through `services/booking/history.py`, never directly.
    """

    __tablename__ = "booking_events"
    __table_args__ = (
        Index("ix_booking_events_booking_id_id", "booking_id", "id"),
        CheckConstraint("source IN ('live', 'backfill')", name="source"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.clock_timestamp()
    )
    actor: Mapped[BookingActor] = mapped_column(
        pg_enum(BookingActor, "booking_actor"), nullable=False
    )
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(Text, nullable=False)  # `payment.captured`, …
    text: Mapped[str] = mapped_column(Text, nullable=False)
    customer_text: Mapped[str | None] = mapped_column(Text)
    before: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="live")
    approx: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    logged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.clock_timestamp()
    )
