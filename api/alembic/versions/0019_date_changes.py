"""P7 — change date (R45).

- `date_changes`: one row per move of a booking to another departure (models/bookings.py);
- `payments.date_change_id`: the order that pays a change's difference;
- `departure_availability` also subtracts the party of every live change hold
  (`state = 'held' and hold_expires_at > now()`), so the new date's seats are held while the
  customer pays, and the hold lapses by itself like a booking's.

ADD-only plus the view, which keeps its two columns and types. With no date_changes rows it
returns exactly what 0018's did, so it is safe to run against production BEFORE the P7 code
merges.

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-01 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

AVAILABILITY_P7 = """
create or replace view departure_availability as
select
    d.id as departure_id,
    greatest(
        d.seats_total - (
            select count(*)
            from bookings b
            join booking_travellers t on t.booking_id = b.id
            where b.departure_id = d.id
              and (
                  b.status in ('confirmed', 'partially_paid', 'completed')
                  or (b.status = 'pending' and b.hold_expires_at > now())
              )
        ) - coalesce((
            select sum(w.party)
            from waitlist_entries w
            where w.departure_id = d.id
              and w.state = 'offered'
              and w.offer_expires_at > now()
        ), 0) - coalesce((
            select sum(c.party)
            from date_changes c
            where c.to_departure_id = d.id
              and c.state = 'held'
              and c.hold_expires_at > now()
        ), 0),
        0
    )::smallint as seats_left
from departures d
"""

# 0018's definition, verbatim.
AVAILABILITY_P6 = """
create or replace view departure_availability as
select
    d.id as departure_id,
    greatest(
        d.seats_total - (
            select count(*)
            from bookings b
            join booking_travellers t on t.booking_id = b.id
            where b.departure_id = d.id
              and (
                  b.status in ('confirmed', 'partially_paid', 'completed')
                  or (b.status = 'pending' and b.hold_expires_at > now())
              )
        ) - coalesce((
            select sum(w.party)
            from waitlist_entries w
            where w.departure_id = d.id
              and w.state = 'offered'
              and w.offer_expires_at > now()
        ), 0),
        0
    )::smallint as seats_left
from departures d
"""


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.create_table(
        "date_changes",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column(
            "booking_id",
            sa.Text(),
            sa.ForeignKey("bookings.id", name=op.f("fk_date_changes_booking_id_bookings")),
            nullable=False,
        ),
        sa.Column(
            "from_departure_id",
            sa.Text(),
            sa.ForeignKey(
                "departures.id", name=op.f("fk_date_changes_from_departure_id_departures")
            ),
            nullable=False,
        ),
        sa.Column(
            "to_departure_id",
            sa.Text(),
            sa.ForeignKey("departures.id", name=op.f("fk_date_changes_to_departure_id_departures")),
            nullable=False,
        ),
        sa.Column("party", sa.SmallInteger(), nullable=False),
        sa.Column("state", sa.Text(), nullable=False),
        sa.Column("hold_expires_at", sa.DateTime(timezone=True)),
        sa.Column("fee_paise", sa.Integer(), nullable=False),
        sa.Column("net_paise", sa.Integer(), nullable=False),
        sa.Column("pay_paise", sa.Integer(), nullable=False),
        sa.Column("quote", postgresql.JSONB(), nullable=False),
        sa.Column("invoiced", sa.Boolean(), nullable=False),
        sa.Column("actor", sa.Text(), nullable=False),
        sa.Column(
            "by_user_id",
            sa.Text(),
            sa.ForeignKey("users.id", name=op.f("fk_date_changes_by_user_id_users")),
        ),
        sa.Column("reason", sa.Text()),
        sa.Column("travellers", postgresql.JSONB()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "state IN ('held', 'done', 'lapsed', 'cancelled')", name=op.f("ck_date_changes_state")
        ),
        sa.CheckConstraint("actor IN ('customer', 'owner')", name=op.f("ck_date_changes_actor")),
        sa.CheckConstraint("party BETWEEN 1 AND 12", name=op.f("ck_date_changes_party")),
        sa.CheckConstraint(
            "fee_paise >= 0 AND pay_paise >= 0", name=op.f("ck_date_changes_amounts")
        ),
        sa.CheckConstraint(
            "state <> 'held' OR hold_expires_at IS NOT NULL",
            name=op.f("ck_date_changes_hold_ends"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_date_changes")),
    )
    op.create_index("ix_date_changes_booking_id", "date_changes", ["booking_id"])
    op.create_index(
        "ix_date_changes_held",
        "date_changes",
        ["to_departure_id", "hold_expires_at"],
        postgresql_where=sa.text("state = 'held'"),
    )
    op.add_column(
        "payments",
        sa.Column(
            "date_change_id",
            sa.Text(),
            sa.ForeignKey("date_changes.id", name=op.f("fk_payments_date_change_id_date_changes")),
        ),
    )
    op.create_index(
        "ix_payments_date_change_id",
        "payments",
        ["date_change_id"],
        postgresql_where=sa.text("date_change_id IS NOT NULL"),
    )
    op.execute(AVAILABILITY_P7)


def downgrade() -> None:
    op.execute(AVAILABILITY_P6)
    op.drop_index("ix_payments_date_change_id", table_name="payments")
    op.drop_column("payments", "date_change_id")
    op.drop_table("date_changes")
