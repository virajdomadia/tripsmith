"""B15 — coupon codes (R26).

- `coupons`: the owner's codes. Flat ₹ off (`amount_paise`) or % off (`percent`, 1–90) with an
  optional ₹ cap; valid from `starts_at` (IST day start) until `ends_at` (null = no end);
  optional minimum booking amount; optional total-use limit (null = no limit); all packages or
  the chosen ones in `coupon_packages`; an on/off switch.
- `coupon_packages`: the chosen packages when `all_packages` is false.
- `bookings.coupon_code`: the code a booking was quoted with. Uses are counted from bookings
  (a use = a booking with the code and money captured), never stored, so no counter can drift.

ADD-only, so it is safe to run against production BEFORE the B15 code merges: the deployed api
never names these tables or the column.

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-26 23:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

coupon_kind = postgresql.ENUM("flat", "percent", name="coupon_kind", create_type=False)


def upgrade() -> None:
    coupon_kind.create(op.get_bind(), checkfirst=False)
    op.create_table(
        "coupons",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("kind", coupon_kind, nullable=False),
        sa.Column("amount_paise", sa.Integer()),
        sa.Column("percent", sa.SmallInteger()),
        sa.Column("cap_paise", sa.Integer()),
        sa.Column("min_paise", sa.Integer()),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("use_limit", sa.Integer()),
        sa.Column("all_packages", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id", name="pk_coupons"),
        sa.UniqueConstraint("code", name="uq_coupons_code"),
        sa.CheckConstraint(
            "(kind = 'flat' AND amount_paise > 0 AND percent IS NULL AND cap_paise IS NULL)"
            " OR (kind = 'percent' AND percent BETWEEN 1 AND 90 AND amount_paise IS NULL)",
            name=op.f("ck_coupons_terms"),
        ),
        sa.CheckConstraint(
            "cap_paise IS NULL OR cap_paise > 0", name=op.f("ck_coupons_cap_positive")
        ),
        sa.CheckConstraint(
            "min_paise IS NULL OR min_paise > 0", name=op.f("ck_coupons_min_positive")
        ),
        sa.CheckConstraint(
            "use_limit IS NULL OR use_limit > 0", name=op.f("ck_coupons_limit_positive")
        ),
        sa.CheckConstraint("ends_at IS NULL OR ends_at > starts_at", name=op.f("ck_coupons_dates")),
    )
    op.create_table(
        "coupon_packages",
        sa.Column("coupon_id", sa.Text(), nullable=False),
        sa.Column("package_id", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["coupon_id"],
            ["coupons.id"],
            name="fk_coupon_packages_coupon_id_coupons",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["packages.id"],
            name="fk_coupon_packages_package_id_packages",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("coupon_id", "package_id", name="pk_coupon_packages"),
    )
    op.add_column("bookings", sa.Column("coupon_code", sa.Text()))
    op.create_index(
        "ix_bookings_coupon_code",
        "bookings",
        ["coupon_code", "contact_email"],
        postgresql_where=sa.text("coupon_code IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_bookings_coupon_code", table_name="bookings")
    op.drop_column("bookings", "coupon_code")
    op.drop_table("coupon_packages")
    op.drop_table("coupons")
    coupon_kind.drop(op.get_bind(), checkfirst=False)
