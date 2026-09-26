import { redirect } from 'next/navigation';
import { PageHead } from '@/components/admin/PageHead';
import { Pager } from '@/components/admin/enquiries/Pager';
import { ReviewsTable } from '@/components/admin/reviews/ReviewsTable';
import { ReviewTabs } from '@/components/admin/reviews/ReviewTabs';
import { api } from '@/lib/api';
import { parseReviewQuery, reviewsHref } from '@/lib/admin/reviews';

export const metadata = { title: 'Reviews' };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The moderation queue (R24, B13): Pending, Published and Hidden tabs, newest first. Publish
 * and Hide act inline; each recomputes the package's rating and refreshes its pages. The tab and
 * the page live in the URL, like the inbox.
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
  const { counts } = list;
  return (
    <>
      <PageHead
        title="Reviews"
        subtitle={`${counts.pending} waiting · ${counts.published} published · ${counts.hidden} hidden`}
      />
      <ReviewTabs state={list.state} counts={counts} />
      <ReviewsTable items={list.items} state={list.state} />
      <Pager
        href={(page) => reviewsHref(list.state, page)}
        noun={['review', 'reviews']}
        page={list.page}
        totalPages={list.totalPages}
        total={list.total}
        shown={list.items.length}
      />
    </>
  );
}
