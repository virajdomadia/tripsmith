import type { components } from './api-types';
import { CANCELLATION_SCHEDULE } from './policies';

/** My trips (R18, R19): row states, the three tabs, the countdown, the refund tier that applies
 * today, and the sign-in screen's two calls. */

export type AccountBooking = components['schemas']['AccountBooking'];
export type AccountBookingDetail = components['schemas']['AccountBookingDetail'];
export type AccountCancellation = components['schemas']['AccountCancellation'];
export type OtpSent = components['schemas']['OtpSent'];
export type AccountReview = components['schemas']['AccountReview'];

export type Tone = 'ok' | 'warn' | 'mute' | 'primary';

type Stateful = Pick<AccountBooking, 'status' | 'holdExpiresAt' | 'cancellation'>;

/**
 * What a row says about its booking. A pending booking is either still inside its 10-minute
 * hold (the customer may be paying in another tab) or a checkout that lapsed unpaid — shown, not
 * hidden, so an abandoned attempt never looks like a lost booking. A confirmed booking the
 * customer asked to cancel stays confirmed (and seated) until the owner decides.
 */
export function bookingState(b: Stateful, now: Date = new Date()): { label: string; tone: Tone } {
  switch (b.status) {
    case 'confirmed':
    case 'partially_paid':
      if (b.cancellation === 'requested') return { label: 'Cancellation requested', tone: 'warn' };
      return b.status === 'confirmed'
        ? { label: 'Confirmed', tone: 'ok' }
        : { label: 'Part paid', tone: 'primary' };
    case 'completed':
      return { label: 'Completed', tone: 'mute' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'mute' };
    case 'pending':
      return lapsed(b, now)
        ? { label: 'Not completed', tone: 'mute' }
        : { label: 'Awaiting payment', tone: 'primary' };
  }
}

const lapsed = (b: Pick<AccountBooking, 'holdExpiresAt'>, now: Date) =>
  new Date(b.holdExpiresAt) <= now;

/** Whole days from the business day `today` to `date` (both ISO dates, no time zone games). */
export function daysBetween(today: string, date: string): number {
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
}

/** The IST calendar day of an instant (`bookedAt`, a payment time), as an ISO date. */
export function istDay(instant: string): string {
  return new Date(Date.parse(instant) + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

export function countdown(today: string, departs: string): string {
  const n = daysBetween(today, departs);
  if (n <= 0) return 'Leaves today';
  if (n === 1) return 'Leaves tomorrow';
  return `In ${n} days`;
}

export type Tab = 'upcoming' | 'past' | 'cancelled';
export const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'cancelled', label: 'Cancelled' },
];

/**
 * The B0 mockup's three tabs. Upcoming: paid (or still being paid) and not yet departed.
 * Past: completed, or paid and departed (the daily job marks them completed a day later).
 * Cancelled: cancelled bookings and checkouts that lapsed unpaid.
 */
export function tabOf(b: AccountBooking, today: string, now: Date = new Date()): Tab {
  if (b.status === 'cancelled' || (b.status === 'pending' && lapsed(b, now))) return 'cancelled';
  if (b.status === 'completed' || daysBetween(today, b.departs) < 0) return 'past';
  return 'upcoming';
}

export function groupTrips(
  bookings: AccountBooking[],
  today: string,
  now: Date = new Date(),
): Record<Tab, AccountBooking[]> {
  const out: Record<Tab, AccountBooking[]> = { upcoming: [], past: [], cancelled: [] };
  for (const b of bookings) out[tabOf(b, today, now)].push(b);
  // Upcoming soonest first; the others most recent first.
  out.upcoming.sort((a, b) => a.departs.localeCompare(b.departs));
  out.past.sort((a, b) => b.departs.localeCompare(a.departs));
  return out;
}

/** The schedule row that applies to a cancellation asked `daysOut` days before departure
 * (mirrors `refund_tier` in api/app/business.py). */
export function refundTierIndex(daysOut: number): number {
  if (daysOut >= 30) return 0;
  if (daysOut >= 15) return 1;
  return CANCELLATION_SCHEDULE.length - 1;
}

export const travellersLabel = (n: number) => (n === 1 ? '1 traveller' : `${n} travellers`);

export const voucherHref = (ref: string) =>
  `/account/bookings/${encodeURIComponent(ref)}/voucher.pdf`;

/** The api's error envelope as the sign-in screen and the cancel form need it. */
export type SignInError = { message: string; reason?: string | null; retryAfter?: number };

type Result<T> = { ok: true; data: T } | { ok: false; error: SignInError };

/** The api's envelope message for a schema 400 (api/app/errors.py). */
const GENERIC_400 = 'Request validation failed';

async function postJson<T>(path: string, body: unknown): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: { message: 'Could not reach the server — check your connection' } };
  }
  const json = (await res.json().catch(() => undefined)) as
    | { error?: { message?: string; reason?: string | null; fieldErrors?: Record<string, string> } }
    | undefined;
  if (res.ok) return { ok: true, data: json as T };
  const retry = Number(res.headers.get('retry-after'));
  return {
    ok: false,
    error: {
      // A schema 400's useful words are in its field errors ("Write the reason without special
      // characters"); a handled error ("That code isn't right — 4 tries left") says it on top.
      message:
        (json?.error?.message === GENERIC_400
          ? Object.values(json?.error?.fieldErrors ?? {})[0]
          : undefined) ??
        json?.error?.message ??
        'Something went wrong — try again',
      reason: json?.error?.reason,
      retryAfter: Number.isFinite(retry) && retry > 0 ? retry : undefined,
    },
  };
}

export const requestCode = (email: string) => postJson<OtpSent>('/api/auth/otp/request', { email });

export const verifyCode = (email: string, code: string) =>
  postJson<unknown>('/api/auth/otp/verify', { email, code });

export const askToCancel = (ref: string, reason: string) =>
  postJson<AccountCancellation>(`/api/account/bookings/${encodeURIComponent(ref)}/cancellation`, {
    reason,
  });

export const sendReview = (ref: string, rating: number, text: string) =>
  postJson<AccountReview>(`/api/account/bookings/${encodeURIComponent(ref)}/review`, {
    rating,
    text,
  });

/** The success sheet hands the booking's email to the sign-in screen in this tab only — never
 * in the URL (no PII in URLs, v1.0.1). */
export const SIGN_IN_EMAIL_KEY = 'ts-signin-email';
