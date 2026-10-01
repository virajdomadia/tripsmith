// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * P7b — the desk's Move: the api prices every choice; a rise asks how it is settled before the
 * move is allowed; a fee off the tier asks why; the move posts the server's net as expected.
 */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => '/admin/bookings/TB-7K2M9Q',
}));
const adminGet = vi.fn();
const adminRequest = vi.fn();
vi.mock('@/lib/admin/client', () => ({
  adminGet: (...a: unknown[]) => adminGet(...a),
  adminRequest: (...a: unknown[]) => adminRequest(...a),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { MoveBooking } = await import('../src/components/admin/bookings/MoveBooking');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const OPTIONS = {
  currentDate: '2099-11-13',
  travellers: [{ name: 'Asha Rao', age: 34, occupancy: 'single' }],
  suggestedFeePaise: 0,
  dates: [
    { departureId: 'dep_now', date: '2099-11-13', seatsLeft: 9, current: true },
    { departureId: 'dep_up', date: '2099-11-20', seatsLeft: 6, current: false },
  ],
};
const QUOTE = {
  currentFarePaise: 29_000_00,
  farePaise: 34_000_00,
  addonsChangePaise: 0,
  feePaise: 0,
  netPaise: 5_000_00,
  totalPaise: 34_000_00,
  paidPaise: 29_000_00,
  owedPaise: 5_000_00,
  refundPaise: 0,
  dueOn: '2099-10-21',
  seatsLeft: 6,
  fits: true,
};

describe('MoveBooking', { timeout: 30_000 }, () => {
  it('asks how a rise is settled, then posts the server’s net', async () => {
    adminGet.mockResolvedValue(OPTIONS);
    adminRequest.mockImplementation(async (path: string) =>
      path.endsWith('/move/quote') ? QUOTE : {},
    );
    const user = userEvent.setup();
    render(<MoveBooking bookingRef="TB-7K2M9Q" />);
    expect(await screen.findByText('The customer owes ₹5,000 more')).toBeTruthy();
    const go = screen.getByRole('button', { name: 'Move the booking' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    await user.click(screen.getByRole('radio', { name: /Paid now offline/ }));
    await user.type(screen.getByRole('textbox', { name: 'Reference' }), 'UTR 99');
    await waitFor(() => expect(go.disabled).toBe(false));
    await user.click(go);
    const move = adminRequest.mock.calls.find(([p]) => p === '/admin/bookings/TB-7K2M9Q/move');
    expect(move![1].body).toEqual({
      departureId: 'dep_up',
      travellers: null,
      feePaise: 0,
      feeReason: null,
      settle: 'offline',
      method: 'upi',
      reference: 'UTR 99',
      expectedNetPaise: 5_000_00,
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('asks why when the fee is off the tier', async () => {
    adminGet.mockResolvedValue(OPTIONS);
    adminRequest.mockResolvedValue({ ...QUOTE, feePaise: 50_000, netPaise: 5_500_00 });
    const user = userEvent.setup();
    render(<MoveBooking bookingRef="TB-7K2M9Q" />);
    const fee = await screen.findByLabelText('Change fee (₹)');
    await user.clear(fee);
    await user.type(fee, '500');
    expect(await screen.findByLabelText('Why the fee differs')).toBeTruthy();
  });

  it('refuses a party that will not fit, in words', async () => {
    adminGet.mockResolvedValue(OPTIONS);
    adminRequest.mockResolvedValue({ ...QUOTE, fits: false, seatsLeft: 0 });
    render(<MoveBooking bookingRef="TB-7K2M9Q" />);
    expect(await screen.findByText(/Not enough seats for the whole party/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Move the booking' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
