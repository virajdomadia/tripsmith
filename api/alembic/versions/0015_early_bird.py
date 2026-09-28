"""P17 — early-bird pricing (R47): up to two tiers per package, switchable on or off.

Five columns on `packages`:

- `early_bird_on` — the switch; a switched-off package keeps its tiers for next time;
- `eb1_days` / `eb1_off_paise` — tier 1: ₹ off per traveller when booked `eb1_days`+ days before
  departure (IST);
- `eb2_days` / `eb2_off_paise` — the optional tier 2: nearer the date, and a smaller amount.

The checks keep each tier's two fields together, tier 2 behind tier 1 (fewer days, less off), and
the switch on only with a tier to apply.

ADD-only, with defaults the deployed code never reads, so it is safe to run against production
BEFORE the P17 code merges.

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-28 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CHECKS = {
    "eb1_pair": "(eb1_days IS NULL) = (eb1_off_paise IS NULL)",
    "eb2_pair": "(eb2_days IS NULL) = (eb2_off_paise IS NULL)",
    "eb_positive": (
        "(eb1_days IS NULL OR (eb1_days > 0 AND eb1_off_paise > 0)) "
        "AND (eb2_days IS NULL OR (eb2_days > 0 AND eb2_off_paise > 0))"
    ),
    "eb2_after_eb1": (
        "eb2_days IS NULL OR (eb1_days IS NOT NULL AND eb2_days < eb1_days "
        "AND eb2_off_paise < eb1_off_paise)"
    ),
    "eb_on_needs_tier": "NOT early_bird_on OR eb1_days IS NOT NULL",
}


def upgrade() -> None:
    # A brief ACCESS EXCLUSIVE lock on packages: give up rather than queue every read behind a
    # long-running transaction (re-run it if it times out).
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "packages",
        sa.Column("early_bird_on", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column("packages", sa.Column("eb1_days", sa.SmallInteger()))
    op.add_column("packages", sa.Column("eb1_off_paise", sa.Integer()))
    op.add_column("packages", sa.Column("eb2_days", sa.SmallInteger()))
    op.add_column("packages", sa.Column("eb2_off_paise", sa.Integer()))
    for name, rule in CHECKS.items():
        op.create_check_constraint(op.f(f"ck_packages_{name}"), "packages", rule)


def downgrade() -> None:
    for name in reversed(CHECKS):
        op.drop_constraint(op.f(f"ck_packages_{name}"), "packages", type_="check")
    for column in ("eb2_off_paise", "eb2_days", "eb1_off_paise", "eb1_days", "early_bird_on"):
        op.drop_column("packages", column)
