import type { AdminBooking } from '@/lib/admin/booking-filters';
import { formatDate, inr } from '@/lib/format';

/**
 * Booking detail C · Lifecycle, and desk A's "next step" (R59, P20): a booking read as a state
 * machine. Everything here is derived from `GET /admin/bookings/{ref}` — the status, its flags
 * and the history (R54) — so the stepper, the moves and the panel can never disagree with the
 * api, which re-checks every move anyway.
 */

type Entry = AdminBooking['history']['entries'][number];
export type StepState = 'done' | 'now' | 'todo' | 'bad';
export interface Step {
  name: string;
  state: StepState;
  at: string | null;
  /** History kinds shown when this step is opened. */
  kinds: readonly string[];
}
export type MoveKey = 'mark-paid' | 'release' | 'refund-made' | 'approve' | 'reject';
export interface Move {
  key: MoveKey;
  title: string;
  becomes: string;
  tone: 'ok' | 'mute' | 'bad';
  effects: [string, string][];
}
export interface NextStep {
  tone: 'bad' | 'warn' | 'ok' | 'mute';
  title: string;
  text: string;
}

const PAID = ['payment.captured', 'payment.offline'];
const at = (entries: readonly Entry[], ...kinds: string[]) =>
  entries.find((e) => kinds.includes(e.kind))?.at ?? null;
const last = (entries: readonly Entry[], ...kinds: string[]) =>
  entries.findLast((e) => kinds.includes(e.kind))?.at ?? null;

