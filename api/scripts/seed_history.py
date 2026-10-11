"""`seed.py --history` (P12, R55): a year of marked demo history behind the reports.

About 50 past departures (four per live package, spread over the last 12 months) and ~150
bookings on them, priced by the real quote (early-bird from the booking day, add-ons, a demo
deal, two demo coupons, the counter's manual discount), paid in full or on a deposit, a few
cancelled with a refund recorded by hand, and the lapsed holds and failed payments every month
has. Plus the package enquiries and page views a year like that brings in.

Everything is marked: contacts are `history-seed-N@example.com` (the reports' "Demo history"
switch, and every automatic email skips them), refs `TB-H00001…` / `TS-H00001…`, a "Demo booking
(seed)" history line, and the coupon codes `DEMOHIST10` / `DEMOFLAT2K` exist only on these
quotes. Nothing departs within the last week and nothing was booked in the last 35 days, so the
public urgency labels (R40) never see it. No GST numbers are issued. It never touches a future
departure, so no seat anyone can buy changes.

Idempotent: if any history booking exists the run does nothing. Deterministic (fixed seed).
"""

import datetime as dt
import random
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Booking,
    BookingCancellation,
    BookingTraveller,
    Coupon,
    Departure,
    Enquiry,
    Package,
    PackageAddon,
    PackageView,
    Payment,
    Refund,
    User,
)
from app.models.enums import (
    AddonBasis,
    BookingActor,
    BookingChannel,
    BookingStatus,
    CancellationStatus,
    CancelReason,
    CouponKind,
    EmailStatus,
    EnquiryStatus,
    EnquiryType,
    Occupancy,
    PackageStatus,
    PaymentProvider,
    PaymentStatus,
    RefundStatus,
    UserRole,
)
from app.schemas.bookings import QuoteAddon, QuoteDeal, QuoteLine, QuoteLineKind, QuoteTraveller
from app.services.analytics import ist_today
from app.services.booking import history
from app.services.booking.addons import addon_rows
from app.services.booking.pricing import apply_coupon, apply_manual, build_quote
from app.services.email.render import IST
from app.services.email.send import HISTORY_LOCAL_PREFIX

RNG_SEED = 55
DEPARTURES_PER_PACKAGE = 4
NEWEST_DEPARTURE_DAYS = 7  # nothing departs in the last week: the desk's "this week" stays real
NEWEST_BOOKING_DAYS = 35  # outside R40's 30-day "Booked N×" window, with room to spare
YEAR = 365
REF_PREFIX = "TB-H"
ENQUIRY_PREFIX = "TS-H"
PHONE = "9876500000"
COUPONS = (
    Coupon(code="DEMOHIST10", kind=CouponKind.PERCENT, percent=10, cap_paise=3_000_00),
    Coupon(code="DEMOFLAT2K", kind=CouponKind.FLAT, amount_paise=2_000_00),
)
DEAL_LABEL = "Season sale (demo)"
MANUAL_REASON = "Returning family (demo)"
FIRST = (
    "Aarav",
    "Diya",
    "Kabir",
    "Meera",
    "Rohan",
    "Saanvi",
    "Vikram",
    "Anika",
    "Arjun",
    "Isha",
    "Neel",
    "Tara",
    "Dev",
    "Riya",
    "Karan",
    "Pooja",
    "Nikhil",
    "Sneha",
    "Yash",
    "Aditi",
)
LAST = (
    "Sharma",
    "Iyer",
    "Patel",
    "Reddy",
    "Nair",
    "Gupta",
    "Menon",
    "Rao",
    "Das",
    "Kapoor",
    "Joshi",
    "Bhat",
    "Kulkarni",
    "Shetty",
    "Chopra",
)
PARTIES = ((1, 8), (2, 46), (3, 14), (4, 20), (5, 7), (6, 5))  # (travellers, weight)
LEADS = (((3, 6), 10), ((7, 29), 35), ((30, 89), 40), ((90, 150), 15))  # days ahead
CHANNELS = (
    (BookingChannel.WEB, 70),
    (BookingChannel.PHONE, 10),
    (BookingChannel.WHATSAPP, 8),
    (BookingChannel.WALK_IN, 5),
    (BookingChannel.ENQUIRY, 7),
)


