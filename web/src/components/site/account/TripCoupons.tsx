'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { tickChecklistItem, type Readiness, type ReadinessPart } from '@/lib/account';
import { shortDate } from '@/lib/format';

/**
 * P9 (R49): every readiness part as a numbered tear-off coupon under the holiday pass — mockup
 * "My trip D". Details and balance open in place (their own forms inside); the trip's checklist
 * items tick straight from the coupon. A finished task tears off with a stamp into the "Torn
 * off" pile. P10 adds the trip pack and the calendar as two more coupons.
 */
export function TripCoupons({
  bookingRef,
  readiness,
  details,
  balance,
  locksOn,
  departs,
  balanceDueOn,
}: {
  bookingRef: string;
  readiness: Readiness;
  details: ReactNode;
  balance: ReactNode | null;
  locksOn: string;
  departs: string;
  balanceDueOn: string | null;
}) {
  const router = useRouter();
  const numbered = readiness.parts.map((part, n) => ({ part, n }));
  const firstTodo = numbered.find(({ part }) => !part.done && part.kind !== 'item')?.part.key;
  const [open, setOpen] = useState<string | null>(firstTodo ?? null);
  // Optimistic ticks, so the coupon tears off at once; the refresh brings the server's truth.
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [just, setJust] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const done = (p: ReadinessPart) => (p.kind === 'item' && p.key in ticks ? ticks[p.key] : p.done);

  async function tick(p: ReadinessPart, value: boolean) {
    if (busy.has(p.key)) return; // one request per item at a time
    setError(null);
    setBusy((b) => new Set(b).add(p.key));
    setTicks((t) => ({ ...t, [p.key]: value }));
    if (value) setJust(p.key);
    const res = await tickChecklistItem(bookingRef, p.key.replace(/^item:/, ''), value);
    setBusy((b) => {
      const next = new Set(b);
      next.delete(p.key);
      return next;
    });
    if (!res.ok) {
      // Back to the server's state: drop the override and the tear-off animation.
      setTicks((t) => {
        const rest = { ...t };
        delete rest[p.key];
        return rest;
      });
      setJust((j) => (j === p.key ? null : j));
      setError(res.error.message);
      return;
    }
    router.refresh();
  }

  const stub = (p: ReadinessPart) =>
    done(p)
      ? 'Torn off'
      : p.kind === 'details'
        ? `Locks ${shortDate(locksOn)}`
        : p.kind === 'balance'
          ? balanceDueOn
            ? `Due ${shortDate(balanceDueOn)}`
            : 'Due now'
          : `By ${shortDate(departs)}`;

  const body = (p: ReadinessPart) =>
    p.kind === 'details' ? details : p.kind === 'balance' ? balance : null;

  const coupon = ({ part: p, n }: { part: ReadinessPart; n: number }) => {
    const isDone = done(p);
    const isOpen = p.kind !== 'item' && open === p.key;
    const panel = `cp-${p.key.replace(/[^a-z0-9]/gi, '-')}`;
    const tone = isDone ? 'done' : p.fraction > 0 ? 'part' : 'todo';
    const verb = isOpen ? 'Close' : isDone ? 'View' : p.kind === 'balance' ? 'Pay' : 'Open';
    return (
      <li
        key={p.key}
        className={`hp-cp ${tone} ${isOpen ? 'open' : ''} ${just === p.key ? 'just' : ''}`}
      >
        <div className="hp-cp-stub">
          <span className={`num hp-cp-no ${tone}`}>{String(n + 1).padStart(2, '0')}</span>
          <small
            className={`text-[11.5px] font-bold ${!isDone && p.kind === 'balance' ? 'text-warn' : 'text-mute'}`}
          >
            {stub(p)}
          </small>
        </div>
        <div className="grid min-w-0 gap-3.5 px-3.5 py-3 md:px-4 md:py-3.5">
          <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
            <div className="grid min-w-0 flex-1 basis-[70%] md:basis-auto">
              <b className={`text-[15.5px] ${isDone ? 'text-ink2' : ''}`}>{p.label}</b>
              {p.note && <small className="text-[13px] text-mute">{p.note}</small>}
            </div>
            {isDone && (
              <span className="hp-stamp" aria-hidden>
                Torn
                <br />
                off
              </span>
            )}
            {p.kind === 'item' ? (
              <label className="hp-tick">
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={(e) => tick(p, e.target.checked)}
                  aria-label={`Done: ${p.label}`}
                />
                <span className="hp-tbox" aria-hidden>
                  <Check className="size-3.5" />
                </span>
                <span>{isDone ? 'Done' : 'Mark done'}</span>
              </label>
            ) : (
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => setOpen(isOpen ? null : p.key)}
                className="inline-flex shrink-0 items-center gap-1 text-[14px] font-bold text-primary hover:text-primary-ink"
              >
                {verb}
                <ChevronDown
                  className={`size-4 transition-transform duration-300 motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
            )}
          </div>
          {p.kind !== 'item' && (
            <div id={panel} hidden={!isOpen} className="hp-cp-body grid gap-3">
              {body(p)}
            </div>
          )}
        </div>
      </li>
    );
  };

  const live = numbered.filter(({ part }) => !done(part));
  const torn = numbered.filter(({ part }) => done(part));

  return (
    <section className="grid gap-3" aria-labelledby="coupons-h">
      <div>
        <h2 id="coupons-h" className="flex flex-wrap items-center gap-2 text-[20px]">
          Your coupons
          <span className="num rounded-chip bg-bg2 px-2.5 py-0.5 text-[13px] font-bold text-ink2">
            {live.length === 0 ? 'all torn off' : `${live.length} to tear off`}
          </span>
        </h2>
        <p className="mt-0.5 text-[14px] text-mute">
          Finish a task and its coupon tears off. Each stub shows the date it matters by.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-warn">
          {error}
        </p>
      )}
      {live.length > 0 && <ol className="m-0 grid list-none gap-2.5 p-0">{live.map(coupon)}</ol>}
      {torn.length > 0 && (
        <>
          <h3 className="label-caps mt-2.5 flex items-center gap-2">
            Torn off <span className="num">{torn.length}</span>
          </h3>
          <ol className="m-0 grid list-none gap-2.5 p-0">{torn.map(coupon)}</ol>
        </>
      )}
    </section>
  );
}
