"""Traveller details and the pre-trip checklist (R49, P9).

After payment (`confirmed` or `partially_paid`) the lead booker fills in a card per traveller:
ID, date of birth, emergency contact, food, medical notes. The package says which of them are
required (default ID + emergency + food); a partial save is fine and the card says what's left.
The customer's form locks on departure − 3 days (IST); the owner edits from the desk until the
purge (P9b).

Readiness is equal parts: details (complete travellers ÷ travellers), balance paid, and each of
the package's checklist items the customer ticks. P10 adds the trip pack and the calendar.

Privacy: the ID number is encrypted (id_numbers.py) and only its masked form leaves the api. The
history log can't be edited (0010's trigger), so its entries name the fields that changed and
never their values — an ID shows as its type and last four, the masked form. The daily tidy
deletes every details row 30 days after the trip's return day.
"""

import datetime as dt
import re
from collections.abc import Sequence
from typing import Any

from sqlalchemy import ColumnElement, and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.config import Settings
from app.errors import ApiError
from app.models import Booking, BookingTraveller, Departure, Package, TravellerDetail
from app.models.enums import BookingActor, BookingStatus, Occupancy
from app.schemas.bookings import ADULT_MIN_AGE, CHILD_MAX_AGE, CHILD_MIN_AGE
from app.schemas.details import (
    DETAIL_FIELDS,
    ChecklistItem,
    ChecklistItemOut,
    DepartureReadiness,
    DetailField,
    DetailsState,
    ManifestTraveller,
    Readiness,
    ReadinessPart,
    TravellerDetailsBlock,
    TravellerDetailsInput,
    TravellerDetailsOut,
    TravellerDetailsSettings,
    TravellerDetailsSettingsInput,
)
from app.services.booking import history, id_numbers
from app.services.format import inr, long_date

OPEN_STATUSES = (BookingStatus.CONFIRMED, BookingStatus.PARTIALLY_PAID)
# The owner may still correct a finished trip's details for the record, until the purge.
OWNER_STATUSES = (*OPEN_STATUSES, BookingStatus.COMPLETED)
LOCK_DAYS = 3
PURGE_AFTER_DAYS = 30
FIELD_WORDS: dict[DetailField, str] = {
    "id": "ID",
    "dob": "date of birth",
    "emergency": "emergency contact",
    "food": "food",
    "medical": "medical notes",
}
LOCKED = "Details locked 3 days before departure — WhatsApp us to change anything"
NOT_OPEN = "Traveller details open once the booking is paid"


def locks_on(departs: dt.date) -> dt.date:
    return departs - dt.timedelta(days=LOCK_DAYS)


def purge_on(returns: dt.date) -> dt.date:
    return returns + dt.timedelta(days=PURGE_AFTER_DAYS)


def required_of(pkg: Package) -> list[DetailField]:
    have = set(pkg.details_required)
    return [f for f in DETAIL_FIELDS if f in have]


def missing(row: TravellerDetail | None, required: Sequence[DetailField]) -> list[DetailField]:
    def filled(f: DetailField) -> bool:
        if row is None:
            return False
        if f == "id":
            return row.id_type is not None
        if f == "dob":
            return row.dob is not None
        if f == "emergency":
            return bool(row.emergency_name and row.emergency_phone)
        if f == "food":
            return row.food is not None
        return bool(row.medical)

    return [f for f in required if not filled(f)]


def state_of(
    status: BookingStatus, departs: dt.date, returns: dt.date, today: dt.date
) -> DetailsState:
    if status == BookingStatus.PENDING:
        return "not_yet"
    if status not in OPEN_STATUSES or today > returns or today >= purge_on(returns):
        return "closed"
    return "locked" if today >= locks_on(departs) else "open"


