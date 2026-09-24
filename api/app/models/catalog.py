"""Catalog tables (06 A3): destinations, packages, itinerary days, departures, images,
testimonials. `seats_left` is never stored — the `departure_availability` view computes it."""

import datetime as dt
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
    column,
    table,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedMixin, IdMixin, TimestampsMixin, pg_enum
from app.models.enums import PackageStatus, Theme


class Destination(IdMixin, TimestampsMixin, Base):
    __tablename__ = "destinations"

    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    tagline: Mapped[str] = mapped_column(Text, nullable=False)
    intro: Mapped[str] = mapped_column(Text, nullable=False)  # markdown
    cover_url: Mapped[str] = mapped_column(Text, nullable=False)
    region: Mapped[str] = mapped_column(Text, nullable=False)
    best_months: Mapped[list[int]] = mapped_column(ARRAY(SmallInteger), nullable=False)
    climate: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)  # ⏩ add-on B
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    # Set when the first package here goes live, never cleared: from then on the slug is fixed,
    # even if that package is later unpublished, moved or deleted (migration 0002 backfilled).
    first_published_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))

    packages: Mapped[list["Package"]] = relationship(back_populates="destination")


class Package(IdMixin, TimestampsMixin, Base):
    __tablename__ = "packages"
    __table_args__ = (
        CheckConstraint("days = nights + 1", name="days_is_nights_plus_one"),
        Index("ix_packages_destination_id_status", "destination_id", "status"),
        Index("ix_packages_status_featured", "status", "featured"),
        Index("ix_packages_themes", "themes", postgresql_using="gin"),
    )

    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    destination_id: Mapped[str] = mapped_column(
        ForeignKey("destinations.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    themes: Mapped[list[Theme]] = mapped_column(
        ARRAY(pg_enum(Theme, "theme")), nullable=False, server_default="{}"
    )
    nights: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    days: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    departure_city: Mapped[str] = mapped_column(Text, nullable=False, server_default="Ex-Mumbai")
    highlights: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    inclusions: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    exclusions: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    # [{name, city, stars, nights}]
    hotels: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, server_default="[]")
    # [{q, a}]
    faq: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, server_default="[]")
    cover_image_id: Mapped[str | None] = mapped_column(
        ForeignKey("package_images.id", ondelete="SET NULL", use_alter=True)
    )
    status: Mapped[PackageStatus] = mapped_column(
        pg_enum(PackageStatus, "package_status"),
        nullable=False,
        server_default=PackageStatus.DRAFT.value,
    )
    featured: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # Set the first time the package goes live and never cleared: from then on the slug (the
    # public URL) is fixed. Migration 0002 backfilled the packages already live.
    first_published_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    # The version the form's stale-edit check compares; only a form save (create/update) moves
    # it. `updated_at` also moves on a publish or a gallery change, which are not conflicts.
    edited_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    # Cached: min live-departure price_double_paise; recomputed on departure writes.
    starting_price_paise: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    deal_price_paise: Mapped[int | None] = mapped_column(Integer)  # ⏩ v2
    deal_label: Mapped[str | None] = mapped_column(Text)  # ⏩ v2
    deal_ends_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))  # ⏩ v2
    rating_avg: Mapped[Decimal | None] = mapped_column(Numeric(2, 1))  # ⏩ v2 reviews
    rating_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")  # ⏩ v2

    destination: Mapped[Destination] = relationship(back_populates="packages")
    itinerary: Mapped[list["ItineraryDay"]] = relationship(
        back_populates="package", cascade="all, delete-orphan", order_by="ItineraryDay.day_no"
    )
    departures: Mapped[list["Departure"]] = relationship(
        back_populates="package", cascade="all, delete-orphan", order_by="Departure.date"
    )
    images: Mapped[list["PackageImage"]] = relationship(
        back_populates="package",
        cascade="all, delete-orphan",
        order_by="PackageImage.position",
        foreign_keys="PackageImage.package_id",
    )
    cover_image: Mapped["PackageImage | None"] = relationship(
        foreign_keys=[cover_image_id], post_update=True
    )


class ItineraryDay(IdMixin, Base):
    __tablename__ = "itinerary_days"
    __table_args__ = (UniqueConstraint("package_id", "day_no"),)

    package_id: Mapped[str] = mapped_column(
        ForeignKey("packages.id", ondelete="CASCADE"), nullable=False
    )
    day_no: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)  # markdown
    meal_b: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    meal_l: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    meal_d: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    stay: Mapped[str | None] = mapped_column(Text)  # hotel / city
    location_name: Mapped[str | None] = mapped_column(Text)  # ⏩ storyboard / route map
    lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))  # ⏩
    lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))  # ⏩

    package: Mapped[Package] = relationship(back_populates="itinerary")


class Departure(IdMixin, TimestampsMixin, Base):
    __tablename__ = "departures"
    __table_args__ = (
        UniqueConstraint("package_id", "date"),
        Index("ix_departures_date", "date"),
    )

    package_id: Mapped[str] = mapped_column(
        ForeignKey("packages.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    seats_total: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    guaranteed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    price_double_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    price_triple_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    price_child_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    single_supplement_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    whatsapp_group_url: Mapped[str | None] = mapped_column(Text)  # ⏩ add-on C

    package: Mapped[Package] = relationship(back_populates="departures")


class PackageImage(IdMixin, Base):
    __tablename__ = "package_images"
    __table_args__ = (Index("ix_package_images_package_id_position", "package_id", "position"),)

    package_id: Mapped[str] = mapped_column(
        ForeignKey("packages.id", ondelete="CASCADE"), nullable=False
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    alt: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")

    package: Mapped[Package] = relationship(back_populates="images", foreign_keys=[package_id])


class Testimonial(IdMixin, CreatedMixin, Base):
    __tablename__ = "testimonials"
    __table_args__ = (CheckConstraint("rating between 1 and 5", name="rating_1_to_5"),)

    name: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(Text, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    package_id: Mapped[str | None] = mapped_column(ForeignKey("packages.id", ondelete="SET NULL"))
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")


# The `departure_availability` view (06 A3). v1 = `seats_total`; the v2 migration replaces the
# view to subtract bookings. Services join this instead of reading seats_total so v2 changes
# nothing above the database.
departure_availability = table(
    "departure_availability",
    column("departure_id", Text),
    column("seats_left", Integer),
)
