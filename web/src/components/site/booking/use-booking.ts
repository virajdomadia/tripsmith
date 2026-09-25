'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorFromResponse, type ApiRequestError } from '@/lib/api-errors';
import {
  type BookingOrder,
  type Contact,
  type Departure,
  formErrors,
  holdSecondsLeft,
  istToday,
  orderBody,
  partySize,
  type PaymentResult,
  type Quote,
  quoteTravellers,
  type Rooms,
  slotsFor,
  type TravellerInput,
  unbookableReason,
} from '@/lib/booking';
import { formatDate } from '@/lib/format';
import { type CheckoutSuccess, loadCheckout, openCheckout } from '@/lib/razorpay-checkout';

export type BookingPackage = {
  slug: string;
  name: string;
  duration: string;
  destination: string;
  cover: { url: string; alt: string } | null;
  departures: Departure[];
};

/**
 * Where Pay has got to. `choose` is the form; everything after it is one attempt at paying.
 * `dismissed` keeps its order: pressing Pay again reopens Checkout on the same order while the
 * hold lasts, rather than starting (and rate-limiting) a new booking for the same seats.
 */
export type Phase =
  | { kind: 'choose' }
  | { kind: 'starting' }
  | { kind: 'opening'; order: BookingOrder }
  | { kind: 'paying'; order: BookingOrder }
  | { kind: 'checking'; order: BookingOrder }
  | { kind: 'dismissed'; order: BookingOrder; failure?: string }
  | { kind: 'confirming'; order: BookingOrder; payment: CheckoutSuccess }
  | { kind: 'unconfirmed'; order: BookingOrder; payment: CheckoutSuccess }
  | { kind: 'done'; order: BookingOrder; result: PaymentResult };

type QuoteState =
  | { status: 'idle' }
  | { status: 'loading'; last?: Quote }
  | { status: 'ok'; quote: Quote }
  | { status: 'error'; message: string };

type Availability = { status: 'stale' | 'loading' | 'live' | 'error'; at?: number };

const json = { 'Content-Type': 'application/json' };
/** A hold with less than this left is not worth reopening Checkout on. */
const REUSE_MIN_SECONDS = 45;

export const MESSAGES = {
  rate_limited:
    'Too many booking attempts from this connection. Try again in a few minutes, or WhatsApp us.',
  off: 'Online booking is switched off right now. Send an enquiry or WhatsApp us, and we’ll hold your seats by hand.',
  provider:
    'The payment service didn’t answer, so nothing was held or charged. Try again in a minute, or WhatsApp us.',
  network: 'We couldn’t reach Tripsmith. Check your connection and try again.',
  checkout:
    'The payment window didn’t load. Check your connection (or an ad blocker) and press Pay again.',
  gone: 'This trip is no longer on sale. WhatsApp us and we’ll find you something close.',
} as const;

async function readError(res: Response): Promise<ApiRequestError> {
  return errorFromResponse(res.status, res.statusText, await res.json().catch(() => undefined));
}

