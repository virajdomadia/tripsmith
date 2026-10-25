"""V7 (Q-4) — six indexes for the desk, the reports and foreign-key deletes.

- `bookings.package_id`: the desk's package filter, the coupon report's join from packages, the
  urgency badges' `IN`, and the RESTRICT check when a package is deleted.
- `bookings.created_at`: the reports' and the coupon report's date windows (the existing
  `(user_id, created_at)` index can't serve a range with no user).
- `enquiry_notes.enquiry_id`: an enquiry's notes on its page, and the cascade when the daily
  purge (V5) deletes an enquiry.
- `coupon_packages.package_id`: the primary key leads with `coupon_id`, so deleting a package
  scanned the table for its cascade.
- `email_sends.package_id`: the cascade when a package is deleted.
- `date_changes.from_departure_id`: deleting a departure checks no change still points at it.
  (`to_departure_id` gets the same check, and `ix_date_changes_held` can't serve it: that index
  is partial, `WHERE state = 'held'`. Not in the audit's six; see docs/12 § Fixed in V7.)

ADD-only: new indexes, nothing the current code reads changes, so it is safe to run against
production BEFORE the V7 code merges. Plain `CREATE INDEX`: every table is a few hundred rows,
so the write lock lasts milliseconds; `CONCURRENTLY` would need a migration outside a
transaction.

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-25 12:00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEXES = (
    ("ix_bookings_package_id", "bookings", "package_id"),
    ("ix_bookings_created_at", "bookings", "created_at"),
    ("ix_enquiry_notes_enquiry_id", "enquiry_notes", "enquiry_id"),
    ("ix_coupon_packages_package_id", "coupon_packages", "package_id"),
    ("ix_email_sends_package_id", "email_sends", "package_id"),
    ("ix_date_changes_from_departure_id", "date_changes", "from_departure_id"),
)


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    for name, table, column in INDEXES:
        op.create_index(name, table, [column])


def downgrade() -> None:
    for name, table, _ in INDEXES:
        op.drop_index(name, table_name=table)
