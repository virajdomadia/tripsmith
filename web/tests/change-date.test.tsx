// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckoutOptions } from '../src/lib/razorpay-checkout';
import {
  type ChangeOffer,
  type ChangeOption,
  confirmLabel,
  differenceLabel,
  feeRule,
  moneyLine,
  seatsLabel,
} from '../src/lib/change';

/**
 * P7 — My trips → Change date against a faked api and Checkout: the card states the fee rule in
 * dates; the sheet lists the server's re-quoted dates; a rise holds and pays exactly the
 * server's amount through the booking's confirm route; a fall moves at once and says what comes
 * back; a price that moved reloads the dates with the server's words; a closed card says why.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => '/account/bookings/TB-7F3K2Q',
}));

const { ChangeDatePanel } = await import('../src/components/site/account/ChangeDatePanel');

const fetchMock = vi.fn();
let checkout: CheckoutOptions | undefined;
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  window.Razorpay = class {
    constructor(o: CheckoutOptions) {
      checkout = o;
    }
    on() {}
    open() {}
  } as unknown as Window['Razorpay'];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  checkout = undefined;
  delete window.Razorpay;
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const calls = (path: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([u, init]) => String(u) === path && (init?.method ?? 'GET') === method,
  );
const PATH = '/api/account/bookings/TB-7F3K2Q/change';

const OPEN: ChangeOffer = {
  open: true,
  reason: null,
  feePerTravellerPaise: 0,
  feePaise: 0,
  freeUntil: '2099-10-14',
  lastDay: '2099-10-29',
  used: false,
};

function option(over: Partial<ChangeOption>): ChangeOption {
  return {
    departureId: 'dep_up',
    date: '2099-11-20',
    seatsLeft: 9,
    bookable: true,
    unbookable: null,
    farePaise: 34_000_00,
    differencePaise: 5_000_00,
    feePaise: 0,
    netPaise: 5_000_00,
    totalPaise: 34_000_00,
    payNowPaise: 5_000_00,
    refundPaise: 0,
    balancePaise: 0,
    dueOn: null,
    ...over,
  };
}

const UP = option({});
const DOWN = option({
  departureId: 'dep_down',
  date: '2099-11-06',
  farePaise: 24_000_00,
  differencePaise: -5_000_00,
  netPaise: -5_000_00,
  totalPaise: 24_000_00,
  payNowPaise: 0,
  refundPaise: 5_000_00,
});
const FULL = option({
  departureId: 'dep_full',
  date: '2099-12-04',
  seatsLeft: 0,
  bookable: false,
  unbookable: 'sold_out',
});
const OPTIONS = {
  currentDate: '2099-11-13',
  currentFarePaise: 29_000_00,
  party: 1,
  feePaise: 0,
  options: [DOWN, UP, FULL],
};

function panel(offer: ChangeOffer = OPEN) {
  render(
    <ChangeDatePanel
      bookingRef="TB-7F3K2Q"
      offer={offer}
      contact={{ name: 'Asha Rao', email: 'asha@customer.in', phone: '9876543210' }}
      packageName="Kasol Riverside Weekend"
    />,
  );
}

describe('change-date words', () => {
  it('states the fee rule in dates, and every price as the server gave it', () => {
    expect(feeRule(OPEN)).toBe(
      'Free until Wed 14 Oct 2099. Then ₹1,000 per traveller until Thu 29 Oct 2099; after that, WhatsApp us.',
    );
    expect(feeRule({ ...OPEN, feePerTravellerPaise: 1_000_00, feePaise: 1_000_00 })).toBe(
      '₹1,000 per traveller until Thu 29 Oct 2099 — after that, WhatsApp us.',
    );
    expect(differenceLabel(UP)).toBe('+₹5,000');
    expect(differenceLabel(DOWN)).toBe('−₹5,000');
    expect(differenceLabel(option({ differencePaise: 0 }))).toBe('Same fare');
    expect(moneyLine(UP)).toBe('Pay ₹5,000 now');
    expect(moneyLine(DOWN)).toBe('₹5,000 back to you');
    expect(
      moneyLine(option({ payNowPaise: 0, netPaise: -2_000_00, balancePaise: 20_000_00 })),
    ).toBe('₹2,000 off your balance — nothing to pay now');
    expect(confirmLabel(UP)).toBe('Move to Fri 20 Nov 2099 · Pay ₹5,000');
    expect(confirmLabel(DOWN)).toBe('Move to Fri 6 Nov 2099');
    expect(seatsLabel(FULL)).toBe('Sold out for your party');
    expect(seatsLabel(option({ seatsLeft: 3 }))).toBe('3 left');
  });
});

describe('ChangeDatePanel', { timeout: 30_000 }, () => {
  it('holds and pays exactly the server’s difference, then confirms through the booking', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === PATH && (init?.method ?? 'GET') === 'GET') return json(200, OPTIONS);
      if (url === PATH)
        return json(201, {
          bookingRef: 'TB-7F3K2Q',
          state: 'pay',
          date: UP.date,
          payNowPaise: UP.payNowPaise,
          refundPaise: 0,
          orderId: 'order_Change01',
          keyId: 'rzp_test_Key',
          holdExpiresAt: '2099-10-01T10:10:00Z',
        });
      if (url.endsWith('/confirm')) return json(200, { status: 'confirmed', refundNeeded: false });
      if (url === '/api/account/bookings/TB-7F3K2Q') return json(200, { departs: UP.date });
      throw new Error(url);
    });
    const user = userEvent.setup();
    panel();
    await user.click(screen.getByRole('button', { name: 'Change date' }));
    const sheet = await screen.findByRole('dialog');
    const sold = within(sheet).getByRole('radio', { name: /Fri 4 Dec 2099/ });
    expect((sold as HTMLInputElement).disabled).toBe(true);
    await user.click(within(sheet).getByRole('radio', { name: /Fri 20 Nov 2099/ }));
    const summary = within(sheet).getByRole('region', { name: 'What the change costs' });
    expect(within(summary).getByText('To pay now')).toBeTruthy();

    await user.click(
      within(sheet).getByRole('button', { name: 'Move to Fri 20 Nov 2099 · Pay ₹5,000' }),
    );
    await waitFor(() => expect(checkout).toBeDefined());
    expect(JSON.parse(calls(PATH, 'POST')[0][1].body)).toEqual({
      departureId: 'dep_up',
      expectedNetPaise: 5_000_00,
    });
    expect(checkout!.amount).toBe(5_000_00);
    checkout!.handler({
      razorpay_order_id: 'order_Change01',
      razorpay_payment_id: 'pay_Change01',
      razorpay_signature: 'f'.repeat(64),
    });
    await waitFor(() => expect(calls('/api/bookings/TB-7F3K2Q/confirm', 'POST')).toHaveLength(1));
    expect(await screen.findByText('Moved to Fri 20 Nov 2099')).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it('closed without the callback, a payment the sync finds still moves the trip', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === PATH && (init?.method ?? 'GET') === 'GET') return json(200, OPTIONS);
      if (url === PATH)
        return json(201, {
          bookingRef: 'TB-7F3K2Q',
          state: 'pay',
          date: UP.date,
          payNowPaise: UP.payNowPaise,
          refundPaise: 0,
          orderId: 'order_Change02',
          keyId: 'rzp_test_Key',
          holdExpiresAt: '2099-10-01T10:10:00Z',
        });
      if (url.endsWith('/sync')) return json(200, { status: 'confirmed', refundNeeded: false });
      if (url === '/api/account/bookings/TB-7F3K2Q') return json(200, { departs: UP.date });
      throw new Error(url);
    });
    const user = userEvent.setup();
    panel();
    await user.click(screen.getByRole('button', { name: 'Change date' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('radio', { name: /Fri 20 Nov 2099/ }));
    await user.click(within(sheet).getByRole('button', { name: /Move to Fri 20 Nov 2099/ }));
    await waitFor(() => expect(checkout).toBeDefined());
    checkout!.modal!.ondismiss!();
    expect(await screen.findByText('Moved to Fri 20 Nov 2099')).toBeTruthy();
    expect(JSON.parse(calls('/api/bookings/TB-7F3K2Q/sync', 'POST')[0][1].body)).toEqual({
      orderId: 'order_Change02',
    });
  });

  it('moves at once on a cheaper date and says what comes back', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') return json(200, OPTIONS);
      return json(201, {
        bookingRef: 'TB-7F3K2Q',
        state: 'done',
        date: DOWN.date,
        payNowPaise: 0,
        refundPaise: 5_000_00,
        orderId: null,
        keyId: null,
        holdExpiresAt: null,
      });
    });
    const user = userEvent.setup();
    panel();
    await user.click(screen.getByRole('button', { name: 'Change date' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('radio', { name: /Fri 6 Nov 2099/ }));
    expect(within(sheet).getByText('Back to you')).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: 'Move to Fri 6 Nov 2099' }));
    expect(await screen.findByText('Moved to Fri 6 Nov 2099')).toBeTruthy();
    expect(screen.getByText(/₹5,000 is on its way back to you/)).toBeTruthy();
    expect(checkout).toBeUndefined();
  });

  it('reloads the dates with the server’s words when the price moved', async () => {
    let gets = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        gets += 1;
        return json(200, gets === 1 ? OPTIONS : { ...OPTIONS, options: [DOWN] });
      }
      return json(409, {
        error: {
          code: 'conflict',
          message: 'The price for that date has just changed — have a look at the new one',
          reason: 'price_changed',
        },
      });
    });
    const user = userEvent.setup();
    panel();
    await user.click(screen.getByRole('button', { name: 'Change date' }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('radio', { name: /Fri 20 Nov 2099/ }));
    await user.click(within(sheet).getByRole('button', { name: /Move to Fri 20 Nov 2099/ }));
    expect(await within(sheet).findByText(/has just changed/)).toBeTruthy();
    await waitFor(() =>
      expect(within(sheet).queryByRole('radio', { name: /Fri 20 Nov 2099/ })).toBeNull(),
    );
  });

  it('says why when changes are closed', () => {
    panel({
      ...OPEN,
      open: false,
      reason: 'This booking has had its one online date change — WhatsApp us and we’ll help',
      used: true,
    });
    expect(screen.getByText(/had its one online date change/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change date' })).toBeNull();
  });
});
