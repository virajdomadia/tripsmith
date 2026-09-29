'use client';

import Link from 'next/link';
import { daysBetween } from '@/lib/account';
import { formatDate, inr } from '@/lib/format';
import type { BookingFlow } from './use-booking';

/** The balance falls due this many days before departure (api services/booking/deposit.py). */
export const BALANCE_DAYS = 30;

/**
 * R43 (P5), Book now B's "How you pay": pay in full, or reserve with 25 % now and pay the
 * balance by 30 days before departure. Both amounts are the server's (`quote.deposit`); a date
 * whose balance would already be due shows the deposit struck through with the reason, and a
 * trip that has deposits switched off shows no choice at all. Native radios, so arrow keys and
 * screen readers work as for any radio group.
 */
export function PayChoice({ flow }: { flow: BookingFlow }) {
  const { depositOffer, pay, setPay, departure, today, quote } = flow;
  const q = quote.status === 'ok' ? quote.quote : quote.status === 'loading' ? quote.last : null;
  if (!departure || !q) return null;
  const daysOut = daysBetween(today, departure.date);
  if (!depositOffer && daysOut > BALANCE_DAYS) return null; // switched off for this trip
  return (
    <fieldset className="grid gap-2" aria-busy={quote.status === 'loading'}>
      <legend className="label-caps mb-2 text-mute">How you pay</legend>
      <Option
        value="full"
        checked={pay === 'full'}
        onPick={() => setPay('full')}
        title="Pay in full"
        amount={q.totalPaise}
        note="Nothing more to pay. Your voucher is ready straight away."
      />
      {depositOffer ? (
        <Option
          value="deposit"
          checked={pay === 'deposit'}
          onPick={() => setPay('deposit')}
          title={`Reserve with ${depositOffer.percent}% now`}
          amount={depositOffer.amountPaise}
          note={
            <>
              Balance <span className="num">{inr(depositOffer.balancePaise)}</span> due by{' '}
              {formatDate(depositOffer.dueOn)} — 30 days before departure. Pay it in parts from My
              trips.
            </>
          }
          split={depositOffer.percent}
        />
      ) : (
        <div
          aria-disabled
          className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 rounded-btn border-[1.5px] border-dashed border-line bg-bg2 p-3 text-mute"
        >
          <span aria-hidden className="size-[18px] rounded-full border-2 border-line bg-bg" />
          <b className="text-[15px]">Reserve with 25% now</b>
          <span className="text-[12.5px] font-bold">Not for this date</span>
          <small className="col-start-2 col-end-4 text-[12.5px] leading-snug font-medium text-ink2">
            {formatDate(departure.date)} is {daysOut} days away. A balance is due 30 days before
            departure, so this date is paid in full.
          </small>
        </div>
      )}
      {pay === 'deposit' && depositOffer && (
        <p className="text-[12.5px] leading-snug text-mute">
          We remind you 7 and 3 days before {formatDate(depositOffer.dueOn)}. Unpaid 2 days after
          that, the booking is cancelled under the{' '}
          <Link href="/cancellation-policy" className="text-primary">
            cancellation policy
          </Link>
          .
        </p>
      )}
    </fieldset>
  );
}

function Option({
  value,
  checked,
  onPick,
  title,
  amount,
  note,
  split,
}: {
  value: string;
  checked: boolean;
  onPick: () => void;
  title: string;
  amount: number;
  note: React.ReactNode;
  split?: number;
}) {
  return (
    <label
      className={`grid cursor-pointer grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 rounded-btn border-[1.5px] p-3 transition-[border-color,background-color,box-shadow] duration-200 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary/30 ${
        checked
          ? 'border-primary bg-primary-soft shadow-[inset_0_0_0_1px_var(--color-primary)]'
          : 'border-line bg-bg hover:border-ink'
      }`}
    >
      <input
        type="radio"
        name="pay"
        value={value}
        checked={checked}
        onChange={onPick}
        className="sr-only"
      />
      <span
        aria-hidden
        className={`size-[18px] rounded-full border-2 bg-bg transition-[border-color,box-shadow] duration-200 ${
          checked
            ? 'border-primary shadow-[inset_0_0_0_4px_var(--color-primary)]'
            : 'border-[#8c99a6]'
        }`}
      />
      <b className="text-[15px]">{title}</b>
      <span className="num text-[15px] font-bold">{inr(amount)}</span>
      <small className="col-start-2 col-end-4 text-[12.5px] leading-snug font-medium text-ink2">
        {note}
      </small>
      {split !== undefined && (
        <span
          aria-hidden
          className="col-start-2 col-end-4 mt-1 flex h-1.5 overflow-hidden rounded-full bg-[#d8e1f4]"
        >
          <i className="block bg-action" style={{ width: `${split}%` }} />
        </span>
      )}
    </label>
  );
}
