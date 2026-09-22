// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => '/admin/destinations/d1',
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

const adminRequest = vi.fn();
vi.mock('@/lib/admin/client', () => ({ adminRequest, uploadCover: vi.fn() }));

const { DeleteDestination } =
  await import('../src/components/admin/destinations/DeleteDestination');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DeleteDestination', () => {
  it('disables the trigger and explains the block while packages reference the destination', () => {
    render(<DeleteDestination id="d1" name="Goa" packageCount={2} />);
    const trigger = screen.getByRole('button', { name: 'Delete destination' });
    expect(trigger.hasAttribute('disabled')).toBe(true);
    expect(
      screen.getByText('Delete is blocked while 2 packages use this destination.'),
    ).toBeTruthy();
  });

  it('deletes, toasts, and navigates back once confirmed', async () => {
    adminRequest.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<DeleteDestination id="d1" name="Goa" packageCount={0} />);

    await user.click(screen.getByRole('button', { name: 'Delete destination' }));
    const confirm = await screen.findByRole('button', { name: 'Delete' });
    await user.click(confirm);

    await waitFor(() =>
      expect(adminRequest).toHaveBeenCalledWith('/admin/destinations/d1', { method: 'DELETE' }),
    );
    expect(toastSuccess).toHaveBeenCalledWith('Goa deleted');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/destinations'));
  });
});
