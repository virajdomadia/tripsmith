'use client';

import { useState } from 'react';
import { equation, lakh, LINE_WORD, net, scale, tick, type MoneyDesk } from '@/lib/admin/money';
import { formatDate, inr, MONTHS } from '@/lib/format';
import { cn } from '@/lib/utils';

const UP = 150;
const DOWN = 56;
const HATCH_RED =
  'bg-[repeating-linear-gradient(135deg,var(--color-bad)_0_2px,var(--color-bad-soft)_2px_5px)] border border-bad';
const CHIP = {
  in: 'bg-ok-soft text-ok',
  out: 'bg-bg2 text-mute',
  owe: 'bg-bad-soft text-bad',
} as const;

/**
 * Mockup Dashboard C: the cash equation (collected − refunds [+ live holds] = kept) and the
 * cash-by-day chart — solid bars for money in, red below the axis for refunds recorded, hatched
 * red for refunds still to record. Tap a day to read its payments by name. On a phone the
 * equation becomes 2 × 2 and the chart scrolls sideways.
 */
export function CashDesk({ money }: { money: MoneyDesk }) {
  const [holds, setHolds] = useState(false);
  const [sel, setSel] = useState(money.today);
  const eq = equation(money, holds);
  const month = MONTHS[Number(money.monthStart.slice(5, 7)) - 1];
  const bar = scale(money.days, UP, DOWN);
  const day = money.days.find((d) => d.date === sel) ?? money.days.at(-1)!;
  const dayNet = net(day.lines);

  return (
    <div className="grid gap-3.5">
      <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] font-bold">
        <input
          type="checkbox"
          checked={holds}
          onChange={(e) => setHolds(e.target.checked)}
          className="size-4 accent-primary"
        />
        Count live holds as coming in
        <span className="font-semibold text-mute">
          · {money.holds.length} · {inr(money.holdsPaise)}
        </span>
      </label>

      <div
        aria-label="Cash equation"
        className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-bg sm:grid-cols-4"
      >
        <Term
          k={`Collected in ${month}`}
          v={lakh(eq.collected)}
          d={`${inr(eq.collected)} · ${money.collectedCount} payment${money.collectedCount === 1 ? '' : 's'}`}
        />
        <Term
          sign="−"
          k="Refunds"
          v={lakh(eq.refunds)}
          tone="text-bad"
          d={`${inr(money.refundedPaise)} recorded · ${inr(money.toRecordPaise)} to record`}
        />
        <Term
          sign="+"
          k="Live holds"
          v={lakh(eq.holds)}
          tone="text-ok"
          d={holds ? `${money.holds.length} checkouts still open` : 'Not counted — tick above'}
        />
        <Term
          sign="="
          k={`Kept in ${month}, if all goes to plan`}
          v={lakh(eq.kept)}
          d={inr(eq.kept)}
          dark
        />
      </div>

      <section className="rounded-card border border-line bg-bg" aria-labelledby="cash-by-day">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3">
          <h2 id="cash-by-day" className="text-[15px] font-extrabold">
            Cash by day
            <span className="ml-1.5 font-semibold text-mute">
              · {formatDate(money.windowStart)} to today · tap a day
            </span>
          </h2>
          <ul className="ml-auto flex flex-wrap gap-3.5 text-[12px] font-semibold text-mute">
            <Legend swatch="bg-primary">Collected</Legend>
            <Legend swatch="bg-[#d9534a]">Refunded</Legend>
            <Legend swatch={HATCH_RED}>Refund to record</Legend>
          </ul>
        </header>
        <div className="px-4 pt-2 pb-4">
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[640px] gap-[3px]"
              style={{ gridTemplateColumns: `repeat(${money.days.length}, minmax(12px, 1fr))` }}
            >
              {money.days.map((d, i) => {
                const h = bar(d);
                const on = d.date === sel;
                const isToday = d.date === money.today;
                return (
                  <button
                    key={d.date}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${formatDate(d.date)}: in ${inr(d.inPaise)}, out ${inr(d.outPaise + d.owePaise)}`}
                    onClick={() => setSel(d.date)}
                    className={cn(
                      'group grid cursor-pointer rounded-md transition-colors',
                      on ? 'bg-primary-soft' : 'hover:bg-bg2',
                    )}
                    style={{ gridTemplateRows: `${UP}px 1px ${DOWN}px 18px` }}
                  >
                    <span className="flex flex-col justify-end">
                      {h.in > 0 && (
                        <i
                          className="origin-bottom animate-[grow_.5s_var(--ease-out)_both] rounded-t-[3px] bg-primary motion-reduce:animate-none"
                          style={{ height: h.in, animationDelay: `${i * 12}ms` }}
                        />
                      )}
                    </span>
                    <span className="bg-ink/35" />
                    <span className="flex flex-col justify-start gap-px">
                      {h.out > 0 && (
                        <i className="rounded-b-[3px] bg-[#d9534a]" style={{ height: h.out }} />
                      )}
                      {h.owe > 0 && (
                        <i className={cn('rounded-b-[3px]', HATCH_RED)} style={{ height: h.owe }} />
                      )}
                    </span>
                    <span
                      className={cn(
                        'num pt-1 text-center text-[10px] font-bold whitespace-nowrap',
                        isToday ? 'rounded bg-bad text-white' : 'text-mute',
                      )}
                    >
                      {tick(d.date, money.today)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            aria-live="polite"
            className="mt-3 grid gap-1.5 rounded-xl bg-bg2 px-3.5 py-3 text-[13.5px]"
          >
            <h3 className="flex flex-wrap justify-between gap-2 text-sm font-extrabold">
              <span>
                {formatDate(day.date)}
                {day.date === money.today && ' · today'}
              </span>
              {day.lines.length > 0 && (
                <span className="num">
                  Net {dayNet < 0 ? '−' : '+'}
                  {inr(Math.abs(dayNet))}
                </span>
              )}
            </h3>
            {day.lines.length === 0 ? (
              <span className="text-mute">No money moved on this day.</span>
            ) : (
              day.lines.map((l, i) => (
                <div key={`${l.ref}-${l.kind}-${i}`} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    {l.name} · <span className="font-mono text-[12.5px]">{l.ref}</span> · {l.label}{' '}
                    <span
                      className={cn(
                        'rounded-chip px-2 py-px text-[11.5px] font-bold',
                        CHIP[l.kind],
                      )}
                    >
                      {LINE_WORD[l.kind]}
                    </span>
                  </span>
                  <b className="num whitespace-nowrap">
                    {l.kind === 'in' ? '+' : '−'}
                    {inr(l.amountPaise)}
                  </b>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Term({
  k,
  v,
  d,
  sign,
  tone,
  dark,
}: {
  k: string;
  v: string;
  d: string;
  sign?: string;
  tone?: string;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative grid gap-0.5 border-line px-4 py-4 [&:nth-child(n+2)]:border-l max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t',
        dark && 'bg-ink text-white',
      )}
    >
      {sign && (
        <span
          aria-hidden
          className="absolute top-1/2 -left-3 z-[1] hidden size-[22px] -translate-y-1/2 place-items-center rounded-full border border-line bg-bg text-sm font-extrabold text-mute sm:grid"
        >
          {sign}
        </span>
      )}
      <span className={cn('text-[12px] font-bold', dark ? 'text-ink-soft' : 'text-mute')}>
        {sign && (
          <span className="sr-only">
            {sign === '−' ? 'minus ' : sign === '+' ? 'plus ' : 'equals '}
          </span>
        )}
        {k}
      </span>
      <span className={cn('num text-[26px] font-extrabold tracking-tight sm:text-[28px]', tone)}>
        {v}
      </span>
      <span className={cn('text-[12.5px] font-semibold', dark ? 'text-ink-soft' : 'text-mute')}>
        {d}
      </span>
    </div>
  );
}

function Legend({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <i aria-hidden className={cn('inline-block size-[11px] rounded-[3px]', swatch)} />
      {children}
    </li>
  );
}
