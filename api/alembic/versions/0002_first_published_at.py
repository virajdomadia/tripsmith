"""Slug lock + stale-edit version (v1.0.1): packages.first_published_at, packages.edited_at,
destinations.first_published_at.

A public URL that has been shared, indexed or printed on a PDF must not move, so the admin
refuses a slug change on a package that has ever been live, and on a destination that has ever
held a live package. The moment a package first went live was never recorded, so the backfill
uses the evidence there is: a package live today, or one an enquiry references (enquiries are
only ever made on live packages). The earliest enquiry dates it; `updated_at` otherwise.

`edited_at` is the version the package form's stale-edit check compares: only a form save moves
it. `updated_at` also moves on a publish or a gallery change, which would turn every photo
upload in one tab into a spurious conflict in another.

EXPAND-ONLY: three nullable columns and backfills. Safe to run against production before the
new api deploys — the old code never reads these columns and keeps working after it.

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

BACKFILL_PACKAGES = """
update packages p
set first_published_at = coalesce(
    (select min(e.created_at) from enquiries e where e.package_id = p.id),
    p.updated_at
)
where p.first_published_at is null
  and (
    p.status = 'live'
    or exists (select 1 from enquiries e where e.package_id = p.id)
  )
"""

BACKFILL_DESTINATIONS = """
update destinations d
set first_published_at = (
    select min(p.first_published_at) from packages p where p.destination_id = d.id
)
where d.first_published_at is null
  and exists (
    select 1 from packages p
    where p.destination_id = d.id and p.first_published_at is not null
  )
"""


def upgrade() -> None:
    op.add_column(
        "packages", sa.Column("first_published_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("packages", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "destinations", sa.Column("first_published_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute(BACKFILL_PACKAGES)
    op.execute(BACKFILL_DESTINATIONS)  # after the packages: it reads what they were given
    op.execute("update packages set edited_at = updated_at where edited_at is null")


def downgrade() -> None:
    op.drop_column("destinations", "first_published_at")
    op.drop_column("packages", "edited_at")
    op.drop_column("packages", "first_published_at")
