"""v1.0.1 — sessions store sha256(token), not the cookie value.

Existing rows are hashed in place, so everyone signed in stays signed in: the cookie still holds
the raw token, and `services/auth/sessions.py::hash_token` computes the same hex digest that
`encode(sha256(convert_to(token, 'UTF8')), 'hex')` writes here (built-in since PG 11 — no
pgcrypto). A downgrade cannot recover the tokens, so it deletes the sessions (one sign-out).

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-24 12:00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE sessions SET token = encode(sha256(convert_to(token, 'UTF8')), 'hex')")
    op.alter_column("sessions", "token", new_column_name="token_hash")
    op.execute("ALTER TABLE sessions RENAME CONSTRAINT uq_sessions_token TO uq_sessions_token_hash")


def downgrade() -> None:
    op.execute("DELETE FROM sessions")
    op.execute("ALTER TABLE sessions RENAME CONSTRAINT uq_sessions_token_hash TO uq_sessions_token")
    op.alter_column("sessions", "token_hash", new_column_name="token")
