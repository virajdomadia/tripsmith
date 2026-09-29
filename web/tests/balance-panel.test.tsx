// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckoutOptions } from '../src/lib/razorpay-checkout';

/**
 * P5 — My trips → Balance: what is left and by when, a part of at least ₹1,000 (or all of a
 * smaller balance), ordered for exactly that amount and paid through Checkout like any payment.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { BalancePanel } = await import('../src/components/site/account/BalancePanel');

const fetchMock = vi.fn();
let checkout: CheckoutOptions | undefined;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  window.Razorpay = class {
    constructor(options: CheckoutOptions) {
      checkout = options;
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

const BALANCE = {
  depositPaise: 8_500_00,
  balancePaise: 25_500_00,
  dueOn: '2099-10-14',
  lastDayOn: '2099-10-16',
  minPartPaise: 1_000_00,
  open: true,
  reason: null as string | null,
};

function panel(balance = BALANCE, paid = 8_500_00) {
  render(
    <BalancePanel
      bookingRef="TB-7K2M9Q"
      balance={balance}
      paidPaise={paid}
      totalPaise={34_000_00}
      today="2099-09-27"
      contact={{ name: 'Asha Rao', email: 'asha@example.com', phone: '9000000051' }}
      packageName="Munnar"
    />,
  );
}

describe('BalancePanel', () => {
  it('shows what is left and by when, and pays a part of it', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/account/bookings/TB-7K2M9Q/balance')
        return json(201, {
          bookingRef: 'TB-7K2M9Q',
          orderId: 'order_Part0001',
          keyId: 'rzp_test_Key',
          amountPaise: 15_000_00,
          balancePaise: 25_500_00,
        });
      if (url.endsWith('/confirm')) return json(200, { status: 'partially_paid' });
      throw new Error(`unexpected ${url}`);
    });
    const user = userEvent.setup();
    panel();
    expect(screen.getByRole('heading', { name: '₹25,500' })).toBeTruthy();
    expect(screen.getByText(/Balance due by .* · 17 days/)).toBeTruthy();
    // Starts at Razorpay's test-mode cap; the helper says what is left after it.
    const input = screen.getByLabelText('Pay now') as HTMLInputElement;
    expect(input.value).toBe('15,000');
    expect(screen.getByText(/After this you’ll owe ₹10,500/)).toBeTruthy();

    await user.clear(input);
    await user.type(input, '500');
    expect(screen.getByText('Enter at least ₹1,000.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Pay/ }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Full ₹25,500' }));
    expect(screen.getByText(/This clears the balance/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '₹15,000' }));
    await user.click(screen.getByRole('button', { name: 'Pay ₹15,000' }));

    await waitFor(() => expect(checkout).toBeDefined());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ amountPaise: 15_000_00 });
    expect(checkout).toMatchObject({ order_id: 'order_Part0001', amount: 15_000_00 });
    checkout!.handler({
      razorpay_order_id: 'order_Part0001',
      razorpay_payment_id: 'pay_Part0001',
      razorpay_signature: 'a'.repeat(64),
    });
    expect(await screen.findByText(/Payment received — thank you/)).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it('says why it is closed, and shows paid in full once cleared', () => {
    panel({ ...BALANCE, open: false, reason: 'You’ve asked to cancel this booking' });
    expect(screen.getByText('You’ve asked to cancel this booking')).toBeTruthy();
    expect(screen.queryByLabelText('Pay now')).toBeNull();
    cleanup();
    panel({ ...BALANCE, balancePaise: 0, open: false }, 34_000_00);
    expect(screen.getByRole('heading', { name: 'Paid in full' })).toBeTruthy();
  });
});