def card(t: BookingTraveller, row: TravellerDetail | None, required: Sequence[DetailField]):
    left = missing(row, required)
    out = TravellerDetailsOut(
        traveller_id=t.id,
        name=t.name,
        age=t.age,
        occupancy=t.occupancy,
        missing=left,
        complete=not left,
    )
    if row is not None:
        out.id_type = row.id_type
        out.id_masked = (
            id_numbers.masked(row.id_type, row.id_last4)
            if row.id_type is not None and row.id_last4
            else None
        )
        out.dob = row.dob
        out.emergency_name = row.emergency_name
        out.emergency_relation = row.emergency_relation
        out.emergency_phone = row.emergency_phone
        out.food = row.food
        out.allergies = row.allergies
        out.medical = row.medical
    return out


async def rows_of(db: AsyncSession, booking_id: str) -> dict[str, TravellerDetail]:
    rows = (
        (await db.execute(select(TravellerDetail).where(TravellerDetail.booking_id == booking_id)))
        .scalars()
        .all()
    )
    return {r.traveller_id: r for r in rows}


async def rows_for_departure(db: AsyncSession, departure_id: str) -> dict[str, TravellerDetail]:
    """Every saved details row on one departure, by traveller id (the manifest)."""
    rows = (
        (
            await db.execute(
                select(TravellerDetail)
                .join(Booking, Booking.id == TravellerDetail.booking_id)
                .where(Booking.departure_id == departure_id)
            )
        )
        .scalars()
        .all()
    )
    return {r.traveller_id: r for r in rows}


def _ordered(travellers: Sequence[BookingTraveller]) -> list[BookingTraveller]:
    return sorted(travellers, key=lambda t: (t.position, t.id))


async def details_block(
    db: AsyncSession,
    booking: Booking,
    pkg: Package,
    departs: dt.date,
    returns: dt.date,
    today: dt.date,
) -> TravellerDetailsBlock:
    """The booking page's section. `booking.travellers` must be loaded."""
    required = required_of(pkg)
    purged = today >= purge_on(returns)
    found = {} if purged else await rows_of(db, booking.id)
    cards = [card(t, found.get(t.id), required) for t in _ordered(booking.travellers)]
    return TravellerDetailsBlock(
        state=state_of(booking.status, departs, returns, today),
        locks_on=locks_on(departs),
        required=required,
        travellers=cards,
        complete=sum(1 for c in cards if c.complete),
        purged=purged,
    )


def checklist_of(pkg: Package, booking: Booking) -> list[ChecklistItem]:
    done = set(booking.checklist_done)
    return [
        ChecklistItem(
            key=str(i["key"]),
            label=str(i["label"]),
            note=str(i.get("note") or ""),
            done=i["key"] in done,
        )
        for i in pkg.checklist
    ]


def readiness(
    booking: Booking, block: TravellerDetailsBlock, items: Sequence[ChecklistItem]
) -> Readiness | None:
    """Only while the trip is ahead and paid for (confirmed or part paid)."""
    if booking.status not in OPEN_STATUSES:
        return None
    total = len(block.travellers)
    left = total - block.complete
    parts = [
        ReadinessPart(
            key="details",
            kind="details",
            label="Traveller details",
            note=(
                f"All {total} complete"
                if not left
                else f"{block.complete} of {total} complete · details lock "
                f"{long_date(block.locks_on)}"
            ),
            fraction=block.complete / total if total else 1.0,
            done=not left,
        )
    ]
    paid = booking.status == BookingStatus.CONFIRMED
    owed = max(booking.total_paise - booking.paid_paise, 0)
    parts.append(
        ReadinessPart(
            key="balance",
            kind="balance",
            label="Balance paid",
            note=(
                f"Paid in full · {inr(booking.total_paise // 100)}"
                if paid
                else f"{inr(owed // 100)} due"
                + (f" by {long_date(booking.balance_due_on)}" if booking.balance_due_on else "")
            ),
            fraction=1.0 if paid else 0.0,
            done=paid,
        )
    )
    parts.extend(
        ReadinessPart(
            key=f"item:{i.key}",
            kind="item",
            label=i.label,
            note=i.note,
            fraction=1.0 if i.done else 0.0,
            done=i.done,
        )
        for i in items
    )
    percent = round(sum(p.fraction for p in parts) / len(parts) * 100)
    return Readiness(percent=percent, parts=parts)


