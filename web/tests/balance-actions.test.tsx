// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** P5b — the desk's deposit block: what is left and by when, record it paid, move the day. */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => '/admin/bookings/TB-7K2M9Q',
}));
const adminRequest = vi.fn(async () => ({}));
vi.mock('@/lib/admin/client', () => ({ adminRequest }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { BalanceActions } = await import('../src/components/admin/bookings/BalanceActions');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const BALANCE = {
  depositPaise: 8_500_00,
  balancePaise: 25_500_00,
  dueOn: '2099-10-14',
  lastDayOn: '2099-10-16',
  daysLeft: 12,
  canMarkPaid: true,
  canExtend: true,
  extendUntil: '2099-11-13',
};

// Only the fields the block reads.
const booking = (balance: Partial<typeof BALANCE> = {}) =>
  ({ ref: 'TB-7K2M9Q', balance: { ...BALANCE, ...balance } }) as never;

describe('BalanceActions', () => {
  it('shows the balance and records it paid offline', async () => {
    const user = userEvent.setup();
    render(<BalanceActions booking={booking()} />);
    expect(screen.getByText('₹25,500')).toBeTruthy();
    expect(screen.getByText('In 12 days')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Mark balance paid (offline)' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Reference (optional)'), 'UTR 4471');
    await user.click(within(dialog).getByRole('button', { name: 'Record and confirm' }));
    await waitFor(() =>
      expect(adminRequest).toHaveBeenCalledWith('/admin/bookings/TB-7K2M9Q/balance-paid', {
        method: 'POST',
        body: { reference: 'UTR 4471' },
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('moves the due day later, never past departure', async () => {
    const user = userEvent.setup();
    render(<BalanceActions booking={booking()} />);
    await user.click(screen.getByRole('button', { name: 'Extend due date' }));
    const dialog = await screen.findByRole('dialog');
    const day = within(dialog).getByLabelText('New due day') as HTMLInputElement;
    expect(day.value).toBe('2099-10-21');
    expect(day.max).toBe('2099-11-13');
    await user.clear(day);
    await user.type(day, '2099-12-01');
    expect(within(dialog).getByText(/Pick a day from/)).toBeTruthy();
    expect(
      (within(dialog).getByRole('button', { name: 'Move the due day' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('says overdue with the day the tidy cancels, and paid in full once cleared', () => {
    render(<BalanceActions booking={booking({ daysLeft: -1 })} />);
    expect(screen.getByText(/Overdue · cancelled after/)).toBeTruthy();
    cleanup();
    render(
      <BalanceActions
        booking={booking({ balancePaise: 0, canMarkPaid: false, canExtend: false })}
      />,
    );
    expect(screen.getByText('Paid in full')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
