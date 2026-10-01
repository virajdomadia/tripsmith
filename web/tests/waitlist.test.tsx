// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimFromSearch, claimLive, istMoment } from '../src/lib/waitlist';

/**
 * R44 (P6) in the Book-now sheet: a sold-out date takes waitlist joins, and a waitlist offer's
 * link opens the sheet locked to its date, with the held seats counted as free and the offer's
 * email fixed — the quote and the order carry the claim token.
 */

vi.mock('next/image', () => ({
  default: (props: { alt: string }) => <span data-alt={props.alt} />,
}));

const { BookingSheet } = await import('../src/components/site/booking/BookingSheet');

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
      }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const SOLD = {
  id: 'dep_nov',
  date: '2099-11-20',
  seatsTotal: 16,
  seatsLeft: 0,
  guaranteed: true,
  priceDoublePaise: 14_999_00,
  priceTriplePaise: 13_499_00,
  priceChildPaise: 8_999_00,
  singleSupplementPaise: 6_000_00,
  badge: 'sold-out' as const,
  waiting: 3,
  waitlistOpen: true,
};
const OPEN = { ...SOLD, id: 'dep_dec', date: '2099-12-18', seatsLeft: 8, badge: null, waiting: 0 };
const PKG = {
  slug: 'north-goa-beaches',
  name: 'North Goa Beaches',
  duration: '3N / 4D',
  destination: 'Goa',
  cover: null,
  departures: [SOLD, OPEN],
  addons: [] as never[],
  deal: null,
  earlyBird: null,
};
const QUOTE = {
  departureId: 'dep_nov',
  packageSlug: 'north-goa-beaches',
  date: '2099-11-20',
  seatsLeft: 2,
  lines: [
    { kind: 'double', occupancy: 'double', count: 2, unitPaise: 14_999_00, amountPaise: 29_998_00 },
  ],
  deal: null,
  earlyBird: null,
  coupon: null,
  manual: null,
  addons: [],
  ladder: [],
  subtotalPaise: 29_998_00,
  discountPaise: 0,
  addonsPaise: 0,
  changeFeePaise: 0,
  totalPaise: 29_998_00,
};
const TOKEN = 'ckentry01.1.0123456789abcdef0123456789abcdef';
const EXPIRES = new Date(Date.now() + 20 * 3600_000).toISOString();
const CLAIM = {
  state: 'offered',
  departureId: 'dep_nov',
  date: '2099-11-20',
  packageSlug: 'north-goa-beaches',
  packageName: 'North Goa Beaches',
  name: 'Asha Rao',
  email: 'asha@customer.in',
  party: 2,
  heldSeats: 2,
  expiresAt: EXPIRES,
  position: null,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function api(overrides: Record<string, () => Response> = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    const path = String(url).split('?')[0];
    if (overrides[path]) return overrides[path]();
    if (path.endsWith('/departures')) return json(200, { items: [SOLD, OPEN] });
    if (path === '/api/bookings/quote') return json(200, QUOTE);
    if (path === `/api/waitlist/claim/${TOKEN}`) return json(200, CLAIM);
    if (path === '/api/waitlist') return json(201, { position: 4, waiting: 4 });
    throw new Error(`unexpected ${url}`);
  });
}

const calls = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).split('?')[0] === path);

describe('waitlist helpers', () => {
  it('reads only a well-formed claim token from the URL', () => {
    expect(claimFromSearch(`?claim=${TOKEN}`)).toBe(TOKEN);
    expect(claimFromSearch('?claim=<script>')).toBeNull();
    expect(claimFromSearch('')).toBeNull();
  });

  it('treats an offer as live only while it runs', () => {
    expect(claimLive(CLAIM as never)).toBe(true);
    expect(
      claimLive({ ...CLAIM, expiresAt: new Date(Date.now() - 1000).toISOString() } as never),
    ).toBe(false);
    expect(claimLive({ ...CLAIM, state: 'waiting', expiresAt: null } as never)).toBe(false);
  });

  it('writes the end of an offer in IST', () => {
    expect(istMoment('2026-10-02T08:45:00Z')).toBe('Fri, 2 Oct, 2:15 pm');
  });
});

describe('the waitlist in the Book-now sheet', { timeout: 30_000 }, () => {
  it('joins a sold-out date: name, email and party, and says where the party stands', async () => {
    api();
    const user = userEvent.setup();
    render(<BookingSheet pkg={PKG} open onOpenChange={() => {}} />);
    const sheet = await screen.findByRole('dialog');
    await within(sheet).findByText('Live availability · checked just now');
    expect(within(sheet).getByText('Fully booked · 3 waiting')).toBeTruthy();

    await user.click(within(sheet).getByRole('button', { name: 'Join waitlist · 3 waiting' }));
    const form = within(sheet).getByRole('form', { name: /Join the waitlist for/ });
    await user.type(within(form).getByLabelText('Your name'), 'Asha Rao');
    await user.type(within(form).getByLabelText('Email'), 'Asha@Customer.in');
    await user.click(within(form).getByRole('button', { name: 'One more seat' }));
    await user.click(within(form).getByRole('button', { name: 'Join the waitlist' }));

    expect(await within(sheet).findByText(/in line for/)).toBeTruthy();
    expect(within(sheet).getByText('#4')).toBeTruthy();
    expect(JSON.parse(calls('/api/waitlist')[0][1].body)).toEqual({
      departureId: 'dep_nov',
      name: 'Asha Rao',
      email: 'Asha@Customer.in',
      party: 3,
    });
  });

  it('opens a claim link on its date with the held seats free and the email fixed', async () => {
    api();
    render(<BookingSheet pkg={PKG} open onOpenChange={() => {}} claim={TOKEN} />);
    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText(/2 seats held for you until/)).toBeTruthy();
    // Only the offer's date, bookable: its 0 seats plus the 2 held.
    const dates = within(sheet).getByRole('group', { name: 'Departure dates' });
    expect(within(dates).getAllByRole('button')).toHaveLength(1);
    await waitFor(() => expect(calls('/api/bookings/quote').length).toBeGreaterThan(0));
    const body = JSON.parse(calls('/api/bookings/quote').at(-1)![1].body);
    expect(body).toMatchObject({ departureId: 'dep_nov', claim: TOKEN });
    const email = within(sheet).getByLabelText('Email') as HTMLInputElement;
    expect(email.value).toBe('asha@customer.in');
    expect(email.readOnly).toBe(true);
    expect(within(sheet).getByText(/Held for you until/)).toBeTruthy();
  });

  it('says so when the offer has ended, and shows the dates as usual', async () => {
    api({
      [`/api/waitlist/claim/${TOKEN}`]: () =>
        json(200, { ...CLAIM, state: 'waiting', heldSeats: 0, expiresAt: null, position: 2 }),
    });
    render(<BookingSheet pkg={PKG} open onOpenChange={() => {}} claim={TOKEN} />);
    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText(/Your offer ended before it was claimed/)).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: /Join waitlist/ })).toBeTruthy();
  });
});
