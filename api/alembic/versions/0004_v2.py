"""v2 — booking engine tables, enquiry_messages, booking-aware departure_availability (06 A10).

Runs on production BEFORE the B2 code merges, so it must leave the deployed v1.0.1 api working:
- everything is ADD-only (new enums, new tables) except two changes the live code cannot see:
  - `sessions.token` is dropped — the CONTRACT step deferred from 0003; B1 (PR #58) stopped
    mapping it, so no deployed code reads or writes it;
  - `departure_availability` is replaced with the same two columns and types, now subtracting
    booked seats. With no bookings yet it returns exactly what v1 did (`seats_total`).

Seat formula (04 v2 §3): seats_total − travellers on bookings that hold seats, where a `pending`
booking holds them only while `hold_expires_at > now()` — holds expire lazily, never by cron.
`confirmed`, `partially_paid` (add-on D) and `completed` all hold seats: a completed trip used
them, so a past departure does not reopen once the daily job marks it complete. Clamped at 0.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-25 00:15:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Created and dropped explicitly (as in 0001) so a downgrade leaves no stray types behind.
# `occupancy` already has a StrEnum since v1 (pricing) but only becomes a column type here.
ENUMS = {
    "occupancy": ("double", "triple", "single", "child"),
    "message_direction": ("outbound", "inbound"),
    "booking_status": ("pending", "confirmed", "partially_paid", "cancelled", "completed"),
    "payment_provider": ("razorpay", "offline"),
    "payment_status": ("created", "captured", "failed", "refunded"),
    "cancellation_status": ("requested", "approved", "rejected"),
    "cancel_reason": (
        "hold_expired",
        "payment_failed",
        "seats_gone",
        "cancellation_approved",
        "owner_released",
    ),
}


def _enum(name: str) -> postgresql.ENUM:
    return postgresql.ENUM(*ENUMS[name], name=name, create_type=False)


# A correlated subquery rather than a grouped join: callers filter the view by departure, and
# this lets Postgres count one departure's bookings through ix_bookings_departure_id_status.
AVAILABILITY_V2 = """
create or replace view departure_availability as
select
    d.id as departure_id,
    greatest(
        d.seats_total - (
            select count(*)
            from bookings b
            join booking_travellers t on t.booking_id = b.id
            where b.departure_id = d.id
              and (
                  b.status in ('confirmed', 'partially_paid', 'completed')
                  or (b.status = 'pending' and b.hold_expires_at > now())
              )
        ),
        0
    )::smallint as seats_left
