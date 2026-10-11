// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  usePathname: () => '/packages',
}));

import { CompareTick } from '../src/components/site/compare/CompareTick';
import { CompareTray } from '../src/components/site/compare/CompareTray';
import { CompareView } from '../src/components/site/compare/CompareView';
import { SavedToasts } from '../src/components/site/saved/SavedToasts';
import {
  type CompareTrip,
  compareHref,
  compareRows,
  priceFrom,
  slugsFromParam,
  winners,
} from '../src/lib/compare';
import { resetTrayForTests, toggleCompare, useCompareTray } from '../src/lib/compare-tray';
import { resetSavedForTests } from '../src/lib/saved';

function trip(slug: string, over: Partial<CompareTrip> = {}): CompareTrip {
  return {
    slug,
    name: `Trip ${slug}`,
    destination: { slug: 'goa', name: 'Goa' },
    nights: 3,
    days: 4,
    departureCity: 'Goa airport',
    cover: null,
    startingPricePaise: 20_000_00,
    deal: null,
    earlyBird: null,
    places: ['Calangute'],
    hotels: [{ name: 'Sea View', city: 'Calangute', stars: 3, nights: 3 }],
    meals: { breakfasts: 3, lunches: 0, dinners: 1 },
    inclusions: ['Breakfast', 'Airport transfers'],
    exclusions: ['Flights'],
    departures: [
      {
        id: `${slug}-d1`,
        date: '2099-11-06',
        seatsTotal: 12,
        seatsLeft: 6,
        guaranteed: false,
        pricePerson: undefined,
        priceDoublePaise: 20_000_00,
        priceTriplePaise: 18_000_00,
        priceChildPaise: 10_000_00,
        singleSupplementPaise: 9_000_00,
        badge: null,
        waiting: 0,
        waitlistOpen: false,
        leader: null,
      } as unknown as CompareTrip['departures'][number],
    ],
    rating: { avg: 4.5, count: 10 },
    leader: null,
    deposit: true,
    ...over,
  };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  resetTrayForTests();
  resetSavedForTests();
  replace.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ signedIn: false, slugs: [], max: 60 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the compare rows', () => {
  it('reads the URL as asked and builds a shareable link', () => {
    expect(slugsFromParam(' a, b ,,c')).toEqual(['a', 'b', 'c']);
    expect(slugsFromParam(['a,b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(slugsFromParam(undefined)).toEqual([]);
    expect(compareHref(['goa', 'munnar'])).toBe('/compare?p=goa,munnar');
  });

  it('marks a list as the same when only its order, case or spacing differ', () => {
    const a = trip('a');
    const b = trip('b', { inclusions: ['airport  transfers', 'BREAKFAST'] });
    const differs = (ts: CompareTrip[]) =>
      Object.fromEntries(compareRows(ts).map((r) => [r.key, r.differs]));
    expect(differs([a, b]).included).toBe(false);
    const c = trip('c', { inclusions: ['Breakfast'], nights: 5, startingPricePaise: 18_000_00 });
    const d = differs([a, c]);
    expect(d.included).toBe(true);
    expect(d.duration).toBe(true);
    expect(d.price).toBe(true);
    expect(d.cancellation).toBe(false);
    // One trip: nothing can differ.
    expect(compareRows([a]).some((r) => r.differs)).toBe(false);
  });

  it('a deal counts in the price compared', () => {
    const dealt = trip('b', {
      deal: {
        label: 'Pujo deal',
        endsOn: '2099-10-05',
        endsAt: '2099-10-04T18:30:00Z',
        offPaise: 2_000_00,
        pricePaise: 18_000_00,
      },
    });
    const rows = compareRows([trip('a', { startingPricePaise: 18_000_00 }), dealt]);
    expect(rows.find((r) => r.key === 'price')?.differs).toBe(false);
    // The api's deal price is the truth, even when the stored starting price is lower than
    // the base the deal was cut from (the card shows `deal.pricePaise` too).
    expect(priceFrom(trip('c', { startingPricePaise: 17_000_00, deal: dealt.deal }))).toBe(
      18_000_00,
    );
  });

  it('earns a tag only for a trip that is best alone', () => {
    const w = winners([
      trip('a', { nights: 5, rating: { avg: 4.8, count: 3 } }),
      trip('b', { startingPricePaise: 15_000_00, rating: { avg: 4.8, count: 9 } }),
      trip('c'),
    ]);
    expect(w.get('a')?.get('duration')).toBe('Longest trip');
    expect(w.get('b')?.get('price')).toBe('Lowest price');
    // 4.8 is shared: nobody is "Top rated".
    expect([...w.values()].some((m) => m.has('rating'))).toBe(false);
  });
});

function TrayCount() {
  return <p data-testid="n">{useCompareTray().items.length}</p>;
}

describe('the tray', () => {
  it('holds three; a fourth is refused with a toast', async () => {
    render(
      <>
        {['a', 'b', 'c', 'd'].map((s) => (
          <CompareTick
            key={s}
            item={{ slug: s, name: `Trip ${s}`, coverUrl: null }}
            variant="card"
          />
        ))}
        <TrayCount />
        <SavedToasts />
      </>,
    );
    for (const s of ['a', 'b', 'c'])
      fireEvent.click(screen.getByRole('checkbox', { name: `Compare Trip ${s}` }));
    expect(screen.getByTestId('n').textContent).toBe('3');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Compare Trip d' }));
    expect(screen.getByTestId('n').textContent).toBe('3');
    expect(await screen.findByText('Compare holds 3 — remove one first')).toBeTruthy();
    expect(
      screen.getByRole('checkbox', { name: 'Compare Trip d' }).getAttribute('aria-checked'),
    ).toBe('false');
    expect(JSON.parse(sessionStorage.getItem('ts:compare:v1') ?? '[]')).toHaveLength(3);
  });

  it('links to the compare page once two are ticked, and removes one', () => {
    act(() => {
      toggleCompare({ slug: 'a', name: 'Trip a', coverUrl: null });
    });
    render(<CompareTray />);
    expect(screen.queryByRole('link', { name: /Compare \(/ })).toBeNull();
    expect(screen.getByText('Tick one more trip to compare')).toBeTruthy();
    act(() => {
      toggleCompare({ slug: 'b', name: 'Trip b', coverUrl: null });
    });
    expect(screen.getByRole('link', { name: 'Compare (2)' }).getAttribute('href')).toBe(
      '/compare?p=a,b',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Trip a from compare' }));
    expect(screen.getByText('Tick one more trip to compare')).toBeTruthy();
  });
});

describe('the compare page', () => {
  it('shows a column per trip, highlights differences and hides the rest on request', () => {
    render(
      <CompareView
        trips={[trip('a'), trip('b', { nights: 5, days: 6, startingPricePaise: 15_000_00 })]}
        missing={['gone-trip']}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Compare 2 trips' })).toBeTruthy();
    expect(screen.getByText('1 trip in this link is no longer listed')).toBeTruthy();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('link', { name: 'Trip a' }).getAttribute('href')).toBe(
      '/packages/a',
    );
    expect(within(table).getAllByRole('link', { name: 'Book now' })[1]?.getAttribute('href')).toBe(
      '/packages/b#book',
    );
    expect(within(table).getByText('✓ Lowest price')).toBeTruthy();
    expect(within(table).getByRole('rowheader', { name: /Stays/ })).toBeTruthy();

    const toggle = screen.getByRole('button', { name: /Show only differences/ });
    expect(toggle.textContent).toContain('2 of 13'); // price and duration; same dates and seats
    fireEvent.click(toggle);
    expect(within(table).queryByRole('rowheader', { name: /Stays/ })).toBeNull();
    expect(within(table).getByRole('rowheader', { name: /Duration/ })).toBeTruthy();

    // The tray now holds what the page shows.
    expect(JSON.parse(sessionStorage.getItem('ts:compare:v1') ?? '[]')).toHaveLength(2);
  });

  it('removing a trip rewrites the URL; the last one cannot be removed', () => {
    render(<CompareView trips={[trip('a'), trip('b')]} missing={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Trip a from compare' }));
    expect(replace).toHaveBeenCalledWith('/compare?p=b', { scroll: false });
    cleanup();
    render(<CompareView trips={[trip('a')]} missing={[]} />);
    expect(
      (screen.getByRole('button', { name: 'Remove Trip a from compare' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText('Add a second trip to see where they differ.')).toBeTruthy();
  });
});
