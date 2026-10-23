"""Customer sign-in by email code (R18, 04 v2 "Own email code"). No passwords, no SMS.

- `issue_code` writes a 6-digit code to `verification`, valid 10 minutes. Only the newest code
  for an email works: issuing one retires the others. The wrong-try cap is per code, and each new
  code starts at 0 tries, so issuing is capped in the database too (v2.6 SA-2): 5 codes per
  email in 15 minutes, 20 in a day, which holds when Upstash fails open. Codes that really get
  emailed share a daily budget of 200 (SA-5), so rotating addresses can't spend the Gmail quota
  booking mail needs.
- `check_code` locks that row: a wrong code counts a try and the fifth kills it; the right one
  is consumed in the caller's transaction, so a code can only ever open one session.
- `sign_in_customer` finds or creates the `users` row (`role = customer`), attaches the
  bookings made with this email, and opens the same 30-day session cookie the owner gets.

The stored value is an HMAC of the email and code under `SESSION_SECRET` (prefixed, like the
voucher link): a leaked table row is useless without the key, where a plain hash of a 6-digit
code would fall to a million guesses.
"""

import datetime as dt
import hashlib
import hmac
import math
import secrets
from dataclasses import dataclass

from sqlalchemy import delete, func, not_, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.signing import Keys, keys_of
from app.models import Booking, Session, User, Verification
from app.models.enums import BookingActor, UserRole
from app.services.auth.sessions import open_session
from app.services.booking import history
from app.services.email.send import DEMO_DOMAINS

CODE_TTL = dt.timedelta(minutes=10)
MAX_ATTEMPTS = 5
NAME_MAX = 80
# v2.6 SA-2: codes per email, counted in the database so they hold when Upstash fails open.
OTP_EMAIL_CAPS = ((dt.timedelta(minutes=15), 5), (dt.timedelta(days=1), 20))
# v2.6 SA-5: code emails a day across everyone — leaves most of Gmail's ~500 for booking mail.
DAILY_CODE_EMAILS = 200
CODE_EMAIL_WINDOW = dt.timedelta(days=1)


class TooManyCodes(Exception):
    def __init__(self, retry_after: int, *, budget: bool = False) -> None:
        super().__init__(retry_after)
        self.retry_after = retry_after
        self.budget = budget  # True: the day's code-email budget, not this email's cap


def _now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


def new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(email: str, code: str, secret: str | None) -> str:
    """No secret (local dev) still hashes — just unkeyed; production always has one."""
    key = (secret or "").encode()
    return hmac.new(key, f"otp:{email}:{code}".encode(), hashlib.sha256).hexdigest()


async def role_of(db: AsyncSession, email: str) -> UserRole | None:
    return (await db.execute(select(User.role).where(User.email == email))).scalar_one_or_none()


@dataclass(frozen=True)
class Issued:
    code: str
    expires_at: dt.datetime


def _wait(oldest: dt.datetime, window: dt.timedelta, now: dt.datetime) -> int:
    return max(1, math.ceil((oldest + window - now).total_seconds()))


async def _refuse_if_capped(
    db: AsyncSession, email: str, *, emailed: bool, now: dt.datetime
) -> None:
    """Raise TooManyCodes when this email is at a cap, or (for a code that will really be
    emailed) when the day's code-email budget is spent. Counts rows `prune_codes` keeps."""
    for window, cap in OTP_EMAIL_CAPS:
        recent = (
            select(Verification.created_at)
            .where(Verification.identifier == email, Verification.created_at > now - window)
            .order_by(Verification.created_at.desc())
            .limit(cap)
            .subquery()
        )
        n, oldest = (await db.execute(select(func.count(), func.min(recent.c.created_at)))).one()
        if n >= cap:
            raise TooManyCodes(_wait(oldest, window, now))
    if not emailed:
        return
    # Demo addresses are never emailed (`held_back`), so they don't spend the budget.
    to_real = not_(or_(*(Verification.identifier.endswith(f"@{d}") for d in DEMO_DOMAINS)))
    n, oldest = (
        await db.execute(
            select(func.count(), func.min(Verification.created_at)).where(
                Verification.created_at > now - CODE_EMAIL_WINDOW, to_real
            )
        )
    ).one()
    if n >= DAILY_CODE_EMAILS:
        raise TooManyCodes(_wait(oldest, CODE_EMAIL_WINDOW, now), budget=True)


