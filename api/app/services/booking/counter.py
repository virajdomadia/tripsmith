"""The counter (R56, P18): the owner books for a customer and settles it in one step.

The price is the website's — `build_quote` with the deal, the early-bird, a coupon and add-ons —
plus an optional manual discount with a reason (`pricing.apply_manual`), so a counter quote and
a web quote for the same party differ by that discount alone. Two rules differ from the web: the
date may be as late as the departure day (the web stops two days out), and the party is capped
by the seats left rather than 12.

Booking and settling are one transaction under the same locks as a web hold (contact →
departure → coupon, then the enquiry being converted): the booking is written `pending` and the
payment taken at the counter (cash, UPI or bank) is applied at once through `settle_capture`,
the one capture function — confirmed when paid in full, `partially_paid` on the deposit. The
receipt, the voucher and the emails then follow as for any first payment (`on_new_capture`).

Converting an enquiry marks it `converted`, links it (`bookings.enquiry_id`) and notes it; an
enquiry converted once refuses a second booking.
"""

import datetime as dt
import re
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import ApiError
from app.infra.db import constraint_name
from app.models import (
    Booking,
    BookingTraveller,
    Departure,
    Enquiry,
    EnquiryNote,
    Package,
    PackageAddon,
    Payment,
    User,
)
from app.models.catalog import departure_availability
from app.models.enums import (
    BookingActor,
    BookingChannel,
    BookingStatus,
    EnquiryStatus,
    Occupancy,
    PackageStatus,
    PaymentProvider,
    PaymentStatus,
)
from app.schemas.bookings import (
    ADULT_MIN_AGE,
    CHILD_MAX_AGE,
    CHILD_MIN_AGE,
    Quote,
    QuoteRequest,
    UnbookableReason,
)
from app.schemas.catalog import AddonOut, ImageOut
from app.schemas.counter import (
    SEARCH_MIN,
    CounterBookingRequest,
    CounterDeparture,
    CounterPackage,
    CounterQuoteRequest,
    CounterTrips,
    CustomerMatch,
    CustomerSearch,
    CustomerTrip,
    EditTravellersInput,
)
from app.schemas.enquiries import normalise_phone
from app.services.admin_enquiries import PHONE_QUERY_RE, like_escape
from app.services.analytics import ist_today
from app.services.booking import coupons, deposit, history
from app.services.booking.addons import addon_rows
from app.services.booking.after_capture import Notify, on_new_capture
from app.services.booking.freshness import refresh_quietly
from app.services.booking.links import issue_link, link_until
from app.services.booking.locking import lock_booking
from app.services.booking.orders import (
    HOLD,
    NO_DEPOSIT,
    REF_ATTEMPTS,
    REF_CONSTRAINT,
    _deal_base,
    _load,
    _lock_contact,
    _seats_left,
    make_ref,
    priced_addons,
)
from app.services.booking.payments import settle_capture
from app.services.booking.pricing import apply_coupon, apply_manual, build_quote
from app.services.booking.settled import Capture, Settled
from app.services.booking.voucher import offline_label
from app.services.email.links import ist_moment

CHANNEL_WORDS = {
    BookingChannel.WEB: "Web",
    BookingChannel.PHONE: "Phone",
    BookingChannel.WALK_IN: "Walk-in",
    BookingChannel.WHATSAPP: "WhatsApp",
    BookingChannel.ENQUIRY: "Enquiry",
}
METHOD_WORDS = {"cash": "Cash", "upi": "UPI", "bank": "Bank transfer"}
CUSTOMER_MATCHES = 8
TRIPS_SHOWN = 3
DEPARTED = "This date has already departed"
NO_ENQUIRY = "That enquiry no longer exists"
PAYMENTS_OFF = "Online payments are switched off — take the payment at the counter"
LINK_TOO_LATE = "Too close to departure for a 24-hour link — take the payment now, or a deposit"
EDITABLE = (BookingStatus.PENDING, BookingStatus.PARTIALLY_PAID, BookingStatus.CONFIRMED)


