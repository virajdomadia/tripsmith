"""Declarative base + the column recipes every table shares (06 Conventions)."""

from datetime import datetime
from enum import StrEnum

from cuid2 import cuid_wrapper
from sqlalchemy import DateTime, Enum, MetaData, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Deterministic constraint names so migrations can drop/alter them by name.
NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

new_id = cuid_wrapper()


def pg_enum(enum: type[StrEnum], name: str) -> Enum:
    """A native Postgres enum that stores the StrEnum *values* (`owner`), not member names."""
    return Enum(enum, name=name, values_callable=lambda e: [m.value for m in e])


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


class IdMixin:
    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)


class CreatedMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class TimestampsMixin(CreatedMixin):
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
