"""B13 — review moderation.

- `reviews.moderated_at`: when the owner last published or hid the review. Null = still waiting
  in the Pending queue; set with `approved = true` = published; set with `approved = false` =
  hidden. Without it, a hidden review and a new one look the same (both `approved = false`).

ADD-only, so it is safe to run against production BEFORE the B13 code merges: the deployed api
never names this column.

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-26 23:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("reviews", sa.Column("moderated_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("reviews", "moderated_at")