def booking_percent(
    booking: Booking, travellers: int, complete: int, checklist: Sequence[dict[str, Any]]
) -> int:
    """The same sum as `readiness`, from counts — the desk and the per-departure figure (P9b)."""
    done = set(booking.checklist_done)
    fractions = [
        complete / travellers if travellers else 1.0,
        1.0 if booking.status == BookingStatus.CONFIRMED else 0.0,
        *(1.0 if i["key"] in done else 0.0 for i in checklist),
    ]
    return round(sum(fractions) / len(fractions) * 100)


# --- in SQL: the desk filter, its column and the per-departure figure (P9b) ---------------------


def _missing_sql(pkg: Any, td: Any) -> ColumnElement[bool]:
    """A traveller (outer-joined to `td`) lacks one of the package's required fields — the SQL
    twin of `missing`."""
    req = pkg.details_required
    return or_(
        and_(req.any("id"), td.id_type.is_(None)),
        and_(req.any("dob"), td.dob.is_(None)),
        and_(req.any("emergency"), or_(td.emergency_name.is_(None), td.emergency_phone.is_(None))),
        and_(req.any("food"), td.food.is_(None)),
        and_(req.any("medical"), func.coalesce(td.medical, "") == ""),
    )


def missing_travellers() -> Any:
    """A booking's travellers still missing a required field (correlated on `bookings`)."""
    pkg, td = aliased(Package), aliased(TravellerDetail)
    return (
        select(func.count())
        .select_from(BookingTraveller)
        .join(pkg, pkg.id == Booking.package_id)
        .outerjoin(td, td.traveller_id == BookingTraveller.id)
        .where(BookingTraveller.booking_id == Booking.id, _missing_sql(pkg, td))
        .correlate(Booking)
        .scalar_subquery()
    )


def details_due(today: dt.date) -> ColumnElement[bool]:
    """The desk's "details missing" flag: paid for, not yet departed, someone's card short.
    The statement must join `Departure`."""
    return and_(
        Booking.status.in_(OPEN_STATUSES), Departure.date >= today, missing_travellers() > 0
    )


async def departure_readiness(db: AsyncSession, departure_id: str) -> DepartureReadiness:
    """R49's readiness % per departure: the mean of its paid bookings' readiness, and how many
    travellers still lack details. The calendar (P11) reuses it."""
    rows = (
        await db.execute(
            select(
                Booking,
                select(func.count())
                .where(BookingTraveller.booking_id == Booking.id)
                .correlate(Booking)
                .scalar_subquery(),
                missing_travellers(),
                Package.checklist,
            )
            .join(Package, Package.id == Booking.package_id)
            .where(Booking.departure_id == departure_id, Booking.status.in_(OPEN_STATUSES))
        )
    ).all()
    if not rows:
        return DepartureReadiness(percent=None, missing_travellers=0, bookings=0)
    percents = [
        booking_percent(b, int(n), int(n) - int(m), checklist) for b, n, m, checklist in rows
    ]
    return DepartureReadiness(
        percent=round(sum(percents) / len(percents)),
        missing_travellers=sum(int(m) for _, _, m, _ in rows),
        bookings=len(rows),
    )


# --- saving -------------------------------------------------------------------------------------


def age_on(dob: dt.date, day: dt.date) -> int:
    return day.year - dob.year - ((day.month, day.day) < (dob.month, dob.day))


def _check_dob(t: BookingTraveller, dob: dt.date, departs: dt.date, today: dt.date) -> str | None:
    if dob > today:
        return "The date of birth can't be in the future"
    age = age_on(dob, departs)
    if age > 120:
        return "Check the year of birth"
    if t.occupancy == Occupancy.CHILD and not CHILD_MIN_AGE <= age <= CHILD_MAX_AGE:
        return (
            f"Booked at the child rate ({CHILD_MIN_AGE}–{CHILD_MAX_AGE} on the trip) — this "
            f"makes them {age}. WhatsApp us if the booking needs to change"
        )
    if t.occupancy != Occupancy.CHILD and age < ADULT_MIN_AGE:
        return (
            f"Booked as an adult ({ADULT_MIN_AGE}+ on the trip) — this makes them {age}. "
            "WhatsApp us if the booking needs to change"
        )
    return None


