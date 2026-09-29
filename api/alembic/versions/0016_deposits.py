"""P5 — deposit now, balance later (R43).

- `packages.deposit_on` — whether the Book-now sheet offers "Reserve with 25 % now" (default on);
- `bookings.deposit_paise` — the deposit this booking was made on (null = paid in full);
- `bookings.balance_due_on` — the IST day the balance is due (departure − 30 days; the owner may
  extend it in P5b). Set together with the deposit (check);
- `bookings.balance_refund_paise` — the refund the policy gave when the daily tidy cancelled the
  booking for an unpaid balance (like `booking_cancellations.refund_paise` on an approval), so
  what is still owed stays right after a failed refund is sent again;
- `cancel_reason` gains `balance_unpaid`: the daily tidy's cancel after the 2-day grace.

ADD-only, with defaults the deployed code never reads, so it is safe to run against production
BEFORE the P5 code merges. The new enum value is not used inside this transaction (Postgres
refuses that until the commit).

Downgrade drops the columns and leaves `balance_unpaid` in the type: Postgres cannot drop one
enum value, and an unused value is harmless to the older code.

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-29 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEPOSIT_CHECK = (
    "(deposit_paise IS NULL) = (balance_due_on IS NULL) "
    "AND (deposit_paise IS NULL OR deposit_paise > 0)"
)


def upgrade() -> None:
    # Brief ACCESS EXCLUSIVE locks: give up rather than queue reads behind a long transaction.
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.execute("ALTER TYPE cancel_reason ADD VALUE IF NOT EXISTS 'balance_unpaid'")
    op.add_column(
        "packages",
        sa.Column("deposit_on", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column("bookings", sa.Column("deposit_paise", sa.Integer()))
    op.add_column("bookings", sa.Column("balance_due_on", sa.Date()))
    op.add_column("bookings", sa.Column("balance_refund_paise", sa.Integer()))
    op.create_check_constraint(op.f("ck_bookings_deposit_due"), "bookings", DEPOSIT_CHECK)
    # The daily tidy's reminder and overdue scans: only bookings still on their deposit.
    op.create_index(
        "ix_bookings_balance_due_on",
        "bookings",
        ["balance_due_on"],
        postgresql_where=sa.text("status = 'partially_paid'"),
    )


def downgrade() -> None:
    op.drop_index("ix_bookings_balance_due_on", table_name="bookings")
    op.drop_constraint(op.f("ck_bookings_deposit_due"), "bookings", type_="check")
    op.drop_column("bookings", "balance_refund_paise")
    op.drop_column("bookings", "balance_due_on")
    op.drop_column("bookings", "deposit_paise")
    op.drop_column("packages", "deposit_on")
