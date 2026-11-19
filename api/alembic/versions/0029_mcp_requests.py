"""v4 4.0.4: `mcp_requests`, one row per MCP call served (06 `mcp_requests`).

Expand-only: one new table nothing else reads, so it is safe to run against production before the
4.0.4 code merges. Text + a check constraint for `method`, like 0028.

Revision ID: 0029
Revises: 0028
Create Date: 2026-11-19 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")

    op.create_table(
        "mcp_requests",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("client_name", sa.Text(), nullable=True),
        sa.Column("client_version", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("method", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("args", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("ip_hash", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "method IN ('tools/call', 'resources/read', 'prompts/get')",
            name=op.f("ck_mcp_requests_method"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mcp_requests")),
    )
    op.create_index("ix_mcp_requests_created_at", "mcp_requests", [sa.text("created_at DESC")])
    op.create_index("ix_mcp_requests_name_created_at", "mcp_requests", ["name", "created_at"])


def downgrade() -> None:
    op.drop_table("mcp_requests")
