"""`GET /meta`: the constants both sides need, read from the modules that apply them (Q-5).

The schemas say the shape; this gathers the values, so a rule changed in `deposit.py` or
`business.py` reaches the web's pages and checks with no second copy to forget.
"""

from app.business import CANCELLATION_TIERS
from app.schemas.bookings import ADULT_MIN_AGE, CHILD_MAX_AGE, CHILD_MIN_AGE
from app.schemas.meta import (
    BADGE_LABELS,
    ENQUIRY_MESSAGE_MAX,
    ENQUIRY_TYPE_LABELS,
    IMAGE_MAX_BYTES,
    MAX_THEMES_PER_PACKAGE,
    MAX_TRAVELLERS,
    THEME_LABELS,
    AgeLimits,
    Badge,
    BadgeOption,
    BookingRules,
    CancellationTierOut,
    EnquiryType,
    EnquiryTypeOption,
    Limits,
    Meta,
    Retention,
    Theme,
    ThemeOption,
)
from app.services import enquiries
from app.services.auth import sessions
from app.services.booking import changes, deposit, details, orders, pricing
from app.services.gst import tax


def booking_rules() -> BookingRules:
    return BookingRules(
        deposit_percent=deposit.DEPOSIT_PERCENT,
        balance_days=deposit.BALANCE_DAYS,
        grace_days=deposit.GRACE_DAYS,
        min_part_paise=deposit.MIN_PART_PAISE,
        reminder_days=list(deposit.REMINDER_DAYS),
        hold_minutes=int(orders.HOLD.total_seconds() // 60),
        lead_days=pricing.MIN_DAYS_AHEAD,
        free_change_days=changes.FREE_DAYS,
        change_hold_minutes=int(changes.HOLD.total_seconds() // 60),
        online_change_days=changes.ONLINE_DAYS,
        change_fee_paise=changes.FEE_PER_TRAVELLER_PAISE,
        gst_percent=tax.RATE_PERCENT,
        cancellation_tiers=[
            CancellationTierOut(from_days=t.from_days, kept_percent=t.kept_percent, refund=t.refund)
            for t in CANCELLATION_TIERS
        ],
        ages=AgeLimits(child_min=CHILD_MIN_AGE, child_max=CHILD_MAX_AGE, adult_min=ADULT_MIN_AGE),
    )


def build_meta() -> Meta:
    return Meta(
        themes=[ThemeOption(value=t, label=THEME_LABELS[t]) for t in Theme],
        badges=[BadgeOption(value=b, label=BADGE_LABELS[b]) for b in Badge],
        enquiry_types=[
            EnquiryTypeOption(value=e, label=ENQUIRY_TYPE_LABELS[e]) for e in EnquiryType
        ],
        limits=Limits(
            max_travellers=MAX_TRAVELLERS,
            max_themes_per_package=MAX_THEMES_PER_PACKAGE,
            enquiry_message_max=ENQUIRY_MESSAGE_MAX,
            image_max_bytes=IMAGE_MAX_BYTES,
        ),
        rules=booking_rules(),
        retention=Retention(
            enquiry_days=enquiries.KEEP_DAYS,
            details_days=details.PURGE_AFTER_DAYS,
            session_days=sessions.SESSION_TTL.days,
        ),
    )
