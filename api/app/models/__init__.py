"""SQLAlchemy 2.0 declarative models — one module per table group (06 Part A).

Import this package (not the modules) wherever the full metadata is needed: Alembic's env.py and
the test harness rely on every model being registered on `Base.metadata`.
"""

from app.models.analytics import PackageView
from app.models.auth import Session, User, Verification
from app.models.base import Base, new_id
from app.models.bookings import (
    Booking,
    BookingCancellation,
    BookingTraveller,
    Payment,
    Review,
)
from app.models.catalog import (
    Departure,
    Destination,
    ItineraryDay,
    Package,
    PackageImage,
    Testimonial,
)
from app.models.enquiries import Enquiry, EnquiryMessage, EnquiryNote

__all__ = [
    "Base",
    "Booking",
    "BookingCancellation",
    "BookingTraveller",
    "Departure",
    "Destination",
    "Enquiry",
    "EnquiryMessage",
    "EnquiryNote",
    "ItineraryDay",
    "Package",
    "PackageImage",
    "PackageView",
    "Payment",
    "Review",
    "Session",
    "Testimonial",
    "User",
    "Verification",
    "new_id",
]
