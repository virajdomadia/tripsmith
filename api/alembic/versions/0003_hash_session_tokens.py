"""v1.0.1 — sessions are looked up by sha256(token), never by the cookie value itself.

EXPAND only, so it is safe to run against production *before* the new api deploys:
- add a nullable, unique `token_hash` and backfill it from every existing row, so everyone
  signed in stays signed in (`services/auth/sessions.py::hash_token` computes the same hex that
  `encode(sha256(convert_to(token, 'UTF8')), 'hex')` writes here — built-in since PG 11, no
  pgcrypto);
- make `token` nullable: the new code writes only `token_hash` and leaves `token` NULL.

The old code keeps working after this runs (it still writes and reads `token`); a session it
opens in the gap between migration and deploy has no `token_hash`, so that one owner signs in
again once. Dropping `token` (and the raw values the backfill left in it) is the CONTRACT step,
deferred to v2 once no deployed code reads it.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-24 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("token_hash", sa.Text(), nullable=True))
    op.execute(
        "UPDATE sessions SET token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex') "
        "WHERE token IS NOT NULL"
    )
    op.create_unique_constraint("uq_sessions_token_hash", "sessions", ["token_hash"])
    op.alter_column("sessions", "token", existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    # Sessions opened by the new code carry no raw token and cannot be restored: they go.
    op.execute("DELETE FROM sessions WHERE token IS NULL")
    op.alter_column("sessions", "token", existing_type=sa.Text(), nullable=False)
    op.drop_constraint("uq_sessions_token_hash", "sessions", type_="unique")
    op.drop_column("sessions", "token_hash")
