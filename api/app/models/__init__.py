"""SQLAlchemy 2.0 declarative models — one module per table group (06 Part A).

Import this package (not the modules) wherever the full metadata is needed: Alembic's env.py and
the test harness rely on every model being registered on `Base.metadata`.
"""

from app.models.analytics import PackageView
from app.models.auth import Session, User, Verification
from app.models.base import Base, new_id
from app.models.catalog import (
    Departure,
    Destination,
    ItineraryDay,
    Package,
    PackageImage,
    Testimonial,
)
from app.models.enquiries import Enquiry, EnquiryNote

__all__ = [
    "Base",
    "Departure",
    "Destination",
    "Enquiry",
    "EnquiryNote",
    "ItineraryDay",
    "Package",
    "PackageImage",
    "PackageView",
    "Session",
    "Testimonial",
    "User",
    "Verification",
    "new_id",
]