def _unbookable(dep: Departure, *, seats_left: int, party: int, today: dt.date) -> None:
    """The counter's rules: priced, not yet departed (the departure day itself is fine), and
    seats for the whole party."""
    if min(dep.price_double_paise, dep.price_triple_paise, dep.price_child_paise) <= 0:
        raise ApiError(
            "conflict",
            "This date is priced on request — set its prices on the package first",
            reason=UnbookableReason.ON_REQUEST.value,
        )
    if dep.date < today:
        raise ApiError("conflict", DEPARTED, reason=UnbookableReason.TOO_SOON.value)
    if seats_left < party:
        left = max(0, seats_left)
        raise ApiError(
            "conflict",
            f"Only {left} seat{'s' if left != 1 else ''} left on this date — the party of "
            f"{party} doesn't fit",
            reason=UnbookableReason.SOLD_OUT.value,
        )


async def _price(
    db: AsyncSession,
    dep: Departure,
    pkg: Package,
    req: CounterQuoteRequest,
    *,
    seats_left: int,
    now: dt.datetime,
    lock: bool,
) -> tuple[Quote, str | None]:
    """The website's quote for the party, then the manual discount, then the deposit offer.
    Returns it with the coupon code it kept."""
    party = len(req.travellers)
    quote = build_quote(
        dep,
        pkg,
        req.travellers,
        seats_left=seats_left,
        deal_base=await _deal_base(db, pkg.id, now=now),
        now=now,
        addons=await priced_addons(db, pkg.id, req.addons, party=party),
    )
    code: str | None = None
    if req.coupon_code:
        coupon = await coupons.check(
            db, req.coupon_code, pkg, quote, email=req.email, now=now, lock=lock
        )
        quote = apply_coupon(quote, coupon)
        code = coupon.code
    if req.manual is not None:
        m = req.manual
        quote = apply_manual(quote, mode=m.mode, value=m.value, reason=m.reason)
    return deposit.with_deposit(quote, dep.date, ist_today(now), on=pkg.deposit_on), code


async def counter_quote(
    db: AsyncSession, req: CounterQuoteRequest, *, now: dt.datetime | None = None
) -> Quote:
    """The counter's live quote; no side effects. 404 when the trip is gone, 409 with the
    reason when it can't be booked or a code or the discount is refused."""
    now = now or dt.datetime.now(dt.UTC)
    dep, pkg = await _load(db, req.departure_id, lock=False)
    seats = await _seats_left(db, dep.id)
    _unbookable(dep, seats_left=seats, party=len(req.travellers), today=ist_today(now))
    quote, _code = await _price(db, dep, pkg, req, seats_left=seats, now=now, lock=False)
    return quote


def web_request(req: CounterQuoteRequest) -> QuoteRequest:
    """The website's quote request for the same party (tests compare the two quotes)."""
    return QuoteRequest.model_construct(
        departure_id=req.departure_id,
        travellers=req.travellers,
        coupon_code=req.coupon_code,
        email=req.email,
        addons=req.addons,
    )


async def _claim_enquiry(db: AsyncSession, enquiry_id: str) -> Enquiry:
    enquiry = (
        await db.execute(select(Enquiry).where(Enquiry.id == enquiry_id).with_for_update())
    ).scalar_one_or_none()
    if enquiry is None:
        raise ApiError("not_found", NO_ENQUIRY)
    # Marked Won by hand (no booking behind it) can still be converted and linked, and so can
    # one whose booking was cancelled (a payment link that lapsed); a live one can't twice.
    linked = (
        await db.execute(
            select(Booking.ref)
            .where(Booking.enquiry_id == enquiry.id, Booking.status != BookingStatus.CANCELLED)
            .limit(1)
        )
    ).scalar_one_or_none()
    if linked:
        raise ApiError(
            "conflict",
            f"Enquiry {enquiry.ref} was already converted to booking {linked}",
            reason="already_converted",
        )
    return enquiry


def _reference(method: str, reference: str | None) -> str:
    """How the payment reads on the receipt and the desk: "UPI · 4271 9953 0187", "Cash"."""
    words = METHOD_WORDS[method]
    return f"{words} · {reference}" if reference else words


