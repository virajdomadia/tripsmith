"""P18 — counter booking (R56).

- `bookings.channel` — where the booking came from: `web` (the Book-now sheet), or one the owner
  made at the counter: `phone`, `walk_in`, `whatsapp`, `enquiry` (converted from one). Text with
  a check (models/base.py `TextEnum`); the default makes every existing booking `web`;
- `bookings.created_by_user_id` — the owner who made a counter booking (null on the web);
- `bookings.enquiry_id` — the enquiry it was converted from;
- `payments.razorpay_link_id` — P18b's Razorpay Payment Link (`plink_…`), whose order only
  exists once the payer opens it;
- `booking_travellers.age` becomes nullable: a counter booking may take travellers' details
  later (adults only; a child's age sets the rate).

ADD-only (plus one DROP NOT NULL), with defaults the deployed code never reads and nulls it never
meets (only the new code writes them), so it is safe to run against production BEFORE the P18
code merges.

Revision ID: 0017
Revises: 0016
Create Date: 2026-09-30 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CHANNEL = "channel IN ('web', 'phone', 'walk_in', 'whatsapp', 'enquiry')"


def upgrade() -> None:
    # Brief ACCESS EXCLUSIVE locks: give up rather than queue reads behind a long transaction.
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column("bookings", sa.Column("channel", sa.Text(), nullable=False, server_default="web"))
    op.create_check_constraint(op.f("ck_bookings_channel"), "bookings", CHANNEL)
    op.add_column(
        "bookings",
        sa.Column(
            "created_by_user_id",
            sa.Text(),
            sa.ForeignKey("users.id", name=op.f("fk_bookings_created_by_user_id_users")),
        ),
    )
    op.add_column(
        "bookings",
        sa.Column(
            "enquiry_id",
            sa.Text(),
            sa.ForeignKey(
                "enquiries.id",
                name=op.f("fk_bookings_enquiry_id_enquiries"),
                ondelete="SET NULL",
            ),
        ),
    )
    op.create_index(
        "ix_bookings_enquiry_id",
        "bookings",
        ["enquiry_id"],
        postgresql_where=sa.text("enquiry_id IS NOT NULL"),
    )
    op.add_column("payments", sa.Column("razorpay_link_id", sa.Text()))
    op.create_index(
        "uq_payments_razorpay_link_id",
        "payments",
        ["razorpay_link_id"],
        unique=True,
        postgresql_where=sa.text("razorpay_link_id IS NOT NULL"),
    )
    op.alter_column("booking_travellers", "age", existing_type=sa.SmallInteger(), nullable=True)


def downgrade() -> None:
    # Travellers whose age was left for later get 0 back, so NOT NULL can return.
    op.execute("UPDATE booking_travellers SET age = 0 WHERE age IS NULL")
    op.alter_column("booking_travellers", "age", existing_type=sa.SmallInteger(), nullable=False)
    op.drop_index("uq_payments_razorpay_link_id", table_name="payments")
    op.drop_column("payments", "razorpay_link_id")
    op.drop_index("ix_bookings_enquiry_id", table_name="bookings")
    op.drop_column("bookings", "enquiry_id")
    op.drop_column("bookings", "created_by_user_id")
    op.drop_constraint(op.f("ck_bookings_channel"), "bookings", type_="check")
    op.drop_column("bookings", "channel")
