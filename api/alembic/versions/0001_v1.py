"""v1 — enums, own auth, catalog, enquiries, analytics, departure_availability view (06 A10).

Revision ID: 0001
Revises:
Create Date: 2026-09-15 20:46:15.105168
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Native enums are created explicitly (an enum inside ARRAY is not auto-created by create_table)
# and dropped explicitly so `downgrade base` leaves nothing behind.
ENUMS = {
    "user_role": ("owner", "customer"),
    "package_status": ("draft", "live"),
    "theme": ("beach", "hills", "honeymoon", "family", "adventure", "heritage"),
    "enquiry_type": ("standard", "custom", "contact", "callback", "group", "chat-handoff"),
    "enquiry_status": ("new", "contacted", "converted", "closed"),
    "email_status": ("sent", "failed", "skipped"),
}


def _enum(name: str) -> postgresql.ENUM:
    return postgresql.ENUM(*ENUMS[name], name=name, create_type=False)


DEPARTURE_AVAILABILITY_V1 = """
create view departure_availability as
select d.id as departure_id, d.seats_total as seats_left from departures d
"""


def upgrade() -> None:
    bind = op.get_bind()
    for name in ENUMS:
        _enum(name).create(bind)

    op.create_table(
        "destinations",
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("tagline", sa.Text(), nullable=False),
        sa.Column("intro", sa.Text(), nullable=False),
        sa.Column("cover_url", sa.Text(), nullable=False),
        sa.Column("region", sa.Text(), nullable=False),
        sa.Column("best_months", postgresql.ARRAY(sa.SmallInteger()), nullable=False),
        sa.Column("climate", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("position", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_destinations")),
        sa.UniqueConstraint("slug", name=op.f("uq_destinations_slug")),
    )
    op.create_table(
        "users",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=True),
        sa.Column("role", _enum("user_role"), server_default="customer", nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_table(
        "verification",
        sa.Column("identifier", sa.Text(), nullable=False),
        sa.Column("code_hash", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_verification")),
    )
    op.create_index(
        "ix_verification_identifier_created_at",
        "verification",
        ["identifier", "created_at"],
        unique=False,
    )
    op.create_table(
        "packages",
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("destination_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("themes", postgresql.ARRAY(_enum("theme")), server_default="{}", nullable=False),
        sa.Column("nights", sa.SmallInteger(), nullable=False),
        sa.Column("days", sa.SmallInteger(), nullable=False),
        sa.Column("departure_city", sa.Text(), server_default="Ex-Mumbai", nullable=False),
        sa.Column("highlights", postgresql.ARRAY(sa.Text()), server_default="{}", nullable=False),
        sa.Column("inclusions", postgresql.ARRAY(sa.Text()), server_default="{}", nullable=False),
        sa.Column("exclusions", postgresql.ARRAY(sa.Text()), server_default="{}", nullable=False),
        sa.Column(
            "hotels", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False
        ),
        sa.Column(
            "faq", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False
        ),
        sa.Column("cover_image_id", sa.Text(), nullable=True),
        sa.Column("status", _enum("package_status"), server_default="draft", nullable=False),
        sa.Column("featured", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("starting_price_paise", sa.Integer(), server_default="0", nullable=False),
        sa.Column("deal_price_paise", sa.Integer(), nullable=True),
        sa.Column("deal_label", sa.Text(), nullable=True),
        sa.Column("deal_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rating_avg", sa.Numeric(precision=2, scale=1), nullable=True),
        sa.Column("rating_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("days = nights + 1", name=op.f("ck_packages_days_is_nights_plus_one")),
        sa.ForeignKeyConstraint(
            ["destination_id"],
            ["destinations.id"],
            name=op.f("fk_packages_destination_id_destinations"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_packages")),
        sa.UniqueConstraint("slug", name=op.f("uq_packages_slug")),
    )
    op.create_index(
        "ix_packages_destination_id_status", "packages", ["destination_id", "status"], unique=False
    )
    op.create_index("ix_packages_status_featured", "packages", ["status", "featured"], unique=False)
    op.create_index(
        "ix_packages_themes", "packages", ["themes"], unique=False, postgresql_using="gin"
    )
    op.create_table(
        "sessions",
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ip", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_sessions_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sessions")),
        sa.UniqueConstraint("token", name=op.f("uq_sessions_token")),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"], unique=False)
    op.create_table(
        "departures",
        sa.Column("package_id", sa.Text(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("seats_total", sa.SmallInteger(), nullable=False),
        sa.Column("guaranteed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("price_double_paise", sa.Integer(), nullable=False),
        sa.Column("price_triple_paise", sa.Integer(), nullable=False),
        sa.Column("price_child_paise", sa.Integer(), nullable=False),
        sa.Column("single_supplement_paise", sa.Integer(), nullable=False),
        sa.Column("whatsapp_group_url", sa.Text(), nullable=True),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["packages.id"],
            name=op.f("fk_departures_package_id_packages"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_departures")),
        sa.UniqueConstraint("package_id", "date", name=op.f("uq_departures_package_id_date")),
    )
    op.create_index("ix_departures_date", "departures", ["date"], unique=False)
    op.create_table(
        "enquiries",
        sa.Column("ref", sa.Text(), nullable=False),
        sa.Column("type", _enum("enquiry_type"), nullable=False),
        sa.Column("package_id", sa.Text(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("phone", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("travel_month", sa.Date(), nullable=True),
        sa.Column("adults", sa.SmallInteger(), nullable=False),
        sa.Column("children", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("preferred_dates", sa.Text(), nullable=True),
        sa.Column("budget_paise", sa.Integer(), nullable=True),
        sa.Column("changes", sa.Text(), nullable=True),
        sa.Column("preferred_time", sa.Text(), nullable=True),
        sa.Column("status", _enum("enquiry_status"), server_default="new", nullable=False),
        sa.Column("email_status", _enum("email_status"), server_default="skipped", nullable=False),
        sa.Column("conversation_id", sa.Text(), nullable=True),
        sa.Column("ip_hash", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["packages.id"],
            name=op.f("fk_enquiries_package_id_packages"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_enquiries")),
        sa.UniqueConstraint("ref", name=op.f("uq_enquiries_ref")),
    )
    op.create_index("ix_enquiries_package_id", "enquiries", ["package_id"], unique=False)
    op.create_index(
        "ix_enquiries_phone_package_id_created_at",
        "enquiries",
        ["phone", "package_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_enquiries_status_created_at", "enquiries", ["status", "created_at"], unique=False
    )
    op.create_table(
        "itinerary_days",
        sa.Column("package_id", sa.Text(), nullable=False),
        sa.Column("day_no", sa.SmallInteger(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("meal_b", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("meal_l", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("meal_d", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("stay", sa.Text(), nullable=True),
        sa.Column("location_name", sa.Text(), nullable=True),
        sa.Column("lat", sa.Numeric(precision=9, scale=6), nullable=True),
        sa.Column("lng", sa.Numeric(precision=9, scale=6), nullable=True),
        sa.Column("id", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["packages.id"],
            name=op.f("fk_itinerary_days_package_id_packages"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_itinerary_days")),
        sa.UniqueConstraint(
            "package_id", "day_no", name=op.f("uq_itinerary_days_package_id_day_no")
        ),
    )
    op.create_table(
        "package_images",
        sa.Column("package_id", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("alt", sa.Text(), server_default="", nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("position", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["packages.id"],
            name=op.f("fk_package_images_package_id_packages"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_package_images")),
    )
    op.create_index(
        "ix_package_images_package_id_position",
        "package_images",
        ["package_id", "position"],
        unique=False,
    )
    op.create_foreign_key(
        op.f("fk_packages_cover_image_id_package_images"),
        "packages",
        "package_images",
        ["cover_image_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_table(
        "package_views",
        sa.Column("package_id", sa.Text(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("count", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["packages.id"],
            name=op.f("fk_package_views_package_id_packages"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("package_id", "day", name=op.f("pk_package_views")),
    )
    op.create_index("ix_package_views_day", "package_views", ["day"], unique=False)
    op.create_table(
        "testimonials",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("city", sa.Text(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("rating", sa.SmallInteger(), nullable=False),
        sa.Column("package_id", sa.Text(), nullable=True),
        sa.Column("position", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("rating between 1 and 5", name=op.f("ck_testimonials_rating_1_to_5")),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["packages.id"],
            name=op.f("fk_testimonials_package_id_packages"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_testimonials")),
    )
    op.create_table(
        "enquiry_notes",
        sa.Column("enquiry_id", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["enquiry_id"],
            ["enquiries.id"],
            name=op.f("fk_enquiry_notes_enquiry_id_enquiries"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_enquiry_notes")),
    )
    op.execute(DEPARTURE_AVAILABILITY_V1)


def downgrade() -> None:
    op.execute("drop view if exists departure_availability")
    op.drop_constraint(
        op.f("fk_packages_cover_image_id_package_images"), "packages", type_="foreignkey"
    )
    op.drop_table("enquiry_notes")
    op.drop_table("testimonials")
    op.drop_index("ix_package_views_day", table_name="package_views")
    op.drop_table("package_views")
    op.drop_index("ix_package_images_package_id_position", table_name="package_images")
    op.drop_table("package_images")
    op.drop_table("itinerary_days")
    op.drop_index("ix_enquiries_status_created_at", table_name="enquiries")
    op.drop_index("ix_enquiries_phone_package_id_created_at", table_name="enquiries")
    op.drop_index("ix_enquiries_package_id", table_name="enquiries")
    op.drop_table("enquiries")
    op.drop_index("ix_departures_date", table_name="departures")
    op.drop_table("departures")
    op.drop_index("ix_sessions_user_id", table_name="sessions")
    op.drop_table("sessions")
    op.drop_index("ix_packages_themes", table_name="packages", postgresql_using="gin")
    op.drop_index("ix_packages_status_featured", table_name="packages")
    op.drop_index("ix_packages_destination_id_status", table_name="packages")
    op.drop_table("packages")
    op.drop_index("ix_verification_identifier_created_at", table_name="verification")
    op.drop_table("verification")
    op.drop_table("users")
    op.drop_table("destinations")
    bind = op.get_bind()
    for name in reversed(ENUMS):
        _enum(name).drop(bind)