def _discount_texts(quote: Quote) -> tuple[str, str]:
    coupon = (
        f" · coupon {quote.coupon.code} (−{history.money(quote.coupon.off_paise)})"
        if quote.coupon
        else ""
    )
    manual = f" · manual discount −{history.money(quote.manual.off_paise)}" if quote.manual else ""
    return coupon, manual


async def create_counter_booking(
    db: AsyncSession,
    req: CounterBookingRequest,
    *,
    by: str,
    notify: Notify | None,
    now: dt.datetime | None = None,
) -> str:
    """Book the party and apply the payment taken at the counter. Returns the booking's ref.

    Refused, with nothing written, when the date can't be booked, the party doesn't fit, a code
    or the discount is refused, the deposit isn't on offer, or the enquiry was converted."""
    now = now or dt.datetime.now(dt.UTC)
    contact = req.contact
    party = len(req.travellers)
    channel = BookingChannel(req.channel)
    try:
        await _lock_contact(db, contact.email, contact.phone)
        dep, pkg = await _load(db, req.departure_id, lock=True)
        package_id = pkg.id  # read now: a rollback later expires the row
        seats = await _seats_left(db, dep.id)
        _unbookable(dep, seats_left=seats, party=party, today=ist_today(now))
        offer, coupon_code = await _price(
            db, dep, pkg, req.as_quote(), seats_left=seats - party, now=now, lock=True
        )
        wants_deposit = req.settle == "deposit" or (
            req.settle == "link" and req.link_pay == "deposit"
        )
        chosen = offer.deposit if wants_deposit else None
        if wants_deposit and chosen is None:
            raise ApiError("conflict", NO_DEPOSIT, reason="deposit_unavailable")
        if offer.total_paise != req.expected_total_paise:
            raise ApiError(
                "conflict",
                f"The price is now {history.money(offer.total_paise)}, not "
                f"{history.money(req.expected_total_paise)} — check the receipt and confirm again",
                reason="price_changed",
            )
        amount = chosen.amount_paise if chosen else offer.total_paise
        hold_until = now + HOLD
        if req.settle == "link":
            rzp = notify.razorpay if notify else None
            if rzp is None:
                raise ApiError("internal", PAYMENTS_OFF, status=503)
            until = link_until(dep.date, now)
            if until is None:
                raise ApiError("conflict", LINK_TOO_LATE, reason="link_unavailable")
            if rzp.link_max_paise is not None and amount > rzp.link_max_paise:
                raise ApiError(
                    "conflict",
                    "Razorpay's test mode can't create a link over "
                    f"{history.money(rzp.link_max_paise)} — send the deposit link, or take the "
                    "payment now",
                    reason="link_over_cap",
                )
            hold_until = until
        quote = offer.model_copy(update={"deposit": chosen})
        enquiry = await _claim_enquiry(db, req.enquiry_id) if req.enquiry_id else None

        booking: Booking | None = None
        for _attempt in range(REF_ATTEMPTS):
            candidate = Booking(
                ref=make_ref(),
                package_id=pkg.id,
                departure_id=dep.id,
                status=BookingStatus.PENDING,
                hold_expires_at=hold_until,
                contact_name=contact.name,
                contact_phone=contact.phone,
                contact_email=contact.email,
                billing_state=contact.state,
                gstin=contact.gstin,
                company_name=contact.company_name,
                quote=quote.model_dump(mode="json", by_alias=True),
                total_paise=quote.total_paise,
                deposit_paise=chosen.amount_paise if chosen else None,
                balance_due_on=chosen.due_on if chosen else None,
                coupon_code=coupon_code,
                channel=channel,
                created_by_user_id=by,
                enquiry_id=enquiry.id if enquiry else None,
                travellers=[
                    BookingTraveller(
                        name=t.name or (contact.name if i == 0 else f"Traveller {i + 1}"),
                        age=t.age,
                        occupancy=t.occupancy,
                        position=i,
                    )
                    for i, t in enumerate(req.travellers)
                ],
                addons=addon_rows(quote.addons),
            )
            try:
                async with db.begin_nested():  # a ref collision keeps the locks taken above
                    db.add(candidate)
            except IntegrityError as exc:
                if REF_CONSTRAINT in constraint_name(exc):
                    continue
                raise
            booking = candidate
            break
        if booking is None:
            raise RuntimeError("Could not draw a unique booking ref")

        coupon_text, manual_text = _discount_texts(quote)
        addons_text = history.addons(quote.addons)
        deposit_text = (
            f" · a {history.money(chosen.amount_paise)} deposit now, the balance by "
            f"{history.day(chosen.due_on)}"
            if chosen
            else ""
        )
        link_text = (
            f" · payment link, seats held until {ist_moment(hold_until)}"
            if req.settle == "link"
            else ""
        )
        history.record(
            db,
            booking.id,
            "booked.counter",
            actor=BookingActor.OWNER,
            by=by,
            text=f"Booked at the counter · channel {CHANNEL_WORDS[channel]} · "
            f"{history.travellers(party)}{addons_text} · {history.money(booking.total_paise)}"
            f"{coupon_text}{manual_text}{deposit_text}{link_text}",
            customer=f"Booked with Tripsmith · {history.travellers(party)}{addons_text} · "
            f"{history.money(booking.total_paise)}{deposit_text}",
            after={
                "status": BookingStatus.PENDING.value,
                "totalPaise": booking.total_paise,
                "channel": channel.value,
                **({"depositPaise": chosen.amount_paise} if chosen else {}),
            },
        )
        if quote.manual:
            pct = f" ({quote.manual.percent} %)" if quote.manual.percent else ""
            history.record(
                db,
                booking.id,
                "discount.manual",
                actor=BookingActor.OWNER,
                by=by,
                text=f"Manual discount −{history.money(quote.manual.off_paise)}{pct}: "
                f"“{quote.manual.reason}”",
                customer=f"A discount of {history.money(quote.manual.off_paise)}: "
                f"{quote.manual.reason}",
            )
        reverts = (enquiry.id, enquiry.status.value) if enquiry is not None else None
        if enquiry is not None:
            enquiry.status = EnquiryStatus.CONVERTED
            enquiry.follow_up_on = None
            enquiry.lost_reason = None
            db.add(EnquiryNote(enquiry_id=enquiry.id, body=f"Converted to booking {booking.ref}"))
            history.record(
                db,
                booking.id,
                "enquiry.converted",
                actor=BookingActor.OWNER,
                by=by,
                text=f"Converted from enquiry {enquiry.ref} — marked converted and linked",
            )

        capture: Capture | None = None
        if req.settle == "link":
            db.add(
                Payment(
                    booking_id=booking.id,
                    provider=PaymentProvider.RAZORPAY,
                    amount_paise=amount,
                    status=PaymentStatus.CREATED,
                )
            )
        else:
            capture = await _settle_now(db, booking, req, amount=amount, by=by)
        ref = booking.ref
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    if capture is None:
        assert notify is not None and notify.razorpay is not None  # checked above
        await issue_link(
            db,
            ref,
            notify.razorpay,
            amount_paise=amount,
            expires=hold_until,
            callback_url=f"{notify.settings.site_url.rstrip('/')}/pay/{ref}",
            by=by,
            enquiry_reverts=reverts,
        )
        await refresh_quietly(db, {package_id}, after=f"counter link booking {ref}")
        return ref
    await on_new_capture(
        db, ref, capture, package_id=package_id, after=f"counter booking {ref}", notify=notify
    )
    return ref


