// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusPicker } from '@/components/admin/enquiries/StatusPicker';

const refresh = vi.fn();
const adminRequest = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => '/admin/enquiries/enq_1',
}));
vi.mock('@/lib/admin/client', () => ({ adminRequest: (...a: unknown[]) => adminRequest(...a) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  refresh.mockClear();
  adminRequest.mockReset();
});

describe('StatusPicker', () => {
  it('marks the current status as pressed', () => {
    render(<StatusPicker id="enq_1" status="contacted" />);
    expect(screen.getByRole('button', { name: 'Contacted' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Closed' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('offers only the legal moves (R24): nothing returns to New', () => {
    render(<StatusPicker id="enq_1" status="converted" />);
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(['Converted', 'Closed']);
  });

  it('patches the api and refreshes so the sidebar badge follows', async () => {
    adminRequest.mockResolvedValue({});
    render(<StatusPicker id="enq_1" status="new" />);

    await userEvent.click(screen.getByRole('button', { name: 'Converted' }));

    expect(adminRequest).toHaveBeenCalledWith('/admin/enquiries/enq_1/status', {
      method: 'PATCH',
      body: { status: 'converted' },
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('does not call the api for the status it is already on', async () => {
    render(<StatusPicker id="enq_1" status="new" />);
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(adminRequest).not.toHaveBeenCalled();
  });
});
