"""B10 — travellers keep the order they were entered in.

`booking_travellers.id` is a cuid2, so ordering a party by id (all B7–B9 did) shuffled it: the
lead could print third on the voucher. `position` is the traveller's place in the booking form,
0 first; the voucher, the emails, My trips and the departure manifest order by it.

ADD-only, so it is safe to run against production BEFORE the B10 code merges: the deployed api
never names the column, and its inserts take the server default 0 (ties then fall back to id,
exactly today's order). Existing rows are numbered by id — their entry order was never stored,
so this only makes today's order stable, it cannot recover the original one.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-26 18:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "booking_travellers",
        sa.Column("position", sa.SmallInteger(), nullable=False, server_default="0"),
    )
    op.execute(
        """
        update booking_travellers t
        set position = n.position
        from (
            select id, (row_number() over (partition by booking_id order by id) - 1) as position
            from booking_travellers
        ) n
        where n.id = t.id
        """
    )


def downgrade() -> None:
    op.drop_column("booking_travellers", "position")