async def _settle_now(
    db: AsyncSession, booking: Booking, req: CounterBookingRequest, *, amount: int, by: str
) -> Capture:
    """Paid now or deposit now: the offline payment through `settle_capture`, in the caller's
    transaction (it commits)."""
    assert req.method is not None  # the schema requires it unless settling by link
    reference = _reference(req.method, req.reference)
    db.add(
        Payment(
            booking_id=booking.id,
            provider=PaymentProvider.OFFLINE,
            amount_paise=amount,
            status=PaymentStatus.CAPTURED,
            raw={"reference": reference, "method": req.method},
        )
    )
    await db.flush()
    settled = await settle_capture(
        db,
        booking,
        hold_live=True,  # seats counted for this party under the departure lock above
        amount_paise=amount,
        entry=history.PaymentLog(
            "payment.offline",
            BookingActor.OWNER,
            f"Paid at the counter · {history.money(amount)} · {reference}",
            by=by,
        ),
    )
    if settled not in (Settled.CONFIRMED, Settled.DEPOSIT):  # unreachable under the lock
        raise RuntimeError(f"Counter payment on {booking.ref} settled as {settled}")
    return Capture(settled, offline_label(reference), amount, offline=True)


# --- the trip picker ---------------------------------------------------------------------------


async def counter_trips(
    db: AsyncSession, *, link_max_paise: int | None, now: dt.datetime | None = None
) -> CounterTrips:
    now = now or dt.datetime.now(dt.UTC)
    today = ist_today(now)
    packages = (
        (
            await db.execute(
                select(Package)
                .where(Package.status == PackageStatus.LIVE)
                .options(
                    selectinload(Package.destination),
                    selectinload(Package.addons).selectinload(PackageAddon.image),
                    selectinload(Package.cover_image),
                )
                .order_by(Package.name)
            )
        )
        .scalars()
        .all()
    )
    rows = (
        await db.execute(
            select(Departure, departure_availability.c.seats_left)
            .join(
                departure_availability,
                departure_availability.c.departure_id == Departure.id,
            )
            .where(Departure.package_id.in_([p.id for p in packages]), Departure.date >= today)
            .order_by(Departure.date, Departure.id)
        )
    ).all()
    by_package: dict[str, list[CounterDeparture]] = {}
    for dep, left in rows:
        by_package.setdefault(dep.package_id, []).append(
            CounterDeparture(
                id=dep.id,
                date=dep.date,
                seats_total=dep.seats_total,
                seats_left=int(left),
                price_double_paise=dep.price_double_paise,
                on_request=min(
                    dep.price_double_paise, dep.price_triple_paise, dep.price_child_paise
                )
                <= 0,
                link_until=link_until(dep.date, now),
            )
        )
    return CounterTrips(
        link_max_paise=link_max_paise,
        packages=[
            CounterPackage(
                id=p.id,
                name=p.name,
                slug=p.slug,
                destination=p.destination.name,
                cover_url=p.cover_image.url if p.cover_image else None,
                nights=p.nights,
                days=p.days,
                deposit_on=p.deposit_on,
                departures=by_package.get(p.id, []),
                addons=[
                    AddonOut(
                        id=a.id,
                        name=a.name,
                        description=a.description,
                        price_paise=a.price_paise,
                        basis=a.basis,
                        max_nights=a.max_nights,
                        image=ImageOut(
                            url=a.image.url,
                            alt=a.image.alt,
                            width=a.image.width,
                            height=a.image.height,
                        )
                        if a.image
                        else None,
                    )
                    for a in p.addons
                    if a.active
                ],
            )
            for p in packages
        ],
    )


