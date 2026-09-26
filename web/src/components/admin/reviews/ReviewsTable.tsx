import Link from 'next/link';
import { Stars } from '@/components/site/Stars';
import { istDay } from '@/lib/account';
import type { AdminReview, ReviewState } from '@/lib/admin/reviews';
import { formatDate } from '@/lib/format';
import { travelled } from '@/lib/reviews';
import { ModerateButtons } from './ModerateButtons';

const EMPTY: Record<ReviewState, string> = {
  pending: 'Nothing waiting. New reviews land here, and you get an email for each.',
  published: 'No published reviews yet.',
  hidden: 'No hidden reviews.',
};

/** One card per review: the stars and text in full (the owner never edits it), who and which
 *  trip, and the moves allowed from this tab. */
export function ReviewsTable({ items, state }: { items: AdminReview[]; state: ReviewState }) {
  if (items.length === 0)
    return (
      <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-mute">
        {EMPTY[state]}
      </p>
    );
  return (
    <ul className="grid gap-3">
      {items.map((r) => (
        <li
          key={r.id}
          className="grid gap-3 rounded-card border border-line bg-bg p-4 sm:grid-cols-[1fr_auto] sm:items-start"
        >
          <div className="grid min-w-0 gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-mute">
              <Stars value={r.rating} className="text-[15px] text-ink" />
              <span>
                <b className="text-ink">{r.name}</b> · {r.email}
              </span>
            </div>
            <p className="text-[15px] whitespace-pre-line">{r.text}</p>
            <p className="flex flex-wrap gap-x-2 text-[13px] text-mute">
              <Link href={`/packages/${r.packageSlug}`} className="font-semibold">
                {r.packageName}
              </Link>
              <span aria-hidden>·</span>
              <span>{travelled(r.travelled)}</span>
              <span aria-hidden>·</span>
              <Link
                href={`/admin/bookings/${encodeURIComponent(r.bookingRef)}`}
                className="num font-semibold tracking-[0.04em]"
              >
                {r.bookingRef}
              </Link>
              <span aria-hidden>·</span>
              <span>Sent {formatDate(istDay(r.createdAt))}</span>
            </p>
          </div>
          <ModerateButtons id={r.id} state={r.state} />
        </li>
      ))}
    </ul>
  );
}
