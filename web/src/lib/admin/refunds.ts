import type { AdminBooking } from '@/lib/admin/booking-filters';

/**
 * P13 refunds as the desk reads them. The api decides and splits every refund; this only
 * previews the split in the approve confirm (the same newest-first rule, over each payment's
 * `refundablePaise`) and names where a booking's refunds stand.
 */

type Payment = AdminBooking['payments'][number];
export type Refund = AdminBooking['refunds'][number];

export interface SplitPart {
  paymentId: string;
  label: string;
  amountPaise: number;
  offline: boolean;
}

/** `amountPaise` taken from the newest payment first, as `refunds.plan_refund` does. */
export function splitNewestFirst(payments: readonly Payment[], amountPaise: number): SplitPart[] {
  let left = amountPaise;
  const out: SplitPart[] = [];
  const newest = [...payments]
    .filter((p) => p.refundablePaise > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  for (const p of newest) {
    if (left <= 0) break;
    const take = Math.min(p.refundablePaise, left);
    out.push({
      paymentId: p.id,
      label:
        p.provider === 'offline'
          ? `Offline${p.reference ? ` · ${p.reference}` : ''} — you hand it back`
          : `Razorpay · ${p.paymentId ?? p.orderId ?? 'payment'}`,
      amountPaise: take,
      offline: p.provider === 'offline',
    });
    left -= take;
  }
  return out;
}

/** What "Send refund" sends: every refund that never reached Razorpay, resent on its own
 *  payment under its own key, then whatever else is owed, split newest first. */
export function sendPreview(b: AdminBooking): SplitPart[] {
  const stuck = (b.refunds ?? []).filter(
    (r) => r.status === 'requested' && !r.byHand && r.razorpayRefundId === null,
  );
  const again = stuck.map((r) => {
    const p = b.payments.find((x) => x.id === r.paymentId);
    return {
      paymentId: `${r.id}`,
      label: `Razorpay · ${p?.paymentId ?? 'payment'} · sent again`,
      amountPaise: r.amountPaise,
      offline: false,
    };
  });
  const owed = b.refundToSendPaise - stuck.reduce((s, r) => s + r.amountPaise, 0);
  return [...again, ...splitNewestFirst(b.payments, owed)];
}

/** Flagged, with nothing to send or hand back (a pre-P13 flag): the owner can only clear it. */
export const staleFlag = (b: AdminBooking) =>
  b.refundNeeded && b.refundToSendPaise === 0 && b.refundOfflinePaise === 0;

/** A Razorpay refund Razorpay has accepted but not finished (live mode's `pending`). */
export const inFlight = (r: Refund) =>
  r.status === 'requested' && !r.byHand && r.razorpayRefundId !== null;

/** Why the last Razorpay try didn't go through, newest first — shown beside "Send refund". */
export function lastProblem(b: AdminBooking): string | null {
  const bad = [...(b.refunds ?? [])]
    .reverse()
    .find((r) => r.status === 'failed' || (r.status === 'requested' && r.error));
  return bad?.error ?? null;
}

export const REFUND_REASON: Record<string, string> = {
  cancellation: 'Cancellation',
  seats_gone: 'Seats gone',
  surplus: 'Money it no longer needed',
  owner: 'Owner',
  date_change: 'Date change',
  balance: 'Unpaid balance',
  addon: 'Add-on taken off',
};

export const REFUND_STATUS: Record<Refund['status'], string> = {
  requested: 'processing',
  processed: 'processed',
  failed: 'failed',
};
