"""V1 (SB-1) — what a cancellation kept, fixed at the decision.

`bookings.kept_paise`: the part of what was paid that the business keeps, written when the owner
approves a cancellation (`resolve.py`) or the daily tidy cancels an unpaid balance
(`balance._cancel_overdue`). `refund_owed` then owes `paid − kept`, so money captured after the
decision goes back in full. Null on bookings decided before it — `refund_owed` keeps the old
amounts-only sum for those.

ADD-only: one nullable column, nothing the current code reads changes, so it is safe to run
against production BEFORE the V1 code merges.

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-15 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column("bookings", sa.Column("kept_paise", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "kept_paise")