# --- customers ---------------------------------------------------------------------------------


def _matches(name: Any, email: Any, phone: Any, q: str) -> Any:
    """Name as typed, email by its `@` or as typed, a phone by its digits."""
    text = q.strip()
    if PHONE_QUERY_RE.match(text):
        digits = normalise_phone(text) or re.sub(r"\D", "", text)
        if digits:
            return phone.contains(digits)
    pattern = f"%{like_escape(text)}%"
    return or_(name.ilike(pattern), email.ilike(pattern.lower()))


async def search_customers(db: AsyncSession, q: str) -> CustomerSearch:
    """Customers by phone, email or name: everyone who booked (their latest details, trips
    newest first), then anyone who only enquired. Up to eight, by email."""
    if len(q.strip()) < SEARCH_MIN:
        return CustomerSearch(items=[])
    rows = (
        await db.execute(
            select(Booking, Package.name, Departure.date)
            .join(Package, Package.id == Booking.package_id)
            .join(Departure, Departure.id == Booking.departure_id)
            .where(_matches(Booking.contact_name, Booking.contact_email, Booking.contact_phone, q))
            .order_by(Booking.created_at.desc())
            .limit(200)
        )
    ).all()
    found: dict[str, dict[str, Any]] = {}
    for b, pkg_name, departs in rows:
        entry = found.setdefault(
            b.contact_email,
            {
                "name": b.contact_name,
                "email": b.contact_email,
                "phone": b.contact_phone,
                "state": b.billing_state,
                "gstin": b.gstin,
                "company_name": b.company_name,
                "trips": [],
            },
        )
        entry["trips"].append(
            CustomerTrip(ref=b.ref, package_name=pkg_name, departs=departs, status=b.status)
        )
    if len(found) < CUSTOMER_MATCHES:
        enquirers = (
            await db.execute(
                select(Enquiry.name, Enquiry.email, Enquiry.phone)
                .where(_matches(Enquiry.name, Enquiry.email, Enquiry.phone, q))
                .order_by(Enquiry.created_at.desc())
                .limit(50)
            )
        ).all()
        for name, email, phone in enquirers:
            found.setdefault(
                email.lower(),
                {
                    "name": name,
                    "email": email.lower(),
                    "phone": phone,
                    "state": None,
                    "gstin": None,
                    "company_name": None,
                    "trips": [],
                },
            )
    picked = list(found.values())[:CUSTOMER_MATCHES]
    accounts = set(
        (
            await db.execute(
                select(func.lower(User.email)).where(
                    func.lower(User.email).in_([c["email"] for c in picked])
                )
            )
        ).scalars()
    )
    return CustomerSearch(
        items=[
            CustomerMatch(
                **{k: v for k, v in c.items() if k != "trips"},
                has_account=c["email"] in accounts,
                trip_count=len(c["trips"]),
                trips=c["trips"][:TRIPS_SHOWN],
            )
            for c in picked
        ]
    )


