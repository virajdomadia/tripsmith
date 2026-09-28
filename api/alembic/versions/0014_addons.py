"""P8 — add-ons (R46): the extras a package offers, and the ones each booking bought.

- `package_addons`: the owner's add-ons per package — name, description, price, how it is
  charged (`basis`: per booking | per traveller | per traveller per night, the last with a
  `max_nights`), an optional photo from the package's gallery, on/off, and its place in the list.
- `booking_addons`: what a booking bought, snapshotted — name, basis, unit price, how many
  travellers and nights, the amount. `addon_id` is kept for reports but goes null if the owner
  deletes the add-on; the booking's copy never changes. `payment_id` is the "Add extras" payment
  that bought it (null = bought with the booking); `removed_at` / `refund_id` record an add-on the
  owner took off a booking, refunded through the one refund function.
- `payments.extras`: the priced "Add extras" selection an order pays for, applied when it is
  captured (P8b).
- A second tax invoice for extras bought after the first (R46 decision): the invoice index now
  allows one booking-level invoice (`payment_id` null, as today) plus one per extras payment.

ADD-only apart from the invoice index, which keeps its rule for every invoice the deployed code
writes (all have `payment_id` null), so it is safe to run against production BEFORE the P8 code
merges.

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-28 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BASIS = "basis IN ('booking', 'traveller', 'night')"


def upgrade() -> None:
    # Brief ACCESS EXCLUSIVE locks on payments and gst_documents: give up rather than queue
    # every payment behind a long-running transaction (re-run it if it times out).
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.create_table(
        "package_addons",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("package_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("price_paise", sa.Integer(), nullable=False),
        sa.Column("basis", sa.Text(), nullable=False),
        sa.Column("max_nights", sa.SmallInteger()),
        sa.Column("image_id", sa.Text()),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("position", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(BASIS, name=op.f("ck_package_addons_basis")),
        sa.CheckConstraint("price_paise > 0", name=op.f("ck_package_addons_price_positive")),
        sa.CheckConstraint(
            "(basis = 'night') = (max_nights IS NOT NULL) AND "
            "(max_nights IS NULL OR max_nights BETWEEN 1 AND 14)",
            name=op.f("ck_package_addons_nights"),
        ),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["packages.id"],
            name=op.f("fk_package_addons_package_id_packages"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["image_id"],
            ["package_images.id"],
            name=op.f("fk_package_addons_image_id_package_images"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_package_addons")),
    )
    op.create_index(
        "ix_package_addons_package_id_position", "package_addons", ["package_id", "position"]
    )
    op.add_column("payments", sa.Column("extras", postgresql.JSONB()))
    op.create_table(
        "booking_addons",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("booking_id", sa.Text(), nullable=False),
        sa.Column("addon_id", sa.Text()),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("basis", sa.Text(), nullable=False),
        sa.Column("unit_paise", sa.Integer(), nullable=False),
        sa.Column("travellers", sa.SmallInteger(), nullable=False),
        sa.Column("nights", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("payment_id", sa.Text()),
        sa.Column("removed_at", sa.DateTime(timezone=True)),
        sa.Column("refund_id", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(BASIS, name=op.f("ck_booking_addons_basis")),
        sa.CheckConstraint("amount_paise > 0", name=op.f("ck_booking_addons_amount_positive")),
        sa.ForeignKeyConstraint(
            ["booking_id"], ["bookings.id"], name=op.f("fk_booking_addons_booking_id_bookings")
        ),
        sa.ForeignKeyConstraint(
            ["addon_id"],
            ["package_addons.id"],
            name=op.f("fk_booking_addons_addon_id_package_addons"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["payment_id"], ["payments.id"], name=op.f("fk_booking_addons_payment_id_payments")
        ),
        sa.ForeignKeyConstraint(
            ["refund_id"], ["refunds.id"], name=op.f("fk_booking_addons_refund_id_refunds")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_booking_addons")),
    )
    op.create_index("ix_booking_addons_booking_id", "booking_addons", ["booking_id"])
    op.create_index("ix_booking_addons_addon_id", "booking_addons", ["addon_id"])
    # One booking-level invoice (as before), plus one per extras payment.
    op.drop_index("uq_gst_documents_invoice", table_name="gst_documents")
    op.create_index(
        "uq_gst_documents_invoice",
        "gst_documents",
        ["booking_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'invoice' AND payment_id IS NULL"),
    )
    op.create_index(
        "uq_gst_documents_extras_invoice",
        "gst_documents",
        ["payment_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'invoice' AND payment_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_gst_documents_extras_invoice", table_name="gst_documents")
    op.drop_index("uq_gst_documents_invoice", table_name="gst_documents")
    op.create_index(
        "uq_gst_documents_invoice",
        "gst_documents",
        ["booking_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'invoice'"),
    )
    op.drop_index("ix_booking_addons_addon_id", table_name="booking_addons")
    op.drop_index("ix_booking_addons_booking_id", table_name="booking_addons")
    op.drop_table("booking_addons")
    op.drop_column("payments", "extras")
    op.drop_index("ix_package_addons_package_id_position", table_name="package_addons")
    op.drop_table("package_addons")