async def issue_code(
    db: AsyncSession,
    email: str,
    *,
    secret: str | None,
    emailed: bool = False,
    now: dt.datetime | None = None,
) -> Issued:
    """`emailed`: the code goes out by email, so it spends the day's code-email budget.
    Raises TooManyCodes (nothing written) when a cap or the budget is reached."""
    now = now or _now()
    # One issuer per email at a time, so two parallel asks can't both slip under the cap.
    # The global budget can overshoot by the few asks in flight — fine for a soft budget.
    await db.execute(select(func.pg_advisory_xact_lock(func.hashtext(f"otp:{email}"))))
    try:
        await _refuse_if_capped(db, email, emailed=emailed, now=now)
    except TooManyCodes:
        await db.rollback()
        raise
    await db.execute(
        update(Verification)
        .where(Verification.identifier == email, Verification.consumed_at.is_(None))
        .values(consumed_at=now)
    )
    code = new_code()
    row = Verification(
        identifier=email, code_hash=hash_code(email, code, secret), expires_at=now + CODE_TTL
    )
    db.add(row)
    await db.commit()
    return Issued(code, row.expires_at)


@dataclass(frozen=True)
class Checked:
    ok: bool
    tries_left: int  # 0 when the code is dead (expired, used, replaced, or out of tries)


async def check_code(
    db: AsyncSession,
    email: str,
    code: str,
    *,
    secret: Keys,
    now: dt.datetime | None = None,
) -> Checked:
    """On success the code is marked used but NOT committed — `sign_in_customer` commits it
    with the session, so a failure in between leaves the code usable. A wrong try commits."""
    now = now or _now()
    row = (
        await db.execute(
            select(Verification)
            .where(
                Verification.identifier == email,
                Verification.consumed_at.is_(None),
                Verification.expires_at > now,
            )
            .order_by(Verification.created_at.desc())
            .limit(1)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        await db.rollback()
        return Checked(False, 0)
    # A code mailed just before a SESSION_SECRET rotation was hashed under the old key (V6).
    keys = keys_of(secret) or ("",)
    if any(hmac.compare_digest(row.code_hash, hash_code(email, code, k)) for k in keys):
        row.consumed_at = now
        return Checked(True, MAX_ATTEMPTS - row.attempts)
    row.attempts += 1
    if row.attempts >= MAX_ATTEMPTS:
        row.consumed_at = now
    left = MAX_ATTEMPTS - row.attempts
    await db.commit()
    return Checked(False, left)


def _fallback_name(email: str) -> str:
    return email.split("@", 1)[0][:NAME_MAX] or "Traveller"


async def sign_in_customer(
    db: AsyncSession, email: str, *, ip: str | None, user_agent: str | None
) -> tuple[Session, str]:
    """After a good code: the customer's user row (created on first sign-in, named after the
    lead on their latest booking), their bookings attached, a new session — one commit."""
    latest_lead = (
        await db.execute(
            select(Booking.contact_name)
            .where(Booking.contact_email == email)
            .order_by(Booking.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    # ON CONFLICT: two tabs verifying at once must not trip the unique email.
    await db.execute(
        insert(User)
        .values(name=(latest_lead or _fallback_name(email))[:NAME_MAX], email=email)
        .on_conflict_do_nothing(index_elements=[User.email])
    )
    user = (await db.execute(select(User).where(User.email == email))).scalar_one()
    linked = await db.execute(
        update(Booking)
        .where(Booking.user_id.is_(None), Booking.contact_email == email)
        .values(user_id=user.id)
        .returning(Booking.id)
    )
    history.record_each(
        db,
        list(linked.scalars()),
        "account.linked",
        actor=BookingActor.CUSTOMER,
        by=user.id,
        text="Linked to the customer's account when they signed in",
        customer="Added to your account when you signed in",
    )
    return await open_session(db, user, ip=ip, user_agent=user_agent)


async def prune_codes(db: AsyncSession, *, now: dt.datetime | None = None) -> int:
    """Delete codes that expired over a day ago (the daily cron) — kept that long only so a
    support question about a failed sign-in can still be looked at."""
    cutoff = (now or _now()) - dt.timedelta(days=1)
    result = await db.execute(delete(Verification).where(Verification.expires_at < cutoff))
    await db.commit()
    return result.rowcount  # type: ignore[attr-defined]
