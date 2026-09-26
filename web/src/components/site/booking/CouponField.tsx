'use client';

import { Check, TicketPercent, X } from 'lucide-react';
import { inr } from '@/lib/format';
import { control } from '../enquiry/Field';
import type { BookingFlow } from './use-booking';

/**
 * "Have a code?" under the price (B15, R26). The server decides everything: an applied code
 * shows as a chip once the quote carries it; a refused one shows the server's reason here and
 * the price stays without it. Codes are case-insensitive, so the input upper-cases as you type.
 */
export function CouponField({ flow }: { flow: BookingFlow }) {
  const { coupon, quote } = flow;
  const q = quote.status === 'ok' ? quote.quote : null;
  const applied = coupon.applied && q?.coupon?.code === coupon.applied ? q.coupon : null;
  const checking = !!coupon.applied && quote.status === 'loading';

  if (applied)
    return (
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="inline-flex items-center gap-1.5 rounded-chip bg-ok-soft px-2.5 py-1 font-bold text-ok">
          <Check className="size-3.5" aria-hidden />
          <span className="font-mono tracking-wide">{applied.code}</span> applied ·{' '}
          <span className="num">−{inr(applied.offPaise)}</span>
        </span>
        <button
          type="button"
          onClick={flow.removeCoupon}
          className="inline-flex items-center gap-1 font-semibold text-mute underline-offset-2 hover:text-ink hover:underline"
        >
          <X className="size-3.5" aria-hidden /> Remove
        </button>
      </div>
    );

  if (!coupon.open)
    return (
      <button
        type="button"
        onClick={flow.openCoupon}
        className="inline-flex items-center gap-1.5 justify-self-start text-[13px] font-semibold text-primary underline-offset-2 hover:underline"
      >
        <TicketPercent className="size-4" aria-hidden /> Have a code?
      </button>
    );

  return (
    <form
      className="grid gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        flow.applyCoupon();
      }}
    >
      <label htmlFor="coupon" className="text-[13px] font-semibold text-ink2">
        Coupon code
      </label>
      <div className="flex gap-2">
        <input
          id="coupon"
          className={`${control} font-mono tracking-wide uppercase`}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          placeholder="WELCOME10"
          value={coupon.draft}
          aria-invalid={coupon.error ? true : undefined}
          aria-describedby={coupon.error ? 'coupon-error' : undefined}
          onChange={(e) => flow.setCouponDraft(e.target.value.toUpperCase())}
        />
        <button
          type="submit"
          disabled={!coupon.draft.trim() || checking}
          aria-busy={checking}
          className="rounded-btn border border-line px-4 text-[14px] font-bold text-ink transition-colors hover:border-ink disabled:opacity-45"
        >
          {checking ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {coupon.error && (
        <p id="coupon-error" role="alert" className="text-[13px] font-semibold text-warn">
          {coupon.error}
        </p>
      )}
    </form>
  );
}