export function lifecycle(b: AdminBooking): Step[] {
  const h = b.history.entries;
  const booked: Step = {
    name: 'Booked',
    state: 'done',
    at: b.bookedAt,
    kinds: ['booked', 'order.opened', 'hold.replaced', 'hold.undone', 'hold.restored'],
  };
  const failed: Step[] = h.some((e) => e.kind === 'payment.failed')
    ? [
        {
          name: 'Payment failed',
          state: 'bad',
          at: last(h, 'payment.failed'),
          kinds: ['payment.failed'],
        },
      ]
    : [];
  const paidAt = at(h, ...PAID);
  const paid = (name = 'Paid in full'): Step => ({
    name,
    state: 'done',
    at: paidAt,
    kinds: [...PAID, 'refund.flagged'],
  });
  const departs = (state: StepState): Step => ({
    name: 'Departs',
    state,
    at: `${b.departs}T00:00:00+05:30`,
    kinds: [],
  });
  const asked = b.cancellation;
  const askedStep = (state: StepState): Step => ({
    name: 'Cancel requested',
    state,
    at: asked?.requestedAt ?? null,
    kinds: ['cancellation.requested'],
  });
  const refunded = (): Step[] => [
    {
      name: 'Refunded',
      state: b.refundNeeded ? 'now' : 'done',
      at: b.refundNeeded ? null : last(h, 'refund.recorded'),
      kinds: ['refund.recorded'],
    },
    { name: 'Closed', state: b.refundNeeded ? 'todo' : 'now', at: null, kinds: [] },
  ];
  const owesOrRefunded = b.refundNeeded || h.some((e) => e.kind === 'refund.recorded');
  // A second payment on a live or finished booking: the refund owed is the step that stands.
  const surplus = b.refundNeeded ? refunded().slice(0, 1) : [];

  if (b.status === 'pending') {
    return [
      booked,
      ...failed,
      b.holdLive
        ? { name: 'Checkout open', state: 'now', at: b.holdExpiresAt, kinds: [] }
        : { name: 'Hold lapsed', state: 'now', at: b.holdExpiresAt, kinds: [] },
      { name: 'Paid', state: 'todo', at: null, kinds: PAID },
      departs('todo'),
    ];
  }
  if (b.status === 'confirmed' || b.status === 'partially_paid') {
    const open = asked?.status === 'requested';
    return [
      booked,
      ...failed,
      paid(b.status === 'partially_paid' ? 'Part paid' : 'Paid in full'),
      ...(asked ? [askedStep(open ? 'now' : 'done')] : []),
      ...(asked?.status === 'rejected'
        ? [
            {
              name: 'Request rejected',
              state: 'done' as const,
              at: asked.resolvedAt ?? null,
              kinds: ['cancellation.rejected'],
            },
          ]
        : []),
      ...surplus,
      departs(open || b.refundNeeded ? 'todo' : 'now'),
      { name: 'Completed', state: 'todo', at: null, kinds: ['trip.completed'] },
    ];
  }
  if (b.status === 'completed') {
    const openAsk = asked?.status === 'requested';
    return [
      booked,
      paid(),
      departs('done'),
      ...(openAsk ? [askedStep('now')] : []),
      ...surplus,
      {
        name: 'Completed',
        state: openAsk || b.refundNeeded ? 'done' : b.review ? 'done' : 'now',
        at: at(h, 'trip.completed'),
        kinds: ['trip.completed'],
      },
      ...(b.review
        ? [
            {
              name: 'Reviewed',
              state: 'now' as const,
              at: at(h, 'review.sent'),
              kinds: ['review.sent', 'review.published', 'review.hidden'],
            },
          ]
        : []),
    ];
  }
  // cancelled
  switch (b.cancelReason) {
    case 'seats_gone':
      return [
        booked,
        { name: 'Hold lapsed', state: 'done', at: b.holdExpiresAt, kinds: [] },
        paid('Paid late'),
        {
          name: 'Cancelled · seats gone',
          state: 'done',
          at: at(h, 'cancelled.seats_gone'),
          kinds: ['cancelled.seats_gone'],
        },
        ...refunded(),
      ];
    case 'cancellation_approved':
      return [
        booked,
        paid(b.paidPaise < b.totalPaise && !owesOrRefunded ? 'Part paid' : 'Paid in full'),
        askedStep('done'),
        {
          name: 'Cancelled · approved',
          state: owesOrRefunded ? 'done' : 'now',
          at: asked?.resolvedAt ?? null,
          kinds: ['cancellation.approved'],
        },
        // A ₹0 refund was agreed: nothing to refund, so no Refunded step.
        ...(owesOrRefunded ? refunded() : []),
      ];
    case 'hold_expired':
      return [
        booked,
        ...failed,
        { name: 'Hold lapsed', state: 'done', at: b.holdExpiresAt, kinds: [] },
        {
          name: 'Cancelled · abandoned',
          state: 'now',
          at: at(h, 'hold.expired'),
          kinds: ['hold.expired'],
        },
      ];
    case 'owner_released':
      return [
        booked,
        ...failed,
        {
          name: 'Released by you',
          state: b.refundNeeded ? 'done' : 'now',
          at: at(h, 'hold.released'),
          kinds: ['hold.released'],
        },
        ...(owesOrRefunded ? refunded() : []),
      ];
    default:
      return [booked, ...failed, { name: 'Cancelled', state: 'now', at: null, kinds: [] }];
  }
}

/** The single most useful thing to do next (desk A's side panel). */
export function nextStep(b: AdminBooking): NextStep {
  if (b.refundNeeded) {
    return {
      tone: 'bad',
      title: 'Refund to record',
      text: 'Refund it in the Razorpay dashboard, then press Refund made.',
    };
  }
  if (b.cancellation?.status === 'requested') {
    return {
      tone: 'warn',
      title: 'Answer the cancellation request',
      text: `Asked ${b.cancellation.daysOut} days out · the policy suggests ${inr(b.cancellation.suggestedRefundPaise)} back.`,
    };
  }
  if (b.status === 'pending' && b.holdLive) {
    return {
      tone: 'mute',
      title: 'Checkout open',
      text: 'The seats are held until the customer pays or the hold lapses.',
    };
  }
  if (b.canMarkPaid) {
    return {
      tone: 'warn',
      title: 'Never paid',
      text: b.seatsShort
        ? `The hold lapsed and the party is ${b.seatsShort} short now — release it, or wait for seats.`
        : b.canRelease
          ? 'The hold lapsed. If they paid by UPI or bank, mark it paid; otherwise release it.'
          : 'The checkout was abandoned. If they paid by UPI or bank, you can still mark it paid.',
    };
  }
  if (b.status === 'confirmed') {
    return { tone: 'ok', title: 'Nothing to do', text: `Departs ${formatDate(b.departs)}.` };
  }
  return { tone: 'mute', title: 'Nothing to do', text: 'This booking is closed.' };
}

