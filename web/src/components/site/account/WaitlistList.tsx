import { BellRing, Clock } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { type AccountWaitlistEntry, istMoment, seatsWord } from '@/lib/waitlist';

/**
 * My trips (R44, P6): this email's waitlist places. An offer comes first, with the time its
 * seats are held until and a Claim link into the Book-now sheet; a place still waiting shows
 * where it stands. The api walks each date before answering, so an offer that ran out already
 * reads as waiting again.
 */
export function WaitlistList({ entries }: { entries: AccountWaitlistEntry[] }) {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort(
    (a, b) => Number(!a.claimPath) - Number(!b.claimPath) || a.date.localeCompare(b.date),
  );
  return (
    <section aria-labelledby="waitlist-heading" className="mt-8 grid gap-3">
      <h2 id="waitlist-heading" className="label-caps text-mute">
        Waitlist
      </h2>
      <ul className="grid gap-3">
        {sorted.map((e) => (
          <li
            key={e.departureId}
            className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border p-4 animate-rise ${
              e.claimPath ? 'border-ok/50 bg-ok-soft' : 'border-line bg-bg'
            }`}
          >
            <span
              aria-hidden
              className={`grid size-10 flex-none place-items-center rounded-[12px] ${
                e.claimPath ? 'bg-ok text-white' : 'bg-bg2 text-mute'
              }`}
            >
              {e.claimPath ? <BellRing className="size-5" /> : <Clock className="size-5" />}
            </span>
            <div className="grid min-w-0 flex-1 gap-0.5">
              <Link
                href={`/packages/${e.packageSlug}`}
                className="truncate font-extrabold text-ink no-underline hover:underline"
              >
                {e.packageName}
              </Link>
              <span className="text-[13.5px] text-ink2">
                {formatDate(e.date)} · {seatsWord(e.party)}
                {' · '}
                {e.claimPath && e.offerExpiresAt ? (
                  <b className="text-ok">Held for you until {istMoment(e.offerExpiresAt)}</b>
                ) : (
                  <>
                    <span className="num font-bold">#{e.position}</span> in line
                  </>
                )}
              </span>
            </div>
            {e.claimPath && (
              <Link
                href={e.claimPath}
                className="rounded-btn bg-action px-4 py-2.5 text-sm font-bold text-ink no-underline transition-colors hover:bg-action-ink"
              >
                {e.state === 'claimed' ? 'Finish booking' : 'Claim seats'}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
