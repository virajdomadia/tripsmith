// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { History } from '@/components/admin/bookings/History';
import { Activity } from '@/components/site/account/Activity';
import {
  byDay,
  changes,
  countByChip,
  toneOf,
  type BookingHistory,
  type HistoryEntry,
} from '@/lib/history';

afterEach(() => {
  cleanup();
});

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 1,
  at: '2026-09-22T06:12:00Z',
  kind: 'booked',
  group: 'booking',
  actor: 'customer',
  actorLabel: 'Customer',
  text: 'Booked online · 2 travellers · ₹11,998',
  customerVisible: true,
  before: null,
  after: null,
  rebuilt: false,
  approx: false,
  ...over,
});

describe('history helpers', () => {
  it('counts each chip and groups entries by their IST day', () => {
    const list = [
      entry(),
      entry({ id: 2, group: 'payment', at: '2026-09-22T18:40:00Z' }), // 00:10 IST next day
      entry({ id: 3, group: 'email', at: '2026-09-22T18:41:00Z' }),
    ];
    expect(countByChip(list)).toEqual({ all: 3, booking: 1, payment: 1, email: 1 });
    const days = byDay(list, (iso) =>
      new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    );
    expect(days.map((d) => [d.day, d.entries.length])).toEqual([
      ['2026-09-22', 1],
      ['2026-09-23', 2],
    ]);
  });

  it('words what changed and skips entries that only record where things ended', () => {
    expect(
      changes({ status: 'pending', paidPaise: 0 }, { status: 'confirmed', paidPaise: 1_199_800 }),
    ).toEqual(['Status: pending → confirmed', 'Paid: ₹0 → ₹11,998']);
    expect(changes(null, { status: 'pending' })).toEqual([]);
    expect(changes({ status: 'confirmed' }, { status: 'confirmed' })).toEqual([]);
  });

  it('colours money in green and trouble red or amber', () => {
    expect(toneOf('payment.captured')).toBe('ok');
    expect(toneOf('payment.failed')).toBe('bad');
    expect(toneOf('refund.flagged')).toBe('bad');
    expect(toneOf('hold.expired')).toBe('warn');
    expect(toneOf('booked')).toBe('primary');
    expect(toneOf('email.sent')).toBe('mute');
  });
});

const history = (entries: HistoryEntry[], rebuiltOn: string | null = null): BookingHistory => ({
  entries,
  rebuiltOn,
});

describe('History (desk)', () => {
  it('filters by chip, marks what the customer sees and shows what changed', () => {
    render(
      <History
        history={history([
          entry(),
          entry({
            id: 2,
            kind: 'payment.offline',
            group: 'payment',
            actor: 'owner',
            actorLabel: 'Meera N.',
            text: 'Marked paid offline · ₹11,998 · UTR 44',
            before: { status: 'pending', paidPaise: 0 },
            after: { status: 'confirmed', paidPaise: 1_199_800 },
          }),
          entry({
            id: 3,
            kind: 'email.sent',
            group: 'email',
            actor: 'system',
            actorLabel: 'System',
            text: 'Emailed the owner: “New booking”',
            customerVisible: false,
          }),
        ])}
      />,
    );
    const list = screen.getByRole('list', { name: 'History' });
    expect(within(list).getAllByText(/Booked online|Marked paid|Emailed/)).toHaveLength(3);
    expect(
      within(list).getByText('Status: pending → confirmed · Paid: ₹0 → ₹11,998'),
    ).toBeDefined();
    expect(within(list).getAllByText('(the customer sees this)')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /Payments/ }));
    expect(screen.getByRole('button', { name: /Payments/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    const payments = screen.getByRole('list', { name: 'History' });
    expect(within(payments).queryByText(/Booked online/)).toBeNull();
    expect(within(payments).getByText('Meera N.')).toBeDefined();
  });

  it('puts the rebuilt divider after the last rebuilt entry and marks approximate times', () => {
    render(
      <History
        history={history(
          [
            entry({ rebuilt: true }),
            entry({ id: 2, kind: 'hold.expired', rebuilt: true, approx: true }),
            entry({ id: 3, kind: 'review.sent', at: '2026-09-28T06:00:00Z' }),
          ],
          '2026-09-27T12:00:00Z',
        )}
      />,
    );
    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    const divider = items.findIndex((t) => t.startsWith('↑ Rebuilt from records'));
    expect(items[divider]).toContain('the log started on Sun 27 Sep 2026');
    expect(items.findIndex((t) => t.includes('Booked online'))).toBeLessThan(divider);
    expect(screen.getAllByLabelText('about')).toHaveLength(1);
  });
});

describe('Activity (My trips)', () => {
  it('lists the customer wording by day and hides itself when empty', () => {
    const { container } = render(<Activity entries={[]} />);
    expect(container.innerHTML).toBe('');
    render(
      <Activity
        entries={[
          {
            at: '2026-09-22T06:12:00Z',
            kind: 'booked',
            group: 'booking',
            text: 'You booked 2 travellers · ₹11,998',
            approx: false,
          },
          {
            at: '2026-09-22T06:14:00Z',
            kind: 'email.sent',
            group: 'email',
            text: 'We emailed you: “Booking confirmed”',
            approx: false,
          },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeDefined();
    expect(screen.getByText('Tue 22 Sep 2026')).toBeDefined();
    expect(screen.getByText('We emailed you: “Booking confirmed”')).toBeDefined();
  });
});
