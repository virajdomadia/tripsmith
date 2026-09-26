"""Coupon codes (R26, B15; migration 0009).

A coupon's uses are never stored: a use is a booking carrying its code with money captured
(`paid_paise > 0`), so the count is always what the bookings say. `all_packages` is explicit —
an empty `coupon_packages` set means "none left", never "all", so deleting the only chosen
package cannot widen a coupon to the whole catalogue.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    Table,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, IdMixin, TimestampsMixin, pg_enum
from app.models.catalog import Package
from app.models.enums import CouponKind

coupon_packages = Table(
    "coupon_packages",
    Base.metadata,
    Column("coupon_id", ForeignKey("coupons.id", ondelete="CASCADE"), primary_key=True),
    Column("package_id", ForeignKey("packages.id", ondelete="CASCADE"), primary_key=True),
)


class Coupon(IdMixin, TimestampsMixin, Base):
    __tablename__ = "coupons"
    __table_args__ = (
        CheckConstraint(
            "(kind = 'flat' AND amount_paise > 0 AND percent IS NULL AND cap_paise IS NULL)"
            " OR (kind = 'percent' AND percent BETWEEN 1 AND 90 AND amount_paise IS NULL)",
            name="terms",
        ),
        CheckConstraint("cap_paise IS NULL OR cap_paise > 0", name="cap_positive"),
        CheckConstraint("min_paise IS NULL OR min_paise > 0", name="min_positive"),
        CheckConstraint("use_limit IS NULL OR use_limit > 0", name="limit_positive"),
        CheckConstraint("ends_at IS NULL OR ends_at > starts_at", name="dates"),
    )

    code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)  # upper case
    kind: Mapped[CouponKind] = mapped_column(pg_enum(CouponKind, "coupon_kind"), nullable=False)
    amount_paise: Mapped[int | None] = mapped_column(Integer)  # flat only
    percent: Mapped[int | None] = mapped_column(SmallInteger)  # percent only, 1–90
    cap_paise: Mapped[int | None] = mapped_column(Integer)  # percent only
    min_paise: Mapped[int | None] = mapped_column(Integer)  # after the deal
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # exclusive
    use_limit: Mapped[int | None] = mapped_column(Integer)
    all_packages: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    packages: Mapped[list[Package]] = relationship(secondary=coupon_packages, order_by=Package.name)
