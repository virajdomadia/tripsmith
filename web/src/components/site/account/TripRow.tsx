import { FileDown } from 'lucide-react';
import Link from 'next/link';
import {
  type AccountBooking,
  bookingState,
  type Tone,
  travellersLabel,
  voucherHref,
} from '@/lib/account';
import { formatDate, inr } from '@/lib/format';

const PILL: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  primary: 'bg-primary-soft text-primary-ink',
  mute: 'bg-bg2 text-mute',
};

const EDGE: Record<Tone, string> = {
  ok: 'before:bg-ok',
  warn: 'before:bg-warn',
  primary: 'before:bg-primary',
  mute: 'before:bg-line',
};

/** One booking on My trips: state, the trip, when, who, what was paid, and the voucher. */
export function TripRow({ booking: b, index }: { booking: AccountBooking; index: number }) {
  const state = bookingState(b);
  const paid = b.paidPaise > 0;
  return (
    <li
      className={`relative grid gap-4 overflow-hidden rounded-card border border-line bg-bg p-5 pl-6 animate-rise before:absolute before:inset-y-0 before:left-0 before:w-1.5 sm:grid-cols-[1fr_auto] sm:items-center ${EDGE[state.tone]}`}
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
    >
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-chip px-2.5 py-0.5 text-[12px] font-bold ${PILL[state.tone]}`}>
            {state.label}
          </span>
          <span className="rounded-md border border-dashed border-[#c4cfde] bg-bg2 px-2 py-0.5 text-[12px] font-extrabold tracking-[0.06em] text-ink">
            {b.ref}
          </span>
        </div>
        <h2 className="text-[20px] leading-snug">
          <Link
            href={`/packages/${b.packageSlug}`}
            className="text-ink no-underline hover:underline"
          >
            {b.packageName}
          </Link>
        </h2>
        <p className="text-[14px] text-ink2">
          {b.destination} · Departs{' '}
          <b className="font-semibold text-ink">{formatDate(b.departs)}</b> ·{' '}
          {travellersLabel(b.travellers)}
        </p>
      </div>

      <div className="grid gap-2 sm:justify-items-end">
        <p className="num text-[14px] text-mute">
          {paid ? 'Paid ' : 'Total '}
          <b className="text-[18px] font-extrabold text-ink">
            {inr(paid ? b.paidPaise : b.totalPaise)}
          </b>
        </p>
        {b.hasVoucher && (
          <a
            href={voucherHref(b.ref)}
            download
            className="inline-flex items-center justify-center gap-2 rounded-btn bg-primary px-4 py-2.5 text-sm font-bold text-white no-underline transition-colors hover:bg-primary-ink"
          >
            <FileDown className="size-4" aria-hidden /> Voucher (PDF)
          </a>
        )}
      </div>
    </li>
  );
}
