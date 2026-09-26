'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { control } from '@/components/site/enquiry/Field';
import {
  type AccountBookingDetail,
  type AccountCancellation,
  askToCancel,
  istDay,
  refundTierIndex,
} from '@/lib/account';
import { formatDate, inr } from '@/lib/format';
import { CANCELLATION_SCHEDULE } from '@/lib/policies';

const MIN = 10;
const MAX = 500;

type Props = {
  bookingRef: string;
  status: AccountBookingDetail['status'];
  cancellation: AccountCancellation | null;
  canRequest: boolean;
  daysOut: number;
};

/**
 * The booking page's cancellation block (R19). The policy's three tiers with today's marked —
 * so the customer sees what a cancellation would refund before asking — then either the request
 * form, the request's state, or a line saying why there is nothing to ask. Asking cancels
 * nothing by itself: the owner decides (B11) and the booking keeps its seats meanwhile.
 */
export function CancelPanel({ bookingRef, status, cancellation, canRequest, daysOut }: Props) {
  const paid = status === 'confirmed' || status === 'partially_paid';
  const showTiers = paid && daysOut >= 0 && cancellation?.status !== 'approved';
  const today = refundTierIndex(daysOut);

  return (
    <section className="grid gap-4 rounded-card border border-line p-5" aria-labelledby="cancel">
      <h2 id="cancel" className="text-[18px]">
        Cancelling
      </h2>

      {showTiers && (
        <ol className="grid gap-1.5" aria-label="What a cancellation refunds">
          {CANCELLATION_SCHEDULE.map((tier, i) => {
            const now = i === today;
            return (
              <li
                key={tier.window}
                aria-current={now ? 'true' : undefined}
                className={`rounded-btn border px-3 py-2 text-[13px] leading-snug transition-colors ${
                  now ? 'border-ink bg-bg2 text-ink' : 'border-transparent text-mute'
                }`}
              >
                {now && (
                  <span className="label-caps mb-0.5 block text-primary-ink">
                    Today · {daysOut === 1 ? '1 day' : `${daysOut} days`} out
                  </span>
                )}
                <b className={now ? 'text-ink' : 'font-semibold'}>{tier.window}:</b> {tier.refund}
              </li>
            );
          })}
        </ol>
      )}

      {cancellation ? (
        <Asked c={cancellation} />
      ) : canRequest ? (
        <AskForm bookingRef={bookingRef} />
      ) : (
        <p className="text-[14px] text-ink2">{whyNot(status, daysOut)}</p>
      )}

      <Link href="/cancellation-policy" className="text-[13px] font-semibold">
        Cancellation & refunds policy
      </Link>
    </section>
  );
}

function whyNot(status: Props['status'], daysOut: number): string {
  if (status === 'pending') return 'This booking wasn’t paid, so there is nothing to cancel.';
  if (status === 'cancelled') return 'This booking is cancelled.';
  if (status === 'completed' || daysOut < 0)
    return 'This trip has left. If something went wrong, WhatsApp us.';
  return 'WhatsApp us about cancelling this booking.';
}

function Asked({ c }: { c: AccountCancellation }) {
  const on = formatDate(istDay(c.requestedAt));
  if (c.status === 'requested')
    return (
      <div
        className="grid gap-2 rounded-btn bg-warn-soft p-3.5 text-[14px] text-ink2"
        role="status"
      >
        <p>
          <b className="text-warn">You asked to cancel on {on}.</b> Nothing is cancelled yet — a
          person reads every request and replies within a day. Your seats are held meanwhile.
        </p>
        <p className="border-l-2 border-warn/40 pl-2.5 whitespace-pre-line text-ink">{c.reason}</p>
        <p className="text-[13px]">Changed your mind, or rather move the date? WhatsApp us.</p>
      </div>
    );
  const approved = c.status === 'approved';
  return (
    <div
      className={`grid gap-1.5 rounded-btn p-3.5 text-[14px] ${approved ? 'bg-bg2 text-ink2' : 'bg-primary-soft text-ink2'}`}
    >
      <b className="text-ink">
        {approved ? 'Cancelled at your request.' : 'We couldn’t cancel this booking.'}
      </b>
      {approved && c.refundPaise != null && (
        <p>
          {c.refundPaise > 0 ? (
            <>
              Refund: <b className="num text-ink">{inr(c.refundPaise)}</b> — to the way you paid,
              usually within 5–7 working days.
            </>
          ) : (
            'No refund under the policy at this stage.'
          )}
        </p>
      )}
      {c.refundNote && <p className="whitespace-pre-line">{c.refundNote}</p>}
      {c.resolvedAt && (
        <p className="text-[13px] text-mute">Decided {formatDate(istDay(c.resolvedAt))}</p>
      )}
    </div>
  );
}

function AskForm({ bookingRef }: { bookingRef: string }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Code points, as the api counts them — `.length` counts an emoji as two.
  const length = [...reason.trim()].length;

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-btn border-[1.5px] border-line px-4 py-2.5 text-sm font-bold transition-colors hover:border-warn hover:text-warn"
      >
        Ask to cancel this booking
      </button>
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (length < MIN) {
      setError(`Tell us a little more — at least ${MIN} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await askToCancel(bookingRef, reason.trim());
    if (!res.ok) {
      setBusy(false);
      setError(res.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-2.5 animate-rise" noValidate>
      <label htmlFor={`${id}-reason`} className="label-caps text-mute">
        Why are you cancelling?
      </label>
      <textarea
        id={`${id}-reason`}
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, MAX))}
        rows={4}
        maxLength={MAX}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint`}
        className={`${control} resize-y text-[15px]`}
      />
      <p id={`${id}-hint`} className="flex justify-between gap-3 text-xs text-mute">
        <span className={error ? 'font-semibold text-warn' : ''} role={error ? 'alert' : undefined}>
          {error ?? 'Nothing is cancelled until we reply — within a day.'}
        </span>
        <span className="num shrink-0">
          {length}/{MAX}
        </span>
      </p>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-btn bg-warn px-4 py-2.5 text-sm font-bold text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send request'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-btn px-3 py-2.5 text-sm font-semibold text-mute hover:text-ink"
        >
          Keep it
        </button>
      </div>
    </form>
  );
}
