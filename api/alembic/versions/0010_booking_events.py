"""P16 — per-booking history (R54).

- `booking_events`: one row per change to a booking — when (shown in IST), who (`booking_actor`:
  owner / customer / webhook / cron / system, plus the user when known), a `kind`, the owner's
  wording, the customer's wording (null = not theirs to see), and before/after values.
- A trigger refuses every UPDATE and DELETE on it: history is append-only. (TRUNCATE and DROP
  stay possible — they are schema-owner operations, and the test harness truncates.)
- The backfill rebuilds entries for every existing booking from its v2 rows — the booking, its
  payments, its cancellation request and its review — marked `source = 'backfill'`. Status
  changes the rows only date by `updated_at` get `approx = true`. v2 kept no email records, so
  none are invented. Bookings that already have entries are skipped.

ADD-only, so it is safe to run against production BEFORE the P16 code merges: the deployed api
never names the table. A booking written between this migration and the P16 deploy gets no
rebuilt entries (the deploy follows within minutes).

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-27 17:00:00
"""

import datetime as dt
import json
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

booking_actor = postgresql.ENUM(
    "owner", "customer", "webhook", "cron", "system", name="booking_actor", create_type=False
)

APPEND_ONLY_FUNCTION = """
CREATE FUNCTION booking_events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'booking_events is append-only: % refused', TG_OP
        USING ERRCODE = 'restrict_violation';
END
$$
"""
APPEND_ONLY_TRIGGER = """
CREATE TRIGGER booking_events_append_only
    BEFORE UPDATE OR DELETE ON booking_events
    FOR EACH ROW EXECUTE FUNCTION booking_events_append_only()
"""


def upgrade() -> None:
    booking_actor.create(op.get_bind(), checkfirst=False)
    op.create_table(
        "booking_events",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("booking_id", sa.Text(), nullable=False),
        sa.Column(
            "at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.clock_timestamp(),
        ),
        sa.Column("actor", booking_actor, nullable=False),
        sa.Column("actor_user_id", sa.Text()),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("customer_text", sa.Text()),
        sa.Column("before", postgresql.JSONB()),
        sa.Column("after", postgresql.JSONB()),
        sa.Column("source", sa.Text(), nullable=False, server_default="live"),
        sa.Column("approx", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "logged_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.clock_timestamp(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_booking_events"),
        sa.ForeignKeyConstraint(
            ["booking_id"], ["bookings.id"], name="fk_booking_events_booking_id_bookings"
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"], ["users.id"], name="fk_booking_events_actor_user_id_users"
        ),
        sa.CheckConstraint("source IN ('live', 'backfill')", name=op.f("ck_booking_events_source")),
    )
    op.create_index("ix_booking_events_booking_id_id", "booking_events", ["booking_id", "id"])
    op.execute(APPEND_ONLY_FUNCTION)  # asyncpg runs one statement per call
    op.execute(APPEND_ONLY_TRIGGER)
    _backfill()


def downgrade() -> None:
    op.execute("DROP TRIGGER booking_events_append_only ON booking_events")
    op.execute("DROP FUNCTION booking_events_append_only()")
    op.drop_index("ix_booking_events_booking_id_id", table_name="booking_events")
    op.drop_table("booking_events")
    booking_actor.drop(op.get_bind(), checkfirst=False)


# --- backfill -----------------------------------------------------------------------------------
# Self-contained on purpose: a migration must not change meaning when app code changes later.

# The rows go in as one JSON parameter, cast in SQL: asyncpg cannot bind a parameter of an enum
# created in the same transaction when it runs through Neon's pooler (it retries the type lookup
# and gives up), so `actor` is never sent as `booking_actor`.
INSERT = sa.text(
    "INSERT INTO booking_events"
    " (booking_id, at, actor, kind, text, customer_text, before, after, source, approx)"
    " SELECT r.booking_id, r.at, r.actor::booking_actor, r.kind, r.text, r.customer_text,"
    " NULLIF(r.before, 'null'::jsonb), NULLIF(r.after, 'null'::jsonb), 'backfill', r.approx"
    " FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(booking_id text, at timestamptz,"
    " actor text, kind text, text text, customer_text text, before jsonb, after jsonb,"
    " approx boolean, ord int)"
    " ORDER BY r.ord"
)

VIA = {"checkout": "Checkout", "sync": "the payment check", "webhook": "Razorpay's webhook"}


