// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotesPanel } from '@/components/admin/enquiries/NotesPanel';

const refresh = vi.fn();
const adminRequest = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => '/admin/enquiries/enq_1',
}));
vi.mock('@/lib/admin/client', () => ({ adminRequest: (...a: unknown[]) => adminRequest(...a) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const notes = [
  { id: 'n1', body: 'Status changed from New to Contacted', createdAt: '2026-09-22T06:12:00Z' },
  { id: 'n2', body: 'Called at 11:40 — no answer.', createdAt: '2026-09-22T06:14:00Z' },
];

afterEach(() => {
  cleanup();
  refresh.mockClear();
  adminRequest.mockReset();
});

describe('NotesPanel', () => {
  it('renders the timeline with the signed-in owner as the author', () => {
    render(<NotesPanel id="enq_1" notes={notes} ownerName="Rohan" />);
    expect(screen.getByText('Called at 11:40 — no answer.')).toBeTruthy();
    expect(screen.getAllByText(/Rohan/).length).toBe(2);
  });

  it('posts a note and clears the box', async () => {
    adminRequest.mockResolvedValue({});
    render(<NotesPanel id="enq_1" notes={[]} ownerName="Rohan" />);
    const box = screen.getByLabelText('Add a note');

    await userEvent.type(box, 'Sent the itinerary');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));

    expect(adminRequest).toHaveBeenCalledWith('/admin/enquiries/enq_1/notes', {
      method: 'POST',
      body: { body: 'Sent the itinerary' },
    });
    expect((box as HTMLTextAreaElement).value).toBe('');
    expect(refresh).toHaveBeenCalled();
  });

  it('will not post an empty note', async () => {
    render(<NotesPanel id="enq_1" notes={[]} ownerName="Rohan" />);
    expect(screen.getByRole('button', { name: 'Add note' }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(adminRequest).not.toHaveBeenCalled();
  });

  it('says so when there is nothing on the timeline yet', () => {
    render(<NotesPanel id="enq_1" notes={[]} ownerName="Rohan" />);
    expect(screen.getByText('No notes yet.')).toBeTruthy();
  });
});
