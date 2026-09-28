"""P13b — GST documents (R51): receipts, tax invoices and credit notes, numbered per FY.

- `bookings.billing_state` / `gstin` / `company_name`: what checkout now asks — the customer's
  State (place of supply) and, optionally, a business GSTIN with its company name. Null on every
  booking made before this row (their documents treat them as Karnataka, the supplier's State).
- `gst_documents`: one row per document issued — `kind` (receipt | invoice | credit_note), its
  financial year and sequence, the printed number (`RC/2026-27/0001`), the payment (receipt) or
  refund (credit note) it is for, its GST-inclusive amount and the IST day it is dated. At most
  one receipt per payment, one invoice per booking, one credit note per refund.
- `gst_counters`: the last number used per (kind, FY). A number is taken by incrementing this
  row in the same transaction that inserts the document, so a rollback gives it back: numbers
  never skip or repeat, even under concurrency.

ADD-only and nullable, so it is safe to run against production BEFORE the P13b code merges: the
deployed api never names the new columns or tables.

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-28 03:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("billing_state", sa.Text()))
    op.add_column("bookings", sa.Column("gstin", sa.Text()))
    op.add_column("bookings", sa.Column("company_name", sa.Text()))
    op.create_table(
        "gst_counters",
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("fy", sa.Text(), nullable=False),
        sa.Column("last", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("kind", "fy", name=op.f("pk_gst_counters")),
    )
    op.create_table(
        "gst_documents",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("booking_id", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("fy", sa.Text(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("number", sa.Text(), nullable=False),
        sa.Column("payment_id", sa.Text()),
        sa.Column("refund_id", sa.Text()),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("dated", sa.Date(), nullable=False),
        sa.Column(
            "issued_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            "kind IN ('receipt', 'invoice', 'credit_note')", name=op.f("ck_gst_documents_kind")
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"], ["bookings.id"], name=op.f("fk_gst_documents_booking_id_bookings")
        ),
        sa.ForeignKeyConstraint(
            ["payment_id"], ["payments.id"], name=op.f("fk_gst_documents_payment_id_payments")
        ),
        sa.ForeignKeyConstraint(
            ["refund_id"], ["refunds.id"], name=op.f("fk_gst_documents_refund_id_refunds")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_gst_documents")),
        sa.UniqueConstraint("number", name=op.f("uq_gst_documents_number")),
        sa.UniqueConstraint("kind", "fy", "seq", name=op.f("uq_gst_documents_kind")),
    )
    op.create_index("ix_gst_documents_booking_id", "gst_documents", ["booking_id"])
    op.create_index(
        "uq_gst_documents_receipt",
        "gst_documents",
        ["payment_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'receipt'"),
    )
    op.create_index(
        "uq_gst_documents_invoice",
        "gst_documents",
        ["booking_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'invoice'"),
    )
    op.create_index(
        "uq_gst_documents_credit_note",
        "gst_documents",
        ["refund_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'credit_note'"),
    )


def downgrade() -> None:
    op.drop_index("uq_gst_documents_credit_note", table_name="gst_documents")
    op.drop_index("uq_gst_documents_invoice", table_name="gst_documents")
    op.drop_index("uq_gst_documents_receipt", table_name="gst_documents")
    op.drop_index("ix_gst_documents_booking_id", table_name="gst_documents")
    op.drop_table("gst_documents")
    op.drop_table("gst_counters")
    op.drop_column("bookings", "company_name")
    op.drop_column("bookings", "gstin")
    op.drop_column("bookings", "billing_state")
