import { ArrowRight, FileDown, Mail, MessageCircle, Phone, X } from 'lucide-react';
import Link from 'next/link';
import { istFullDate, istTime } from '@/components/admin/enquiries/ist-date';
import { buttonVariants } from '@/components/ui/button';
import { travellersLabel, voucherHref } from '@/lib/account';
import { manifestHref, type AdminBooking } from '@/lib/admin/booking-filters';
import { mailtoHref, telHref, waHref } from '@/lib/admin/enquiry-links';
import { nextStep } from '@/lib/admin/lifecycle';
import { formatDate, inr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DeskActions } from './DeskActions';
import { CancelRequested, RefundFlag, StateBadge } from './StateBadge';

const STEP_TONE = {
  bad: 'border-bad/30 bg-bad-soft',
  warn: 'border-warn/30 bg-warn-soft',
  ok: 'border-ok/30 bg-ok-soft',
  mute: 'border-line bg-bg2',
} as const;

/**
 * Mockup Bookings desk A's side panel: the booking picked in the list — who, the next step with
 * its button, the trip, the money and the latest history (R54) — so most bookings are handled
 * without leaving the desk. Rendered on the server from `?sel=`; `closeHref` drops it.
 */
export function DeskPanel({ b, closeHref }: { b: AdminBooking | null; closeHref: string }) {
  if (!b) {
    return (
      <aside className="grid place-items-center rounded-card border border-dashed border-line bg-bg p-8 text-center text-sm text-mute">
        Pick a booking to see its next step, money, seats and history here.
      </aside>
    );
  }
  const step = nextStep(b);
  const hello = `Hi ${b.leadName.split(' ')[0]}, this is Tripsmith about your booking ${b.ref} (${b.package.name}).`;
  const recent = b.history.entries.slice(-4).reverse();
  const left = b.departure.seatsLeft;
  const pct = (n: number) => `${Math.min(100, (n / Math.max(1, b.departure.seatsTotal)) * 100)}%`;
  return (
    <aside
      aria-label={`Booking ${b.ref}`}
      className="animate-rise grid gap-0 self-start rounded-card border border-line bg-bg lg:sticky lg:top-4"
    >
      <section className="grid gap-2 border-b border-line p-4">
        <div className="flex items-center justify-between gap-2 text-[12px] font-bold text-mute">
          <span className="font-mono tracking-wide">{b.ref}</span>
          <span>Booked {istFullDate(b.bookedAt)}</span>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close the panel"
            className="rounded-md p-1 text-mute hover:bg-bg2 hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </Link>
        </div>
        <h2 className="text-[20px] leading-tight font-extrabold">{b.leadName}</h2>
        <div className="flex flex-wrap gap-1">
          <StateBadge status={b.status} holdLive={b.holdLive} cancelReason={b.cancelReason} />
          {b.refundNeeded && <RefundFlag />}
          {b.cancellation?.status === 'requested' && <CancelRequested />}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <a
            href={telHref(b.leadPhone)}
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
          >
            <Phone className="size-4" aria-hidden /> Call
          </a>
          <a
            href={waHref(b.leadPhone, hello)}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
          >
            <MessageCircle className="size-4" aria-hidden /> WhatsApp
          </a>
          <a
            href={mailtoHref(b.leadEmail, `Your Tripsmith booking ${b.ref}`)}
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
          >
            <Mail className="size-4" aria-hidden /> Email
          </a>
        </div>
      </section>

      <section className="border-b border-line p-4">
        <div className={cn('grid gap-1.5 rounded-xl border p-3', STEP_TONE[step.tone])}>
          <b className="text-sm">{step.title}</b>
          <p className="text-[13px] text-ink2">{step.text}</p>
          {(b.canMarkPaid || b.canRelease || b.refundNeeded) && <DeskActions booking={b} />}
          {b.cancellation?.status === 'requested' && (
            <Link href={`/admin/bookings/${b.ref}`} className="text-[13px] font-bold text-primary">
              Answer it on the booking →
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-2 border-b border-line p-4 text-[13.5px]">
        <h3 className="label-caps text-[11px] text-mute">Trip</h3>
        <Facts
          rows={[
            ['Package', b.package.name],
            ['Departs', `${formatDate(b.departs)} → ${formatDate(b.returns)}`],
            ['Party', travellersLabel(b.travellers.length)],
          ]}
        />
        <div className="flex items-center gap-3">
          <span aria-hidden className="relative h-1.5 flex-1 overflow-hidden rounded-chip bg-line">
            <i
              className="absolute inset-y-0 left-0 bg-primary"
              style={{ width: pct(b.departure.booked) }}
            />
            <i
              className="absolute inset-y-0 bg-action"
              style={{ left: pct(b.departure.booked), width: pct(b.departure.held) }}
            />
          </span>
          <span className="text-[12px] whitespace-nowrap text-mute">
            {b.departure.booked} booked · {b.departure.held} held · {left} left
          </span>
          <Link
            href={manifestHref(b.departure.departureId)}
            target="_blank"
            className="text-[12.5px] font-bold text-primary"
          >
            Manifest
          </Link>
        </div>
      </section>

      <section className="grid gap-2 border-b border-line p-4 text-[13.5px]">
        <h3 className="label-caps text-[11px] text-mute">Money</h3>
        <Facts
          rows={[
            ['Total', inr(b.totalPaise)],
            ['Paid', inr(b.paidPaise)],
            ...(b.quote.coupon ? [['Coupon', b.quote.coupon.code] as [string, string]] : []),
            ...(b.status === 'pending' && b.holdLive
              ? [['Held until', istTime(b.holdExpiresAt)] as [string, string]]
              : []),
          ]}
        />
      </section>

      <section className="grid gap-2 border-b border-line p-4">
        <h3 className="label-caps flex justify-between text-[11px] text-mute">
          <span>History</span>
          <span className="tracking-normal normal-case">latest first</span>
        </h3>
        <ol className="grid gap-2">
          {recent.map((e) => (
            <li key={e.id} className="grid grid-cols-[auto_1fr] gap-x-2 text-[13px]">
              <time dateTime={e.at} className="num text-[12px] whitespace-nowrap text-mute">
                {e.approx ? '≈ ' : ''}
                {istTime(e.at)}
              </time>
              <span className="text-ink2">
                <b className="text-ink">{e.actorLabel}</b> {e.text}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-wrap gap-2 p-4">
        <Link href={`/admin/bookings/${b.ref}`} className={buttonVariants({ size: 'sm' })}>
          Open booking <ArrowRight className="size-4" aria-hidden />
        </Link>
        {b.hasVoucher && (
          <a href={voucherHref(b.ref)} className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
            <FileDown className="size-4" aria-hidden /> Voucher PDF
          </a>
        )}
      </section>
    </aside>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-mute">{k}</dt>
          <dd className="m-0 font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
