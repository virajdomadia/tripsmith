"""Traveller details (R49, P9; migration 0021).

One row per `booking_travellers` row, made the first time anyone saves that traveller's details.
The table holds every sensitive field the trip needs and nothing else, so the daily tidy's purge
(30 days after the trip) is a plain DELETE, and a booking's travellers stay as booked.

The ID number is stored only encrypted (`id_number_enc`, Fernet under `ID_NUMBER_KEY`); its type
and last four characters sit beside it in plain so every list, email and page shows the masked
form without decrypting. Only the owner's printable manifest decrypts (P9b).
"""

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TextEnum
from app.models.enums import FoodChoice, IdType


class TravellerDetail(Base):
    __tablename__ = "traveller_details"
    __table_args__ = (
        CheckConstraint(
            "id_type IS NULL OR id_type IN ('aadhaar', 'passport', 'driving_licence', 'voter_id')",
            name="id_type",
        ),
        CheckConstraint("food IS NULL OR food IN ('veg', 'non_veg', 'jain', 'vegan')", name="food"),
        CheckConstraint(
            "(id_type IS NULL) = (id_number_enc IS NULL) "
            "AND (id_type IS NULL) = (id_last4 IS NULL)",
            name="id_whole",
        ),
        Index("ix_traveller_details_booking_id", "booking_id"),
    )

    traveller_id: Mapped[str] = mapped_column(
        ForeignKey("booking_travellers.id", ondelete="CASCADE"), primary_key=True
    )
    booking_id: Mapped[str] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False
    )
    id_type: Mapped[IdType | None] = mapped_column(TextEnum(IdType))
    id_number_enc: Mapped[str | None] = mapped_column(Text)
    id_last4: Mapped[str | None] = mapped_column(Text)
    dob: Mapped[date | None] = mapped_column(Date)
    emergency_name: Mapped[str | None] = mapped_column(Text)
    emergency_relation: Mapped[str | None] = mapped_column(Text)
    emergency_phone: Mapped[str | None] = mapped_column(Text)
    food: Mapped[FoodChoice | None] = mapped_column(TextEnum(FoodChoice))
    allergies: Mapped[str | None] = mapped_column(Text)
    medical: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    # Who saved them last: the customer's or the owner's user id (null = the system).
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
