// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** P15b (R53) — Settings · Emails: switch a type, preview it with a booking, send a test; and the
 * booking's Emails panel. */

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => '/admin/settings/emails',
}));
const adminRequest = vi.fn(async (..._args: unknown[]) => ({ to: 'owner@example.com' }));
const adminGet = vi.fn(async (path: string, _q?: unknown) =>
  path.endsWith('/samples')
    ? { items: [{ ref: 'TB-7K2M9Q', label: 'TB-7K2M9Q · Asha Rao · Kasol · Fri 13 Nov 2099' }] }
    : {
        type: 'trip_pack',
        ref: 'TB-7K2M9Q',
        to: 'asha@example.com',
        subject: 'Your trip pack for Kasol — Fri 13 Nov 2099',
        html: '<p>3 days to go</p>',
        text: '3 days to go',
        attachments: ['Tripsmith-TB-7K2M9Q-trip-pack.pdf'],
        asOf: '2099-11-10',
      },
);
vi.mock('@/lib/admin/client', () => ({ adminRequest, adminGet }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { EmailSettingsBoard } = await import('../src/components/admin/emails/EmailSettingsBoard');
const { EmailsPanel } = await import('../src/components/admin/bookings/EmailsPanel');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const type = (t: string, label: string, over: object = {}) => ({
  type: t,
  label,
  trigger: `${label} trigger`,
  switchable: true,
  on: true,
  unsubscribable: false,
  recentSent: 2,
  ...over,
});
const SETTINGS = {
  types: [
    type('trip_pack', 'Trip pack'),
    type('review_request', 'Review request', { unsubscribable: true }),
    type('refund', 'Refund on its way', { switchable: false }),
  ],
  ownerEmail: 'owner@example.com',
  sendsAt: '09:00 IST',
} as never;

describe('EmailSettingsBoard', () => {
  it('switches a type off through the api; the refund email has no switch', async () => {
    const user = userEvent.setup();
    render(<EmailSettingsBoard settings={SETTINGS} />);
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    expect(screen.getByText('Always on')).toBeTruthy();
    expect(screen.getByText('Has an unsubscribe link')).toBeTruthy();
    await user.click(screen.getByRole('switch', { name: 'Trip pack on' }));
    await waitFor(() =>
      expect(adminRequest).toHaveBeenCalledWith('/admin/emails/trip_pack', {
        method: 'PUT',
        body: { on: false },
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('previews with a real booking in a sandboxed frame and sends a test', async () => {
    const user = userEvent.setup();
    render(<EmailSettingsBoard settings={SETTINGS} />);
    await user.click(screen.getAllByRole('button', { name: 'Preview' })[0]);
    const sheet = await screen.findByRole('dialog');
    await within(sheet).findByText('Your trip pack for Kasol — Fri 13 Nov 2099');
    expect(adminGet).toHaveBeenCalledWith('/admin/emails/trip_pack/preview', { ref: 'TB-7K2M9Q' });
    const frame = within(sheet).getByTitle('Trip pack preview');
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toBe('<p>3 days to go</p>');
    expect(within(sheet).getByText('Tripsmith-TB-7K2M9Q-trip-pack.pdf')).toBeTruthy();
    await user.click(within(sheet).getByRole('button', { name: 'Send test to me' }));
    await waitFor(() =>
      expect(adminRequest).toHaveBeenCalledWith('/admin/emails/trip_pack/test', {
        method: 'POST',
        body: { ref: 'TB-7K2M9Q' },
      }),
    );
  });
});

describe('EmailsPanel', () => {
  it('lists what is coming up, marks a switched-off one, and the latest sent', () => {
    render(
      <EmailsPanel
        upcoming={[
          {
            type: 'details_reminder',
            label: 'Traveller details reminder',
            on: '2099-10-30',
            switchOn: true,
            note: '2 still to fill in',
          },
          { type: 'trip_pack', label: 'Trip pack', on: '2099-11-10', switchOn: false, note: null },
        ]}
        history={
          [
            {
              id: 1,
              at: '2099-10-01T04:00:00Z',
              kind: 'email.sent',
              group: 'email',
              text: 'Emailed the customer: “Booking TB-7K2M9Q confirmed”',
            },
            {
              id: 2,
              at: '2099-10-01T04:00:00Z',
              kind: 'payment.captured',
              group: 'payment',
              text: 'Paid',
            },
          ] as never
        }
      />,
    );
    expect(screen.getByText('Traveller details reminder')).toBeTruthy();
    expect(screen.getByText(/2 still to fill in/)).toBeTruthy();
    expect(screen.getByText(/switched off/)).toBeTruthy();
    expect(screen.getByText('Sent · 1')).toBeTruthy();
    expect(screen.getByText('Booking TB-7K2M9Q confirmed')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Email settings' }).getAttribute('href')).toBe(
      '/admin/settings/emails',
    );
  });
});
