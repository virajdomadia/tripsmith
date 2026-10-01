"""SQLAlchemy 2.0 declarative models — one module per table group (06 Part A).

Import this package (not the modules) wherever the full metadata is needed: Alembic's env.py and
the test harness rely on every model being registered on `Base.metadata`.
"""

from app.models.analytics import PackageView
from app.models.auth import Session, User, Verification
from app.models.base import Base, new_id
from app.models.bookings import (
    Booking,
    BookingAddon,
    BookingCancellation,
    BookingEvent,
    BookingTraveller,
    DateChange,
    GstCounter,
    GstDocument,
    Payment,
    Refund,
    Review,
)
from app.models.catalog import (
    Departure,
    Destination,
    ItineraryDay,
    Package,
    PackageAddon,
    PackageImage,
    Testimonial,
)
from app.models.coupons import Coupon, coupon_packages
from app.models.enquiries import Enquiry, EnquiryMessage, EnquiryNote
from app.models.waitlist import WaitlistEntry

__all__ = [
    "Base",
    "Booking",
    "BookingAddon",
    "BookingCancellation",
    "BookingEvent",
    "BookingTraveller",
    "Coupon",
    "DateChange",
    "Departure",
    "Destination",
    "Enquiry",
    "GstCounter",
    "GstDocument",
    "EnquiryMessage",
    "EnquiryNote",
    "ItineraryDay",
    "Package",
    "PackageAddon",
    "PackageImage",
    "PackageView",
    "Payment",
    "Refund",
    "Review",
    "Session",
    "Testimonial",
    "User",
    "Verification",
    "WaitlistEntry",
    "coupon_packages",
    "new_id",
]
