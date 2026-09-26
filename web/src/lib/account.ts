import type { components } from './api-types';

/** My trips (R18, B8): the list's row labels and the sign-in screen's two calls. */

export type AccountBooking = components['schemas']['AccountBooking'];
export type OtpSent = components['schemas']['OtpSent'];

export type Tone = 'ok' | 'warn' | 'mute' | 'primary';

/**
 * What a row says about its booking. A pending booking is either still inside its 10-minute
 * hold (the customer may be paying in another tab) or a checkout that lapsed unpaid — shown, not
 * hidden, so an abandoned attempt never looks like a lost booking.
 */
export function bookingState(
  b: AccountBooking,
  now: Date = new Date(),
): { label: string; tone: Tone } {
  switch (b.status) {
    case 'confirmed':
      return { label: 'Confirmed', tone: 'ok' };
    case 'completed':
      return { label: 'Travelled', tone: 'mute' };
    case 'partially_paid':
      return { label: 'Part paid', tone: 'primary' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'mute' };
    case 'pending':
      return new Date(b.holdExpiresAt) > now
        ? { label: 'Awaiting payment', tone: 'primary' }
        : { label: 'Not paid', tone: 'warn' };
  }
}

export const travellersLabel = (n: number) => (n === 1 ? '1 traveller' : `${n} travellers`);

export const voucherHref = (ref: string) =>
  `/account/bookings/${encodeURIComponent(ref)}/voucher.pdf`;

/** The api's error envelope as the sign-in screen needs it. */
export type SignInError = { message: string; reason?: string | null; retryAfter?: number };

type Result<T> = { ok: true; data: T } | { ok: false; error: SignInError };

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
    { error?: { message?: string; reason?: string | null } } | undefined;
  if (res.ok) return { ok: true, data: json as T };
  const retry = Number(res.headers.get('retry-after'));
  return {
    ok: false,
    error: {
      message: json?.error?.message ?? 'Something went wrong — try again',
      reason: json?.error?.reason,
      retryAfter: Number.isFinite(retry) && retry > 0 ? retry : undefined,
    },
  };
}

export const requestCode = (email: string) => postJson<OtpSent>('/api/auth/otp/request', { email });

export const verifyCode = (email: string, code: string) =>
  postJson<unknown>('/api/auth/otp/verify', { email, code });

/** The success sheet hands the booking's email to the sign-in screen in this tab only — never
 * in the URL (no PII in URLs, v1.0.1). */
export const SIGN_IN_EMAIL_KEY = 'ts-signin-email';
