import { describe, expect, it } from 'vitest';
import { deskHref, parseDeskFilters, type AdminBooking } from '@/lib/admin/booking-filters';
import { blocked, lifecycle, moves, nextStep } from '@/lib/admin/lifecycle';

type Entry = AdminBooking['history']['entries'][number];
const entry = (kind: string, at: string, id = 1): Entry => ({
  id,
  at,
  kind,
  group: 'booking',
  actor: 'system',
  actorLabel: 'System',
  text: kind,
  customerVisible: false,
  before: null,
  after: null,
  rebuilt: false,
  approx: false,
});

const booking = (over: Partial<AdminBooking> = {}): AdminBooking =>
  ({
    ref: 'TB-7K2M9Q',
    status: 'pending',
    cancelReason: null,
    refundNeeded: false,
    holdExpiresAt: '2026-09-26T10:40:00Z',
    holdLive: false,
    bookedAt: '2026-09-26T10:30:00Z',
    departs: '2026-10-18',
    returns: '2026-10-22',
    travellers: [
      { name: 'Kavya Iyer', age: 31, occupancy: 'double' },
      { name: 'Ravi Iyer', age: 33, occupancy: 'double' },
    ],
    totalPaise: 59_397_00,
    paidPaise: 0,
    canMarkPaid: true,
    canRelease: true,
    seatsShort: 0,
    cancellation: null,
    review: null,
    history: { entries: [entry('booked', '2026-09-26T10:30:00Z')], rebuiltOn: null },
    ...over,
  }) as AdminBooking;

const names = (b: AdminBooking) => lifecycle(b).map((s) => `${s.name}:${s.state}`);

describe('lifecycle', () => {
  it('a lapsed hold stands at "Hold lapsed", with a failed attempt marked bad', () => {
    const b = booking({
      history: {
        entries: [
          entry('booked', '2026-09-26T10:30:00Z'),
          entry('payment.failed', '2026-09-26T10:33:00Z', 2),
        ],
        rebuiltOn: null,
      },
    });
    expect(names(b)).toEqual([
      'Booked:done',
      'Payment failed:bad',
      'Hold lapsed:now',
      'Paid:todo',
      'Departs:todo',
    ]);
    expect(moves(b).map((m) => m.key)).toEqual(['mark-paid', 'release']);
    expect(nextStep(b).title).toBe('Never paid');
    expect(blocked(b).map(([what]) => what)).toEqual(['Record a refund', 'Answer a cancellation']);
  });

  it('a confirmed booking with an open request waits on the owner', () => {
    const b = booking({
      status: 'confirmed',
      paidPaise: 59_397_00,
      canMarkPaid: false,
      canRelease: false,
      cancellation: {
        id: 'c1',
        status: 'requested',
        reason: 'My father has surgery',
        requestedAt: '2026-09-26T12:00:00Z',
        daysOut: 22,
        tier: '50 % retained',
        suggestedRefundPaise: 29_698_00,
        canApprove: true,
      } as AdminBooking['cancellation'],
      history: {
        entries: [
          entry('booked', '2026-09-12T10:00:00Z'),
          entry('payment.captured', '2026-09-12T10:04:00Z', 2),
        ],
        rebuiltOn: null,
      },
    });
    expect(names(b)).toEqual([
      'Booked:done',
      'Paid in full:done',
      'Cancel requested:now',
      'Departs:todo',
      'Completed:todo',
    ]);
    expect(moves(b).map((m) => m.key)).toEqual(['approve', 'reject']);
    expect(nextStep(b)).toMatchObject({ tone: 'warn', title: 'Answer the cancellation request' });
    expect(moves(b)[0]!.effects[1]![1]).toContain('₹29,698 of ₹59,397');
  });

  it('seats gone runs through Refunded to Closed, and the refund is the only move', () => {
    const b = booking({
      status: 'cancelled',
      cancelReason: 'seats_gone',
      refundNeeded: true,
      paidPaise: 57_996_00,
      canMarkPaid: false,
      canRelease: false,
    });
    expect(names(b)).toEqual([
      'Booked:done',
      'Hold lapsed:done',
      'Paid late:done',
      'Cancelled · seats gone:done',
      'Refunded:now',
      'Closed:todo',
    ]);
    expect(moves(b).map((m) => m.key)).toEqual(['refund-made']);
    expect(nextStep(b).tone).toBe('bad');
  });

  it('a completed, reviewed trip ends at "Reviewed" with nothing to decide', () => {
    const b = booking({
      status: 'completed',
      paidPaise: 59_397_00,
      canMarkPaid: false,
      canRelease: false,
      review: { rating: 5, text: 'Lovely', state: 'published' } as AdminBooking['review'],
    });
    expect(names(b).slice(-2)).toEqual(['Completed:done', 'Reviewed:now']);
    expect(moves(b)).toEqual([]);
  });
});

