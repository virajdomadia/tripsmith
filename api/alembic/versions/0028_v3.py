"""v3 C1 — the AI concierge's tables (06 A7).

- `conversations`, `messages`: every chat turn, for the owner's log and the handoff transcript.
- `chat_budget`: the site-wide cap (100 turns / IST day, 1,500 / month), one row per IST day.
- `departure_alerts`: "email me when new dates are added" (R30; written from C3). Exactly one of
  package / destination; one open alert per (email, target) — `NULLS NOT DISTINCT` (Postgres 15+)
  so the empty side counts as equal.
- `enquiries.conversation_id`: the plain text column v1 reserved becomes a foreign key
  (`ON DELETE SET NULL`). Nothing writes the column yet, so every value is NULL and the FK
  validates instantly.

Expand-only: new tables plus one FK on a column nothing reads, so it is safe to run against
production BEFORE the C1 code merges. New tables use text + check constraints, not native enums
(models/base.py `TextEnum`).

Revision ID: 0028
Revises: 0027
Create Date: 2026-11-12 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0028"
down_revision: str | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _created_at() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")

    op.create_table(
        "conversations",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("ip_hash", sa.Text(), nullable=True),
        sa.Column("user_id", sa.Text(), nullable=True),
        sa.Column("outcome", sa.Text(), nullable=False, server_default="open"),
        sa.Column("model", sa.Text(), nullable=True),
        sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens_in", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("first_user_message", sa.Text(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        _created_at(),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "outcome IN ('open', 'booking_started', 'enquiry_created', 'dropped')",
            name=op.f("ck_conversations_outcome"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_conversations_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_conversations")),
    )
    op.create_index("ix_conversations_created_at", "conversations", [sa.text("created_at DESC")])
    op.create_index(
        "ix_conversations_outcome_created_at",
        "conversations",
        ["outcome", sa.text("created_at DESC")],
    )

    op.create_table(
        "messages",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("conversation_id", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("parts", postgresql.JSONB(), nullable=False),
        sa.Column("tokens_in", sa.Integer(), nullable=True),
        sa.Column("tokens_out", sa.Integer(), nullable=True),
        _created_at(),
        sa.CheckConstraint("role IN ('user', 'assistant')", name=op.f("ck_messages_role")),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            name=op.f("fk_messages_conversation_id_conversations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_messages")),
    )
    op.create_index(
        "ix_messages_conversation_id_created_at", "messages", ["conversation_id", "created_at"]
    )

    op.create_table(
        "chat_budget",
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("turns", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cap_hit_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("day", name=op.f("pk_chat_budget")),
    )

    op.create_table(
        "departure_alerts",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("package_id", sa.Text(), nullable=True),
        sa.Column("destination_id", sa.Text(), nullable=True),
        _created_at(),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "num_nonnulls(package_id, destination_id) = 1",
            name=op.f("ck_departure_alerts_one_target"),
        ),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["packages.id"],
            name=op.f("fk_departure_alerts_package_id_packages"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["destination_id"],
            ["destinations.id"],
            name=op.f("fk_departure_alerts_destination_id_destinations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_departure_alerts")),
    )
    op.create_index(
        "uq_departure_alerts_open",
        "departure_alerts",
        ["email", "package_id", "destination_id"],
        unique=True,
        postgresql_where=sa.text("sent_at IS NULL"),
        postgresql_nulls_not_distinct=True,
    )
    op.create_index("ix_departure_alerts_package_id", "departure_alerts", ["package_id"])
    op.create_index("ix_departure_alerts_destination_id", "departure_alerts", ["destination_id"])

    op.create_foreign_key(
        op.f("fk_enquiries_conversation_id_conversations"),
        "enquiries",
        "conversations",
        ["conversation_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_enquiries_conversation_id_conversations"), "enquiries", type_="foreignkey"
    )
    op.drop_table("departure_alerts")
    op.drop_table("chat_budget")
    op.drop_table("messages")
    op.drop_table("conversations")
