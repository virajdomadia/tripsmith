import { FileDown, MapPinned, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {
  type AccountBooking,
  bookingState,
  countdown,
  tabOf,
  type Tone,
  travellersLabel,
  voucherHref,
} from '@/lib/account';
import { Stars } from '@/components/site/Stars';
import { formatDate, inr } from '@/lib/format';

export const PILL: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  primary: 'bg-primary-soft text-primary-ink',
  mute: 'bg-bg2 text-mute',
};

export const detailHref = (ref: string) => `/account/bookings/${encodeURIComponent(ref)}`;

/**
 * One booking on My trips (B0 mockup `.brow`): cover photo, the trip (linking to its booking
 * page), when and who, then the state and what to do next — the countdown and voucher for an
 * upcoming trip, "we reply within a day" once a cancellation is asked for, and a dimmed row for
 * a checkout that lapsed unpaid.
 */
export function TripRow({
  booking: b,
  today,
  index,
}: {
  booking: AccountBooking;
  today: string;
  index: number;
}) {
  const state = bookingState(b);
  const tab = tabOf(b, today);
  const lapsed = b.status === 'pending' && tab === 'cancelled';
  const paid = b.paidPaise > 0;
  return (
    <li
      className={`relative grid grid-cols-[72px_1fr] gap-x-4 gap-y-3 rounded-card border border-line bg-bg p-4 animate-rise sm:grid-cols-[96px_1fr_auto] sm:items-center ${tab === 'cancelled' ? 'opacity-70' : ''}`}
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
    >
      <div className="relative size-[72px] overflow-hidden rounded-[14px] bg-bg2 sm:size-24">
        {b.coverUrl ? (
          <Image
            src={b.coverUrl}
            alt=""
            fill
            sizes="96px"
            className={`object-cover ${tab === 'cancelled' ? 'grayscale' : ''}`}
          />
        ) : (
          <MapPinned className="absolute inset-0 m-auto size-7 text-mute" aria-hidden />
        )}
      </div>

      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-chip px-2.5 py-0.5 text-[12px] font-bold ${PILL[state.tone]}`}>
            {state.label}
          </span>
          {tab === 'upcoming' && b.status !== 'pending' && (
            <span className="text-[13px] font-bold text-primary-ink">
              {countdown(today, b.departs)}
            </span>
          )}
        </div>
        <h2 className="text-[19px] leading-snug">
          {/* The whole card is the target; the link text stays the trip's name. */}
          <Link
            href={detailHref(b.ref)}
            className="text-ink no-underline after:absolute after:inset-0 after:rounded-card hover:underline"
          >
            {b.packageName}
          </Link>
        </h2>
        <p className="flex flex-wrap gap-x-2 text-[14px] text-ink2">
          <span>{formatDate(b.departs)}</span>
          <span aria-hidden>·</span>
          <span>{travellersLabel(b.travellers)}</span>
          <span aria-hidden>·</span>
          <span className="num font-semibold tracking-[0.04em]">{b.ref}</span>
        </p>
      </div>

      <div className="col-span-2 grid gap-2 sm:col-span-1 sm:justify-items-end">
        {lapsed ? (
          <p className="text-[13px] text-mute">Payment wasn’t finished — seats released</p>
        ) : b.cancellation === 'requested' ? (
          <p className="text-[13px] text-mute">We reply within a day</p>
        ) : (
          <p className="num text-[14px] text-mute">
            {paid ? 'Paid ' : 'Total '}
            <b className="text-[17px] font-extrabold text-ink">
              {inr(paid ? b.paidPaise : b.totalPaise)}
            </b>
          </p>
        )}
        {b.canReview ? (
          <Link
            href={`${detailHref(b.ref)}#review-title`}
            className="relative z-10 inline-flex items-center justify-center gap-2 rounded-btn bg-primary px-3.5 py-2 text-sm font-bold text-white no-underline transition-colors hover:bg-primary-ink"
          >
            <Star className="size-4" aria-hidden /> Write a review
          </Link>
        ) : (
          b.reviewRating != null && (
            <p className="text-[13px] font-semibold text-mute">
              Reviewed · <Stars value={b.reviewRating} className="text-[13px] text-ink" />
            </p>
          )
        )}
        {b.hasVoucher && (
          <a
            // No `download`: a failure redirects to sign-in or My trips, which must render as a
            // page; a good answer is already `Content-Disposition: attachment`. Above the card's
            // stretched link, so it stays its own target.
            href={voucherHref(b.ref)}
            className="relative z-10 inline-flex items-center justify-center gap-2 rounded-btn border-[1.5px] border-line px-3.5 py-2 text-sm font-bold text-ink no-underline transition-colors hover:border-ink"
          >
            <FileDown className="size-4" aria-hidden /> Voucher
          </a>
        )}
      </div>
    </li>
  );
}
