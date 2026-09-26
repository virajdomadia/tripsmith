"""B11 — cancellation resolution and replies from the inbox.

- `booking_cancellations.refund_paise`: the amount the owner agreed to refund when approving
  (null until approved; 0 when the policy refunds nothing). 'Refund made' records exactly this.
- `enquiry_messages.package_id`: the package whose itinerary PDF went with a reply, so a failed
  send can be sent again with the same attachment.
- `enquiry_messages.error`: why a reply was not sent (null once it is). `resend_id` null already
  means "not sent".

ADD-only, so it is safe to run against production BEFORE the B11 code merges: the deployed api
never names these columns.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-26 22:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("booking_cancellations", sa.Column("refund_paise", sa.Integer()))
    op.add_column(
        "enquiry_messages",
        sa.Column(
            "package_id",
            sa.Text(),
            sa.ForeignKey(
                "packages.id", name="fk_enquiry_messages_package_id_packages", ondelete="SET NULL"
            ),
        ),
    )
    op.add_column("enquiry_messages", sa.Column("error", sa.Text()))


def downgrade() -> None:
    op.drop_column("enquiry_messages", "error")
    op.drop_column("enquiry_messages", "package_id")
    op.drop_column("booking_cancellations", "refund_paise")
