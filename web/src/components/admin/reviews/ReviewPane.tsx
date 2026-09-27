import Link from 'next/link';
import { istFullDate } from '@/components/admin/enquiries/ist-date';
import { Chip } from '@/components/admin/enquiries/InboxList';
import { Stars } from '@/components/site/Stars';
import type { AdminReview, ReviewState } from '@/lib/admin/reviews';
import type { Tone } from '@/lib/admin/inbox';
import { travelled } from '@/lib/reviews';
import { ModerateButtons } from './ModerateButtons';
import { Thumb } from './ReviewQueue';

const STATE: Record<ReviewState, [Tone, string]> = {
  pending: ['warn', 'Waiting'],
  published: ['ok', 'Published'],
  hidden: ['mute', 'Hidden'],
};

/**
 * Mockup Reviews A's reading pane: the review in full — the customer's words are never edited —
 * with its trip, booking and the trip's rating now, and Publish / Hide with no confirm (either
 * move is undone from the other tab). The trip leader and the verified-traveller label arrive
 * with their own v2.5 rows.
 */
export function ReviewPane({ r }: { r: AdminReview | null }) {
  if (!r) {
    return (
      <aside className="grid place-items-center rounded-card border border-dashed border-line bg-bg p-8 text-center text-sm text-mute max-lg:hidden">
        Pick a review to read it in full.
      </aside>
    );
  }
  const [tone, label] = STATE[r.state];
  const rating = r.packageRating;
  return (
    <aside
      id="review"
      aria-label={`Review from ${r.name}`}
      className="animate-rise grid scroll-mt-4 content-start overflow-hidden rounded-card border border-line bg-bg"
    >
      <section className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 border-b border-line p-4">
        <Thumb src={r.packageCoverUrl} className="h-[54px] w-[72px]" />
        <div className="grid min-w-0 justify-items-start gap-1">
          <Chip tone={tone}>{label}</Chip>
          <b className="max-w-full truncate text-[15px]">{r.packageName}</b>
          <small className="text-[12.5px] text-mute">{travelled(r.travelled)}</small>
        </div>
      </section>
      <section className="grid gap-3 border-b border-line p-4">
        <Stars value={r.rating} className="text-[24px]" />
        <p className="text-[15px] leading-relaxed whitespace-pre-line">{r.text}</p>
        <p className="text-[13px] break-words text-ink2">
          <b className="text-ink">{r.name}</b> · {r.email}
        </p>
      </section>
      <section className="border-b border-line p-4">
        <dl className="grid gap-2 text-[13.5px]">
          <div className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-mute">Booking</dt>
            <dd>
              <Link
                href={`/admin/bookings/${encodeURIComponent(r.bookingRef)}`}
                className="num font-mono font-bold tracking-[0.04em]"
              >
                {r.bookingRef}
              </Link>
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-mute">Sent</dt>
            <dd>{istFullDate(r.createdAt)}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-3">
            <dt className="text-mute">Trip rating now</dt>
            <dd>
              {rating ? (
                <>
                  <b className="num">{rating.avg.toFixed(1)}</b> from {rating.count}{' '}
                  {rating.count === 1 ? 'review' : 'reviews'}
                </>
              ) : (
                'No published reviews yet'
              )}
            </dd>
          </div>
        </dl>
      </section>
      <section className="grid gap-2 p-4">
        <ModerateButtons id={r.id} state={r.state} name={r.name} />
        <small className="text-[12.5px] text-mute">
          {r.state === 'pending'
            ? 'Publishing recomputes the trip’s rating and refreshes its pages. The text is the customer’s — it is never edited.'
            : 'No confirm needed: either move is undone from the other tab.'}
        </small>
      </section>
    </aside>
  );
}
