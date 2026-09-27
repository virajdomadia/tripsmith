"""P13a — refunds through the Razorpay refund API (R51).

- `refunds`: one row per refund of one payment — the amount, why (`reason`), and where it stands
  (`refund_status`: requested → processed | failed). The row is written and committed before
  the API call, and its id is sent as Razorpay's `X-Refund-Idempotency` key, so a replay, a
  double click or a retry after a lost answer can never refund twice. `by_hand` marks a refund
  made outside the API: an offline payment's (the owner hands it back and records it) and
  every refund recorded by hand before this row.
- The backfill turns each hand-recorded refund of v2 (`payments.raw.refund`, written by 'Refund
  made') into a `processed`, `by_hand` row, so the refunds table is the one record of money
  going back. `payments.raw.refund` stays as it was.

ADD-only, so it is safe to run against production BEFORE the P13a code merges: the deployed api
never names the table. A refund recorded by hand between this migration and the deploy gets no
row (the deploy follows within minutes).

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-27 23:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

refund_status = postgresql.ENUM(
    "requested", "processed", "failed", name="refund_status", create_type=False
)

# Plain SQL with casts: asyncpg through Neon's pooler cannot bind a parameter of an enum created
# in the same transaction (the 0010 gotcha), and this needs no parameters at all.
BACKFILL = """
INSERT INTO refunds (
    id, booking_id, payment_id, amount_paise, status, reason, by_hand, note,
    created_at, updated_at, processed_at
)
SELECT
    'bf' || p.id,
    p.booking_id,
    p.id,
    COALESCE((p.raw -> 'refund' ->> 'amountPaise')::int, p.amount_paise),
    'processed'::refund_status,
    'owner',
    true,
    NULLIF(p.raw -> 'refund' ->> 'note', ''),
    COALESCE((p.raw -> 'refund' ->> 'at')::timestamptz, p.updated_at),
    COALESCE((p.raw -> 'refund' ->> 'at')::timestamptz, p.updated_at),
    COALESCE((p.raw -> 'refund' ->> 'at')::timestamptz, p.updated_at)
FROM payments p
WHERE p.status = 'refunded'
  AND COALESCE((p.raw -> 'refund' ->> 'amountPaise')::int, p.amount_paise) > 0
  AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.payment_id = p.id)
"""


def upgrade() -> None:
    refund_status.create(op.get_bind(), checkfirst=False)
    op.create_table(
        "refunds",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("booking_id", sa.Text(), nullable=False),
        sa.Column("payment_id", sa.Text(), nullable=False),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("status", refund_status, nullable=False, server_default="requested"),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("by_hand", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("razorpay_refund_id", sa.Text()),
        sa.Column("error", sa.Text()),
        sa.Column("note", sa.Text()),
        sa.Column("requested_by", sa.Text()),
        sa.Column("raw", postgresql.JSONB()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("amount_paise > 0", name=op.f("ck_refunds_amount_positive")),
        sa.ForeignKeyConstraint(
            ["booking_id"], ["bookings.id"], name=op.f("fk_refunds_booking_id_bookings")
        ),
        sa.ForeignKeyConstraint(
            ["payment_id"], ["payments.id"], name=op.f("fk_refunds_payment_id_payments")
        ),
        sa.ForeignKeyConstraint(
            ["requested_by"], ["users.id"], name=op.f("fk_refunds_requested_by_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refunds")),
        sa.UniqueConstraint("razorpay_refund_id", name=op.f("uq_refunds_razorpay_refund_id")),
    )
    op.create_index("ix_refunds_booking_id", "refunds", ["booking_id"])
    op.create_index("ix_refunds_payment_id", "refunds", ["payment_id"])
    op.execute(BACKFILL)


def downgrade() -> None:
    op.drop_index("ix_refunds_payment_id", table_name="refunds")
    op.drop_index("ix_refunds_booking_id", table_name="refunds")
    op.drop_table("refunds")
    refund_status.drop(op.get_bind(), checkfirst=False)
