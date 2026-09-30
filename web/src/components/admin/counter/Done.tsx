import { ArrowRight, Check, FileDown, Plus } from 'lucide-react';
import Link from 'next/link';
import { istTime } from '@/components/admin/enquiries/ist-date';
import { Documents } from '@/components/site/account/Documents';
import { buttonVariants } from '@/components/ui/button';
import { travellersLabel, voucherHref } from '@/lib/account';
import type { AdminBooking } from '@/lib/admin/booking-filters';
import { CHANNEL_LABEL } from '@/lib/admin/counter';
import { formatDate, inr } from '@/lib/format';

/**
 * After booking: what happened, in the booking's own words — confirmed or on its deposit, the
 * receipt (and the invoice once paid in full), the voucher, and the history's first lines.
 * The emails have gone out as for a web booking.
 */
export function Done({ booking: b, onNew }: { booking: AdminBooking; onNew: () => void }) {
  const deposit = b.status === 'partially_paid';
  const outline = buttonVariants({ size: 'sm', variant: 'outline' });
  return (
    <section
      className="ctr-big grid gap-3.5 rounded-[20px] border border-line bg-bg p-5 sm:p-6"
      aria-labelledby="ctr-done-title"
    >
      <div className="flex flex-wrap gap-1.5 text-[12px] font-bold">
        <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2.5 py-0.5 text-ok">
          <Check className="size-3.5" aria-hidden />
          {deposit ? 'Deposit paid · seats held' : 'Confirmed'}
        </span>
        <span className="rounded-full bg-bg2 px-2.5 py-0.5 text-ink2">{b.ref}</span>
        <span className="rounded-full bg-bg2 px-2.5 py-0.5 text-ink2">
          {CHANNEL_LABEL[b.channel ?? 'web']}
          {b.createdBy ? ` · ${b.createdBy}` : ''}
        </span>
      </div>
      <h2 id="ctr-done-title" className="text-[24px] leading-tight font-extrabold">
        Booked for {b.leadName}
      </h2>
      <p className="text-[14px] text-ink2">
        {b.package.name} · {formatDate(b.departs)} · {travellersLabel(b.travellers.length)} ·{' '}
        {deposit && b.balance
          ? `${inr(b.paidPaise)} deposit in, ${inr(b.balance.balancePaise)} balance due ${formatDate(b.balance.dueOn)}`
          : `${inr(b.paidPaise)} paid in full`}
        . The confirmation, voucher and receipt went to {b.leadEmail}.
      </p>
      <Documents bookingRef={b.ref} documents={b.documents} />
      <ol className="grid gap-1 border-t border-line pt-3 text-[13px]">
        {b.history.entries.slice(0, 5).map((e) => (
          <li key={e.id} className="grid grid-cols-[48px_minmax(0,1fr)] gap-2">
            <span className="num text-mute">{istTime(e.at)}</span>
            <span className="min-w-0 break-words">
              <b>{e.actorLabel}</b> · {e.text}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/bookings/${b.ref}`} className={buttonVariants({ size: 'sm' })}>
          Open booking {b.ref}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
        <a href={voucherHref(b.ref)} className={outline}>
          <FileDown className="size-4" aria-hidden />
          Voucher PDF
        </a>
        <button type="button" onClick={onNew} className={outline}>
          <Plus className="size-4" aria-hidden />
          New booking
        </button>
      </div>
    </section>
  );
}
