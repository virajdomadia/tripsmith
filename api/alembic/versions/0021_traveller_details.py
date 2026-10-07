"""P9 — traveller details and the pre-trip checklist (R49).

- `traveller_details`: one row per booked traveller, the trip's sensitive fields (models/details.py
  `TravellerDetail`); the ID number only encrypted, its type and last four in plain;
- `packages.details_required`: which details the trip needs (default ID, emergency contact, food);
- `packages.checklist`: the owner's pre-trip tick items, up to six;
- `bookings.checklist_done`: the item keys the customer has ticked.

ADD-only: a new table and three columns with defaults, nothing read by the current code changes,
so it is safe to run against production BEFORE the P9 code merges. Text + check constraints, not
native enums (see models/base.py `TextEnum`).

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-08 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.create_table(
        "traveller_details",
        sa.Column("traveller_id", sa.Text(), nullable=False),
        sa.Column("booking_id", sa.Text(), nullable=False),
        sa.Column("id_type", sa.Text()),
        sa.Column("id_number_enc", sa.Text()),
        sa.Column("id_last4", sa.Text()),
        sa.Column("dob", sa.Date()),
        sa.Column("emergency_name", sa.Text()),
        sa.Column("emergency_relation", sa.Text()),
        sa.Column("emergency_phone", sa.Text()),
        sa.Column("food", sa.Text()),
        sa.Column("allergies", sa.Text()),
        sa.Column("medical", sa.Text()),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("updated_by", sa.Text()),
        sa.CheckConstraint(
            "id_type IS NULL OR id_type IN ('aadhaar', 'passport', 'driving_licence', 'voter_id')",
            name=op.f("ck_traveller_details_id_type"),
        ),
        sa.CheckConstraint(
            "food IS NULL OR food IN ('veg', 'non_veg', 'jain', 'vegan')",
            name=op.f("ck_traveller_details_food"),
        ),
        sa.CheckConstraint(
            "(id_type IS NULL) = (id_number_enc IS NULL) "
            "AND (id_type IS NULL) = (id_last4 IS NULL)",
            name=op.f("ck_traveller_details_id_whole"),
        ),
        sa.ForeignKeyConstraint(
            ["traveller_id"],
            ["booking_travellers.id"],
            name=op.f("fk_traveller_details_traveller_id_booking_travellers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name=op.f("fk_traveller_details_booking_id_bookings"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"],
            ["users.id"],
            name=op.f("fk_traveller_details_updated_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("traveller_id", name=op.f("pk_traveller_details")),
    )
    op.create_index("ix_traveller_details_booking_id", "traveller_details", ["booking_id"])
    op.add_column(
        "packages",
        sa.Column(
            "details_required",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default="{id,emergency,food}",
        ),
    )
    op.add_column(
        "packages",
        sa.Column(
            "checklist",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )
    op.create_check_constraint(
        op.f("ck_packages_details_required"),
        "packages",
        "details_required <@ ARRAY['id', 'dob', 'emergency', 'food', 'medical']::text[]",
    )
    op.create_check_constraint(
        op.f("ck_packages_checklist"),
        "packages",
        "jsonb_typeof(checklist) = 'array' AND jsonb_array_length(checklist) <= 6",
    )
    op.add_column(
        "bookings",
        sa.Column(
            "checklist_done", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"
        ),
    )


def downgrade() -> None:
    op.drop_column("bookings", "checklist_done")
    op.drop_constraint(op.f("ck_packages_checklist"), "packages", type_="check")
    op.drop_constraint(op.f("ck_packages_details_required"), "packages", type_="check")
    op.drop_column("packages", "checklist")
    op.drop_column("packages", "details_required")
    op.drop_index("ix_traveller_details_booking_id", table_name="traveller_details")
    op.drop_table("traveller_details")
