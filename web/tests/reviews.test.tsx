// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModerateButtons } from '@/components/admin/reviews/ModerateButtons';
import { ReviewTabs } from '@/components/admin/reviews/ReviewTabs';
import { ReviewPanel } from '@/components/site/account/ReviewPanel';
import { Reviews } from '@/components/site/package/Reviews';
import { Stars } from '@/components/site/Stars';
import { parseReviewQuery, reviewsHref } from '@/lib/admin/reviews';
import { type PublicReview, reviewLength, travelled } from '@/lib/reviews';

const refresh = vi.fn();
const adminRequest = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => '/admin/reviews',
}));
vi.mock('@/lib/admin/client', () => ({ adminRequest: (...a: unknown[]) => adminRequest(...a) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TEXT = 'The houseboat night was the best part of the whole trip.';

const review = (n: number): PublicReview => ({
  id: `r${n}`,
  rating: 5 - (n % 2),
  text: `Review ${n} — ${TEXT}`,
  name: 'Asha B.',
  travelled: '2026-08-01',
  createdAt: '2026-08-10T06:00:00Z',
});

afterEach(() => {
  cleanup();
  refresh.mockClear();
  adminRequest.mockReset();
  vi.unstubAllGlobals();
});

describe('Stars', () => {
  it('prints the number beside the glyphs and says it to screen readers', () => {
    const { container } = render(<Stars value={4} />);
    expect(screen.getByRole('img', { name: '4 out of 5 stars' })).toBeTruthy();
    expect(container.textContent).toBe('★★★★★4');
    expect(container.querySelector('.text-star')?.textContent?.startsWith('★★★★')).toBe(true);
  });

  it('rounds the glyphs of an average but keeps its decimal', () => {
    const { container } = render(<Stars value={4.6} />);
    expect(screen.getByRole('img', { name: '4.6 out of 5 stars' })).toBeTruthy();
    expect(container.querySelector('.text-line')?.textContent).toBe('');
    expect(container.textContent?.endsWith('4.6')).toBe(true);
  });

  it('switches to the bright marigold over a photo', () => {
    const { container } = render(<Stars value={3} onDark />);
    expect(container.querySelector('.text-action')).toBeTruthy();
    expect(container.querySelector('.text-star')).toBeNull();
  });
});

describe('review helpers', () => {
  it('formats the month travelled and counts code points like the api', () => {
    expect(travelled('2026-11-20')).toBe('Travelled Nov 2026');
    expect(reviewLength('  🙂🙂  ')).toBe(2);
  });

  it('keeps the moderation tab and page in the URL, defaulting to Pending', () => {
    expect(reviewsHref('pending')).toBe('/admin/reviews');
    expect(reviewsHref('hidden', 3)).toBe('/admin/reviews?state=hidden&page=3');
    expect(parseReviewQuery({ state: 'published', page: '2' })).toEqual({
      state: 'published',
      page: 2,
    });
    expect(parseReviewQuery({ state: 'nope', page: '-1' })).toEqual({ state: 'pending', page: 1 });
  });
});

describe('ReviewPanel', () => {
  it('shows nothing for a trip that cannot be reviewed', () => {
    const { container } = render(
      <ReviewPanel bookingRef="TB-ABC123" packageName="Kasol" review={null} canReview={false} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('asks for a rating and enough words before sending, then refreshes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { rating: 4, text: TEXT, state: 'pending', createdAt: '2026-09-26T06:00:00Z' },
          { status: 201 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ReviewPanel bookingRef="TB-ABC123" packageName="Kasol" review={null} canReview />);
    expect(screen.getByText('Reviews can’t be changed once sent.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Send review' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Pick a rating/);

    await user.click(screen.getByRole('radio', { name: /4 stars — Very good/ }));
    await user.type(screen.getByLabelText('Your review'), 'Too short');
    await user.click(screen.getByRole('button', { name: 'Send review' }));
    expect(screen.getByRole('alert').textContent).toMatch(/at least 20 characters/);
    expect(fetchMock).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Your review'));
    await user.type(screen.getByLabelText('Your review'), `  ${TEXT}  `);
    await user.click(screen.getByRole('button', { name: 'Send review' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/account/bookings/TB-ABC123/review');
    expect(JSON.parse(init.body as string)).toEqual({ rating: 4, text: TEXT });
  });

  it('shows the api’s refusal instead of refreshing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 'conflict',
              message: 'You’ve already reviewed this trip — thank you',
              reason: 'already_reviewed',
            },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    render(<ReviewPanel bookingRef="TB-ABC123" packageName="Kasol" review={null} canReview />);
    await user.click(screen.getByRole('radio', { name: /5 stars/ }));
    await user.type(screen.getByLabelText('Your review'), TEXT);
    await user.click(screen.getByRole('button', { name: 'Send review' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/already reviewed/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows a sent review with its state and no form', () => {
    render(
      <ReviewPanel
        bookingRef="TB-ABC123"
        packageName="Kasol"
        review={{ rating: 3, text: TEXT, state: 'hidden', createdAt: '2026-09-26T06:00:00Z' }}
        canReview={false}
      />,
    );
    expect(screen.getByText('Not published')).toBeTruthy();
    expect(screen.getByText(TEXT)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('package page reviews', () => {
  it('shows the aggregate and the first page, and loads the rest on demand', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ items: [review(7)], page: 2, total: 7, totalPages: 2 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <Reviews
        slug="manali-kasol-tosh"
        rating={{ avg: 4.4, count: 7 }}
        reviews={[1, 2, 3, 4, 5, 6].map(review)}
      />,
    );
    expect(screen.getByRole('img', { name: 'Rated 4.4 out of 5' })).toBeTruthy();
    expect(screen.getByText(/7 reviews from travellers/)).toBeTruthy();
    expect(screen.getAllByText(/Travelled Aug 2026/)).toHaveLength(6);

    await user.click(screen.getByRole('button', { name: /Show more reviews/ }));
    expect(await screen.findByText(/Review 7 —/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/packages/manali-kasol-tosh/reviews?page=2&fresh=1',
    );
    expect(screen.queryByRole('button', { name: /Show more reviews/ })).toBeNull();
  });

  it('offers no button when the first page is everything', () => {
    render(<Reviews slug="x" rating={{ avg: 5, count: 1 }} reviews={[review(1)]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('moderation', () => {
  it('offers only the moves out of the current tab and refreshes after one', async () => {
    adminRequest.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ModerateButtons id="rev_1" state="pending" />);
    expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(adminRequest).toHaveBeenCalledWith('/admin/reviews/rev_1/hide', { method: 'POST' });
    cleanup();

    render(<ModerateButtons id="rev_1" state="published" />);
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    cleanup();
    render(<ModerateButtons id="rev_1" state="hidden" />);
    expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull();
  });

  it('marks the current tab and shows each count', () => {
    render(<ReviewTabs state="hidden" counts={{ pending: 2, published: 5, hidden: 1 }} />);
    const current = screen.getByRole('link', { current: 'page' });
    expect(current.textContent).toBe('Hidden 1');
    expect(screen.getByRole('link', { name: 'Pending 2' }).getAttribute('href')).toBe(
      '/admin/reviews',
    );
  });
});
