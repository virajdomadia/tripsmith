'use client';

import { CircleAlert } from 'lucide-react';
import { WhatsApp } from '@/components/site/home/icons';
import type { BookingOrder, PaymentResult } from '@/lib/booking';
import { whatsappHref } from '@/lib/business';
import { formatDate, inr } from '@/lib/format';

type Props = {
  pkg: { name: string; destination: string };
  order: BookingOrder;
  /** Absent while the payment is taken but the confirm call has not come back. */
  result?: PaymentResult;
  lead: string;
  travellers: string;
  confirming?: boolean;
  onRetry?: () => void;
  onStartOver: () => void;
};

const WA_BTN =
  'inline-flex items-center justify-center gap-2 rounded-btn bg-wa px-4 py-3 font-bold text-white no-underline transition-[filter] hover:brightness-110';

/**
 * The end of the sheet (B0 success, trimmed to B5: the voucher and emails arrive in B7). Three
 * honest outcomes — confirmed; paid too late for the last seats (cancelled + refund, R16); and
 * paid but not yet confirmed by us — each with the reference to quote on WhatsApp.
 */
export function BookingDone({
  pkg,
  order,
  result,
  lead,
  travellers,
  confirming,
  onRetry,
  onStartOver,
}: Props) {
  const ref = order.bookingRef;
  const paid = inr(order.amountPaise);
  const wa = whatsappHref(`Hi Tripsmith, about my booking ${ref} (${pkg.name}).`);

  if (result?.status === 'cancelled' && result.refundNeeded)
    return (
      <div className="grid gap-5 animate-rise" role="status">
        <div className="grid size-14 place-items-center rounded-2xl bg-warn-soft text-warn">
          <CircleAlert className="size-7" />
        </div>
        <h2 className="text-[28px]">We couldn’t hold your seat.</h2>
        <p className="text-[16px] leading-relaxed text-ink2">
          Your payment reached us after your 10-minute hold had ended, and the last seats on{' '}
          {formatDate(order.quote.date)} had gone by then.{' '}
          <b className="text-ink">Your {paid} will be refunded within 5–7 days</b> to the way you
          paid — nothing for you to do.
        </p>
        <RefChip ref_={ref} />
        <div className="grid gap-2 sm:grid-cols-2">
          <a href={wa} target="_blank" rel="noopener" className={WA_BTN}>
            <WhatsApp className="size-4.5" /> WhatsApp us
          </a>
          <button
            type="button"
            onClick={onStartOver}
            className="rounded-btn border-[1.5px] border-line px-4 py-3 font-bold transition-colors hover:border-ink"
          >
            Pick another date
          </button>
        </div>
      </div>
    );

  if (result?.status === 'confirmed' || result?.status === 'completed')
    return (
      <div className="grid gap-5" role="status">
        <div className="grid size-14 place-items-center rounded-2xl bg-ok-soft text-ok">
          <svg
            viewBox="0 0 24 24"
            className="size-7"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" className="tick-draw" pathLength={1} />
          </svg>
        </div>
        <h2 className="text-[30px] animate-rise">You’re going to {pkg.destination}.</h2>
        <p className="text-[16px] leading-relaxed text-ink2 animate-rise [animation-delay:80ms]">
          Booking <RefChip ref_={ref} inline /> is confirmed and paid. Keep the reference — quote it
          whenever you talk to us.
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-card border border-line p-4 animate-rise [animation-delay:160ms]">
          <Fact k="Trip" v={pkg.name} wide />
          <Fact k="Departs" v={formatDate(order.quote.date)} />
          <Fact k="Paid" v={paid} num />
          <Fact k="Travellers" v={travellers} />
          <Fact k="Lead" v={lead} />
        </dl>
        <a
          href={wa}
          target="_blank"
          rel="noopener"
          className={`${WA_BTN} animate-rise [animation-delay:240ms]`}
        >
          <WhatsApp className="size-4.5" /> WhatsApp us about this trip
        </a>
        <p className="rounded-btn bg-primary-soft px-3 py-2.5 text-[13px] leading-relaxed text-primary-ink">
          <b>Demo site.</b> This was a Razorpay test payment — no money moved, and no trip is
          booked.
        </p>
      </div>
    );

  // Paid at Razorpay; our confirmation has not come back (or said something unexpected).
  return (
    <div className="grid gap-5" role="status">
      <div className="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
        <CircleAlert className="size-7" />
      </div>
      <h2 className="text-[28px]">Payment received — confirming your booking.</h2>
      <p className="text-[16px] leading-relaxed text-ink2">
        Razorpay took your payment of {paid}.{' '}
        {confirming
          ? 'We’re checking it now…'
          : 'We couldn’t confirm it just yet. Try again in a moment, or WhatsApp us the reference and we’ll sort it out by hand.'}
      </p>
      <RefChip ref_={ref} />
      <div className="grid gap-2 sm:grid-cols-2">
        {onRetry && (
          <button
            type="button"
            disabled={confirming}
            onClick={onRetry}
            className="rounded-btn bg-action px-4 py-3 font-bold transition-colors hover:bg-action-ink disabled:opacity-50"
          >
            {confirming ? 'Checking…' : 'Check again'}
          </button>
        )}
        <a href={wa} target="_blank" rel="noopener" className={WA_BTN}>
          <WhatsApp className="size-4.5" /> WhatsApp us
        </a>
      </div>
    </div>
  );
}

function RefChip({ ref_, inline }: { ref_: string; inline?: boolean }) {
  return (
    <span
      className={`${inline ? 'inline-block' : 'justify-self-start'} rounded-lg border border-dashed border-[#c4cfde] bg-bg2 px-2.5 py-1 font-extrabold tracking-[0.06em] text-ink`}
    >
      {ref_}
    </span>
  );
}

function Fact({ k, v, num, wide }: { k: string; v: string; num?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="label-caps">{k}</dt>
      <dd className={`m-0 font-bold ${num ? 'num' : ''}`}>{v}</dd>
    </div>
  );
}
