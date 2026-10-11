"""P1 — saved trips, the ♡ (R39).

`saved_packages`: one row per (account, package), both sides `ON DELETE CASCADE`; an index on
(package_id, created_at) for the dashboard's "most saved".

ADD-only: one new table, nothing the current code reads changes, so it is safe to run against
production BEFORE the P1 code merges.

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-10 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.create_table(
        "saved_packages",
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("package_id", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_saved_packages_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["packages.id"],
            name=op.f("fk_saved_packages_package_id_packages"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "package_id", name=op.f("pk_saved_packages")),
    )
    op.create_index(
        "ix_saved_packages_package_id_created_at",
        "saved_packages",
        ["package_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_saved_packages_package_id_created_at", table_name="saved_packages")
    op.drop_table("saved_packages")
