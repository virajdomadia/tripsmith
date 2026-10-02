"""P3 — trip leaders (R41).

- `trip_leaders`: who leads a trip (models/catalog.py `TripLeader`);
- `packages.leader_id`: the package's default leader;
- `departures.leader_id`: a date's own leader when not the default (null = the default).

ADD-only: two nullable columns and a new table, nothing read by the current code changes, so it
is safe to run against production BEFORE the P3 code merges.

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-02 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.create_table(
        "trip_leaders",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("photo_url", sa.Text()),
        sa.Column("languages", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column("years_leading", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("regions", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column("bio", sa.Text(), nullable=False, server_default=""),
        sa.Column("fun_fact", sa.Text(), nullable=False, server_default=""),
        sa.Column("phone", sa.Text(), nullable=False, server_default=""),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "years_leading BETWEEN 0 AND 60", name=op.f("ck_trip_leaders_years_leading")
        ),
        sa.CheckConstraint("char_length(bio) <= 300", name=op.f("ck_trip_leaders_bio_length")),
        sa.CheckConstraint(
            "char_length(fun_fact) <= 140", name=op.f("ck_trip_leaders_fun_fact_length")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trip_leaders")),
        sa.UniqueConstraint("slug", name=op.f("uq_trip_leaders_slug")),
    )
    for table in ("packages", "departures"):
        op.add_column(
            table,
            sa.Column(
                "leader_id",
                sa.Text(),
                sa.ForeignKey(
                    "trip_leaders.id",
                    name=op.f(f"fk_{table}_leader_id_trip_leaders"),
                    ondelete="RESTRICT",
                ),
            ),
        )
        op.create_index(op.f(f"ix_{table}_leader_id"), table, ["leader_id"])


def downgrade() -> None:
    for table in ("departures", "packages"):
        op.drop_index(op.f(f"ix_{table}_leader_id"), table_name=table)
        op.drop_column(table, "leader_id")
    op.drop_table("trip_leaders")
