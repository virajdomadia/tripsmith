"""What a newly applied payment did to its booking (`settle_capture`'s answer), which decides
the emails `on_new_capture` sends. Its own module so payments.py and the email code can share
it without importing each other."""

from enum import StrEnum
from typing import NamedTuple


class Settled(StrEnum):
    """What a newly captured payment did to its booking — which emails B7 sends for it."""

    CONFIRMED = "confirmed"
    PART_PAID = "part_paid"  # add-on D's split: still pending, no email yet
    SEATS_GONE = "seats_gone"  # late capture, no seats: cancelled, refund needed
    NOT_PENDING = "not_pending"  # money on a booking already confirmed or cancelled: refund
    EXTRAS = "extras"  # P8b: an Add extras payment on a confirmed booking — the add-ons join it
    DEPOSIT = "deposit"  # P5: the deposit is in — `partially_paid`, the seats held
    BALANCE_PART = "balance_part"  # P5: a part of the balance, some still to pay
    PAID_IN_FULL = "paid_in_full"  # P5: the part that cleared the balance — `confirmed`
    DATE_CHANGED = "date_changed"  # P7: a change's difference paid — the booking moved
    CHANGE_LAPSED = "change_lapsed"  # P7: paid after its seats had gone — refunded, not moved


class Capture(NamedTuple):
    """A payment applied for the first time (never a replay). `offline` = the owner marked the
    booking paid on the desk (B10): `payment_id` is then a label, not a Razorpay id."""

    settled: Settled
    payment_id: str
    amount_paise: int
    offline: bool = False