@dataclass
class HistoryResult:
    counts: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def _pick[T](rng: random.Random, table: tuple[tuple[T, int], ...]) -> T:
    return rng.choices([v for v, _ in table], weights=[w for _, w in table])[0]


def _at(day: dt.date, rng: random.Random) -> dt.datetime:
    """A daytime IST moment on `day`, as aware UTC."""
    return dt.datetime.combine(
        day, dt.time(rng.randint(9, 21), rng.randint(0, 59)), IST
    ).astimezone(dt.UTC)


def departure_days(today: dt.date, n: int, offset: int) -> list[dt.date]:
    """`n` dates spread over the last year (newest ≥ a week back), shifted per package."""
    span = YEAR - NEWEST_DEPARTURE_DAYS - 20
    return [
        today - dt.timedelta(days=NEWEST_DEPARTURE_DAYS + 3 + (span * i // n + offset * 11) % span)
        for i in range(n)
    ]


class _Writer:
    def __init__(self, db: AsyncSession, today: dt.date, owner_id: str | None) -> None:
        self.db, self.today, self.owner_id = db, today, owner_id
        self.rng = random.Random(RNG_SEED)
        self.bookings = self.enquiries = self.departures = 0
        self.emails: list[str] = []

    def contact(self) -> tuple[str, str]:
        """A name and email; about one in eight is a returning customer."""
        if self.emails and self.rng.random() < 0.12:
            email = self.rng.choice(self.emails)
            return email.split("@")[0], email
        n = len(self.emails) + 1
        email = f"{HISTORY_LOCAL_PREFIX}{n}@example.com"
        self.emails.append(email)
        return email.split("@")[0], email

    def name(self) -> str:
        return f"{self.rng.choice(FIRST)} {self.rng.choice(LAST)}"

    def booked_at(self, departs: dt.date) -> dt.datetime:
        lo, hi = _pick(self.rng, LEADS)
        day = departs - dt.timedelta(days=self.rng.randint(lo, hi))
        newest = self.today - dt.timedelta(days=NEWEST_BOOKING_DAYS)
        if day > newest:
            day = newest - dt.timedelta(days=self.rng.randint(0, 10))
        return _at(day, self.rng)

    async def enquiry(
        self, pkg: Package, departs: dt.date, at: dt.datetime, status: EnquiryStatus
    ) -> Enquiry:
        self.enquiries += 1
        name, email = self.name(), self.contact()[1]
        row = Enquiry(
            ref=f"{ENQUIRY_PREFIX}{self.enquiries:05d}",
            type=EnquiryType.STANDARD,
            package_id=pkg.id,
            name=name,
            phone=PHONE,
            email=email,
            travel_month=departs.replace(day=1),
            adults=self.rng.randint(1, 4),
            message="Demo enquiry (seed) — part of the reports' history",
            status=status,
            email_status=EmailStatus.SKIPPED,
            created_at=at,
            updated_at=at,
        )
        self.db.add(row)
        await self.db.flush()
        return row

    async def booking(
        self,
        pkg: Package,
        dep: Departure,
        offered: list[PackageAddon],
        party: int,
        *,
        returned: bool,
    ) -> int:
        """One booking holding `party` seats (or cancelled after paying); returns the seats it
        still holds."""
        rng = self.rng
        at = self.booked_at(dep.date)
        channel = _pick(rng, CHANNELS)
        occupancies = [Occupancy.DOUBLE] * (party - party % 2) + [Occupancy.SINGLE] * (party % 2)
        extras: list[QuoteAddon] = []
        live = [a for a in offered if a.active]
        if live and rng.random() < 0.38:
            a = rng.choice(live)
            travellers, nights = 1, 1
            if a.basis == AddonBasis.TRAVELLER:
                travellers = rng.randint(1, party)
            elif a.basis == AddonBasis.NIGHT:
                travellers, nights = party, rng.randint(1, max(a.max_nights or 1, 1))
            extras.append(
                QuoteAddon(
                    addon_id=a.id,
                    name=a.name,
                    basis=a.basis,
                    unit_paise=a.price_paise,
                    travellers=travellers,
                    nights=nights,
                    amount_paise=a.price_paise * travellers * nights,
                )
            )
        quote = build_quote(
            dep,
            pkg,
            [QuoteTraveller(occupancy=o) for o in occupancies],
            seats_left=dep.seats_total,
            deal_base=0,
            now=at,
            addons=extras,
        )
        if channel == BookingChannel.WEB and rng.random() < 0.15:
            off = 1_500_00
            deal = [
                QuoteLine(
                    kind=QuoteLineKind.DEAL,
                    occupancy=li.occupancy,
                    count=li.count,
                    unit_paise=-off,
                    amount_paise=-off * li.count,
                )
                for li in quote.lines
                if li.kind.value == li.occupancy.value
            ]
            total_off = -sum(li.amount_paise for li in deal)
            quote = quote.model_copy(
                update={
                    "lines": [*quote.lines, *deal],
                    "deal": QuoteDeal(
                        label=DEAL_LABEL,
                        ends_at=at + dt.timedelta(days=3),
                        per_traveller_paise=off,
                    ),
                    "discount_paise": quote.discount_paise + total_off,
                    "total_paise": quote.total_paise - total_off,
                }
            )
        coupon = None
        if rng.random() < 0.14:
            coupon = rng.choice(COUPONS)
            quote = apply_coupon(quote, coupon)
        if channel != BookingChannel.WEB and rng.random() < 0.3:
            quote = apply_manual(quote, mode="inr", value=1_500, reason=MANUAL_REASON)
        total = quote.total_paise

        self.bookings += 1
        lead_name, email = self.name(), self.contact()[1]
        enquiry = (
            await self.enquiry(pkg, dep.date, at - dt.timedelta(days=2), EnquiryStatus.CONVERTED)
            if channel == BookingChannel.ENQUIRY
            else None
        )
        cancelled = rng.random() < 0.08
        on_deposit = not cancelled and rng.random() < 0.25 and (dep.date - at.date()).days > 35
        deposit = -(-total // 4 // 100) * 100 if on_deposit else None
        status = (
            BookingStatus.CANCELLED
            if cancelled
            else BookingStatus.COMPLETED
            if returned
            else BookingStatus.CONFIRMED
        )
        booking = Booking(
            ref=f"{REF_PREFIX}{self.bookings:05d}",
            package_id=pkg.id,
            departure_id=dep.id,
            status=status,
            channel=channel,
            created_by_user_id=self.owner_id if channel != BookingChannel.WEB else None,
            enquiry_id=enquiry.id if enquiry else None,
            hold_expires_at=at + dt.timedelta(minutes=10),
            contact_name=lead_name,
            contact_phone=PHONE,
            contact_email=email,
            quote=quote.model_dump(mode="json", by_alias=True),
            total_paise=total,
            paid_paise=total,
            coupon_code=coupon.code if coupon else None,
            billing_state="Karnataka" if rng.random() < 0.55 else "Maharashtra",
            deposit_paise=deposit,
            balance_due_on=dep.date - dt.timedelta(days=30) if deposit else None,
            cancel_reason=CancelReason.CANCELLATION_APPROVED if cancelled else None,
            created_at=at,
            updated_at=at,
        )
        self.db.add(booking)
        await self.db.flush()
        first = lead_name.split()[0]
        for i, occ in enumerate(occupancies):
            self.db.add(
                BookingTraveller(
                    booking_id=booking.id,
                    name=lead_name if i == 0 else f"{first}'s guest {i}",
                    age=rng.randint(24, 58),
                    occupancy=occ,
                    position=i,
                )
            )
        for row in addon_rows(quote.addons, booking_id=booking.id):
            self.db.add(row)
        paid_at = at + dt.timedelta(minutes=rng.randint(2, 9))
        parts = (
            [(paid_at, deposit), (_at(dep.date - dt.timedelta(days=33), rng), total - deposit)]
            if deposit
            else [(paid_at, total)]
        )
        payments = []
        for when, amount in parts:
            p = Payment(
                booking_id=booking.id,
                provider=PaymentProvider.OFFLINE,
                amount_paise=amount,
                status=PaymentStatus.CAPTURED,
                created_at=when,
                updated_at=when,
            )
            self.db.add(p)
            payments.append(p)
        await self.db.flush()
        history.record(
            self.db,
            booking.id,
            "booked",
            actor=BookingActor.SYSTEM,
            text=f"Demo booking (seed) · {history.travellers(party)} · {history.money(total)} — "
            "the reports' history",
            customer=f"You booked {history.travellers(party)} · {history.money(total)}",
            at=at,
        )
        if not cancelled:
            return party
        asked = at + dt.timedelta(days=rng.randint(3, 20))
        back = total * rng.choice((50, 75, 90)) // 100 // 100 * 100
        self.db.add(
            BookingCancellation(
                booking_id=booking.id,
                reason="Plans changed (demo)",
                status=CancellationStatus.APPROVED,
                refund_paise=back,
                resolved_at=asked + dt.timedelta(hours=5),
                created_at=asked,
            )
        )
        self.db.add(
            Refund(
                booking_id=booking.id,
                payment_id=payments[-1].id,
                amount_paise=back,
                status=RefundStatus.PROCESSED,
                reason="Cancellation approved (demo)",
                by_hand=True,
                note="Demo refund (seed)",
                processed_at=asked + dt.timedelta(hours=6),
                created_at=asked + dt.timedelta(hours=6),
                updated_at=asked + dt.timedelta(hours=6),
            )
        )
        booking.paid_paise = total - back
        return 0

    async def lapsed(self, pkg: Package, dep: Departure, *, failed: bool) -> None:
        """A web hold that was never paid: it lapsed, or its payment failed."""
        at = self.booked_at(dep.date)
        party = _pick(self.rng, PARTIES)
        quote = build_quote(
            dep,
            pkg,
            [QuoteTraveller(occupancy=Occupancy.DOUBLE) for _ in range(party - party % 2)]
            + [QuoteTraveller(occupancy=Occupancy.SINGLE)] * (party % 2),
            seats_left=dep.seats_total,
            deal_base=0,
            now=at,
        )
        self.bookings += 1
        name, email = self.name(), self.contact()[1]
        booking = Booking(
            ref=f"{REF_PREFIX}{self.bookings:05d}",
            package_id=pkg.id,
            departure_id=dep.id,
            status=BookingStatus.CANCELLED,
            channel=BookingChannel.WEB,
            hold_expires_at=at + dt.timedelta(minutes=10),
            contact_name=name,
            contact_phone=PHONE,
            contact_email=email,
            quote=quote.model_dump(mode="json", by_alias=True),
            total_paise=quote.total_paise,
            paid_paise=0,
            cancel_reason=CancelReason.PAYMENT_FAILED if failed else CancelReason.HOLD_EXPIRED,
            created_at=at,
            updated_at=at,
        )
        self.db.add(booking)
        await self.db.flush()
        self.db.add(
            BookingTraveller(
                booking_id=booking.id, name=name, age=30, occupancy=Occupancy.DOUBLE, position=0
            )
        )
        if failed:
            self.db.add(
                Payment(
                    booking_id=booking.id,
                    provider=PaymentProvider.RAZORPAY,
                    amount_paise=quote.total_paise,
                    status=PaymentStatus.FAILED,
                    created_at=at,
                    updated_at=at,
                )
            )
        history.record(
            self.db,
            booking.id,
            "booked",
            actor=BookingActor.SYSTEM,
            text="Demo hold (seed) — never paid; the reports' history",
            at=at,
        )


async def _views(
    db: AsyncSession, packages: list[Package], today: dt.date, rng: random.Random
) -> int:
    rows = []
    for back in range(NEWEST_BOOKING_DAYS, YEAR + 1):
        day = today - dt.timedelta(days=back)
        season = 1.4 if day.month in (5, 6, 10, 12) else 0.8 if day.month in (2, 7, 8) else 1.0
        for pkg in packages:
            rows.append(
                {"package_id": pkg.id, "day": day, "count": int(rng.randint(4, 22) * season)}
            )
    for i in range(0, len(rows), 2000):  # asyncpg caps a statement at 32,767 parameters
        stmt = insert(PackageView).values(rows[i : i + 2000])
        await db.execute(
            stmt.on_conflict_do_update(
                index_elements=[PackageView.package_id, PackageView.day],
                set_={"count": PackageView.count + stmt.excluded.count},
            )
        )
    return sum(r["count"] for r in rows)


async def seed_history(
    db: AsyncSession, *, today: dt.date | None = None, per_package: int = DEPARTURES_PER_PACKAGE
) -> HistoryResult:
    today = today or ist_today()
    result = HistoryResult()
    already = (
        await db.execute(
            select(func.count())
            .select_from(Booking)
            .where(func.lower(Booking.contact_email).like(f"{HISTORY_LOCAL_PREFIX}%@example.com"))
        )
    ).scalar_one()
    if already:
        result.warnings.append(f"history already seeded ({already} bookings) — left alone")
        result.counts.update(history_bookings=0)
        return result
    packages = list(
        (
            await db.execute(
                select(Package).where(Package.status == PackageStatus.LIVE).order_by(Package.slug)
            )
        ).scalars()
    )
    owner_id = (
        (
            await db.execute(
                select(User.id).where(User.role == UserRole.OWNER).order_by(User.created_at)
            )
        )
        .scalars()
        .first()
    )
    w = _Writer(db, today, owner_id)
    for offset, pkg in enumerate(packages):
        dates = list(
            (await db.execute(select(Departure).where(Departure.package_id == pkg.id))).scalars()
        )
        template = max(
            (d for d in dates if d.price_double_paise > 0), key=lambda d: d.date, default=None
        )
        if template is None:
            result.warnings.append(f"{pkg.slug}: no priced departure to copy — skipped")
            continue
        taken = {d.date for d in dates}
        offered = list(
            (
                await db.execute(select(PackageAddon).where(PackageAddon.package_id == pkg.id))
            ).scalars()
        )
        for day in departure_days(today, per_package, offset):
            if day in taken:
                continue
            dep = Departure(
                package_id=pkg.id,
                date=day,
                seats_total=template.seats_total,
                guaranteed=True,
                price_double_paise=template.price_double_paise,
                price_triple_paise=template.price_triple_paise,
                price_child_paise=template.price_child_paise,
                single_supplement_paise=template.single_supplement_paise,
            )
            db.add(dep)
            await db.flush()
            taken.add(day)
            w.departures += 1
            returned = day + dt.timedelta(days=pkg.nights) < today
            target = dep.seats_total * w.rng.randint(40, 95) // 100
            held = 0
            while True:
                party = _pick(w.rng, PARTIES)
                if held + party > target:
                    break
                held += await w.booking(pkg, dep, offered, party, returned=returned)
            for _ in range(w.rng.randint(1, 3)):
                await w.lapsed(pkg, dep, failed=w.rng.random() < 0.2)
            for _ in range(w.rng.randint(2, 5)):
                status = w.rng.choice(
                    (EnquiryStatus.CONTACTED, EnquiryStatus.CLOSED, EnquiryStatus.CLOSED)
                )
                await w.enquiry(pkg, day, w.booked_at(day), status)
    views = await _views(db, packages, today, w.rng)
    await db.commit()
    result.counts.update(
        history_departures=w.departures,
        history_bookings=w.bookings,
        history_enquiries=w.enquiries,
        history_views=views,
    )
    return result
