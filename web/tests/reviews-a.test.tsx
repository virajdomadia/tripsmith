// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewPane } from '@/components/admin/reviews/ReviewPane';
import { ReviewQueue } from '@/components/admin/reviews/ReviewQueue';
import {
  type AdminReview,
  firstLine,
  parseReviewQuery,
  pickReview,
  reviewKpis,
  reviewsHref,
} from '@/lib/admin/reviews';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/reviews',
}));
vi.mock('@/lib/admin/client', () => ({ adminRequest: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(cleanup);

/** R59 · P20 — Reviews A: the KPI strip, the queue and the reading pane. */
const review = (over: Partial<AdminReview> = {}): AdminReview => ({
  id: 'rev_1',
  rating: 5,
  text: 'The houseboat night was the best part.\n\nOur driver waited an extra hour.',
  state: 'pending',
  name: 'Priya Raghavan',
  email: 'priya@customer.in',
  bookingRef: 'TB-7F3K2Q',
  packageName: 'Munnar & Alleppey Houseboat',
  packageSlug: 'munnar-alleppey',
  travelled: '2026-02-12',
  createdAt: '2026-09-25T06:30:00Z',
  moderatedAt: null,
  packageCoverUrl: null,
  packageRating: { avg: 4.8, count: 91 },
  ...over,
});

const STATS = {
  oldestPendingAt: '2026-09-21T04:00:00Z',
  publishedAvg: 4.6,
  publishedPackages: 15,
  publishedThisMonth: 7,
  publishedLastMonth: 4,
};

describe('Reviews A helpers', () => {
  it('keeps the picked review in the URL beside the tab and page', () => {
    expect(reviewsHref('pending', 1, 'rev_9')).toBe('/admin/reviews?sel=rev_9');
    expect(reviewsHref('hidden', 2, 'rev_9')).toBe('/admin/reviews?state=hidden&page=2&sel=rev_9');
    expect(parseReviewQuery({ sel: ' rev_9 ' })).toEqual({
      state: 'pending',
      page: 1,
      sel: 'rev_9',
    });
    expect(parseReviewQuery({ sel: '' })).toEqual({ state: 'pending', page: 1 });
  });

  it('opens the pick, or the first in the tab once it has moved on', () => {
    const items = [review({ id: 'a' }), review({ id: 'b' })];
    expect(pickReview(items, 'b')?.id).toBe('b');
    expect(pickReview(items, 'gone')?.id).toBe('a');
    expect(pickReview([], 'a')).toBeNull();
  });

  it('excerpts the first paragraph', () => {
    expect(firstLine('\n  \nFirst.\nSecond.')).toBe('First.');
  });

  it('reads the strip: oldest waiting, average and trips, this month against last, hidden', () => {
    const counts = { pending: 3, published: 41, hidden: 2 };
    const k = reviewKpis(counts, STATS, '2026-09-27', '21 Sep');
    expect(k.map((x) => [x.label, x.value, x.hint])).toEqual([
      ['Waiting', '3', 'Oldest sent 21 Sep'],
      ['Average published', '4.6', 'across 15 trips'],
      ['Published · Sep', '7', '+3 on Aug'],
      ['Hidden', '2', 'Spam or personal details'],
    ]);
    const quiet = reviewKpis(
      { pending: 0, published: 0, hidden: 0 },
      {
        ...STATS,
        oldestPendingAt: null,
        publishedAvg: null,
        publishedPackages: 0,
        publishedThisMonth: 1,
        publishedLastMonth: 3,
      },
      '2026-01-05',
      null,
    );
    expect(quiet.map((x) => x.hint)).toEqual([
      'Queue clear',
      'Nothing published yet',
      '−2 on Dec',
      'Spam or personal details',
    ]);
    expect(quiet[1].value).toBe('—');
    expect(quiet[2]).toMatchObject({ label: 'Published · Jan', tone: 'down' });
  });
});

describe('ReviewQueue', () => {
  it('links each row to the pane and marks the open one', () => {
    render(
      <ReviewQueue
        items={[review(), review({ id: 'rev_2', name: 'Arjun Mehta', rating: 3 })]}
        state="pending"
        selected="rev_2"
        hrefFor={(id) => reviewsHref('pending', 1, id)}
      />,
    );
    const rows = screen.getAllByRole('link');
    expect(rows[0].getAttribute('href')).toBe('/admin/reviews?sel=rev_1#review');
    expect(rows[1].getAttribute('aria-current')).toBe('true');
    expect(within(rows[0]).getByText('The houseboat night was the best part.')).toBeTruthy();
    expect(within(rows[1]).getByRole('img', { name: '3 out of 5 stars' })).toBeTruthy();
  });

  it('says so when a tab is empty', () => {
    render(<ReviewQueue items={[]} state="hidden" hrefFor={() => ''} />);
    expect(screen.getByText('No hidden reviews.')).toBeTruthy();
  });
});

describe('ReviewPane', () => {
  it('reads the review in full with its booking, the trip rating now and both moves', () => {
    render(<ReviewPane r={review()} />);
    const pane = screen.getByRole('complementary', { name: 'Review from Priya Raghavan' });
    expect(within(pane).getByText('Waiting')).toBeTruthy();
    expect(within(pane).getByText('Travelled Feb 2026')).toBeTruthy();
    expect(within(pane).getByRole('link', { name: 'TB-7F3K2Q' }).getAttribute('href')).toBe(
      '/admin/bookings/TB-7F3K2Q',
    );
    expect(pane.textContent).toContain('4.8 from 91 reviews');
    expect(within(pane).getByRole('button', { name: 'Publish' })).toBeTruthy();
    expect(within(pane).getByRole('button', { name: 'Hide' })).toBeTruthy();
  });

  it('offers only the move out of a moderated state, and a trip with no rating says so', () => {
    render(<ReviewPane r={review({ state: 'hidden', packageRating: null })} />);
    expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull();
    expect(screen.getByText('No published reviews yet')).toBeTruthy();
    expect(screen.getByText(/either move is undone/)).toBeTruthy();
  });
});
