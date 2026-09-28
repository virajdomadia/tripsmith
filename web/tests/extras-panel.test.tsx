// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckoutOptions } from '../src/lib/razorpay-checkout';

/**
 * P8b — My trips → Add extras against a faked api and Checkout: the server prices every pick,
 * the order is made from choices (never an amount), Checkout's success is confirmed through the
 * booking's own confirm route, a switched-off add-on is dropped with the server's words, and a
 * closed offer says why. Plus the booked add-ons list and the desk's Remove.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => '/account/bookings/TB-7F3K2Q',
}));
vi.mock('next/image', () => ({ default: (p: { alt: string }) => <span data-alt={p.alt} /> }));
const adminRequest = vi.fn();
vi.mock('@/lib/admin/client', () => ({ adminRequest: (...a: unknown[]) => adminRequest(...a) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { ExtrasPanel } = await import('../src/components/site/account/ExtrasPanel');
const { BookedAddons } = await import('../src/components/site/booking/BookedAddons');
const { RemoveAddon } = await import('../src/components/admin/bookings/RemoveAddon');

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
const calls = (path: string) => fetchMock.mock.calls.filter(([u]) => String(u) === path);

const ADDONS = [
  {
    id: 'raft',
    name: 'Kullu rafting',
    description: '',
    pricePaise: 900_00,
    basis: 'traveller' as const,
    maxNights: null,
    image: null,
  },
  {
    id: 'car',
    name: 'Airport transfers',
    description: '',
    pricePaise: 1_800_00,
    basis: 'booking' as const,
    maxNights: null,
    image: null,
  },
];
type Offer = import('../src/lib/api-types').components['schemas']['ExtrasOffer'];
const OPEN: Offer = { open: true, closesOn: '2099-11-13', reason: null, offered: ADDONS };
const LINE = {
  addonId: 'raft',
  name: 'Kullu rafting',
  basis: 'traveller' as const,
  unitPaise: 900_00,
  travellers: 2,
  nights: 1,
  amountPaise: 1_800_00,
};

function panel(extras: Offer = OPEN) {
  render(
    <ExtrasPanel
      bookingRef="TB-7F3K2Q"
      extras={extras}
      party={2}
      contact={{ name: 'Asha Rao', email: 'asha@customer.in', phone: '9876543210' }}
      packageName="Kasol Riverside Weekend"
    />,
  );
}

describe('ExtrasPanel', { timeout: 30_000 }, () => {
  it('prices each pick on the server, orders the choices and confirms the payment', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/extras/quote')) return json(200, { addons: [LINE], totalPaise: 1_800_00 });
      if (url.endsWith('/extras'))
        return json(201, {
          bookingRef: 'TB-7F3K2Q',
          orderId: 'order_Extra01',
          keyId: 'rzp_test_Key',
          amountPaise: 1_800_00,
          addons: [LINE],
        });
      if (url.endsWith('/confirm')) return json(200, { status: 'confirmed', refundNeeded: false });
      throw new Error(url);
    });
    const user = userEvent.setup();
    panel();
    const more = screen.getByRole('button', { name: 'One more traveller for Kullu rafting' });
    await user.click(more);
    await user.click(more);
    expect(await screen.findByText('To pay now')).toBeTruthy();
    expect(
      JSON.parse(calls('/api/account/bookings/TB-7F3K2Q/extras/quote').at(-1)![1].body),
    ).toEqual({
      addons: [{ addonId: 'raft', travellers: 2 }],
    });

    await user.click(screen.getByRole('button', { name: 'Pay for extras' }));
    await waitFor(() => expect(checkout).toBeDefined());
    expect(JSON.parse(calls('/api/account/bookings/TB-7F3K2Q/extras')[0][1].body)).toEqual({
      addons: [{ addonId: 'raft', travellers: 2 }],
    });
    expect(checkout!.amount).toBe(1_800_00);
    checkout!.handler({
      razorpay_order_id: 'order_Extra01',
      razorpay_payment_id: 'pay_Extra01',
      razorpay_signature: 'f'.repeat(64),
    });
    await waitFor(() => expect(calls('/api/bookings/TB-7F3K2Q/confirm')).toHaveLength(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(await screen.findByText(/Extras added/)).toBeTruthy();
  });

  it('drops an add-on the server says is gone, with its words', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const i = body.addons.findIndex((a: { addonId: string }) => a.addonId === 'car');
      if (i >= 0)
        return json(409, {
          error: {
            code: 'conflict',
            message: '“Airport transfers” is no longer offered — we took it off your booking',
            reason: 'addon_unavailable',
            fieldErrors: { [`addons.${i}`]: 'gone' },
          },
        });
      return json(200, { addons: [LINE], totalPaise: 1_800_00 });
    });
    const user = userEvent.setup();
    panel();
    await user.click(screen.getByRole('switch', { name: /Airport transfers/ }));
    expect(await screen.findByText(/no longer offered/)).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole('switch', { name: /Airport transfers/ })).toBeNull(),
    );
  });

  it('says why when extras are closed', () => {
    panel({
      open: false,
      closesOn: '2099-11-13',
      reason: 'Extras closed 7 days before departure',
      offered: [],
    });
    expect(screen.getByText('Extras closed 7 days before departure')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pay for extras' })).toBeNull();
  });
});

const QUOTE = {
  departureId: 'd',
  packageSlug: 'kasol',
  date: '2099-11-20',
  seatsLeft: 4,
  lines: [],
  deal: null,
  coupon: null,
  addons: [LINE],
  subtotalPaise: 11_998_00,
  discountPaise: 0,
  addonsPaise: 1_800_00,
  totalPaise: 13_798_00,
};
const BOOKED = [
  {
    id: 'b1',
    name: 'Kullu rafting',
    basis: 'traveller' as const,
    travellers: 2,
    nights: 1,
    unitPaise: 900_00,
    amountPaise: 1_800_00,
    addedLater: false,
    addedAt: '2099-09-01T06:00:00Z',
    removedAt: '2099-09-03T06:00:00Z',
  },
  {
    id: 'b2',
    name: 'Airport transfers',
    basis: 'booking' as const,
    travellers: 1,
    nights: 1,
    unitPaise: 1_800_00,
    amountPaise: 1_800_00,
    addedLater: true,
    addedAt: '2099-09-02T06:00:00Z',
    removedAt: null,
  },
];

describe('BookedAddons and the desk’s Remove', () => {
  it('shows the fare, what was added later and what was taken off', () => {
    render(<BookedAddons quote={QUOTE} addons={BOOKED} />);
    expect(screen.getByText('Trip fare').nextSibling?.textContent).toBe('₹11,998');
    expect(screen.getByText(/Taken off .* · refunded/)).toBeTruthy();
    expect(screen.getByText(/^Added /)).toBeTruthy();
  });

  it('takes one off through the api and refreshes', async () => {
    adminRequest.mockResolvedValue({});
    const user = userEvent.setup();
    render(
      <BookedAddons
        quote={QUOTE}
        addons={BOOKED}
        action={(a) => <RemoveAddon bookingRef="TB-7F3K2Q" addon={a} />}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Remove Kullu rafting' })).toBeNull(); // gone
    await user.click(screen.getByRole('button', { name: 'Remove Airport transfers' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Note to the customer/), 'Driver unavailable');
    await user.click(within(dialog).getByRole('button', { name: 'Take off and refund' }));
    await waitFor(() => expect(adminRequest).toHaveBeenCalled());
    expect(adminRequest.mock.calls[0]).toEqual([
      '/admin/bookings/TB-7F3K2Q/addons/b2/remove',
      { method: 'POST', body: { note: 'Driver unavailable' } },
    ]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
