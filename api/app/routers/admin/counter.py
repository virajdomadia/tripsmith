"""`/admin/counter/*` and `/admin/customers` (R56, P18): the owner books for a customer.

The quote is the website's price plus an optional manual discount; booking settles in the same
call — the whole total or the deposit, taken by cash, UPI or bank — through the one capture
function, so the receipt, voucher and emails follow as for any web booking.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.cache import NO_STORE
from app.infra.db import get_session
from app.models import User
from app.schemas.admin_bookings import AdminBooking
from app.schemas.bookings import Quote
from app.schemas.counter import (
    CounterBookingRequest,
    CounterQuoteRequest,
    CounterTrips,
    CustomerSearch,
)
from app.services.auth.deps import require_owner
from app.services.booking import counter, desk
from app.services.booking.after_capture import Notify

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_owner)])

Db = Annotated[AsyncSession, Depends(get_session)]
Owner = Annotated[User, Depends(require_owner)]


@router.get("/counter/trips", operation_id="getCounterTrips", response_model_by_alias=True)
async def trips_route(response: Response, db: Db) -> CounterTrips:
    """Every live package with its departures from today (IST) on, seats left and add-ons."""
    response.headers.update(NO_STORE)
    return await counter.counter_trips(db)


@router.post("/counter/quote", operation_id="quoteCounterBooking", response_model_by_alias=True)
async def quote_route(payload: CounterQuoteRequest, response: Response, db: Db) -> Quote:
    """The website's quote for the party, plus the manual discount. 409 with the reason when
    the date can't be booked, the party doesn't fit, or a code or the discount is refused."""
    response.headers.update(NO_STORE)
    return await counter.counter_quote(db, payload)


@router.post(
    "/counter/bookings",
    operation_id="createCounterBooking",
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=True,
)
async def create_route(
    payload: CounterBookingRequest,
    request: Request,
    response: Response,
    db: Db,
    owner: Owner,
) -> AdminBooking:
    """Book and settle: `paid` confirms at once, `deposit` leaves the balance due as on the
    website. 409 `deposit_unavailable`, `already_converted`, or the quote's reasons."""
    response.headers.update(NO_STORE)
    ref = await counter.create_counter_booking(
        db, payload, by=owner.id, notify=Notify.of(request.app.state)
    )
    return await desk.get_booking(db, ref)


@router.get("/customers", operation_id="searchCustomers", response_model_by_alias=True)
async def customers_route(
    response: Response, db: Db, q: Annotated[str, Query(max_length=80)] = ""
) -> CustomerSearch:
    """Customers by phone, email or name (2 characters or more), with their past trips."""
    response.headers.update(NO_STORE)
    return await counter.search_customers(db, q)
