import type { AdminBooking } from '@/lib/admin/booking-filters';
import type { CounterPackage } from '@/lib/admin/counter';
import { addonDetail, isDiscountLine, lineLabel, type Quote } from '@/lib/booking';
import { formatDate, inr } from '@/lib/format';
import { cn } from '@/lib/utils';

type Row = { label: string; sub?: string; paise: number; tone?: 'neg' | 'sub' | 'bad' };

function rows(q: Quote, reason: string): Row[] {
  const out: Row[] = [];
  for (const l of q.lines) {
    if (isDiscountLine(l)) continue;
    out.push({
      label: lineLabel(l),
      sub: `${l.count} × ${inr(l.unitPaise)}`,
      paise: l.amountPaise,
    });
  }
  for (const l of q.lines.filter(isDiscountLine))
    out.push({
      label: lineLabel(l, q.deal?.label),
      sub: `${l.count} × ${inr(Math.abs(l.unitPaise))}`,
      paise: l.amountPaise,
      tone: 'neg',
    });
  if (q.coupon)
    out.push({ label: `Coupon ${q.coupon.code}`, paise: -q.coupon.offPaise, tone: 'neg' });
  if (q.manual)
    out.push({
      label: `Manual discount${q.manual.percent ? ` · ${q.manual.percent}%` : ''}`,
      sub: reason || 'Reason required: it prints on the invoice',
      paise: -q.manual.offPaise,
      tone: reason ? 'neg' : 'bad',
    });
  out.push({ label: 'Fares after discounts', paise: q.totalPaise - q.addonsPaise, tone: 'sub' });
  for (const a of q.addons) out.push({ label: a.name, sub: addonDetail(a), paise: a.amountPaise });
  return out;
}

const money = (paise: number) => (paise < 0 ? `−${inr(-paise)}` : inr(paise));

/**
 * Mockup C's receipt: the server's quote as a printed till slip — dotted leaders, the total
 * between rules, the deposit split under it — stamped "Paid" or "Deposit paid" once booked.
 * It only ever shows `quoteCounterBooking`'s numbers (or, once booked, the booking's own).
 */