def _values(row: TravellerDetail | None) -> dict[str, Any]:
    if row is None:  # nothing saved yet: every field empty, so only filled ones count as changed
        return {
            "id": (None, None),
            "dob": None,
            "emergency": (None, None, None),
            "food": (None, None),
            "medical": None,
        }
    return {
        "id": (row.id_type, row.id_number_enc),
        "dob": row.dob,
        "emergency": (row.emergency_name, row.emergency_relation, row.emergency_phone),
        "food": (row.food, row.allergies),
        "medical": row.medical,
    }


def _changed_words(
    before: dict[str, Any], after: dict[str, Any], row: TravellerDetail
) -> list[str]:
    words: list[str] = []
    for f in DETAIL_FIELDS:
        if before.get(f) == after.get(f):
            continue
        if f == "id" and row.id_type is not None and row.id_last4:
            label = id_numbers.ID_LABEL[row.id_type]
            words.append(f"ID ({label} ending {row.id_last4})")
        elif f == "id":
            words.append("ID removed")
        else:
            words.append(FIELD_WORDS[f])
    return words


async def save_details(
    db: AsyncSession,
    settings: Settings,
    ref: str,
    traveller_id: str,
    payload: TravellerDetailsInput,
    *,
    actor: BookingActor,
    by: str | None,
    today: dt.date,
) -> TravellerDetailsOut:
    """One traveller's card. The customer is held to the lock; the owner (P9b) is not, until the
    purge. A save that changes nothing writes no history."""
    try:
        booking = (
            await db.execute(select(Booking).where(Booking.ref == ref).with_for_update())
        ).scalar_one_or_none()
        if booking is None:
            raise ApiError("not_found", "No booking with that reference")
        departs, nights = (
            await db.execute(
                select(Departure.date, Package.nights)
                .join(Package, Package.id == Departure.package_id)
                .where(Departure.id == booking.departure_id)
            )
        ).one()
        returns = departs + dt.timedelta(days=nights)
        state = state_of(booking.status, departs, returns, today)
        owner = actor == BookingActor.OWNER
        if state == "not_yet":
            raise ApiError("conflict", NOT_OPEN, reason="not_paid")
        if state == "closed" and not (
            owner and booking.status in OWNER_STATUSES and today < purge_on(returns)
        ):
            raise ApiError(
                "conflict", "Traveller details can't be changed on this booking", reason="closed"
            )
        if state == "locked" and not owner:
            raise ApiError("conflict", LOCKED, reason="locked")

        t = (
            await db.execute(
                select(BookingTraveller)
                .where(
                    BookingTraveller.id == traveller_id, BookingTraveller.booking_id == booking.id
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if t is None:
            raise ApiError("not_found", "No such traveller on this booking")
        row = await db.get(TravellerDetail, traveller_id, with_for_update=True)

        errors: dict[str, str] = {}
        number: str | None = None
        if payload.id_type is not None:
            if payload.id_number:
                try:
                    number = id_numbers.check(payload.id_type, payload.id_number)
                except ValueError as e:
                    errors["idNumber"] = str(e)
                same = row is not None and row.id_type == payload.id_type and row.id_number_enc
                if number and same and id_numbers.reveal(settings, same) == number:
                    number = None  # the saved number typed again: nothing to re-encrypt
            elif row is None or row.id_type != payload.id_type:
                errors["idNumber"] = "Enter the ID number"
        if payload.dob is not None:
            problem = _check_dob(t, payload.dob, departs, today)
            if problem:
                errors["dob"] = problem
        if (payload.emergency_name is None) != (payload.emergency_phone is None):
            key = "emergencyPhone" if payload.emergency_phone is None else "emergencyName"
            errors[key] = "Give both a name and a phone number for the emergency contact"
        if errors:
            raise ApiError("validation", next(iter(errors.values())), field_errors=errors)

        before = _values(row)
        had = [f for f in DETAIL_FIELDS if f not in missing(row, DETAIL_FIELDS)] if row else []
        old_name = t.name
        if row is None:
            row = TravellerDetail(traveller_id=t.id, booking_id=booking.id)
            db.add(row)
        if payload.id_type is None:
            row.id_type = row.id_number_enc = row.id_last4 = None
        elif number is not None:
            sealed = id_numbers.seal(settings, number)
            row.id_type, row.id_number_enc, row.id_last4 = payload.id_type, sealed.enc, sealed.last4
        row.dob = payload.dob
        row.emergency_name = payload.emergency_name
        row.emergency_relation = payload.emergency_relation if payload.emergency_name else None
        row.emergency_phone = payload.emergency_phone
        row.food = payload.food
        row.allergies = payload.allergies
        row.medical = payload.medical
        row.updated_by = by
        t.name = payload.name
        if t.age is None and payload.dob is not None:
            t.age = age_on(payload.dob, departs)

        words = _changed_words(before, _values(row), row)
        renamed = old_name != t.name
        if words or renamed:
            first = not had
            who = f"{old_name} → {t.name}" if renamed else t.name
            what = " · ".join(words)
            lead = "Added" if first else "Updated"
            text = f"{lead} {who}'s details" + (f" · {what}" if what else "")
            history.record(
                db,
                booking.id,
                "details.saved",
                actor=actor,
                by=by,
                text=text,
                customer=text,
                # Field names only: the log can't be edited, so it never holds the values.
                before={"traveller": old_name, "fields": had},
                after={
                    "traveller": t.name,
                    "fields": [f for f in DETAIL_FIELDS if f not in missing(row, DETAIL_FIELDS)],
                },
            )
        required = (
            await db.execute(
                select(Package.details_required).where(Package.id == booking.package_id)
            )
        ).scalar_one()
        await db.flush()
        out = card(t, row, [f for f in DETAIL_FIELDS if f in set(required)])
        await db.commit()
        return out
    except BaseException:
        await db.rollback()
        raise


async def tick_item(db: AsyncSession, ref: str, key: str, *, done: bool, today: dt.date) -> None:
    """The customer ticks (or unticks) one of the package's checklist items. Open while the
    booking is paid for and the trip hasn't started; no history (it's their own to-do list)."""
    try:
        booking = (
            await db.execute(select(Booking).where(Booking.ref == ref).with_for_update())
        ).scalar_one_or_none()
        if booking is None:
            raise ApiError("not_found", "No booking with that reference")
        checklist, departs = (
            await db.execute(
                select(Package.checklist, Departure.date)
                .join(Departure, Departure.package_id == Package.id)
                .where(Departure.id == booking.departure_id)
            )
        ).one()
        if not any(i.get("key") == key for i in checklist):
            raise ApiError("not_found", "That item isn't on this trip's checklist")
        if booking.status not in OPEN_STATUSES or today > departs:
            raise ApiError("conflict", "This checklist is closed", reason="closed")
        have = [k for k in booking.checklist_done if k != key]
        booking.checklist_done = [*have, key] if done else have
        await db.commit()
    except BaseException:
        await db.rollback()
        raise


# --- the daily tidy -----------------------------------------------------------------------------


async def purge(db: AsyncSession, *, today: dt.date) -> int:
    """Delete every details row whose trip came back 30 or more days ago (R49), with one history
    entry per booking. Returns the bookings cleared."""
    try:
        cutoff = today - dt.timedelta(days=PURGE_AFTER_DAYS)
        due = (
            (
                await db.execute(
                    select(TravellerDetail.booking_id)
                    .join(Booking, Booking.id == TravellerDetail.booking_id)
                    .join(Departure, Departure.id == Booking.departure_id)
                    .join(Package, Package.id == Departure.package_id)
                    .where(Departure.date + Package.nights <= cutoff)
                    .distinct()
                )
            )
            .scalars()
            .all()
        )
        if not due:
            await db.rollback()
            return 0
        await db.execute(delete(TravellerDetail).where(TravellerDetail.booking_id.in_(due)))
        history.record_each(
            db,
            due,
            "details.purged",
            actor=BookingActor.CRON,
            text="Traveller details deleted (30 days after the trip)",
            customer="Traveller details deleted, 30 days after the trip",
        )
        await db.commit()
        return len(due)
    except BaseException:
        await db.rollback()
        raise


# --- a party change keeps what matches (P7b moves) ----------------------------------------------


async def carry_over(db: AsyncSession, booking_id: str) -> dict[str, list[dict[str, Any]]]:
    """Before an owner's party change deletes the travellers (the details go with them by
    cascade): each one's saved details, by lower-cased name, to `reattach` to the new rows."""
    rows = (
        await db.execute(
            select(BookingTraveller.name, TravellerDetail)
            .join(TravellerDetail, TravellerDetail.traveller_id == BookingTraveller.id)
            .where(BookingTraveller.booking_id == booking_id)
        )
    ).all()
    keep = (
        "id_type id_number_enc id_last4 dob emergency_name emergency_relation emergency_phone "
        "food allergies medical updated_by"
    ).split()
    kept: dict[str, list[dict[str, Any]]] = {}
    for name, d in rows:  # a list per name: two travellers may share one
        kept.setdefault(name.strip().lower(), []).append({k: getattr(d, k) for k in keep})
    return kept


def reattach(
    db: AsyncSession,
    booking_id: str,
    kept: dict[str, list[dict[str, Any]]],
    new: Sequence[BookingTraveller],
) -> None:
    """The kept details onto the new travellers with the same name (flushed rows, ids set)."""
    for t in new:
        same = kept.get(t.name.strip().lower())
        values = same.pop(0) if same else None
        if values is not None:
            db.add(TravellerDetail(traveller_id=t.id, booking_id=booking_id, **values))


# --- package settings (P9b, Package editor B) ---------------------------------------------------


def details_settings(pkg: Package) -> TravellerDetailsSettings:
    return TravellerDetailsSettings(
        required=required_of(pkg),
        checklist=[
            ChecklistItemOut(
                key=str(i["key"]), label=str(i["label"]), note=str(i.get("note") or "")
            )
            for i in pkg.checklist or []
        ],
    )


def _new_key(label: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")[:24] or "item"
    key, n = base, 2
    while key in taken:
        key, n = f"{base}-{n}", n + 1
    return key


def apply_details_settings(pkg: Package, settings: TravellerDetailsSettingsInput) -> None:
    """Required fields in their canonical order; checklist keys kept when sent (so the
    customers' ticks survive a rename), made from the label when new."""
    want = set(settings.required)
    pkg.details_required = [f for f in DETAIL_FIELDS if f in want]
    taken = {i.key for i in settings.checklist if i.key}
    items: list[dict[str, Any]] = []
    for i in settings.checklist:
        key = i.key or _new_key(i.label, taken)
        taken.add(key)
        if any(x["key"] == key for x in items):
            raise ApiError("validation", "Two checklist items share a key")
        items.append({"key": key, "label": i.label, "note": i.note})
    pkg.checklist = items


# --- the owner's views (P9b) --------------------------------------------------------------------


def manifest_traveller(
    settings: Settings,
    t: BookingTraveller,
    row: TravellerDetail | None,
    required: Sequence[DetailField],
) -> ManifestTraveller:
    """Every field, the ID number decrypted — the printable manifest only."""
    out = ManifestTraveller(
        traveller_id=t.id,
        name=t.name,
        age=t.age,
        occupancy=t.occupancy,
        missing=missing(row, required),
    )
    if row is not None:
        out.id_type = row.id_type
        if row.id_type is not None and row.id_number_enc:
            number = id_numbers.reveal(settings, row.id_number_enc)
            out.id_number = id_numbers.spaced(row.id_type, number) if number else None
        out.dob = row.dob
        out.emergency_name = row.emergency_name
        out.emergency_relation = row.emergency_relation
        out.emergency_phone = row.emergency_phone
        out.food = row.food
        out.allergies = row.allergies
        out.medical = row.medical
    return out


def owed(block: TravellerDetailsBlock) -> list[tuple[str, list[DetailField]]]:
    return [(c.name, c.missing) for c in block.travellers if c.missing]
