'use client';

import { addonDetail, lineLabel, type Quote } from '@/lib/booking';
import { inr } from '@/lib/format';
import { AnimatedPrice } from './AnimatedPrice';
import type { BookingFlow } from './use-booking';

/**
 * The receipt (B0 `.brk`, Book now B): the server's quote, line for line. Not one rupee is added
 * up here — the lines, the deal, the coupon (B15), the add-ons (P8) and the total are
 * `quoteBooking`'s, and the Razorpay order is made from the same quote on the server. With
 * add-ons, the trip fare after its discounts gets its own line and the add-ons follow at full
 * price. While a re-quote is in flight the last one stays, dimmed; a new line rises in.
 */
export function PriceBreakdown({ flow }: { flow: BookingFlow }) {
  const { quote, departure, reason } = flow;

  if (!departure || (reason && reason !== 'short'))
    return <p className="text-sm text-mute">Pick a date to see the price.</p>;
  if (reason === 'short')
    return <p className="text-sm text-mute">Choose a date with enough seats to see the price.</p>;
  if (quote.status === 'error')
    return (
      <p
        role="alert"
        className="rounded-[10px] bg-warn-soft px-2.5 py-2 text-[13px] font-bold text-warn"
      >
        {quote.message}
      </p>
    );

  const q: Quote | undefined =
    quote.status === 'ok' ? quote.quote : quote.status === 'loading' ? quote.last : undefined;
  if (!q) return <Skeleton />;
  const travellers = flow.party;
  const addons = q.addons ?? []; // an api from before P8 sends none (deploy race)

  return (
    <div
      aria-busy={quote.status === 'loading'}
      className={`grid gap-1.5 text-sm transition-opacity duration-200 ${quote.status === 'loading' ? 'opacity-55' : ''}`}
    >
      {q.lines.map((l) => (
        <div
          key={`${l.kind}-${l.occupancy}`}
          className={`flex justify-between gap-3 ${l.kind === 'deal' ? 'font-bold text-ok' : ''}`}
        >
          <span className={l.kind === 'deal' ? '' : 'text-ink2'}>
            {lineLabel(l, q.deal?.label)} · {l.count} × {l.unitPaise < 0 ? '−' : ''}
            {inr(Math.abs(l.unitPaise))}
          </span>
          <span className="num">
            {l.amountPaise < 0 ? '−' : ''}
            {inr(Math.abs(l.amountPaise))}
          </span>
        </div>
      ))}
      {q.coupon && (
        <div className="flex justify-between gap-3 font-bold text-ok">
          <span>
            Coupon <span className="font-mono tracking-wide">{q.coupon.code}</span>
          </span>
          <span className="num">−{inr(q.coupon.offPaise)}</span>
        </div>
      )}
      {addons.length > 0 && (
        <>
          <div className="mt-0.5 flex justify-between gap-3 border-t border-line pt-1.5 font-bold">
            <span>Trip fare</span>
            <span className="num">{inr(q.totalPaise - (q.addonsPaise ?? 0))}</span>
          </div>
          <p className="label-caps mt-1.5 text-[11px] text-mute">Add-ons · no discounts apply</p>
          {addons.map((a) => (
            <div key={a.addonId ?? a.name} className="flex justify-between gap-3 animate-rise">
              <span className="text-ink2">
                {a.name} · {addonDetail(a)}
              </span>
              <span className="num">{inr(a.amountPaise)}</span>
            </div>
          ))}
        </>
      )}
      <div className="mt-1 flex items-baseline justify-between border-t-[1.5px] border-ink pt-2.5">
        <span className="font-bold">Total</span>
        <AnimatedPrice paise={q.totalPaise} className="text-[28px] font-extrabold tracking-tight" />
      </div>
      <p className="num text-right text-[12.5px] font-semibold text-mute">
        {inr(Math.round(q.totalPaise / travellers))} per traveller
        {addons.length > 0 ? ', add-ons included' : ' · everything under Inclusions'}
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-hidden className="grid gap-2">
      {[70, 55, 85].map((w) => (
        <div key={w} className="h-4 animate-pulse rounded bg-bg2" style={{ width: `${w}%` }} />
      ))}
      <div className="mt-1 h-8 animate-pulse rounded bg-bg2" />
    </div>
  );
}
