import Link from 'next/link';
import { REVIEW_TABS, type ReviewCounts, type ReviewState, reviewsHref } from '@/lib/admin/reviews';

/** The inbox's tab look: links, so the queue works without JavaScript. */
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
            className={`rounded-[10px] px-3 py-1.5 text-sm font-bold transition-colors ${
              active ? 'bg-ink text-white' : 'text-ink2 hover:bg-bg2'
            }`}
          >
            {tab.label} {counts[tab.state]}
          </Link>
        );
      })}
    </nav>
  );
}
