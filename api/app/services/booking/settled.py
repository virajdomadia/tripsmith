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


class Capture(NamedTuple):
    """A payment applied for the first time (never a replay)."""

    settled: Settled
    payment_id: str
    amount_paise: int
