import { redirect } from 'next/navigation';
import { PageHead } from '@/components/admin/PageHead';
import { Pager } from '@/components/admin/enquiries/Pager';
import { istShortDate } from '@/components/admin/enquiries/ist-date';
import { ReviewPane } from '@/components/admin/reviews/ReviewPane';
import { ReviewQueue } from '@/components/admin/reviews/ReviewQueue';
import { ReviewTabs } from '@/components/admin/reviews/ReviewTabs';
import { api } from '@/lib/api';
import { parseReviewQuery, pickReview, reviewKpis, reviewsHref } from '@/lib/admin/reviews';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Reviews' };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Reviews A (R24, R59 · P20): a KPI strip, the Pending / Published / Hidden tabs, and the queue
 * beside a reading pane for the review picked (`?sel=`, else the first in the tab). Publish and
 * Hide act from the pane; each recomputes the package's rating and refreshes its pages. The tab,
 * page and pick live in the URL, like the desk. On a phone the pane follows the list.
 */
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseReviewQuery(await searchParams);
  const list = await api('/admin/reviews', {
    auth: true,
    searchParams: { state: query.state, page: String(query.page) },
  });
  if (query.page > list.totalPages) redirect(reviewsHref(query.state, list.totalPages));
  const { counts, stats } = list;
  const selected = pickReview(list.items, query.sel);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const oldest = stats.oldestPendingAt ? istShortDate(stats.oldestPendingAt) : null;
  return (
    <>
      <PageHead
        title="Reviews"
        subtitle={`${counts.pending} waiting · ${counts.published} published · ${counts.hidden} hidden`}
      />
      <dl className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {reviewKpis(counts, stats, today, oldest).map((k) => (
          <div
            key={k.label}
            className="grid min-w-0 gap-0.5 rounded-card border border-line bg-bg px-3.5 py-3"
          >
            <dt className="text-[12.5px] font-bold text-mute">{k.label}</dt>
            <dd className="num text-[24px] leading-tight font-extrabold">{k.value}</dd>
            <dd
              className={cn(
                'text-[12.5px] font-semibold',
                k.tone === 'up' ? 'text-ok' : k.tone === 'down' ? 'text-warn' : 'text-mute',
              )}
            >
              {k.hint}
            </dd>
          </div>
        ))}
      </dl>
      <ReviewTabs state={list.state} counts={counts} />
      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-3">
          <div className="overflow-hidden rounded-card border border-line bg-bg">
            <ReviewQueue
              items={list.items}
              state={list.state}
              selected={selected?.id}
              hrefFor={(id) => reviewsHref(list.state, list.page, id)}
            />
          </div>
          <Pager
            href={(page) => reviewsHref(list.state, page)}
            noun={['review', 'reviews']}
            page={list.page}
            totalPages={list.totalPages}
            total={list.total}
            shown={list.items.length}
          />
        </div>
        <div className="lg:sticky lg:top-4">
          <ReviewPane r={selected} />
        </div>
      </div>
    </>
  );
}