# --- details later ------------------------------------------------------------------------------


async def edit_travellers(
    db: AsyncSession, ref: str, payload: EditTravellersInput, *, by: str
) -> None:
    """Names and ages for a booking's travellers, in its order; the rooms stay as booked. A
    child's age stays inside the child rate; an adult's may be left empty."""
    try:
        booking, _live = await lock_booking(db, ref)
        if booking.status not in EDITABLE:
            raise ApiError(
                "conflict", "Travellers can't be changed on this booking", reason="not_editable"
            )
        rows = (
            (
                await db.execute(
                    select(BookingTraveller)
                    .where(BookingTraveller.booking_id == booking.id)
                    .order_by(BookingTraveller.position, BookingTraveller.id)
                    .with_for_update()
                )
            )
            .scalars()
            .all()
        )
        if len(rows) != len(payload.travellers):
            raise ApiError(
                "validation", f"This booking has {len(rows)} travellers — send each of them"
            )
        errors: dict[str, str] = {}
        for i, (row, new) in enumerate(zip(rows, payload.travellers, strict=True)):
            if row.occupancy == Occupancy.CHILD:
                if new.age is None or not CHILD_MIN_AGE <= new.age <= CHILD_MAX_AGE:
                    errors[f"travellers.{i}.age"] = (
                        f"The child rate is for ages {CHILD_MIN_AGE}–{CHILD_MAX_AGE}"
                    )
            elif new.age is not None and new.age < ADULT_MIN_AGE:
                errors[f"travellers.{i}.age"] = f"Adults are {ADULT_MIN_AGE} or older"
        if errors:
            raise ApiError("validation", next(iter(errors.values())), field_errors=errors)
        before = [{"name": r.name, "age": r.age} for r in rows]
        after = [{"name": t.name, "age": t.age} for t in payload.travellers]
        if before == after:
            await db.rollback()
            return
        for row, new in zip(rows, payload.travellers, strict=True):
            row.name, row.age = new.name, new.age
        changed = sum(1 for b, a in zip(before, after, strict=True) if b != a)
        history.record(
            db,
            booking.id,
            "travellers.updated",
            actor=BookingActor.OWNER,
            by=by,
            text=f"Traveller details updated · {history.travellers(changed)} changed",
            customer="Traveller details updated",
            before={"travellers": before},
            after={"travellers": after},
        )
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
