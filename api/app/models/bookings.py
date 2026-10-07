"""Booking engine tables (06 A6, v2): bookings, their travellers, payments, cancellations, reviews,
and (v2.5) each booking's append-only history (P16) and its refunds (P13).

Seats are never stored: the `departure_availability` view (0004_v2) subtracts confirmed
travellers and live pending holds from `departures.seats_total`. Add-on D's `split` column is here
from the start; its `payments.share_id` arrives with the `booking_shares` table.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedMixin, IdMixin, TextEnum, TimestampsMixin, pg_enum
from app.models.enums import (
    AddonBasis,
    BookingActor,
    BookingChannel,
    BookingStatus,
    CancellationStatus,
    CancelReason,
    DateChangeState,
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
        CheckConstraint(  # 0016 (P5)
            "(deposit_paise IS NULL) = (balance_due_on IS NULL) "
            "AND (deposit_paise IS NULL OR deposit_paise > 0)",
            name="deposit_due",
        ),
        Index(  # 0016: the daily tidy's reminder and overdue scans
            "ix_bookings_balance_due_on",
            "balance_due_on",
            postgresql_where=text("status = 'partially_paid'"),
        ),
        CheckConstraint(  # 0017 (P18)
            "channel IN ('web', 'phone', 'walk_in', 'whatsapp', 'enquiry')", name="channel"
        ),
        Index(
            "ix_bookings_enquiry_id",
            "enquiry_id",
            postgresql_where=text("enquiry_id IS NOT NULL"),
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
    # 0013 (P13b): the State asked at checkout (place of supply) and an optional business GSTIN
    # with its company name. Null on bookings made before it — treated as Karnataka.
    billing_state: Mapped[str | None] = mapped_column(Text)
    gstin: Mapped[str | None] = mapped_column(Text)
    company_name: Mapped[str | None] = mapped_column(Text)
    split: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")  # add-on D
    # 0016 (P5, R43): the deposit the booking was made on (null = paid in full) and the IST day
    # its balance is due. `partially_paid` = the deposit is in, the seats held, the balance open.
    deposit_paise: Mapped[int | None] = mapped_column(Integer)
    balance_due_on: Mapped[date | None] = mapped_column(Date)
    # The refund the policy gave when the balance went unpaid (`balance_unpaid`).
    balance_refund_paise: Mapped[int | None] = mapped_column(Integer)
    # 0017 (P18, R56): where it came from, the owner who made it at the counter, and the enquiry
    # it was converted from.
    channel: Mapped[BookingChannel] = mapped_column(
        TextEnum(BookingChannel), nullable=False, server_default=BookingChannel.WEB.value
    )
    created_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    enquiry_id: Mapped[str | None] = mapped_column(ForeignKey("enquiries.id", ondelete="SET NULL"))
    # 0021 (P9, R49): the package checklist items the customer has ticked, by key.
    checklist_done: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default="{}"
    )

    travellers: Mapped[list["BookingTraveller"]] = relationship(
        back_populates="booking",
        cascade="all, delete-orphan",
        order_by="[BookingTraveller.position, BookingTraveller.id]",
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="booking", order_by="Payment.created_at"
    )
    cancellation: Mapped["BookingCancellation | None"] = relationship(back_populates="booking")
    addons: Mapped[list["BookingAddon"]] = relationship(
        back_populates="booking",
        order_by="[BookingAddon.created_at, BookingAddon.position, BookingAddon.id]",
    )


class BookingTraveller(IdMixin, Base):
    __tablename__ = "booking_travellers"
    __table_args__ = (Index("ix_booking_travellers_booking_id", "booking_id"),)

    booking_id: Mapped[str] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    # Null = left for later at the counter (P18, 0017); a child's age is always known.
    age: Mapped[int | None] = mapped_column(SmallInteger)
    occupancy: Mapped[Occupancy] = mapped_column(pg_enum(Occupancy, "occupancy"), nullable=False)
    # 0006: the traveller's place in the booking form, 0 first (ids are random cuid2s).
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")

    booking: Mapped[Booking] = relationship(back_populates="travellers")


class Payment(IdMixin, TimestampsMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (
        Index("ix_payments_booking_id", "booking_id"),
        Index("ix_payments_razorpay_order_id", "razorpay_order_id"),
        Index(  # 0019 (P7)
            "ix_payments_date_change_id",
            "date_change_id",
            postgresql_where=text("date_change_id IS NOT NULL"),
        ),
        Index(  # 0017 (P18b)
            "uq_payments_razorpay_link_id",
            "razorpay_link_id",
            unique=True,
            postgresql_where=text("razorpay_link_id IS NOT NULL"),
        ),
    )

    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    provider: Mapped[PaymentProvider] = mapped_column(
        pg_enum(PaymentProvider, "payment_provider"), nullable=False
    )
    razorpay_order_id: Mapped[str | None] = mapped_column(Text)
    # 0017 (P18b): a Payment Link's id; its order appears only once the payer opens the link.
    razorpay_link_id: Mapped[str | None] = mapped_column(Text)
    # Unique so a replayed webhook can never record the same capture twice (nulls don't clash).
    razorpay_payment_id: Mapped[str | None] = mapped_column(Text, unique=True)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        pg_enum(PaymentStatus, "payment_status"),
        nullable=False,
        server_default=PaymentStatus.CREATED.value,
    )
    raw: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # last webhook payload
    # 0014 (P8b): the priced "Add extras" selection this order pays for; null on a booking order.
    extras: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB(none_as_null=True))
    # 0019 (P7): the date change this order pays the difference of; null on any other order.
    date_change_id: Mapped[str | None] = mapped_column(ForeignKey("date_changes.id"))

    booking: Mapped[Booking] = relationship(back_populates="payments")
    refunds: Mapped[list["Refund"]] = relationship(
        back_populates="payment", order_by="Refund.created_at"
    )


class BookingAddon(IdMixin, CreatedMixin, Base):
    """An add-on a booking bought (R46, P8, 0014) — the booking's own copy of the name and the
    price, so the owner editing or deleting the package's add-on never changes it. `travellers`
    is 1 for a per-booking add-on; `nights` is 1 unless it is charged per night. `payment_id` is
    the "Add extras" payment that bought it, null when it came with the booking. An add-on the
    owner takes off keeps its row, with `removed_at` and the refund that paid it back."""

    __tablename__ = "booking_addons"
    __table_args__ = (
        Index("ix_booking_addons_booking_id", "booking_id"),
        Index("ix_booking_addons_addon_id", "addon_id"),
        CheckConstraint("basis IN ('booking', 'traveller', 'night')", name="basis"),
        CheckConstraint("amount_paise > 0", name="amount_positive"),
    )

    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    addon_id: Mapped[str | None] = mapped_column(
        ForeignKey("package_addons.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    basis: Mapped[AddonBasis] = mapped_column(TextEnum(AddonBasis), nullable=False)
    unit_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    travellers: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    nights: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="1")
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    payment_id: Mapped[str | None] = mapped_column(ForeignKey("payments.id"))
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refund_id: Mapped[str | None] = mapped_column(ForeignKey("refunds.id"))

    booking: Mapped[Booking] = relationship(back_populates="addons")


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
    # cancellation | seats_gone | surplus | owner | addon (P8b) — later rows: date_change | balance
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


class GstCounter(Base):
    """The last GST document number used per (kind, FY) — incremented in the same transaction
    that inserts the document, so numbers never skip or repeat (0013). Write through
    `services/gst/documents.py`."""

    __tablename__ = "gst_counters"

    kind: Mapped[str] = mapped_column(Text, primary_key=True)
    fy: Mapped[str] = mapped_column(Text, primary_key=True)
    last: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class GstDocument(IdMixin, Base):
    """A receipt, tax invoice or credit note issued for a booking (R51, P13b, 0013). The PDF is
    rendered on demand from the booking as it stands; the row fixes its number, amount and
    date. Write through `services/gst/documents.py`."""

    __tablename__ = "gst_documents"
    __table_args__ = (
        Index("ix_gst_documents_booking_id", "booking_id"),
        Index(
            "uq_gst_documents_receipt",
            "payment_id",
            unique=True,
            postgresql_where=text("kind = 'receipt'"),
        ),
        Index(
            "uq_gst_documents_invoice",
            "booking_id",
            unique=True,
            postgresql_where=text("kind = 'invoice' AND payment_id IS NULL"),
        ),
        Index(  # 0014 (P8b): a second invoice for extras bought after the first
            "uq_gst_documents_extras_invoice",
            "payment_id",
            unique=True,
            postgresql_where=text("kind = 'invoice' AND payment_id IS NOT NULL"),
        ),
        Index(
            "uq_gst_documents_credit_note",
            "refund_id",
            unique=True,
            postgresql_where=text("kind = 'credit_note'"),
        ),
        CheckConstraint("kind IN ('receipt', 'invoice', 'credit_note')", name="kind"),
        UniqueConstraint("kind", "fy", "seq", name="uq_gst_documents_kind"),
    )

    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    fy: Mapped[str] = mapped_column(Text, nullable=False)  # "2026-27"
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    number: Mapped[str] = mapped_column(Text, nullable=False, unique=True)  # "RC/2026-27/0001"
    payment_id: Mapped[str | None] = mapped_column(ForeignKey("payments.id"))
    refund_id: Mapped[str | None] = mapped_column(ForeignKey("refunds.id"))
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)  # GST-inclusive
    dated: Mapped[date] = mapped_column(Date, nullable=False)  # the IST day of the event
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class DateChange(IdMixin, TimestampsMixin, Base):
    """A move of a booking to another departure of its trip (R45, P7, 0019) — written through
    `services/booking/changes.py`, never directly.

    `held` keeps `party` seats on `to_departure_id` until `hold_expires_at` while the customer
    pays the difference: the `departure_availability` view subtracts them, so the hold lapses by
    itself like a booking's. `quote` is the booking's new price snapshot; `net_paise` = new fare
    − current fare + fee (signed), `pay_paise` what was asked for now. `invoiced` = the booking
    was paid in full (its tax invoice exists) when the change was made, so the change is a supply
    of its own: a price-up gets a supplementary invoice, a price-down refund a credit note.
    `travellers` = the new party when the owner changed it (P7b); null = the same party.
    """

    __tablename__ = "date_changes"
    __table_args__ = (
        Index("ix_date_changes_booking_id", "booking_id"),
        Index(
            "ix_date_changes_held",
            "to_departure_id",
            "hold_expires_at",
            postgresql_where=text("state = 'held'"),
        ),
        CheckConstraint("state IN ('held', 'done', 'lapsed', 'cancelled')", name="state"),
        CheckConstraint("actor IN ('customer', 'owner')", name="actor"),
        CheckConstraint("party BETWEEN 1 AND 12", name="party"),
        CheckConstraint("fee_paise >= 0 AND pay_paise >= 0", name="amounts"),
        CheckConstraint("state <> 'held' OR hold_expires_at IS NOT NULL", name="hold_ends"),
    )

    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    from_departure_id: Mapped[str] = mapped_column(ForeignKey("departures.id"), nullable=False)
    to_departure_id: Mapped[str] = mapped_column(ForeignKey("departures.id"), nullable=False)
    party: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    state: Mapped[DateChangeState] = mapped_column(TextEnum(DateChangeState), nullable=False)
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fee_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    net_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    pay_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    quote: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    invoiced: Mapped[bool] = mapped_column(Boolean, nullable=False)
    actor: Mapped[str] = mapped_column(Text, nullable=False)  # customer | owner
    by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str | None] = mapped_column(Text)  # the owner's, for a changed fee
    travellers: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB(none_as_null=True))
