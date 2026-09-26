// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResolveCancellation } from '@/components/admin/bookings/ResolveCancellation';

const refresh = vi.fn();
const adminRequest = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => '/admin/bookings/TB-ABC123',
}));
vi.mock('@/lib/admin/client', () => ({ adminRequest: (...a: unknown[]) => adminRequest(...a) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const request = {
  id: 'can_1',
  status: 'requested' as const,
  reason: 'My mother is unwell.',
  requestedAt: '2026-09-20T06:00:00Z',
  refundNote: null,
  refundPaise: null,
  resolvedAt: null,
  daysOut: 20,
  tier: '50% of the package price is retained',
  suggestedRefundPaise: 14_500_00,
  canApprove: true,
};

function dialog(overrides: Partial<typeof request> = {}) {
  render(
    <ResolveCancellation
      bookingRef="TB-ABC123"
      cancellation={{ ...request, ...overrides }}
      paidPaise={29_000_00}
    />,
  );
}

afterEach(() => {
  cleanup();
  refresh.mockClear();
  adminRequest.mockReset();
});

describe('ResolveCancellation', () => {
  it('shows the tier on the day they asked and pre-fills its refund', async () => {
    dialog();
    expect(screen.getByText(/20 days before departure/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Approve cancellation' }));
    expect((screen.getByLabelText('Refund (₹)') as HTMLInputElement).value).toBe('14500');
  });

  it('approves with the refund in paise and the note', async () => {
    adminRequest.mockResolvedValue({});
    dialog();
    await userEvent.click(screen.getByRole('button', { name: 'Approve cancellation' }));
    const refund = screen.getByLabelText('Refund (₹)');
    await userEvent.clear(refund);
    await userEvent.type(refund, '12000');
    await userEvent.type(screen.getByLabelText('Note to the customer'), 'Back in 5–7 days.');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel booking and email' }));
    expect(adminRequest).toHaveBeenCalledWith('/admin/cancellations/can_1/resolve', {
      method: 'POST',
      body: { decision: 'approve', note: 'Back in 5–7 days.', refundPaise: 12_000_00 },
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('refuses a refund above what was paid, or no note', async () => {
    dialog();
    await userEvent.click(screen.getByRole('button', { name: 'Approve cancellation' }));
    const refund = screen.getByLabelText('Refund (₹)');
    await userEvent.clear(refund);
    await userEvent.type(refund, '30000');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel booking and email' }));
    expect(adminRequest).not.toHaveBeenCalled();
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts.some((t) => t?.startsWith('At most'))).toBe(true);
    expect(alerts.some((t) => t?.startsWith('Write the customer a line'))).toBe(true);
  });

  it('rejects with a note and no refund', async () => {
    adminRequest.mockResolvedValue({});
    dialog();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await userEvent.type(screen.getByLabelText('Why — to the customer'), 'Too close to go.');
    await userEvent.click(screen.getByRole('button', { name: 'Reject and email' }));
    expect(adminRequest).toHaveBeenCalledWith('/admin/cancellations/can_1/resolve', {
      method: 'POST',
      body: { decision: 'reject', note: 'Too close to go.' },
    });
  });

  it('offers only reject when the booking no longer holds its seats', () => {
    dialog({ canApprove: false });
    expect(screen.queryByRole('button', { name: 'Approve cancellation' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();
  });
});
