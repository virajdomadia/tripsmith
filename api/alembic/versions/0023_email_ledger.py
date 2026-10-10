"""P15 — automatic trip emails (R53).

- `email_sends`: the ledger — one row per automatic email (and per refund email), unique `key`,
  inserted and committed before the send (models/emails.py);
- `email_switches`: the owner's on/off per automatic type (no row = on);
- `email_suppressions`: (email, type) pairs that unsubscribed.

Backfills, so deploy day sends nothing twice:
- every P5 balance reminder already claimed in `booking_events` (`balance.reminder`, after =
  {stage, dueOn}) becomes a `sent` ledger row under the same key;
- every Razorpay refund already processed becomes a `skipped` row — its news went out in the
  cancellation or date-change email, before refund emails existed.

ADD-only: three new tables, nothing the current code reads changes, so it is safe to run
against production BEFORE the P15 code merges. Text + check constraints, not native enums.

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-10 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TYPES = (
    "'balance_reminder', 'details_reminder', 'trip_pack', 'review_request', 'still_thinking', "
    "'refund'"
)


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.create_table(
        "email_sends",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("booking_id", sa.Text()),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("package_id", sa.Text()),
        sa.Column("stage", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("anchor", sa.Date()),
        sa.Column("state", sa.Text(), nullable=False, server_default="sending"),
        sa.Column("attempts", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("error", sa.Text()),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(f"type IN ({TYPES})", name=op.f("ck_email_sends_type")),
        sa.CheckConstraint(
            "state IN ('sending', 'sent', 'held', 'failed', 'skipped')",
            name=op.f("ck_email_sends_state"),
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name=op.f("fk_email_sends_booking_id_bookings"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["packages.id"],
            name=op.f("fk_email_sends_package_id_packages"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_email_sends")),
    )
    op.create_index("uq_email_sends_key", "email_sends", ["key"], unique=True)
    op.create_index("ix_email_sends_booking_id", "email_sends", ["booking_id"])
    op.create_index(
        "ix_email_sends_retry",
        "email_sends",
        ["state"],
        postgresql_where=sa.text("state = 'failed'"),
    )
    op.create_table(
        "email_switches",
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("on", sa.Boolean(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("updated_by", sa.Text()),
        sa.CheckConstraint(f"type IN ({TYPES})", name=op.f("ck_email_switches_type")),
        sa.ForeignKeyConstraint(
            ["updated_by"],
            ["users.id"],
            name=op.f("fk_email_switches_updated_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("type", name=op.f("pk_email_switches")),
    )
    op.create_table(
        "email_suppressions",
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(f"type IN ({TYPES})", name=op.f("ck_email_suppressions_type")),
        sa.PrimaryKeyConstraint("email", "type", name=op.f("pk_email_suppressions")),
    )
    # P5's reminder claims → the ledger, under the key services/email/automatic.py uses.
    op.execute(
        """
        INSERT INTO email_sends
            (id, key, type, booking_id, email, package_id, stage, anchor, state, sent_at,
             created_at, updated_at)
        SELECT DISTINCT ON (e.booking_id, e.after->>'stage', e.after->>'dueOn')
            'bf' || md5(e.id::text),
            'balance_reminder:' || e.booking_id || ':' || (e.after->>'stage') || ':'
                || (e.after->>'dueOn'),
            'balance_reminder', e.booking_id, lower(b.contact_email), b.package_id,
            (e.after->>'stage')::smallint, (e.after->>'dueOn')::date, 'sent', e.at, e.at, e.at
        FROM booking_events e JOIN bookings b ON b.id = e.booking_id
        WHERE e.kind = 'balance.reminder' AND e.after ? 'stage' AND e.after ? 'dueOn'
        ORDER BY e.booking_id, e.after->>'stage', e.after->>'dueOn', e.at
        ON CONFLICT (key) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO email_sends
            (id, key, type, booking_id, email, package_id, state, created_at, updated_at)
        SELECT 'bf' || md5(r.id), 'refund:' || r.id, 'refund', r.booking_id,
            lower(b.contact_email), b.package_id, 'skipped', now(), now()
        FROM refunds r JOIN bookings b ON b.id = r.booking_id
        WHERE r.status = 'processed'
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("email_suppressions")
    op.drop_table("email_switches")
    op.drop_index("ix_email_sends_retry", table_name="email_sends")
    op.drop_index("ix_email_sends_booking_id", table_name="email_sends")
    op.drop_index("uq_email_sends_key", table_name="email_sends")
    op.drop_table("email_sends")
