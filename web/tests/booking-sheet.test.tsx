// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckoutOptions } from '../src/lib/razorpay-checkout';

/**
 * B5 — the Book-now sheet against a faked api and a faked Razorpay Checkout: the order is made
 * from the visitor's party (never an amount), Checkout opens on that order, and each way a
 * payment can end is told honestly — confirmed, refunded, sold out mid-flow, or closed unpaid.
 */

vi.mock('next/image', () => ({
  default: (props: { alt: string }) => <span data-alt={props.alt} />,
}));

const { BookingSheet } = await import('../src/components/site/booking/BookingSheet');

const fetchMock = vi.fn();
let checkout: CheckoutOptions | undefined;
const failedHandlers: ((e: { error?: { description?: string } }) => void)[] = [];

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
  window.Razorpay = class {
    constructor(options: CheckoutOptions) {
      checkout = options;
    }
    on(_: string, cb: (e: { error?: { description?: string } }) => void) {
      failedHandlers.push(cb);
    }
    open() {}
  } as unknown as Window['Razorpay'];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  checkout = undefined;
  failedHandlers.length = 0;
  delete window.Razorpay;
});

const DEP = {
  id: 'dep_nov',
  date: '2099-11-20',
  seatsTotal: 16,
  seatsLeft: 16,
  guaranteed: true,
  priceDoublePaise: 14_999_00,
  priceTriplePaise: 13_499_00,
  priceChildPaise: 8_999_00,
  singleSupplementPaise: 6_000_00,
  badge: null,
};
const DEC = { ...DEP, id: 'dep_dec', date: '2099-12-18', seatsLeft: 4, guaranteed: false };
const PKG = {
  slug: 'north-goa-beaches',
  name: 'North Goa Beaches',
  duration: '3N / 4D',
  destination: 'Goa',
  cover: null,
  departures: [DEP, DEC],
};
const QUOTE = {
  departureId: 'dep_nov',
  packageSlug: 'north-goa-beaches',
  date: '2099-11-20',
  seatsLeft: 16,
  lines: [
    { kind: 'double', occupancy: 'double', count: 2, unitPaise: 14_999_00, amountPaise: 29_998_00 },
  ],
  deal: null,
  subtotalPaise: 29_998_00,
  discountPaise: 0,
  totalPaise: 29_998_00,
};
const ORDER = {
  bookingRef: 'TB-7F3K2Q',
  orderId: 'order_Test0001',
  keyId: 'rzp_test_Key',
  amountPaise: 29_998_00,
  holdExpiresAt: new Date(Date.now() + 600_000).toISOString(),
  quote: QUOTE,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Route the sheet's calls; `overrides` answer a path instead of the default. */
function api(overrides: Record<string, () => Response> = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    const path = url.split('?')[0];
    if (overrides[path]) return overrides[path]();
    if (path.endsWith('/departures')) return json(200, { items: [DEP, DEC] });
    if (path === '/api/bookings/quote') return json(200, QUOTE);
    if (path === '/api/bookings') return json(201, ORDER);
    if (path.endsWith('/confirm'))
      return json(200, { bookingRef: ORDER.bookingRef, status: 'confirmed', refundNeeded: false });
    if (path.endsWith('/sync'))
      return json(200, { bookingRef: ORDER.bookingRef, status: 'pending', refundNeeded: false });
    throw new Error(`unexpected ${url}`);
  });
}

const calls = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).split('?')[0] === path);

async function fillAndPay(user: ReturnType<typeof userEvent.setup>) {
  render(<BookingSheet pkg={PKG} open onOpenChange={() => {}} />);
  await fillIn(user);
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pay' }));
}

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  const sheet = await screen.findByRole('dialog');
  await within(sheet).findByText('Live availability · checked just now');
  await waitFor(() => expect(calls('/api/bookings/quote')).toHaveLength(1));
  await user.type(within(sheet).getByLabelText('Traveller 1 name'), 'Ananya Rao');
  await user.type(within(sheet).getByLabelText('Traveller 1 age'), '34');
  await user.type(within(sheet).getByLabelText('Traveller 2 name'), 'Vikram Rao');
  await user.type(within(sheet).getByLabelText('Traveller 2 age'), '36');
  await user.type(within(sheet).getByLabelText('Mobile'), '98450 12345');
  await user.type(within(sheet).getByLabelText('Email'), 'ananya@example.com');
}

