import Image from 'next/image';
import type { AccountBookingDetail, Readiness } from '@/lib/account';
import { daysBetween } from '@/lib/account';
import { duration, formatDate, inr, shortDate } from '@/lib/format';

/**
 * P9 (R49): the booking as a holiday pass — mockup "My trip D". The dark pass carries the trip,
 * when, who and the balance; its perforated stub holds the countdown, one punch hole per
 * readiness part (punched one by one on load) and a barcode drawn from the booking ref. Shown
 * while the trip is paid for and ahead; other states keep the photo header.
 */
export function HolidayPass({
  b,
  readiness,
  state,
}: {
  b: AccountBookingDetail;
  readiness: Readiness;
  state: { label: string };
}) {
  const days = Math.max(daysBetween(b.today, b.departs), 0);
  const left = readiness.parts.filter((p) => !p.done).length;
  const owed = b.totalPaise - b.paidPaise;
  const adults = b.travellers.filter((t) => t.occupancy !== 'child').length;
  const children = b.travellers.length - adults;
  const who = [
    `${adults} adult${adults === 1 ? '' : 's'}`,
    children ? `${children} child${children === 1 ? '' : 'ren'}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const label = `Readiness ${readiness.percent} percent: ${readiness.parts
    .map((p) => `${p.label} ${p.done ? 'done' : p.fraction > 0 ? 'partly done' : 'to do'}`)
    .join(', ')}`;

  return (
    <header className="hp-pass relative mt-4 grid overflow-hidden rounded-[22px] bg-ink text-white">
      <div className="relative h-[130px] md:h-auto">
        {b.coverUrl && (
          <Image
            src={b.coverUrl}
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 200px, 100vw"
            className="object-cover opacity-90"
          />
        )}
      </div>
      <div className="grid min-w-0 content-start gap-3.5 p-[18px] md:px-[26px] md:py-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span className="text-[11px] font-extrabold tracking-[0.16em] text-[#afc0d0] uppercase">
            Tripsmith · Holiday pass
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded-chip bg-action px-2.5 py-0.5 text-[12px] font-bold text-ink">
              {state.label}
            </span>
            <span className="rounded-md border border-dashed border-white/40 px-2 py-0.5 text-[12px] font-extrabold tracking-[0.06em]">
              {b.ref}
            </span>
          </span>
        </div>
        <div>
          <h1 className="text-[clamp(26px,3.6vw,40px)] leading-[1.05] tracking-[-0.03em] text-white">
            {b.packageName}
          </h1>
          <p className="mt-1 text-[14px] font-semibold text-[#afc0d0]">
            {b.destination} · {duration(b.nights, b.days)} · from {b.departureCity}
          </p>
        </div>
        <dl className="m-0 grid grid-cols-2 gap-x-[18px] gap-y-3 border-t border-white/15 pt-3.5 md:grid-cols-3">
          <Meta k="Depart" v={formatDate(b.departs)} />
          <Meta k="Return" v={formatDate(b.returns)} />
          <Meta k="Travellers" v={who} />
          <Meta k="Trip leader" v={b.leaderName ?? 'Named in your trip pack'} />
          <Meta
            k="Meeting point"
            v={
              b.pack?.content?.meeting?.place ??
              (b.pack ? `In the trip pack, ${shortDate(b.pack.opensOn)}` : b.departureCity)
            }
          />
          <Meta
            k="Balance"
            v={
              owed > 0
                ? `${inr(owed)} due${b.balance?.dueOn ? ` ${formatDate(b.balance.dueOn)}` : ''}`
                : 'Paid in full'
            }
            due={owed > 0}
          />
        </dl>
      </div>
      <div className="hp-stub relative grid min-w-0 content-between items-center gap-x-[18px] gap-y-3.5 bg-[#1b2a36] p-[18px] md:p-[22px]">
        <div className="grid">
          <small className="text-[11px] font-extrabold tracking-[0.14em] text-[#afc0d0] uppercase">
            Leaves in
          </small>
          <b className="num text-[56px] leading-[0.95] tracking-[-0.05em] text-action md:text-[72px]">
            {days}
          </b>
          <span className="text-[16px] font-extrabold">{days === 1 ? 'day' : 'days'}</span>
        </div>
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-[7px]" role="img" aria-label={label}>
            {readiness.parts.map((p, i) => (
              <span
                key={p.key}
                className={`hp-hole ${p.done ? 'done' : p.fraction > 0 ? 'part' : ''}`}
                style={
                  {
                    '--i': i,
                    '--f': `${Math.round(p.fraction * 100)}%`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <small className="num text-[12.5px] font-bold text-[#d6dee6]">
            {readiness.percent}% ready ·{' '}
            {left === 0 ? 'all set' : `${left} coupon${left === 1 ? '' : 's'} left`}
          </small>
        </div>
        <Barcode text={b.ref} />
      </div>
    </header>
  );
}

function Meta({ k, v, due }: { k: string; v: string; due?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-bold tracking-[0.12em] text-[#afc0d0] uppercase">{k}</dt>
      <dd className={`m-0 mt-0.5 text-[14px] font-bold ${due ? 'text-action' : ''}`}>{v}</dd>
    </div>
  );
}

/** Bars from the ref's characters — decoration (aria-hidden), the same every render. */
function Barcode({ text }: { text: string }) {
  const widths = [...text.replace(/-/g, '')].flatMap((c) => {
    const n = c.charCodeAt(0);
    return [1 + (n % 3), 1 + ((n >> 2) % 2)];
  });
  return (
    <div className="hp-bars col-span-full flex h-[30px] gap-[2px] md:h-10" aria-hidden>
      {widths.map((w, i) => (
        <i key={i} className={i % 2 ? 'gap' : ''} style={{ flexGrow: w }} />
      ))}
    </div>
  );
}
