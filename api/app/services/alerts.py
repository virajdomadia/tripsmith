"""Notify me when new dates are added (v3 C3, R30; 04 v3 §7; 06 C6).

A visitor leaves an email for a package with no upcoming date, or for a destination where nothing
is open. There is no schedule (03 decision 4): when the owner saves new departures in admin — a
date added from the calendar, new rows in the package editor, or a package with dates going live
— every open alert for that package or its destination gets **one** email, and closes.

Claiming is a guarded `UPDATE … WHERE sent_at IS NULL RETURNING`, committed before any email
goes, so two saves racing each other never email one alert twice. A send that fails reopens its
alert (the next new date tries again); nothing here raises into the owner's save.

Demo mode: the email is sent because of something the *owner* did, so while PUBLIC_DEMO_OWNER is
on it goes to the owner's inbox as `[Test → …]` like every other owner-triggered customer email
(`services/email/bookings.deliver`, V2 SA-1).
"""

import asyncio
import datetime as dt
import logging
from collections.abc import Collection
from dataclasses import dataclass

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.business import BUSINESS
from app.errors import ApiError
from app.infra.email import EmailMessage
from app.models import Departure, DepartureAlert, Destination, Package
from app.models.enums import PackageStatus
from app.schemas.alerts import AlertSubscribe, AlertSubscribed, AlertTarget
from app.services.analytics import ist_today
from app.services.booking.after_capture import Notify
from app.services.email.bookings import _message, deliver
from app.services.format import inr, long_date

log = logging.getLogger(__name__)

SEND_AT_ONCE = 5  # parallel sends: a burst of alerts stays well inside the save's 30 s
DATES_SHOWN = 4
TRIP_GONE = "That trip is no longer available"
PLACE_GONE = "We don't go there any more"


# --- subscribe ------------------------------------------------------------------------------------


