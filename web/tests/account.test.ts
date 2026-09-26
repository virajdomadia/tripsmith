import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as voucher } from '../src/app/(site)/account/bookings/[ref]/voucher.pdf/route';
import { POST as logout } from '../src/app/api/auth/logout/route';
import { POST as requestOtp } from '../src/app/api/auth/otp/request/route';
import { POST as verifyOtp } from '../src/app/api/auth/otp/verify/route';
import {
  type AccountBooking,
  bookingState,
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
    ...over,
  });

  it('says what each state means', () => {
    expect(bookingState(row({}), now).label).toBe('Confirmed');
    expect(bookingState(row({ status: 'completed' }), now).label).toBe('Travelled');
    expect(bookingState(row({ status: 'cancelled' }), now).label).toBe('Cancelled');
    expect(bookingState(row({ status: 'pending' }), now)).toEqual({
      label: 'Awaiting payment',
      tone: 'primary',
    });
    expect(
      bookingState(row({ status: 'pending', holdExpiresAt: '2026-09-26T09:59:59Z' }), now),
    ).toEqual({ label: 'Not paid', tone: 'warn' });
  });

  it('builds the labels and the voucher link', () => {
    expect(travellersLabel(1)).toBe('1 traveller');
    expect(travellersLabel(3)).toBe('3 travellers');
    expect(voucherHref('TB-ABC123')).toBe('/account/bookings/TB-ABC123/voucher.pdf');
  });
});
