"""P20 · Enquiries A2 — a follow-up date and a lost reason on enquiries.

- `enquiries.follow_up_on`: the IST day the owner plans to chase an open enquiry; drives the
  "Follow up today" filter. Cleared when the enquiry is won or lost.
- `enquiries.lost_reason`: why a closed ("Lost") enquiry was lost, picked from a short list.

ADD-only and nullable, so it is safe to run against production BEFORE the P20b code merges:
the deployed api never names the columns.

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-27 21:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("enquiries", sa.Column("follow_up_on", sa.Date()))
    op.add_column("enquiries", sa.Column("lost_reason", sa.Text()))


def downgrade() -> None:
    op.drop_column("enquiries", "lost_reason")
    op.drop_column("enquiries", "follow_up_on")
