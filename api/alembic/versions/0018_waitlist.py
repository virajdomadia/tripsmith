"""P6 — the waitlist (R44).

- `waitlist_entries`: one row per person waiting for a sold-out departure (models/waitlist.py);
- `departure_availability` also subtracts the party of every live offer
  (`state = 'offered' and offer_expires_at > now()`), so an offer holds seats and lapses by
  itself, exactly like a pending booking's hold.

ADD-only plus the view, which keeps its two columns and types. With no waitlist rows it returns
exactly what 0004's did, so it is safe to run against production BEFORE the P6 code merges.

Revision ID: 0018
Revises: 0017
Create Date: 2026-09-30 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LIVE_STATES = "state IN ('waiting', 'offered', 'claimed')"

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

# 0004's definition, verbatim.
AVAILABILITY_V2 = """
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
        ),
        0
    )::smallint as seats_left
from departures d
"""


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.create_table(
        "waitlist_entries",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column(
            "departure_id",
            sa.Text(),
            sa.ForeignKey(
                "departures.id",
                name=op.f("fk_waitlist_entries_departure_id_departures"),
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("party", sa.SmallInteger(), nullable=False),
        sa.Column("position", sa.BigInteger(), nullable=False),
        sa.Column("state", sa.Text(), nullable=False, server_default="waiting"),
        sa.Column("offer_expires_at", sa.DateTime(timezone=True)),
        sa.Column("offer_no", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column(
            "offered_by_user_id",
            sa.Text(),
            sa.ForeignKey("users.id", name=op.f("fk_waitlist_entries_offered_by_user_id_users")),
        ),
        sa.Column(
            "booking_id",
            sa.Text(),
            sa.ForeignKey(
                "bookings.id",
                name=op.f("fk_waitlist_entries_booking_id_bookings"),
                ondelete="SET NULL",
            ),
        ),
        sa.Column("joined_ip", sa.Text()),
        sa.Column("mail_due", sa.Text()),
        sa.Column(
            "events",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("party BETWEEN 1 AND 12", name=op.f("ck_waitlist_entries_party")),
        sa.CheckConstraint(
            "state IN ('waiting', 'offered', 'claimed', 'booked', 'removed', 'closed')",
            name=op.f("ck_waitlist_entries_state"),
        ),
        sa.CheckConstraint(
            "mail_due IS NULL OR mail_due IN ('offer', 'lapse')",
            name=op.f("ck_waitlist_entries_mail_due"),
        ),
        sa.CheckConstraint(
            "state <> 'offered' OR offer_expires_at IS NOT NULL",
            name=op.f("ck_waitlist_entries_offer_ends"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_waitlist_entries")),
    )
    op.create_index(
        "uq_waitlist_entries_departure_email",
        "waitlist_entries",
        ["departure_id", "email"],
        unique=True,
        postgresql_where=sa.text(LIVE_STATES),
    )
    op.create_index(
        "ix_waitlist_entries_departure_state_position",
        "waitlist_entries",
        ["departure_id", "state", "position"],
    )
    op.create_index("ix_waitlist_entries_email", "waitlist_entries", ["email"])
    op.create_index(
        "ix_waitlist_entries_mail_due",
        "waitlist_entries",
        ["mail_due"],
        postgresql_where=sa.text("mail_due IS NOT NULL"),
    )
    op.execute(AVAILABILITY_P6)


def downgrade() -> None:
    op.execute(AVAILABILITY_V2)
    op.drop_table("waitlist_entries")