async def subscribe(db: AsyncSession, payload: AlertSubscribe) -> AlertSubscribed:
    """Insert, or reuse the open alert this address already has for the target. No email now."""
    if payload.package_slug:
        row = (
            await db.execute(
                select(Package.id, Package.name).where(
                    Package.slug == payload.package_slug, Package.status == PackageStatus.LIVE
                )
            )
        ).one_or_none()
        if row is None:
            raise ApiError("not_found", TRIP_GONE)
        target, slug = AlertTarget.PACKAGE, payload.package_slug
        alert = DepartureAlert(email=payload.email, package_id=row.id)
        match = DepartureAlert.package_id == row.id
    else:
        row = (
            await db.execute(
                select(Destination.id, Destination.name).where(
                    Destination.slug == payload.destination_slug
                )
            )
        ).one_or_none()
        if row is None:
            raise ApiError("not_found", PLACE_GONE)
        target, slug = AlertTarget.DESTINATION, str(payload.destination_slug)
        alert = DepartureAlert(email=payload.email, destination_id=row.id)
        match = DepartureAlert.destination_id == row.id
    existing = (
        await db.execute(
            select(DepartureAlert.id).where(
                DepartureAlert.email == payload.email, match, DepartureAlert.sent_at.is_(None)
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        try:
            async with db.begin_nested():
                db.add(alert)
        except IntegrityError:
            pass  # a double-tap inserted it a moment ago: the open alert is what they asked for
        await db.commit()
    return AlertSubscribed(target=target, slug=slug, name=row.name)


# --- send on new dates ----------------------------------------------------------------------------


async def upcoming_ids(db: AsyncSession, package_id: str) -> set[str]:
    """The package's departures from today on — what an admin save is compared against."""
    rows = await db.execute(
        select(Departure.id).where(
            Departure.package_id == package_id, Departure.date >= ist_today()
        )
    )
    return set(rows.scalars())


@dataclass(frozen=True)
class AlertFacts:
    alert_id: str
    email: str
    for_package: bool
    package_name: str
    package_slug: str
    destination_name: str
    dates: list[tuple[dt.date, int]]  # (day, per-person twin price in paise), soonest first


def render(f: AlertFacts, site_url: str) -> EmailMessage:
    site = site_url.rstrip("/")
    watched = f.package_name if f.for_package else f.destination_name
    subject = (
        f"New dates for {f.package_name}: {long_date(f.dates[0][0])}"
        if f.for_package
        else f"New {f.destination_name} dates: {f.package_name}"
    )
    dates = [
        (long_date(day), f"from {inr(paise // 100)} per person" if paise else "price on request")
        for day, paise in f.dates[:DATES_SHOWN]
    ]
    vars = {
        "f": f,
        "business": BUSINESS,
        "site_url": site,
        "watched": watched,
        "dates": dates,
        "more": max(0, len(f.dates) - DATES_SHOWN),
        "url": f"{site}/packages/{f.package_slug}#dates",
    }
    return _message(f.email, subject, "departure_alert", vars)


async def _claim(
    db: AsyncSession, package_id: str
) -> tuple[list[tuple[str, str, bool]], Package] | None:
    pkg = (
        await db.execute(
            select(Package)
            .where(Package.id == package_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if pkg is None or pkg.status != PackageStatus.LIVE:
        await db.rollback()
        return None
    claimed = (
        await db.execute(
            update(DepartureAlert)
            .where(
                DepartureAlert.sent_at.is_(None),
                or_(
                    DepartureAlert.package_id == pkg.id,
                    DepartureAlert.destination_id == pkg.destination_id,
                ),
            )
            .values(sent_at=dt.datetime.now(dt.UTC))
            .returning(DepartureAlert.id, DepartureAlert.email, DepartureAlert.package_id)
        )
    ).all()
    return [(i, email, pid is not None) for i, email, pid in claimed], pkg


async def send_for_new_dates(
    db: AsyncSession, package_id: str, new_ids: Collection[str], notify: Notify
) -> int:
    """Email every open alert for the package or its destination once; returns how many went.
    Nothing to do unless the save added an upcoming date to a live package. Never raises."""
    if not new_ids:
        return 0
    try:
        claimed = await _claim(db, package_id)
        if not claimed or not claimed[0]:
            await db.rollback()
            return 0
        alerts, pkg = claimed
        destination = await db.get(Destination, pkg.destination_id)
        rows = await db.execute(
            select(Departure.date, Departure.price_double_paise)
            .where(Departure.id.in_(list(new_ids)), Departure.date >= ist_today())
            .order_by(Departure.date)
        )
        dates = [(day, price) for day, price in rows.all()]
        facts_base = (pkg.name, pkg.slug, destination.name if destination else "")
        await db.commit()  # the claim stands before anything is sent
    except Exception:
        await db.rollback()
        log.exception("Departure alerts for package %s could not be claimed", package_id)
        return 0
    if not dates:  # the new rows were already in the past: nothing worth saying; reopen
        await _reopen(db, [a for a, _, _ in alerts])
        return 0

    gate = asyncio.Semaphore(SEND_AT_ONCE)

    async def one(alert_id: str, email: str, for_package: bool) -> bool:
        facts = AlertFacts(alert_id, email, for_package, *facts_base, dates=dates)
        async with gate:
            lines = await deliver(
                notify.sender,
                notify.settings,
                [("customer", render(facts, notify.settings.site_url))],
                ref=f"alert {alert_id}",
                what="departure alert",
            )
        return not any(line.outcome == "failed" for line in lines)

    results = await asyncio.gather(*(one(*a) for a in alerts), return_exceptions=True)
    failed = [a[0] for a, ok in zip(alerts, results, strict=True) if ok is not True]
    if failed:
        await _reopen(db, failed)
    return len(alerts) - len(failed)


async def _reopen(db: AsyncSession, ids: list[str]) -> None:
    try:
        await db.execute(
            update(DepartureAlert).where(DepartureAlert.id.in_(ids)).values(sent_at=None)
        )
        await db.commit()
    except Exception:  # a second open alert for the same target appeared meanwhile: keep that one
        await db.rollback()
        log.exception("Could not reopen %d departure alerts", len(ids))