// userEvent types every character; under a full parallel run that outgrows the 5 s default.
describe('BookingSheet', { timeout: 30_000 }, () => {
  it('reads live seats, quotes on the server, orders the party and confirms the payment', async () => {
    api();
    const user = userEvent.setup();
    await fillAndPay(user);

    expect(calls('/api/packages/north-goa-beaches/departures')[0][0]).toContain('fresh=1');
    expect(JSON.parse(calls('/api/bookings/quote')[0][1].body)).toEqual({
      departureId: 'dep_nov',
      travellers: [{ occupancy: 'double' }, { occupancy: 'double' }],
    });
    await waitFor(() => expect(checkout).toBeDefined());
    // The order carries people, never a price; the contact name came from traveller 1.
    expect(JSON.parse(calls('/api/bookings')[0][1].body)).toEqual({
      departureId: 'dep_nov',
      travellers: [
        { name: 'Ananya Rao', age: 34, occupancy: 'double' },
        { name: 'Vikram Rao', age: 36, occupancy: 'double' },
      ],
      contact: { name: 'Ananya Rao', phone: '9845012345', email: 'ananya@example.com' },
    });
    expect(checkout).toMatchObject({
      key: 'rzp_test_Key',
      order_id: 'order_Test0001',
      amount: 29_998_00,
      prefill: { name: 'Ananya Rao', email: 'ananya@example.com', contact: '98450 12345' },
    });
    expect(checkout!.timeout).toBeGreaterThan(590);
    expect(checkout!.timeout).toBeLessThanOrEqual(600);

    checkout!.handler({
      razorpay_order_id: 'order_Test0001',
      razorpay_payment_id: 'pay_Test0001',
      razorpay_signature: 'a'.repeat(64),
    });
    expect(await screen.findByText('You’re going to Goa.')).toBeTruthy();
    expect(screen.getAllByText('TB-7F3K2Q').length).toBeGreaterThan(0);
    expect(JSON.parse(calls('/api/bookings/TB-7F3K2Q/confirm')[0][1].body)).toEqual({
      razorpayOrderId: 'order_Test0001',
      razorpayPaymentId: 'pay_Test0001',
      razorpaySignature: 'a'.repeat(64),
    });
  });

  it('says so plainly when the payment landed after the seats had gone', async () => {
    api({
      '/api/bookings/TB-7F3K2Q/confirm': () =>
        json(200, { bookingRef: 'TB-7F3K2Q', status: 'cancelled', refundNeeded: true }),
    });
    const user = userEvent.setup();
    await fillAndPay(user);
    await waitFor(() => expect(checkout).toBeDefined());
    checkout!.handler({
      razorpay_order_id: 'order_Test0001',
      razorpay_payment_id: 'pay_Test0001',
      razorpay_signature: 'a'.repeat(64),
    });
    expect(await screen.findByText('We couldn’t hold your seat.')).toBeTruthy();
    expect(screen.getByText(/Your ₹29,998 will be refunded within 5–7 days/)).toBeTruthy();
    expect(screen.queryByText('You’re going to Goa.')).toBeNull();
  });

  it('sends the visitor back to the dates when theirs sold out at Pay', async () => {
    api({
      '/api/bookings': () =>
        json(409, {
          error: { code: 'conflict', message: 'Sold out', reason: 'sold_out' },
        }),
    });
    const user = userEvent.setup();
    await fillAndPay(user);
    expect(await screen.findByText('Fri 20 Nov 2099 is no longer available')).toBeTruthy();
    expect(checkout).toBeUndefined();
    // No date is picked for them, and the typed travellers are still there.
    expect(
      screen.getByRole('button', { name: /Fri 20 Nov 2099/ }).getAttribute('aria-pressed'),
    ).toBe('false');
    expect((screen.getByLabelText('Traveller 1 name') as HTMLInputElement).value).toBe(
      'Ananya Rao',
    );
  });

  it('checks with the api when Checkout closes unpaid, then reopens the same order', async () => {
    api();
    const user = userEvent.setup();
    await fillAndPay(user);
    await waitFor(() => expect(checkout).toBeDefined());
    failedHandlers.forEach((cb) => cb({ error: { description: 'Card declined by the bank.' } }));
    checkout!.modal.ondismiss();

    const again = await screen.findByRole('button', { name: 'Pay again' });
    expect(calls('/api/bookings/TB-7F3K2Q/sync')).toHaveLength(1);
    expect(screen.getByText('Card declined by the bank.')).toBeTruthy();
    expect(screen.getByText(/Your seats are held for/)).toBeTruthy();

    const first = checkout;
    await user.click(again);
    await waitFor(() => expect(checkout).not.toBe(first));
    expect(calls('/api/bookings')).toHaveLength(1); // same hold, no second booking
    expect(checkout!.order_id).toBe('order_Test0001');
  });

  it('warns before Pay that test mode stops at ₹15,000', async () => {
    api();
    render(<BookingSheet pkg={PKG} open onOpenChange={() => {}} />);
    // ₹29,998 for two: over the cap.
    expect(await screen.findByText(/this payment will stop at Razorpay/)).toBeTruthy();
  });

  it('counts the visitor’s own hold as theirs when the seats are re-read', async () => {
    api();
    const user = userEvent.setup();
    const { rerender } = render(<BookingSheet pkg={PKG} open onOpenChange={() => {}} />);
    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(checkout).toBeDefined());
    checkout!.modal.ondismiss();
    await screen.findByRole('button', { name: 'Pay again' });
    // The read from before the hold is shown as it was — not topped up with our own seats.
    expect(screen.getByRole('button', { name: /Fri 20 Nov 2099/ }).textContent).toContain(
      '16 seats left',
    );

    // Closed and reopened: the api now counts our 2 held seats as gone — every seat left.
    api({
      '/api/packages/north-goa-beaches/departures': () =>
        json(200, { items: [{ ...DEP, seatsLeft: 0 }, DEC] }),
    });
    rerender(<BookingSheet pkg={PKG} open={false} onOpenChange={() => {}} />);
    rerender(<BookingSheet pkg={PKG} open onOpenChange={() => {}} />);
    await screen.findByText('Live availability · checked just now');
    expect(screen.queryByText(/is no longer available/)).toBeNull();
    // Read after the hold: 0 left to others, our 2 added back.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Fri 20 Nov 2099/ }).textContent).toContain(
        '2 seats left',
      ),
    );
    const again = await screen.findByRole('button', { name: 'Pay again' });
    expect((again as HTMLButtonElement).disabled).toBe(false);
    const quotes = calls('/api/bookings/quote').length;
    await user.click(again);
    await waitFor(() => expect(checkout!.order_id).toBe('order_Test0001'));
    expect(calls('/api/bookings')).toHaveLength(1);
    expect(calls('/api/bookings/quote')).toHaveLength(quotes);
  });

  it('keeps the visitor’s hold theirs when a later seat read fails', async () => {
    api({
      '/api/packages/north-goa-beaches/departures': () =>
        json(200, { items: [{ ...DEP, seatsLeft: 2 }, DEC] }),
    });
    const user = userEvent.setup();
    const { rerender } = render(<BookingSheet pkg={PKG} open onOpenChange={() => {}} />);
    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    await waitFor(() => expect(checkout).toBeDefined());
    checkout!.modal.ondismiss();
    await screen.findByRole('button', { name: 'Pay again' });

    // Reopened: a read after the hold (0 left to others), then a read that fails.
    api({
      '/api/packages/north-goa-beaches/departures': () =>
        json(200, { items: [{ ...DEP, seatsLeft: 0 }, DEC] }),
    });
    rerender(<BookingSheet pkg={PKG} open={false} onOpenChange={() => {}} />);
    rerender(<BookingSheet pkg={PKG} open onOpenChange={() => {}} />);
    await screen.findByText('Live availability · checked just now');
    api({ '/api/packages/north-goa-beaches/departures': () => json(500, {}) });
    rerender(<BookingSheet pkg={PKG} open={false} onOpenChange={() => {}} />);
    rerender(<BookingSheet pkg={PKG} open onOpenChange={() => {}} />);
    await screen.findByText(/Couldn’t check live seats/);
    expect(screen.queryByText(/is no longer available/)).toBeNull();
    const again = screen.getByRole('button', { name: 'Pay again' }) as HTMLButtonElement;
    expect(again.disabled).toBe(false);
  });

  it('confirms from the sync when Razorpay took the money but never called back', async () => {
    api({
      '/api/bookings/TB-7F3K2Q/sync': () =>
        json(200, { bookingRef: 'TB-7F3K2Q', status: 'confirmed', refundNeeded: false }),
    });
    const user = userEvent.setup();
    await fillAndPay(user);
    await waitFor(() => expect(checkout).toBeDefined());
    checkout!.modal.ondismiss();
    expect(await screen.findByText('You’re going to Goa.')).toBeTruthy();
  });
});
