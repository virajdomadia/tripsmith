"""P10 — add to calendar and the trip pack (R48).

- `packages.meet_place` / `meet_time` / `meet_maps_url` / `meet_note`: where and when the trip
  starts, with a Maps link and one short line ("look for the blue Tripsmith board");
- `packages.know_before`: the owner's "Know before you go" notes, a JSONB object with five fixed
  keys (weather, network, cash, rules, packing), each plain text;
- `departures.meet_*`: the same four, for a date that starts somewhere else. A null place means
  the date uses the package's meeting point — the set overrides as a whole;
- `bookings.pack_read_at`: the first time the customer opened the unlocked pack (or its PDF);
- `bookings.calendar_added_at` / `calendar_via`: the last "Add to calendar" click and which
  button ('google' or 'ics'). A date change clears `calendar_added_at` and keeps `calendar_via`,
  so the booking page can say "Date changed — update your calendar".

ADD-only: nullable columns and one with a default, nothing read by the current code changes, so
it is safe to run against production BEFORE the P10 code merges. Hotels gain an optional address
and phone inside the existing `packages.hotels` JSONB — no column.

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-09 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MEET = ("meet_place", "meet_time", "meet_maps_url", "meet_note")


def _meet_columns(table: str) -> None:
    op.add_column(table, sa.Column("meet_place", sa.Text()))
    op.add_column(table, sa.Column("meet_time", sa.Time()))
    op.add_column(table, sa.Column("meet_maps_url", sa.Text()))
    op.add_column(table, sa.Column("meet_note", sa.Text()))
    # Time, link and note belong to a place: none of them without one.
    op.create_check_constraint(
        op.f(f"ck_{table}_meet_needs_place"),
        table,
        "meet_place IS NOT NULL OR (meet_time IS NULL AND meet_maps_url IS NULL "
        "AND meet_note IS NULL)",
    )


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    _meet_columns("packages")
    op.add_column(
        "packages",
        sa.Column(
            "know_before",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )
    op.create_check_constraint(
        op.f("ck_packages_know_before"), "packages", "jsonb_typeof(know_before) = 'object'"
    )
    _meet_columns("departures")
    op.add_column("bookings", sa.Column("pack_read_at", sa.DateTime(timezone=True)))
    op.add_column("bookings", sa.Column("calendar_added_at", sa.DateTime(timezone=True)))
    op.add_column("bookings", sa.Column("calendar_via", sa.Text()))
    op.create_check_constraint(
        op.f("ck_bookings_calendar_via"),
        "bookings",
        "calendar_via IS NULL OR calendar_via IN ('google', 'ics')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_bookings_calendar_via"), "bookings", type_="check")
    op.drop_column("bookings", "calendar_via")
    op.drop_column("bookings", "calendar_added_at")
    op.drop_column("bookings", "pack_read_at")
    for table in ("departures", "packages"):
        op.drop_constraint(op.f(f"ck_{table}_meet_needs_place"), table, type_="check")
        for column in reversed(MEET):
            op.drop_column(table, column)
    op.drop_constraint(op.f("ck_packages_know_before"), "packages", type_="check")
    op.drop_column("packages", "know_before")