export function Receipt({
  quote: live,
  loading,
  error,
  pkg,
  date,
  customer,
  state,
  reason,
  footer,
  done,
  waiting,
}: {
  quote: Quote | null;
  loading: boolean;
  error: string | null;
  pkg: CounterPackage | null;
  date: string | null;
  customer: string | null;
  state: string | null;
  reason: string;
  footer: string;
  done: AdminBooking | null;
  /** What the quote still waits for, when nothing can be priced yet. */
  waiting: string;
}) {
  const quote = done ? done.quote : live;
  const stamp = !done
    ? null
    : done.status === 'pending'
      ? 'Link sent'
      : done.status === 'cancelled'
        ? 'Cancelled'
        : done.status === 'partially_paid'
          ? 'Deposit paid'
          : 'Paid';
  const karnataka = !state || state === 'Karnataka';
  return (
    <div className="ctr-rc relative text-[13.5px]" aria-busy={loading}>
      {stamp && (
        <span
          className={cn(
            'ctr-stamp',
            (done?.status === 'pending' || done?.status === 'cancelled') && 'wait',
          )}
          role="status"
        >
          {stamp}
        </span>
      )}
      <header className="grid justify-items-center gap-0.5 border-b-2 border-dashed border-[#d9cfbb] pb-3 text-center">
        <span className="inline-flex items-center gap-2 text-[17px] font-extrabold tracking-[0.14em] uppercase">
          <i className="size-3 rounded-full bg-action shadow-[0_0_0_4px_var(--color-primary)]" />
          Tripsmith
        </span>
        <span className="text-[11.5px] font-bold tracking-[0.1em] text-mute uppercase">
          Counter quote · {done ? done.ref : 'draft'}
        </span>
      </header>
      <dl className="my-3 grid gap-0.5 text-[12.5px]">
        {(
          [
            ['Trip', pkg?.name ?? '—'],
            ['Departs', date ? formatDate(date) : '—'],
            ['For', customer ?? '—'],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex gap-2.5">
            <dt className="w-16 flex-none text-mute">{k}</dt>
            <dd className="m-0 min-w-0 font-bold break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {quote ? (
        <div className={cn('transition-opacity', loading && !done && 'opacity-60')}>
          <div className="grid gap-1.5 border-t-2 border-dashed border-[#d9cfbb] pt-3">
            {rows(quote, done ? (quote.manual?.reason ?? '') : reason).map((r) => (
              <div
                key={`${r.label}-${r.sub ?? ''}`}
                className={cn(
                  'flex items-baseline gap-1.5',
                  r.tone === 'sub' && 'pt-1 font-extrabold',
                )}
              >
                <span className="max-w-[70%] min-w-0">
                  {r.label}
                  {r.sub && (
                    <small
                      className={cn(
                        'block text-[11px] text-mute',
                        r.tone === 'bad' && 'font-bold text-bad',
                      )}
                    >
                      {r.sub}
                    </small>
                  )}
                </span>
                <i className="min-w-3 flex-1 -translate-y-1 border-b-[1.5px] border-dotted border-[#c8bea8]" />
                <b
                  className={cn(
                    'num whitespace-nowrap',
                    (r.tone === 'neg' || r.tone === 'bad') && 'text-ok',
                  )}
                >
                  {money(r.paise)}
                </b>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-baseline justify-between border-y-2 border-ink py-2">
            <span className="text-[12.5px] font-extrabold tracking-[0.12em] uppercase">Total</span>
            <b className="num text-[28px] tracking-tight" aria-live="polite">
              {inr(done ? done.totalPaise : quote.totalPaise)}
            </b>
          </div>
          <p className="mt-1.5 text-[11.5px] text-mute">
            Includes 5% GST · {karnataka ? 'CGST + SGST (Karnataka)' : `IGST (${state})`} · SAC
            998555
          </p>
          <div className="mt-3 grid gap-1 text-[13px]">
            {done?.paymentLink && done.status === 'pending' ? (
              <div className="flex justify-between">
                <span className="text-mute">
                  Payment link{done.paymentLink.amountPaise < done.totalPaise ? ' · deposit' : ''}
                </span>
                <b className="num">{inr(done.paymentLink.amountPaise)}</b>
              </div>
            ) : done ? (
              <>
                <div className="flex justify-between">
                  <span className="text-mute">
                    {done.status === 'partially_paid' ? 'Deposit paid' : 'Paid in full'}
                  </span>
                  <b className="num">{inr(done.paidPaise)}</b>
                </div>
                {done.balance && done.balance.balancePaise > 0 && (
                  <div className="flex justify-between">
                    <span className="text-mute">Balance by {formatDate(done.balance.dueOn)}</span>
                    <b className="num">{inr(done.balance.balancePaise)}</b>
                  </div>
                )}
              </>
            ) : quote.deposit ? (
              <>
                <div className="flex justify-between">
                  <span className="text-mute">Deposit today ({quote.deposit.percent}%)</span>
                  <b className="num">{inr(quote.deposit.amountPaise)}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">Balance by {formatDate(quote.deposit.dueOn)}</span>
                  <b className="num">{inr(quote.deposit.balancePaise)}</b>
                </div>
              </>
            ) : (
              <p className="text-mute">Pay in full: the deposit closes 30 days before departure.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="border-t-2 border-dashed border-[#d9cfbb] pt-3 text-mute">
          {loading ? 'Pricing…' : waiting}
        </p>
      )}
      {error && !done && (
        <p
          role="alert"
          className="mt-3 rounded-[10px] bg-bad-soft px-2.5 py-2 text-[12.5px] font-bold text-bad"
        >
          {error}
        </p>
      )}
      <footer className="mt-3.5 text-center text-[11px] tracking-[0.04em] text-mute">
        Priced by the server, same as the website · {footer}
      </footer>
    </div>
  );
}
