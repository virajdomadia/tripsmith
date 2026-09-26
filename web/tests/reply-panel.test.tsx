// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReplyPanel } from '@/components/admin/enquiries/ReplyPanel';

const refresh = vi.fn();
const adminRequest = vi.fn();
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => '/admin/enquiries/enq_1',
}));
vi.mock('@/lib/admin/client', () => ({ adminRequest: (...a: unknown[]) => adminRequest(...a) }));
vi.mock('sonner', () => ({ toast }));

const packages = [
  { slug: 'kasol-trek', name: 'Kasol Trek' },
  { slug: 'north-goa-beaches', name: 'North Goa Beaches' },
];
const sent = {
  id: 'm1',
  subject: 'Tripsmith · your enquiry TS-ABC123',
  body: 'Hi Priya,\n\nThe dates work.',
  sentAt: '2026-09-22T06:14:00Z',
  sent: true,
  error: null,
  attachment: { slug: 'north-goa-beaches', name: 'North Goa Beaches' },
};
const failed = { ...sent, id: 'm2', sent: false, error: 'Resend refused it', attachment: null };

function panel(messages = [] as (typeof sent)[]) {
  return render(
    <ReplyPanel
      id="enq_1"
      email="priya@example.com"
      messages={messages}
      subject="Tripsmith · your enquiry TS-ABC123"
      body={'Hi Priya, this is Tripsmith about your enquiry (TS-ABC123).\n\n'}
      packages={packages}
      packageSlug="north-goa-beaches"
    />,
  );
}

afterEach(() => {
  cleanup();
  refresh.mockClear();
  adminRequest.mockReset();
  toast.success.mockClear();
  toast.error.mockClear();
});

describe('ReplyPanel', () => {
  it('starts from the opener with the enquiry’s own itinerary picked', () => {
    panel();
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe(
      'Tripsmith · your enquiry TS-ABC123',
    );
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toMatch(/^Hi Priya/);
    expect((screen.getByLabelText('Attach an itinerary') as HTMLSelectElement).value).toBe(
      'north-goa-beaches',
    );
    expect(screen.getByText(/No replies yet/)).toBeTruthy();
  });

  it('sends the reply with the chosen attachment and clears the box', async () => {
    adminRequest.mockResolvedValue({ messages: [sent] });
    panel();
    await userEvent.selectOptions(screen.getByLabelText('Attach an itinerary'), 'kasol-trek');
    await userEvent.type(screen.getByLabelText('Message'), 'See you soon.');
    await userEvent.click(screen.getByRole('button', { name: 'Send reply' }));

    const [path, init] = adminRequest.mock.calls[0]!;
    expect(path).toBe('/admin/enquiries/enq_1/reply');
    expect(init.body.packageSlug).toBe('kasol-trek');
    expect(init.body.body).toMatch(/\n\nSee you soon\.$/);
    expect(toast.success).toHaveBeenCalledWith('Reply sent');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toMatch(/^Re: /);
    expect(refresh).toHaveBeenCalled();
  });

  it('says so when the send failed', async () => {
    adminRequest.mockResolvedValue({ messages: [failed] });
    panel();
    await userEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(toast.error).toHaveBeenCalledWith('Not sent — Resend refused it');
  });

  it('shows the thread, marks a failed reply and sends it again', async () => {
    adminRequest.mockResolvedValue({ messages: [sent, { ...failed, sent: true, error: null }] });
    panel([sent, failed]);
    expect(screen.getByText(/North Goa Beaches itinerary/)).toBeTruthy();
    expect(screen.getByText(/Not sent · Resend refused it/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Send again' }));
    expect(adminRequest).toHaveBeenCalledWith('/admin/enquiries/enq_1/messages/m2/resend', {
      method: 'POST',
    });
    expect(toast.success).toHaveBeenCalledWith('Reply sent');
  });

  it('will not send without a message', async () => {
    panel();
    await userEvent.clear(screen.getByLabelText('Message'));
    await userEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(adminRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Write the reply');
  });
});