def inr(paise: int) -> str:
    """Indian grouping: ₹12,34,567 (services/format.py's `inr`, from paise)."""
    s = str(abs(paise // 100))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = [head[max(i - 2, 0) : i] for i in range(len(head), 0, -2)][::-1]
        s = ",".join(groups) + "," + tail
    return ("-" if paise < 0 else "") + "₹" + s


def travellers(n: int) -> str:
    return f"{n} traveller{'s' if n != 1 else ''}"


def _when(value: object, fallback: dt.datetime) -> dt.datetime:
    if isinstance(value, str):
        try:
            return dt.datetime.fromisoformat(value)
        except ValueError:
            pass
    return fallback


def _via(raw: dict[str, Any] | None) -> str:
    raw = raw or {}
    return "webhook" if "event" in raw else "sync" if "id" in raw else "checkout"


def _entry(
    booking_id: str,
    at: dt.datetime,
    actor: str,
    kind: str,
    text: str,
    customer: str | None = None,
    *,
    approx: bool = False,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "booking_id": booking_id,
        "at": at,
        "actor": actor,
        "kind": kind,
        "text": text,
        "customer_text": customer,
        "before": before,
        "after": after,
        "source": "backfill",
        "approx": approx,
    }


def _booking_entries(b: Any, pays: list[Any], asked: Any, review: Any) -> list[dict[str, Any]]:
    demo = b.ref.startswith("TB-DEMO")
    out: list[dict[str, Any]] = []
    coupon = (b.quote or {}).get("coupon") or {}
    coupon_text = (
        f" · coupon {coupon['code']} (−{inr(int(coupon.get('offPaise') or 0))})"
        if coupon.get("code")
        else ""
    )
    party = travellers(b.party)
    out.append(
        _entry(
            b.id,
            b.created_at,
            "system" if demo else "customer",
            "booked",
            (f"Demo booking seeded · {party} · {inr(b.total_paise)}")
            if demo
            else f"Booked online · {party} · {inr(b.total_paise)}{coupon_text}",
            f"You booked {party} · {inr(b.total_paise)}",
        )
    )
    # The capture that brought the money up to the price is the one that confirmed the booking.
    reached = b.status in ("confirmed", "completed") or b.cancel_reason == "cancellation_approved"
    captured = 0
    for p in pays:
        amount = inr(p.amount_paise)
        raw = p.raw or {}
        info = raw.get("refund")
        refund: dict[str, Any] = info if isinstance(info, dict) else {}
        settled = p.status in ("captured", "refunded")
        confirmed = ""
        if settled:
            before = captured
            captured += p.amount_paise
            if reached and before < b.total_paise <= captured:
                confirmed = " — booking confirmed"
        if p.provider == "offline":
            ref = raw.get("reference")
            out.append(
                _entry(
                    b.id,
                    p.created_at,
                    "system" if demo else "owner",
                    "payment.offline",
                    f"Marked paid offline · {amount}"
                    + (f" · {ref}" if isinstance(ref, str) and ref else "")
                    + confirmed,
                    f"Payment of {amount} received{confirmed}",
                )
            )
        else:
            out.append(
                _entry(
                    b.id,
                    p.created_at,
                    "system",
                    "order.opened",
                    f"Razorpay order {p.razorpay_order_id} opened · {amount}",
                )
            )
            if p.status == "failed":
                out.append(
                    _entry(
                        b.id,
                        p.updated_at,
                        "webhook",
                        "payment.failed",
                        f"Payment {p.razorpay_payment_id} failed",
                        "A payment attempt didn't go through",
                    )
                )
            elif settled:
                via = _via(raw)
                out.append(
                    _entry(
                        b.id,
                        _when(refund.get("capturedAt"), p.updated_at),
                        "webhook" if via == "webhook" else "customer",
                        "payment.captured",
                        f"Payment {p.razorpay_payment_id} captured · {amount} · via {VIA[via]}"
                        + confirmed,
                        f"Payment of {amount} received{confirmed}",
                    )
                )
        if p.status == "refunded":
            back_paise = refund.get("amountPaise")
            back = inr(back_paise if isinstance(back_paise, int) else p.amount_paise)
            note = refund.get("note")
            out.append(
                _entry(
                    b.id,
                    _when(refund.get("at"), p.updated_at),
                    "owner",
                    "refund.recorded",
                    f"Refund of {back} recorded"
                    + (f" · {note}" if isinstance(note, str) and note else ""),
                    f"Refund of {back} made",
                )
            )
    if asked is not None:
        out.append(
            _entry(
                b.id,
                asked.created_at,
                "customer",
                "cancellation.requested",
                f"Customer asked to cancel: “{asked.reason}”",
                f"You asked to cancel: “{asked.reason}”",
            )
        )
        if asked.resolved_at is not None and asked.status == "approved":
            refund_paise = asked.refund_paise or 0
            out.append(
                _entry(
                    b.id,
                    asked.resolved_at,
                    "owner",
                    "cancellation.approved",
                    "Cancellation approved — seats freed · "
                    + (f"refund {inr(refund_paise)} agreed" if refund_paise else "no refund")
                    + f" · “{asked.refund_note}”",
                    "Cancellation approved — "
                    + (
                        f"a refund of {inr(refund_paise)} is on its way"
                        if refund_paise
                        else "no refund under the policy"
                    )
                    + f". “{asked.refund_note}”",
                    after={"status": "cancelled"},
                )
            )
        elif asked.resolved_at is not None:
            out.append(
                _entry(
                    b.id,
                    asked.resolved_at,
                    "owner",
                    "cancellation.rejected",
                    f"Cancellation request rejected — the booking stands · “{asked.refund_note}”",
                    f"Your cancellation request wasn't approved: “{asked.refund_note}”",
                )
            )
    last_capture = max(
        (e["at"] for e in out if e["kind"] == "payment.captured"), default=b.updated_at
    )
    if b.status == "cancelled" and b.cancel_reason == "hold_expired":
        out.append(
            _entry(
                b.id,
                b.updated_at,
                "cron",
                "hold.expired",
                "Cancelled by the daily tidy — the checkout was abandoned",
                "Not paid in time — the held seats were released",
                approx=True,
            )
        )
    elif b.status == "cancelled" and b.cancel_reason == "seats_gone":
        out.append(
            _entry(
                b.id,
                last_capture,
                "system",
                "cancelled.seats_gone",
                "Cancelled — paid after the hold lapsed and the seats had gone · refund needed",
                "Your payment arrived after the hold ended and the seats had gone — the booking "
                "is cancelled and the money is refunded in full",
                approx=True,
            )
        )
    elif b.status == "cancelled" and b.cancel_reason == "owner_released":
        out.append(
            _entry(
                b.id,
                b.updated_at,
                "owner",
                "hold.released",
                "Hold released — cancelled, seats freed",
                approx=True,
            )
        )
    elif b.status == "cancelled" and b.cancel_reason == "payment_failed":
        out.append(
            _entry(
                b.id,
                b.updated_at,
                "system",
                "cancelled",
                "Cancelled — the payment failed",
                "Cancelled — the payment didn't go through",
                approx=True,
            )
        )
    elif b.status == "completed":
        out.append(
            _entry(
                b.id,
                max(b.updated_at, b.created_at),
                "system" if demo else "cron",
                "trip.completed",
                "Departed — marked completed",
                "Trip completed — welcome back",
                approx=True,
            )
        )
    if review is not None:
        out.append(
            _entry(
                b.id,
                review.created_at,
                "system" if demo else "customer",
                "review.sent",
                f"Review sent · ★{review.rating}",
                f"You reviewed the trip · ★{review.rating}",
            )
        )
        if review.moderated_at is not None:
            out.append(
                _entry(
                    b.id,
                    review.moderated_at,
                    "system" if demo else "owner",
                    "review.published" if review.approved else "review.hidden",
                    "Review published on the package page" if review.approved else "Review hidden",
                )
            )
    return sorted(out, key=lambda e: e["at"])


def _backfill() -> None:
    conn = op.get_bind()
    bookings = conn.execute(
        sa.text(
            "SELECT b.id, b.ref, b.status::text AS status, b.cancel_reason::text AS cancel_reason,"
            " b.quote, b.total_paise, b.created_at, b.updated_at,"
            " (SELECT count(*) FROM booking_travellers t WHERE t.booking_id = b.id) AS party"
            " FROM bookings b"
            " WHERE NOT EXISTS (SELECT 1 FROM booking_events e WHERE e.booking_id = b.id)"
            " ORDER BY b.created_at, b.id"
        ).columns(quote=postgresql.JSONB())
    ).all()
    if not bookings:
        return
    pays: dict[str, list[Any]] = {}
    for p in conn.execute(
        sa.text(
            "SELECT booking_id, provider::text AS provider, status::text AS status, amount_paise,"
            " razorpay_order_id, razorpay_payment_id, raw, created_at, updated_at"
            " FROM payments ORDER BY created_at, id"
        ).columns(raw=postgresql.JSONB())
    ).all():
        pays.setdefault(p.booking_id, []).append(p)
    asked = {
        c.booking_id: c
        for c in conn.execute(
            sa.text(
                "SELECT booking_id, reason, status::text AS status, refund_note, refund_paise,"
                " created_at, resolved_at FROM booking_cancellations"
            )
        ).all()
    }
    reviews = {
        r.booking_id: r
        for r in conn.execute(
            sa.text("SELECT booking_id, rating, approved, created_at, moderated_at FROM reviews")
        ).all()
    }
    rows = [
        entry
        for b in bookings
        for entry in _booking_entries(b, pays.get(b.id, []), asked.get(b.id), reviews.get(b.id))
    ]
    for start in range(0, len(rows), 500):
        batch = [
            {**row, "at": row["at"].isoformat(), "ord": start + i}
            for i, row in enumerate(rows[start : start + 500])
        ]
        conn.execute(INSERT, {"rows": json.dumps(batch)})
