import Link from 'next/link';
import { REVIEW_TABS, type ReviewCounts, type ReviewState, reviewsHref } from '@/lib/admin/reviews';
import { cn } from '@/lib/utils';

/** The state tabs, as links, so the queue works without JavaScript. */
export function ReviewTabs({ state, counts }: { state: ReviewState; counts: ReviewCounts }) {
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Filter by state">
      {REVIEW_TABS.map((tab) => {
        const active = tab.state === state;
        return (
          <Link
            key={tab.state}
            href={reviewsHref(tab.state)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-bold no-underline transition-colors',
              active ? 'bg-ink text-white' : 'text-ink2 hover:bg-bg2',
            )}
          >
            {tab.label}{' '}
            <span
              className={cn(
                'num text-[12px] font-extrabold',
                tab.state === 'pending' && counts.pending > 0 && !active
                  ? 'rounded-chip bg-action px-1.5 text-ink'
                  : active
                    ? 'text-white'
                    : 'text-mute',
              )}
            >
              {counts[tab.state]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