export function useBooking(pkg: BookingPackage, open: boolean) {
  const [liveDepartures, setDepartures] = useState<Departure[]>(pkg.departures);
  const [availability, setAvailability] = useState<Availability>({ status: 'stale' });
  const [departureId, setDepartureId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Rooms>({ double: 1, triple: 0, single: 0, children: 0 });
  const [travellers, setTravellers] = useState<Record<string, TravellerInput>>({});
  const [contact, setContact] = useState<Contact>({ name: '', phone: '', email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<QuoteState>({ status: 'idle' });
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' });
  const [banner, setBanner] = useState<string | null>(null);
  /** The departure that sold out under the visitor, named in the "no longer available" box. */
  const [gone, setGone] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [today, setToday] = useState(() => istToday());

  /**
   * The visitor's own live hold. The api's `seatsLeft` already subtracts it, so without adding
   * it back their own date would look short (or sold out) after they close Checkout — and they
   * could not press Pay again on seats they are holding. The quote is the order's own. Only a
   * read taken after the hold (`since`) has it subtracted; an older one is left as it is.
   */
  const [held, setHeld] = useState<{
    departureId: string;
    seats: number;
    expiresAt: string;
    since: number;
    quoteKey: string;
    quote: Quote;
  } | null>(null);
  const departures = useMemo(
    () =>
      held && holdSecondsLeft(held.expiresAt) > 0 && (availability.at ?? 0) > held.since
        ? liveDepartures.map((d) =>
            d.id === held.departureId ? { ...d, seatsLeft: d.seatsLeft + held.seats } : d,
          )
        : liveDepartures,
    [liveDepartures, held, availability.at],
  );
  const slots = useMemo(() => slotsFor(rooms), [rooms]);
  const party = partySize(rooms);
  const departure = departures.find((d) => d.id === departureId) ?? null;
  const reason = departure ? unbookableReason(departure, party, today) : null;
  /** The last order and the exact body it was made from: reused only for the same booking. */
  const lastOrder = useRef<{ key: string; order: BookingOrder } | null>(null);

  /* ---- live availability: every time the sheet opens, uncached (?fresh=1, docs/04 v2 §3) ---- */
  const refresh = useCallback(async () => {
    setAvailability((a) => ({ ...a, status: 'loading' }));
    setToday(istToday());
    try {
      const res = await fetch(`/api/packages/${encodeURIComponent(pkg.slug)}/departures?fresh=1`, {
        cache: 'no-store',
      });
      if (res.status === 404) {
        setDepartures([]);
        setBanner(MESSAGES.gone);
        setAvailability({ status: 'error' });
        return;
      }
      if (!res.ok) throw await readError(res);
      const body = (await res.json()) as { items: Departure[] };
      setDepartures(body.items);
      setAvailability({ status: 'live', at: Date.now() });
    } catch {
      setAvailability({ status: 'error' });
    }
  }, [pkg.slug]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // Start on the first date this party can book. After a date sold out under the visitor
  // (`gone`), nothing is picked for them: R14 sends them back to choosing.
  useEffect(() => {
    if (departureId || gone) return;
    const first = departures.find((d) => !unbookableReason(d, party, today));
    if (first) setDepartureId(first.id);
  }, [departures, departureId, gone, party, today]);

  // A chosen date that is no longer on sale at all (a fresh read said so) is unchosen; one that
  // is merely `short` stays, with the warning — the visitor may rather travel fewer.
  const chosenDate = departure?.date;
  useEffect(() => {
    if (!reason || reason === 'short' || !chosenDate) return;
    setGone(formatDate(chosenDate));
    setDepartureId(null);
  }, [reason, chosenDate]);

  /* ---- the quote: re-asked on every date or party change, never computed here ---- */
  useEffect(() => {
    if (!departureId || reason) {
      setQuote({ status: 'idle' });
      return;
    }
    const quoteKey = JSON.stringify({ departureId, travellers: quoteTravellers(rooms) });
    if (held?.quoteKey === quoteKey && holdSecondsLeft(held.expiresAt) > 0) {
      // Asking again would count the visitor's own hold against them: use the order's quote.
      setQuote({ status: 'ok', quote: held.quote });
      return;
    }
    const ctrl = new AbortController();
    setQuote((q) => ({ status: 'loading', last: q.status === 'ok' ? q.quote : undefined }));
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/bookings/quote', {
          method: 'POST',
          headers: json,
          body: JSON.stringify({ departureId, travellers: quoteTravellers(rooms) }),
          signal: ctrl.signal,
        });
        if (res.ok) {
          setQuote({ status: 'ok', quote: (await res.json()) as Quote });
          return;
        }
        const err = await readError(res);
        if (res.status === 409 || res.status === 404) {
          // Sold (or pulled) since the list loaded: re-read the list; the picker explains.
          setQuote({ status: 'idle' });
          void refresh();
          return;
        }
        setQuote({ status: 'error', message: err.body.message });
      } catch (e) {
        if ((e as Error).name !== 'AbortError')
          setQuote({ status: 'error', message: MESSAGES.network });
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [departureId, rooms, reason, refresh, held]);

  /* ---- the form ---- */
  const setTraveller = (key: string, patch: Partial<TravellerInput>) => {
    setTravellers((t) => ({ ...t, [key]: { ...(t[key] ?? { name: '', age: '' }), ...patch } }));
    setErrors({});
  };
  const updateContact = (patch: Partial<Contact>) => {
    setContact((c) => ({ ...c, ...patch }));
    setErrors({});
  };
  const chooseDeparture = (id: string) => {
    setDepartureId(id);
    setGone(null);
  };

  const busy =
    phase.kind === 'starting' ||
    phase.kind === 'opening' ||
    phase.kind === 'paying' ||
    phase.kind === 'checking';
  const canPay =
    !!departure &&
    !reason &&
    quote.status === 'ok' &&
    (phase.kind === 'choose' || phase.kind === 'dismissed');

  /* ---- Pay ---- */
  const unbookable = (message: string, date?: string) => {
    lastOrder.current = null;
    setHeld(null);
    setGone(date ? formatDate(date) : null);
    setBanner(date ? null : message);
    setDepartureId(null);
    setPhase({ kind: 'choose' });
    void refresh();
  };

  async function startOrder(): Promise<BookingOrder | null> {
    const body = orderBody(departureId!, slots, travellers, contact);
    const key = JSON.stringify(body);
    const prev = lastOrder.current;
    if (prev?.key === key && holdSecondsLeft(prev.order.holdExpiresAt) > REUSE_MIN_SECONDS)
      return prev.order;

    setPhase({ kind: 'starting' });
    let res: Response;
    try {
      res = await fetch('/api/bookings', { method: 'POST', headers: json, body: key });
    } catch {
      setBanner(MESSAGES.network);
      setPhase({ kind: 'choose' });
      return null;
    }
    if (res.status === 201) {
      const order = (await res.json()) as BookingOrder;
      lastOrder.current = { key, order };
      setHeld({
        departureId: body.departureId,
        seats: body.travellers.length,
        expiresAt: order.holdExpiresAt,
        since: Date.now(),
        quoteKey: JSON.stringify({
          departureId: body.departureId,
          travellers: body.travellers.map((t) => ({ occupancy: t.occupancy })),
        }),
        quote: order.quote,
      });
      return order;
    }
    const err = await readError(res);
    if (err.body.code === 'validation' && err.body.fieldErrors) {
      setErrors(err.body.fieldErrors);
      setFocusRequest((n) => n + 1);
      setBanner(
        Object.keys(err.body.fieldErrors).some(
          (k) => k.startsWith('travellers.') || k.startsWith('contact.'),
        )
          ? null
          : (Object.values(err.body.fieldErrors)[0] ?? err.body.message),
      );
    } else if (res.status === 409) unbookable(err.body.message, departure?.date);
    else if (res.status === 404) unbookable(MESSAGES.gone);
    else if (res.status === 429) setBanner(MESSAGES.rate_limited);
    else if (res.status === 503) setBanner(MESSAGES.off);
    else setBanner(MESSAGES.provider);
    if (res.status !== 409 && res.status !== 404) setPhase({ kind: 'choose' });
    return null;
  }

  async function confirm(order: BookingOrder, payment: CheckoutSuccess) {
    setPhase({ kind: 'confirming', order, payment });
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(order.bookingRef)}/confirm`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({
          razorpayOrderId: payment.razorpay_order_id,
          razorpayPaymentId: payment.razorpay_payment_id,
          razorpaySignature: payment.razorpay_signature,
        }),
      });
      if (!res.ok) throw await readError(res);
      const result = (await res.json()) as PaymentResult;
      lastOrder.current = null;
      setHeld(null);
      setPhase({ kind: 'done', order, result });
    } catch {
      setPhase({ kind: 'unconfirmed', order, payment });
    }
  }

  /** The Checkout attempt in progress; `closed` once any path (success, dismiss, watchdog) took it. */
  const attempt = useRef<{ order: BookingOrder; closed: boolean } | null>(null);

  /**
   * Checkout closed without a success callback — dismissed, or gone quietly (a popup that lost
   * its opener, a tab put to sleep). Before offering Pay again, ask the api whether Razorpay
   * took the money anyway (`syncPayment`); B6's webhook is the backstop if even this fails.
   */
  async function afterClose(order: BookingOrder, failure?: string) {
    setPhase({ kind: 'checking', order });
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(order.bookingRef)}/sync`, {
        method: 'POST',
      });
      if (res.ok) {
        const result = (await res.json()) as PaymentResult;
        if (result.status !== 'pending') {
          lastOrder.current = null;
          setHeld(null);
          setPhase({ kind: 'done', order, result });
          return;
        }
      }
    } catch {
      // Unknown: offer Pay again; a second payment on a paid booking is flagged for refund.
    }
    setPhase({ kind: 'dismissed', order, failure });
  }

  // Watchdog: Razorpay removes (or hides) its container when Checkout closes. If that happens
  // with no callback at all, settle the attempt the same way a dismiss would.
  useEffect(() => {
    if (phase.kind !== 'paying') return;
    let misses = 0;
    const timer = setInterval(() => {
      const el = document.querySelector<HTMLElement>('.razorpay-container');
      const visible = !!el && el.isConnected && getComputedStyle(el).display !== 'none';
      misses = visible ? 0 : misses + 1;
      const current = attempt.current;
      if (misses >= 2 && current && !current.closed) {
        current.closed = true;
        void afterClose(current.order);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [phase.kind]);

  async function pay() {
    const found = formErrors(slots, travellers, contact);
    if (Object.keys(found).length) {
      setErrors(found);
      setFocusRequest((n) => n + 1);
      return;
    }
    if (!canPay) return;
    setBanner(null);
    setGone(null);
    const order = await startOrder();
    if (!order) return;

    setPhase({ kind: 'opening', order });
    try {
      await loadCheckout();
    } catch {
      setBanner(MESSAGES.checkout);
      setPhase({ kind: 'dismissed', order });
      return;
    }
    let failure: string | undefined;
    attempt.current = { order, closed: false };
    try {
      openCheckout(
        {
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amountPaise,
          currency: 'INR',
          name: 'Tripsmith',
          description: `${pkg.name} · ${formatDate(order.quote.date)}`,
          timeout: holdSecondsLeft(order.holdExpiresAt),
          prefill: {
            name: contact.name.trim(),
            email: contact.email.trim(),
            contact: contact.phone.trim(),
          },
          notes: { booking_ref: order.bookingRef },
          theme: { color: '#1B4FD8' },
          retry: { enabled: true },
          modal: {
            confirm_close: true,
            escape: true,
            ondismiss: () => {
              if (attempt.current?.closed) return;
              if (attempt.current) attempt.current.closed = true;
              void afterClose(order, failure);
            },
          },
          handler: (payment) => {
            if (attempt.current) attempt.current.closed = true;
            void confirm(order, payment);
          },
        },
        (description) => {
          failure = description ?? 'The payment didn’t go through.';
        },
      );
      setPhase((p) => (p.kind === 'opening' ? { kind: 'paying', order } : p));
    } catch {
      setBanner(MESSAGES.checkout);
      setPhase({ kind: 'dismissed', order });
    }
  }

  const retryConfirm = () => {
    if (phase.kind === 'unconfirmed') void confirm(phase.order, phase.payment);
  };

  /** Back to the form after a finished (or refunded) booking: a fresh start, same people. */
  const startOver = () => {
    lastOrder.current = null;
    setHeld(null);
    setPhase({ kind: 'choose' });
    setBanner(null);
    void refresh();
  };

  return {
    departures,
    availability,
    today,
    departure,
    departureId,
    reason,
    chooseDeparture,
    rooms,
    setRooms,
    party,
    slots,
    travellers,
    setTraveller,
    contact,
    updateContact,
    errors,
    focusRequest,
    quote,
    phase,
    busy,
    canPay,
    banner,
    gone,
    pay,
    retryConfirm,
    startOver,
    refresh,
  };
}

export type BookingFlow = ReturnType<typeof useBooking>;
