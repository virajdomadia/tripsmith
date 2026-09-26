import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as voucher } from '../src/app/(site)/account/bookings/[ref]/voucher.pdf/route';
import { POST as cancel } from '../src/app/api/account/bookings/[ref]/cancellation/route';
import { POST as logout } from '../src/app/api/auth/logout/route';
import { POST as requestOtp } from '../src/app/api/auth/otp/request/route';
import { POST as verifyOtp } from '../src/app/api/auth/otp/verify/route';
import {
  type AccountBooking,
  bookingState,
  countdown,
  daysBetween,
  groupTrips,
  istDay,
  refundTierIndex,
  travellersLabel,
  voucherHref,
} from '../src/lib/account';

/** B8 — My trips: the code handlers, the account voucher hop, sign-out, and the row labels. */

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.API_URL = 'http://api.test';
  process.env.REVALIDATE_SECRET = 's3cret';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_URL;
  delete process.env.REVALIDATE_SECRET;
});

function jsonPost(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://web.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/auth/otp/request and /verify', () => {
  it('forwards the body with the visitor address and passes the answer through', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ email: 'a@x.test', expiresAt: '2026-09-26T10:10:00Z', demoCode: '123456' }),
    );
    const res = await requestOtp(
      jsonPost('/api/auth/otp/request', { email: 'a@x.test' }, { 'x-forwarded-for': '1.2.3.4' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await res.json()).demoCode).toBe('123456');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/auth/otp/request');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Client-Ip']).toBe('1.2.3.4');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'a@x.test' });
  });

  it('copies the session cookie a good code opens', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { user: { role: 'customer' } },
        { headers: { 'set-cookie': 'ts_session=tok; Path=/; HttpOnly; SameSite=lax' } },
      ),
    );
    const res = await verifyOtp(jsonPost('/api/auth/otp/verify', { email: 'a@x.test', code: '1' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBe('ts_session=tok; Path=/; HttpOnly; SameSite=lax');
  });

  it('keeps the api envelope and Retry-After on a refusal', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: { code: 'rate_limited', message: 'Too many codes asked for' } },
        { status: 429, headers: { 'retry-after': '420' } },
      ),
    );
    const res = await requestOtp(jsonPost('/api/auth/otp/request', { email: 'a@x.test' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('420');
    expect((await res.json()).error.code).toBe('rate_limited');
  });

  it('answers 502 in the envelope when the api is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const res = await verifyOtp(jsonPost('/api/auth/otp/verify', { email: 'a@x.test' }));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('internal');
  });

  it('refuses cross-site posts and non-JSON bodies without calling the api', async () => {
    const cross = await requestOtp(
      jsonPost('/api/auth/otp/request', { email: 'a@x.test' }, { 'sec-fetch-site': 'cross-site' }),
    );
    expect(cross.status).toBe(403);
    const junk = await requestOtp(jsonPost('/api/auth/otp/request', 'email=a'));
    expect(junk.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /account/bookings/{ref}/voucher.pdf', () => {
  const get = (ref: string, cookie = 'ts_session=tok; ts_enquiry_draft=pii') =>
    voucher(
      new Request(`http://web.test/account/bookings/${ref}/voucher.pdf`, { headers: { cookie } }),
      {
        params: Promise.resolve({ ref }),
      },
    );

  it('streams the PDF with the viewer’s cookie, minus the enquiry draft', async () => {
    fetchMock.mockResolvedValue(
      new Response('%PDF-1.4', {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="Tripsmith-TB-ABC123-voucher.pdf"',
        },
      }),
    );
    const res = await get('TB-ABC123');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('content-disposition')).toContain('TB-ABC123');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/account/bookings/TB-ABC123/voucher.pdf');
    expect((init.headers as Record<string, string>).cookie).toBe('ts_session=tok');
  });

  it.each([
    [401, 'http://web.test/account/sign-in'],
    [403, 'http://web.test/account?voucher=missing'],
    [404, 'http://web.test/account?voucher=missing'],
    [500, 'http://web.test/account?voucher=unavailable'],
  ])('lands a %i on a page, never on JSON', async (status, location) => {
    fetchMock.mockResolvedValue(Response.json({ error: {} }, { status }));
    const res = await get('TB-ABC123');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(location);
  });

  it('never calls the api for a ref that is not one', async () => {
    const res = await get('..%2Fadmin');
    expect(res.headers.get('location')).toBe('http://web.test/account?voucher=missing');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sign out from My trips', () => {
  it('returns the customer to their own sign-in', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await logout(
      new Request('http://web.test/api/auth/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: 'ts_session=t' },
        body: new URLSearchParams({ to: 'account' }),
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://web.test/account/sign-in?signedout=1');
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});

describe('My trips rows', () => {
  const now = new Date('2026-09-26T10:00:00Z');
  const row = (over: Partial<AccountBooking>): AccountBooking => ({
    ref: 'TB-ABC123',
    status: 'confirmed',
    holdExpiresAt: '2026-09-26T10:05:00Z',
    totalPaise: 1_199_800,
    paidPaise: 1_199_800,
    bookedAt: '2026-09-26T09:55:00Z',
    packageName: 'Kasol Riverside Weekend',
    packageSlug: 'kasol-weekend-camp',
    destination: 'Himachal',
    departs: '2026-11-06',
    travellers: 2,
    hasVoucher: true,
    coverUrl: null,
    cancellation: null,
    reviewRating: null,
    canReview: false,
    ...over,
  });

  it('says what each state means', () => {
    expect(bookingState(row({}), now).label).toBe('Confirmed');
    expect(bookingState(row({ status: 'completed' }), now).label).toBe('Completed');
    expect(bookingState(row({ cancellation: 'requested' }), now)).toEqual({
      label: 'Cancellation requested',
      tone: 'warn',
    });
    expect(bookingState(row({ status: 'cancelled' }), now).label).toBe('Cancelled');
    expect(bookingState(row({ status: 'pending' }), now)).toEqual({
      label: 'Awaiting payment',
      tone: 'primary',
    });
    expect(
      bookingState(row({ status: 'pending', holdExpiresAt: '2026-09-26T09:59:59Z' }), now),
    ).toEqual({ label: 'Not completed', tone: 'mute' });
  });

  it('builds the labels and the voucher link', () => {
    expect(travellersLabel(1)).toBe('1 traveller');
    expect(travellersLabel(3)).toBe('3 travellers');
    expect(voucherHref('TB-ABC123')).toBe('/account/bookings/TB-ABC123/voucher.pdf');
  });
});

describe('My trips tabs, countdown and tier', () => {
  const now = new Date('2026-09-26T10:00:00Z');
  const today = '2026-09-26';
  const b = (ref: string, over: Partial<AccountBooking>): AccountBooking => ({
    ref,
    status: 'confirmed',
    holdExpiresAt: '2026-09-20T10:00:00Z',
    totalPaise: 100,
    paidPaise: 100,
    bookedAt: '2026-09-20T09:00:00Z',
    packageName: 'X',
    packageSlug: 'x',
    destination: 'Goa',
    departs: '2026-11-06',
    travellers: 1,
    hasVoucher: true,
    coverUrl: null,
    cancellation: null,
    reviewRating: null,
    canReview: false,
    ...over,
  });

  it('puts each booking in its tab, upcoming soonest first', () => {
    const g = groupTrips(
      [
        b('TB-LATER1', { departs: '2026-12-01' }),
        b('TB-SOON01', { departs: '2026-10-01', cancellation: 'requested' }),
        b('TB-TODAY1', { departs: today }),
        b('TB-GONE01', { departs: '2026-09-25' }),
        b('TB-DONE01', { status: 'completed', departs: '2026-08-01' }),
        b('TB-LAPSE1', { status: 'pending', paidPaise: 0, hasVoucher: false }),
        b('TB-HOLD01', { status: 'pending', holdExpiresAt: '2026-09-26T10:05:00Z' }),
        b('TB-CANC01', { status: 'cancelled' }),
      ],
      today,
      now,
    );
    expect(g.upcoming.map((x) => x.ref)).toEqual([
      'TB-TODAY1',
      'TB-SOON01',
      'TB-HOLD01',
      'TB-LATER1',
    ]);
    expect(g.past.map((x) => x.ref)).toEqual(['TB-GONE01', 'TB-DONE01']);
    expect(g.cancelled.map((x) => x.ref)).toEqual(['TB-LAPSE1', 'TB-CANC01']);
  });

  it('counts whole days and says them plainly', () => {
    expect(daysBetween('2026-09-26', '2026-11-06')).toBe(41);
    expect(countdown(today, '2026-11-06')).toBe('In 41 days');
    expect(countdown(today, '2026-09-27')).toBe('Leaves tomorrow');
    expect(countdown(today, today)).toBe('Leaves today');
    expect(istDay('2026-09-26T20:00:00Z')).toBe('2026-09-27'); // 1:30 am IST
  });

  it('picks the policy tier the api picks', () => {
    expect([45, 30, 29, 15, 14, 0].map(refundTierIndex)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('POST /api/account/bookings/{ref}/cancellation', () => {
  const post = (ref: string, body: unknown, headers: Record<string, string> = {}) =>
    cancel(
      new Request(`http://web.test/api/account/bookings/${ref}/cancellation`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'sec-fetch-site': 'same-origin',
          cookie: 'ts_session=tok',
          ...headers,
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ ref }) },
    );

  it('forwards the reason with the session cookie and passes the answer through', async () => {
    fetchMock.mockResolvedValue(Response.json({ status: 'requested' }, { status: 201 }));
    const res = await post('TB-ABC123', { reason: 'We cannot travel that week' });
    expect(res.status).toBe(201);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/account/bookings/TB-ABC123/cancellation');
    expect((init.headers as Record<string, string>).cookie).toBe('ts_session=tok');
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'We cannot travel that week' });
  });

  it('refuses a bad ref and cross-site posts without calling the api', async () => {
    expect((await post('nope', { reason: 'x' })).status).toBe(404);
    expect((await post('TB-ABC123', {}, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