describe('lifecycle edge cases', () => {
  const request = (
    status: 'requested' | 'approved' | 'rejected',
    refundPaise: number | null = null,
  ) =>
    ({
      id: 'c1',
      status,
      reason: 'Change of plans',
      requestedAt: '2026-09-26T12:00:00Z',
      resolvedAt: status === 'requested' ? null : '2026-09-27T09:00:00Z',
      refundPaise,
      daysOut: 10,
      tier: 'No refund',
      suggestedRefundPaise: 0,
      canApprove: status === 'requested',
    }) as AdminBooking['cancellation'];

  it('an approved cancellation with no refund ends there, with no Refunded step', () => {
    const b = booking({
      status: 'cancelled',
      cancelReason: 'cancellation_approved',
      paidPaise: 59_397_00,
      canMarkPaid: false,
      canRelease: false,
      cancellation: request('approved', 0),
    });
    expect(names(b).slice(-2)).toEqual(['Cancel requested:done', 'Cancelled · approved:now']);
  });

  it('a confirmed booking paid twice stands at the refund it owes', () => {
    const b = booking({
      status: 'confirmed',
      paidPaise: 2 * 59_397_00,
      refundNeeded: true,
      canMarkPaid: false,
      canRelease: false,
    });
    expect(names(b)).toContain('Refunded:now');
    expect(moves(b).map((m) => m.key)).toEqual(['refund-made']);
  });

  it('a completed trip with an open request stands at the request, and reject keeps it completed', () => {
    const b = booking({
      status: 'completed',
      paidPaise: 59_397_00,
      canMarkPaid: false,
      canRelease: false,
      cancellation: request('requested'),
    });
    expect(names(b)).toContain('Cancel requested:now');
    expect(moves(b).find((m) => m.key === 'reject')?.becomes).toBe('Completed');
  });

  it('an abandoned checkout is only offered Mark paid, and the advice says so', () => {
    const b = booking({
      status: 'cancelled',
      cancelReason: 'hold_expired',
      canMarkPaid: true,
      canRelease: false,
    });
    expect(moves(b).map((m) => m.key)).toEqual(['mark-paid']);
    expect(nextStep(b).text).not.toContain('release');
  });
});

describe('the desk remembers the open booking in the URL', () => {
  it('keeps ?sel= on the desk, drops a malformed one, never sends it to the CSV', () => {
    const f = parseDeskFilters({ status: 'pending', sel: 'TB-7K2M9Q' });
    expect(f.sel).toBe('TB-7K2M9Q');
    expect(deskHref(f, {})).toBe('/admin/bookings?status=pending&sel=TB-7K2M9Q');
    expect(deskHref(f, {}, '/api/admin/bookings.csv')).toBe(
      '/api/admin/bookings.csv?status=pending',
    );
    expect(parseDeskFilters({ sel: 'nope' }).sel).toBeUndefined();
  });
});
