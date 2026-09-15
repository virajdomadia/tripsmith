"""Own page-view counter (06 A5): one row per package per day."""

from datetime import date

from sqlalchemy import Date, ForeignKey, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PackageView(Base):
    __tablename__ = "package_views"
    __table_args__ = (Index("ix_package_views_day", "day"),)

    package_id: Mapped[str] = mapped_column(
        ForeignKey("packages.id", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
