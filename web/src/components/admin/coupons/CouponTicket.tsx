import Link from 'next/link';
import { Chip } from '@/components/admin/enquiries/InboxList';
import {
  boardHref,
  endsSoon,
  meter,
  perRupee,
  sparkPoints,
  tripsLabel,
  when,
} from '@/lib/admin/coupon-board';
import { type AdminCoupon, couponTerms, STATE_LABEL } from '@/lib/admin/coupon-schema';
import type { Tone } from '@/lib/admin/inbox';
import { lakh } from '@/lib/admin/money';
import { inr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ActiveToggle } from './ActiveToggle';
import { CopyCode } from './CopyCode';

export const STATE_TONE: Record<AdminCoupon['state'], Tone> = {
  active: 'ok',
  scheduled: 'info',
  paused: 'mute',
  expired: 'mute',
  used_up: 'warn',
};

function Spark({ weekly }: { weekly: number[] }) {
  const pts = sparkPoints(weekly);
  if (!pts) return null;
  return (
    <svg
      viewBox="0 0 112 30"
      preserveAspectRatio="none"
      aria-hidden
      className="h-[30px] w-[112px] shrink-0 overflow-visible"
    >
      <polygon points={`0,30 ${pts} 112,30`} className="fill-primary/10" />
      <polyline
        points={pts}
        className="fill-none stroke-primary"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Mockup Coupons B's ticket: the code and its terms on the stub, a perforation, then what it
 * earned — bookings, ₹ given back, bookings value per ₹1 given — a uses meter with checkout holds
 * shaded, eight weeks of uses, and the state, "Ends soon" and the on switch. The whole ticket
 * opens "what it did" (a stretched link); Copy and the switch sit above it.
 */
export function CouponTicket({ c, today, open }: { c: AdminCoupon; today: string; open: boolean }) {
  const ended = c.state === 'expired' || c.state === 'used_up';
  const m = meter(c);
  return (
    <article
      aria-label={`${c.code}, ${STATE_LABEL[c.state]}`}
      className={cn(
        'relative grid min-w-0 rounded-card border border-line bg-bg transition-[transform,box-shadow,border-color] duration-300 focus-within:border-primary hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-20px_rgba(20,32,42,.4)] motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        open && 'border-primary shadow-[inset_0_0_0_1px_var(--color-primary)]',
      )}
    >
      <div className="grid gap-1 px-[18px] pt-4 pb-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3
            className={cn(
              'min-w-0 truncate font-mono text-[20px] font-extrabold tracking-wide',
              ended && 'text-mute',
            )}
          >
            <Link
              href={open ? boardHref() : `${boardHref(c.id)}#did`}
              scroll={false}
              aria-expanded={open}
              className="text-inherit no-underline after:absolute after:inset-0 after:rounded-card focus-visible:outline-none"
            >
              {c.code}
            </Link>
          </h3>
          <CopyCode code={c.code} />
        </div>
        <p className="text-[16px] font-extrabold tracking-tight">
          {couponTerms(c)}
          {c.minPaise ? (
            <small className="ml-1 text-[12.5px] font-semibold text-mute">
              on {inr(c.minPaise)} or more
            </small>
          ) : null}
        </p>
        <p className="truncate text-[12.5px] text-mute">{tripsLabel(c)}</p>
      </div>
      <div aria-hidden className="relative mx-4 border-t-2 border-dashed border-line">
        <span className="absolute -top-[10px] -left-[27px] size-[18px] rounded-full border border-line bg-bg2 [clip-path:inset(0_0_0_50%)]" />
        <span className="absolute -top-[10px] -right-[27px] size-[18px] rounded-full border border-line bg-bg2 [clip-path:inset(0_50%_0_0)]" />
      </div>
      <dl className="grid grid-cols-3 gap-2 px-[18px] pt-3.5 pb-1">
        {(
          [
            ['Bookings', String(c.uses)],
            ['Given back', lakh(c.givenPaise)],
            ['Booked per ₹1', perRupee(c)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] font-bold text-mute">{k}</dt>
            <dd className="num truncate text-[18px] font-extrabold tracking-tight">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-end gap-3 px-[18px] pt-2 pb-3">
        <div className="grid min-w-0 flex-1 gap-1.5">
          {m && (
            <span
              aria-hidden
              className="relative block h-2 overflow-hidden rounded-full bg-bg2"
              data-meter={`${m.used}/${m.held}`}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{ width: `${m.used}%` }}
              />
              <span
                className="absolute inset-y-0 bg-action/70"
                style={{ left: `${m.used}%`, width: `${m.held}%` }}
              />
            </span>
          )}
          <span className="text-[12.5px] text-ink2">
            <b className="num">{c.uses}</b>
            {c.useLimit ? ` of ${c.useLimit.toLocaleString('en-IN')} used` : ' used · no limit'}
            {c.liveHolds > 0 && (
              <span className="font-bold text-warn"> · {c.liveHolds} in checkout</span>
            )}
          </span>
        </div>
        <Spark weekly={c.weekly} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line py-2.5 pr-3.5 pl-[18px]">
        <Chip tone={STATE_TONE[c.state]}>{STATE_LABEL[c.state]}</Chip>
        {endsSoon(c, today) && <Chip tone="warn">Ends soon</Chip>}
        <span className="min-w-0 flex-[1_1_120px] text-[12.5px] text-mute">{when(c, today)}</span>
        <span className="relative z-10 ml-auto">
          <ActiveToggle id={c.id} code={c.code} active={c.active} />
        </span>
      </div>
    </article>
  );
}
