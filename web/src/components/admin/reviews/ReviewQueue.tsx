import Image from 'next/image';
import Link from 'next/link';
import { istShortDate } from '@/components/admin/enquiries/ist-date';
import { Stars } from '@/components/site/Stars';
import { type AdminReview, firstLine, type ReviewState } from '@/lib/admin/reviews';
import { cn } from '@/lib/utils';

const EMPTY: Record<ReviewState, string> = {
  pending: 'Nothing waiting. New reviews land here, and you get an email for each.',
  published: 'No published reviews yet.',
  hidden: 'No hidden reviews.',
};

/** The trip's cover as a small thumb; a plain tile when the package has no photo yet. */
export function Thumb({ src, className }: { src: string | null; className?: string }) {
  return (
    <span
      className={cn('relative block shrink-0 overflow-hidden rounded-lg bg-bg2', className)}
      aria-hidden
    >
      {src && <Image src={src} alt="" fill sizes="112px" className="object-cover" />}
    </span>
  );
}

/**
 * Mockup Reviews A's queue: one row per review — the trip's photo, the stars, who and when, the
 * trip and the first line — each a link that opens it in the reading pane (`?sel=`). On a phone
 * the pane sits under the list, so a row also jumps down to it.
 */
export function ReviewQueue({
  items,
  state,
  selected,
  hrefFor,
}: {
  items: AdminReview[];
  state: ReviewState;
  selected?: string;
  hrefFor: (id: string) => string;
}) {
  if (items.length === 0)
    return <p className="p-8 text-center text-sm text-mute">{EMPTY[state]}</p>;
  return (
    <ul aria-label="Reviews" className="grid">
      {items.map((r) => {
        const on = r.id === selected;
        return (
          <li key={r.id} className="border-t border-line first:border-0">
            <Link
              // No `scroll={false}`: it would also cancel the #review jump a phone needs.
              href={`${hrefFor(r.id)}#review`}
              aria-current={on ? 'true' : undefined}
              className={cn(
                'grid grid-cols-[56px_minmax(0,1fr)] items-start gap-3 px-4 py-3 text-ink no-underline transition-colors hover:bg-primary-soft/40',
                on && 'bg-primary-soft shadow-[inset_3px_0_0_var(--color-primary)]',
              )}
            >
              <Thumb src={r.packageCoverUrl} className="h-10 w-14" />
              <span className="grid min-w-0 gap-0.5">
                <span className="flex min-w-0 items-center gap-2">
                  <Stars value={r.rating} number={null} className="text-[13px]" />
                  <b className="min-w-0 truncate text-[14px]">{r.name}</b>
                  <small className="ml-auto text-[12px] whitespace-nowrap text-mute">
                    {istShortDate(r.createdAt)}
                  </small>
                </span>
                <small className="truncate text-[12.5px] font-semibold text-ink2">
                  {r.packageName}
                </small>
                <span className="truncate text-[13px] text-mute">{firstLine(r.text)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