/** Only the moves the api would accept now, each with what it changes. */
export function moves(b: AdminBooking): Move[] {
  const out: Move[] = [];
  const due = b.totalPaise - b.paidPaise;
  if (b.cancellation?.status === 'requested') {
    const c = b.cancellation;
    if (c.canApprove) {
      out.push({
        key: 'approve',
        title: 'Approve the cancellation',
        becomes: 'Cancelled · approved',
        tone: 'mute',
        effects: [
          ['Seats', `${b.travellers.length} back on sale at once`],
          [
            'Money',
            `The policy suggests ${inr(c.suggestedRefundPaise)} of ${inr(b.paidPaise)} — you set the amount`,
          ],
          ['Email', 'The customer gets your note'],
        ],
      });
    }
    out.push({
      key: 'reject',
      title: 'Reject the request',
      becomes:
        ({ confirmed: 'Confirmed', partially_paid: 'Part paid', completed: 'Completed' } as const)[
          b.status as 'confirmed' | 'partially_paid' | 'completed'
        ] ?? 'Unchanged',
      tone: 'ok',
      effects: [
        ['Seats', 'Stay booked'],
        ['Money', 'Nothing changes'],
        ['Email', 'The customer gets your reason; they can’t ask again'],
      ],
    });
  }
  if (b.canMarkPaid) {
    out.push({
      key: 'mark-paid',
      title: 'Mark paid offline',
      becomes: 'Confirmed',
      tone: 'ok',
      effects: [
        [
          'Seats',
          b.seatsShort
            ? `Re-checked — ${b.seatsShort} short right now, so it would be refused`
            : 'Re-checked first; the party fits',
        ],
        ['Money', `${inr(due)} recorded with your reference`],
        ['Email', 'Confirmation and voucher to the customer'],
      ],
    });
  }
  if (b.canRelease) {
    out.push({
      key: 'release',
      title: 'Release the hold',
      becomes: 'Cancelled · released',
      tone: 'bad',
      effects: [
        ['Seats', b.holdLive ? `${b.travellers.length} freed at once` : 'Already free'],
        ['Money', 'Nothing was paid'],
        ['Email', 'None'],
      ],
    });
  }
  if (b.refundNeeded) {
    out.push({
      key: 'refund-made',
      title: 'Record the refund',
      becomes: 'Refunded',
      tone: 'mute',
      effects: [
        ['Money', 'Refund in the Razorpay dashboard first; this records it and clears the flag'],
        ['Email', 'None'],
      ],
    });
  }
  return out;
}

/** The desk's other writes, and why each is unavailable now. */
export function blocked(b: AdminBooking): [string, string][] {
  const out: [string, string][] = [];
  if (!b.canMarkPaid) {
    out.push([
      'Mark paid offline',
      b.paidPaise >= b.totalPaise
        ? 'Already paid in full'
        : 'Only a booking still waiting for payment can be paid',
    ]);
  }
  if (!b.canRelease)
    out.push(['Release the hold', 'Only a pending booking holds seats to release']);
  if (!b.refundNeeded) out.push(['Record a refund', 'Nothing is owed back']);
  if (b.cancellation?.status !== 'requested') {
    out.push([
      'Answer a cancellation',
      b.cancellation ? `Already ${b.cancellation.status}` : 'No request from the customer',
    ]);
  }
  if (b.status === 'confirmed')
    out.push(['Mark completed', `The daily tidy does it after ${formatDate(b.departs)}`]);
  return out;
}
