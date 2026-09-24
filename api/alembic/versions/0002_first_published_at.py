"""packages.first_published_at — the slug locks once a trip has been published (v1.0.1).

A public URL that has been shared, indexed or printed on a PDF must not move, so the admin
refuses a slug change on a package that has ever been live (and on a destination that has ever
held one). Packages live today are backfilled with their `updated_at`: the exact moment they
first went live was never recorded, and any non-null value is what the lock reads.

Additive and nullable — safe to run before or after the api deploy.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-24 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "packages", sa.Column("first_published_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute(
        "update packages set first_published_at = updated_at "
        "where status = 'live' and first_published_at is null"
    )


def downgrade() -> None:
    op.drop_column("packages", "first_published_at")
