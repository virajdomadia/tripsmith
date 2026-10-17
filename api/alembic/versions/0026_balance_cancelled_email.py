"""V4 (OP-6) — the balance-cancellation email moves onto the email ledger.

`email_sends.type` may now be `balance_cancelled` too: the daily tidy claims a ledger row before
it sends that email, so a refused send is retried by `/cron/emails` instead of being lost, and a
re-run never sends it twice. Only the ledger widens — the owner can't switch this email off or
unsubscribe from it, so `email_switches` and `email_suppressions` keep their list.

EXPAND-only: the constraint accepts every value it accepted before, and the current code never
writes the new one, so it is safe to run against production BEFORE the V4 code merges.

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-17 12:00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD = (
    "'balance_reminder', 'details_reminder', 'trip_pack', 'review_request', 'still_thinking', "
    "'refund'"
)
NEW = f"{OLD}, 'balance_cancelled'"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.drop_constraint(op.f("ck_email_sends_type"), "email_sends", type_="check")
    op.create_check_constraint(op.f("ck_email_sends_type"), "email_sends", f"type IN ({NEW})")


def downgrade() -> None:
    op.execute("DELETE FROM email_sends WHERE type = 'balance_cancelled'")
    op.drop_constraint(op.f("ck_email_sends_type"), "email_sends", type_="check")
    op.create_check_constraint(op.f("ck_email_sends_type"), "email_sends", f"type IN ({OLD})")
