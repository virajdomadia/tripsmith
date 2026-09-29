"""Deposit now, balance later (R43, P5): the rules, with no database.

- The deposit is 25 % of the booking's total (after the deal, the early-bird and the coupon,
  add-ons included), rounded **up** to the whole rupee — never under 25 %, and the balance stays
  in whole rupees.
- The balance is due 30 days before departure, the first day of the full-refund tier. A
  departure whose due day has come (IST) is pay in full only.
- The balance can be paid in parts of at least ₹1,000; a remainder under that is one last part.
- Two days' grace after the due day, the daily tidy cancels the booking as `balance_unpaid`.
- Reminders go 7 and 3 days before the due day, and on it.
"""

import datetime as dt

from app.schemas.bookings import Quote, QuoteDeposit

DEPOSIT_PERCENT = 25
BALANCE_DAYS = 30
GRACE_DAYS = 2
MIN_PART_PAISE = 1_000_00
REMINDER_DAYS = (7, 3, 0)  # before the due day; the tidy sends the nearest one not yet sent


def due_on(departs: dt.date) -> dt.date:
    return departs - dt.timedelta(days=BALANCE_DAYS)


def deposit_paise(total_paise: int) -> int:
    """25 % of the total, rounded up to the whole rupee."""
    return -(-total_paise * DEPOSIT_PERCENT // (100 * 100)) * 100


def offered(total_paise: int, departs: dt.date, today: dt.date, *, on: bool) -> QuoteDeposit | None:
    """The deposit this quote may be paid with — None when the package has it switched off,
    the balance would already be due, or the total is too small to split."""
    if not on or today >= due_on(departs):
        return None
    amount = deposit_paise(total_paise)
    if amount >= total_paise:
        return None
    return QuoteDeposit(
        percent=DEPOSIT_PERCENT,
        amount_paise=amount,
        balance_paise=total_paise - amount,
        due_on=due_on(departs),
    )


def with_deposit(quote: Quote, departs: dt.date, today: dt.date, *, on: bool) -> Quote:
    return quote.model_copy(update={"deposit": offered(quote.total_paise, departs, today, on=on)})


def min_part(balance_paise: int) -> int:
    """The smallest part the customer may pay now: ₹1,000, or all of a smaller balance."""
    return min(MIN_PART_PAISE, balance_paise)


def overdue_after(due: dt.date) -> dt.date:
    """The last IST day of grace; the tidy cancels on the day after it."""
    return due + dt.timedelta(days=GRACE_DAYS)


def reminder_stage(due: dt.date, today: dt.date) -> int | None:
    """Which reminder today calls for: the nearest stage whose day has come (a missed run
    catches up with the latest one, never sends two), or None before −7 and after the grace."""
    left = (due - today).days
    if left > REMINDER_DAYS[0] or today > overdue_after(due):
        return None
    return next((s for s in reversed(REMINDER_DAYS) if left <= s), REMINDER_DAYS[0])