from departures d
"""

# 0001's definition, verbatim.
AVAILABILITY_V1 = """
create or replace view departure_availability as
select d.id as departure_id, d.seats_total as seats_left from departures d
"""


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
    )


def _updated_at() -> sa.Column:
    return sa.Column(
        "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
    )


def upgrade() -> None:
    bind = op.get_bind()
    for name in ENUMS:
        _enum(name).create(bind)

    op.create_table(
        "bookings",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("ref", sa.Text(), nullable=False),
        sa.Column("package_id", sa.Text(), nullable=False),
        sa.Column("departure_id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=True),
        sa.Column("status", _enum("booking_status"), server_default="pending", nullable=False),
        sa.Column("hold_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("contact_name", sa.Text(), nullable=False),
        sa.Column("contact_phone", sa.Text(), nullable=False),
        sa.Column("contact_email", sa.Text(), nullable=False),
        sa.Column("origin_city", sa.Text(), nullable=True),
        sa.Column("quote", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("total_paise", sa.Integer(), nullable=False),
        sa.Column("paid_paise", sa.Integer(), server_default="0", nullable=False),
        sa.Column("cancel_reason", _enum("cancel_reason"), nullable=True),
        sa.Column("refund_needed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("split", sa.Boolean(), server_default="false", nullable=False),
        _updated_at(),
        _created_at(),
        sa.ForeignKeyConstraint(
            ["departure_id"],
            ["departures.id"],
            name=op.f("fk_bookings_departure_id_departures"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["packages.id"],
            name=op.f("fk_bookings_package_id_packages"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_bookings_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bookings")),
        sa.UniqueConstraint("ref", name=op.f("uq_bookings_ref")),
    )
    op.create_index("ix_bookings_departure_id_status", "bookings", ["departure_id", "status"])
    op.create_index("ix_bookings_user_id_created_at", "bookings", ["user_id", "created_at"])
    op.create_index("ix_bookings_status_hold_expires_at", "bookings", ["status", "hold_expires_at"])

    op.create_table(
        "booking_travellers",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("booking_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("age", sa.SmallInteger(), nullable=False),
        sa.Column("occupancy", _enum("occupancy"), nullable=False),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name=op.f("fk_booking_travellers_booking_id_bookings"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_booking_travellers")),
    )
    op.create_index("ix_booking_travellers_booking_id", "booking_travellers", ["booking_id"])

    op.create_table(
        "payments",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("booking_id", sa.Text(), nullable=False),
        sa.Column("provider", _enum("payment_provider"), nullable=False),
        sa.Column("razorpay_order_id", sa.Text(), nullable=True),
        sa.Column("razorpay_payment_id", sa.Text(), nullable=True),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("status", _enum("payment_status"), server_default="created", nullable=False),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        _updated_at(),
        _created_at(),
        sa.ForeignKeyConstraint(
            ["booking_id"], ["bookings.id"], name=op.f("fk_payments_booking_id_bookings")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payments")),
        sa.UniqueConstraint("razorpay_payment_id", name=op.f("uq_payments_razorpay_payment_id")),
    )
    op.create_index("ix_payments_booking_id", "payments", ["booking_id"])
    op.create_index("ix_payments_razorpay_order_id", "payments", ["razorpay_order_id"])

    op.create_table(
        "booking_cancellations",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("booking_id", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "status", _enum("cancellation_status"), server_default="requested", nullable=False
        ),
        sa.Column("refund_note", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        _created_at(),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name=op.f("fk_booking_cancellations_booking_id_bookings"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_booking_cancellations")),
        sa.UniqueConstraint("booking_id", name=op.f("uq_booking_cancellations_booking_id")),
    )

    op.create_table(
        "reviews",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("booking_id", sa.Text(), nullable=False),
        sa.Column("package_id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("rating", sa.SmallInteger(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("approved", sa.Boolean(), server_default="false", nullable=False),
        _created_at(),
        sa.CheckConstraint("rating between 1 and 5", name=op.f("ck_reviews_rating_range")),
        sa.ForeignKeyConstraint(
            ["booking_id"], ["bookings.id"], name=op.f("fk_reviews_booking_id_bookings")
        ),
        sa.ForeignKeyConstraint(
            ["package_id"], ["packages.id"], name=op.f("fk_reviews_package_id_packages")
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_reviews_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reviews")),
        sa.UniqueConstraint("booking_id", name=op.f("uq_reviews_booking_id")),
    )
    op.create_index("ix_reviews_package_id_approved", "reviews", ["package_id", "approved"])

    op.create_table(
        "enquiry_messages",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("enquiry_id", sa.Text(), nullable=False),
        sa.Column("direction", _enum("message_direction"), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("resend_id", sa.Text(), nullable=True),
        sa.Column(
            "sent_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["enquiry_id"],
            ["enquiries.id"],
            name=op.f("fk_enquiry_messages_enquiry_id_enquiries"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_enquiry_messages")),
    )
    op.create_index(
        "ix_enquiry_messages_enquiry_id_sent_at", "enquiry_messages", ["enquiry_id", "sent_at"]
    )

    op.execute(AVAILABILITY_V2)

    # CONTRACT (deferred from 0003): the raw cookie values the backfill left behind go with it.
    op.drop_constraint("uq_sessions_token", "sessions", type_="unique")
    op.drop_column("sessions", "token")


def downgrade() -> None:
    # Raw tokens cannot be restored: the column comes back empty and nullable, as 0003 left it
    # for new-code rows (0003's own downgrade then deletes those sessions).
    op.add_column("sessions", sa.Column("token", sa.Text(), nullable=True))
    op.create_unique_constraint("uq_sessions_token", "sessions", ["token"])

    op.execute(AVAILABILITY_V1)  # before the tables it reads are dropped

    op.drop_table("enquiry_messages")
    op.drop_table("reviews")
    op.drop_table("booking_cancellations")
    op.drop_table("payments")
    op.drop_table("booking_travellers")
    op.drop_table("bookings")

    bind = op.get_bind()
    for name in reversed(ENUMS):
        _enum(name).drop(bind)
