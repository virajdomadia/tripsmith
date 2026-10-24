// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../src/lib/api-errors';

/** V9 (Q-7): the money desk's "Going out" button — two taps, the second names the amount. */

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push }),
  usePathname: () => '/admin',
}));
const adminRequest = vi.fn<(path: string, init: object) => Promise<unknown>>(async () => ({}));
vi.mock('@/lib/admin/client', () => ({ adminRequest }));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', () => ({ toast }));

const { RefundMadeButton } = await import('../src/components/admin/money/RefundMadeButton');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RefundMadeButton', () => {
  it('records an offline refund handed back, on the second tap only', async () => {
    const user = userEvent.setup();
    render(<RefundMadeButton bookingRef="TB-7F3K2Q" amountPaise={4_250_00} offline />);
    await user.click(screen.getByRole('button', { name: 'Refund made (offline)' }));
    expect(adminRequest).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Yes, ₹4,250 handed back' }));
    await waitFor(() =>
      expect(adminRequest).toHaveBeenCalledWith('/admin/bookings/TB-7F3K2Q/refund-made', {
        method: 'POST',
        body: {},
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Offline refund of ₹4,250 recorded on TB-7F3K2Q');
    expect(refresh).toHaveBeenCalled();
  });

  it('sends an online refund through Razorpay’s route', async () => {
    const user = userEvent.setup();
    render(<RefundMadeButton bookingRef="TB-7F3K2Q" amountPaise={1_000_00} />);
    await user.click(screen.getByRole('button', { name: 'Send refund' }));
    await user.click(screen.getByRole('button', { name: 'Yes, send ₹1,000' }));
    await waitFor(() =>
      expect(adminRequest).toHaveBeenCalledWith('/admin/bookings/TB-7F3K2Q/refund', {
        method: 'POST',
        body: {},
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Refund of ₹1,000 sent on TB-7F3K2Q');
  });

  it('backs out without calling the api', async () => {
    const user = userEvent.setup();
    render(<RefundMadeButton bookingRef="TB-7F3K2Q" amountPaise={1_000_00} offline />);
    await user.click(screen.getByRole('button', { name: 'Refund made (offline)' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Refund made (offline)' })).toBeTruthy();
    expect(adminRequest).not.toHaveBeenCalled();
  });

  it('shows the api’s refusal and asks again instead of refreshing', async () => {
    adminRequest.mockRejectedValueOnce(
      new ApiRequestError(409, { code: 'conflict', message: 'Nothing is owed on TB-7F3K2Q' }),
    );
    const user = userEvent.setup();
    render(<RefundMadeButton bookingRef="TB-7F3K2Q" amountPaise={1_000_00} offline />);
    await user.click(screen.getByRole('button', { name: 'Refund made (offline)' }));
    await user.click(screen.getByRole('button', { name: 'Yes, ₹1,000 handed back' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Nothing is owed on TB-7F3K2Q'));
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Refund made (offline)' })).toBeTruthy();
  });

  it('sends an expired session to sign in', async () => {
    adminRequest.mockRejectedValueOnce(
      new ApiRequestError(401, { code: 'unauthorized', message: 'Sign in' }),
    );
    const user = userEvent.setup();
    render(<RefundMadeButton bookingRef="TB-7F3K2Q" amountPaise={1_000_00} />);
    await user.click(screen.getByRole('button', { name: 'Send refund' }));
    await user.click(screen.getByRole('button', { name: 'Yes, send ₹1,000' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith('Your session expired — sign in again');
    expect(push).toHaveBeenCalledWith('/admin/login'); // /admin is where sign-in lands anyway
  });
});
