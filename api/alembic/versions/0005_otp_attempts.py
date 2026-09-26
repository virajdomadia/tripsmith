"""B8 — customer sign-in by email code: count wrong tries per code, find bookings by email.

ADD-only, so it is safe to run against production BEFORE the B8 code merges (the deployed api
never reads either):
- `verification.attempts` — wrong tries on this code; the fifth kills it (R18). Kept in the row,
  not in Redis, so the cap holds even while the rate limiter fails open;
- `ix_bookings_contact_email` — a signed-in customer owns the bookings made with their verified
  email (`services/account.py`), looked up on every My trips visit and voucher download.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-26 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "verification",
        sa.Column("attempts", sa.SmallInteger(), nullable=False, server_default="0"),
    )
    op.create_index("ix_bookings_contact_email", "bookings", ["contact_email"])


def downgrade() -> None:
    op.drop_index("ix_bookings_contact_email", table_name="bookings")
    op.drop_column("verification", "attempts")
