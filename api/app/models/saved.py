"""Saved trips — the ♡ (R39, P1; migration 0024).

One row per (account, package). A guest's saves live in the browser and are merged in on
sign-in, so `created_at` is when the trip was saved (the browser's time, clamped), not when the
row was written. "Most saved" on the owner's dashboard counts rows by `created_at`.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SavedPackage(Base):
    __tablename__ = "saved_packages"
    __table_args__ = (Index("ix_saved_packages_package_id_created_at", "package_id", "created_at"),)

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    package_id: Mapped[str] = mapped_column(
        ForeignKey("packages.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
