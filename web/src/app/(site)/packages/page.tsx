import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { EmptyState } from '@/components/site/packages/EmptyState';
import { ResultsGrid } from '@/components/site/packages/ResultsGrid';
import { NavLink, Results, SearchTransition } from '@/components/site/packages/SearchTransition';
import { api } from '@/lib/api';
import {
  activeChips,
  EMPTY_QUERY,
  isFiltered,
  parseSearchQuery,
  resultCount,
  toApiSearchParams,
  toSearchParams,
  type RawSearchParams,
  type SearchQuery,
} from '@/lib/search';

type Props = { searchParams: Promise<RawSearchParams> };

/** Cached 60 s per distinct query (the api's own s-maxage); tagged so admin edits (F18) can purge it. */
const search = (query: SearchQuery) =>
  api('/packages', { searchParams: toApiSearchParams(query), tags: ['packages'], revalidate: 60 });

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = parseSearchQuery(await searchParams);
  return {
    title: 'Holiday packages',
    description:
      'Every Tripsmith trip with real departure dates and per-person prices. Filter by destination, budget, nights, theme and travel month.',
    // One indexable URL. Filtered views are shareable, but crawlers are pointed at the listing.
    alternates: { canonical: '/packages' },
    robots: isFiltered(query) ? { index: false, follow: true } : undefined,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function PackagesPage({ searchParams }: Props) {
  const query = parseSearchQuery(await searchParams);
  const results = await search(query);
  const { facets } = results;
  const chips = activeChips(query, facets);
  const queryKey = toSearchParams(query).toString();
  const catalogSize = facets.destinations.reduce((n, d) => n + d.count, 0);
  const suggestions =
    results.total === 0 && isFiltered(query) ? (await search(EMPTY_QUERY)).items.slice(0, 3) : [];

  return (
    <Container className="pb-20">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 pt-3.5 text-[13px] text-mute">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <span aria-hidden>›</span>
        <span className="text-ink">Holiday packages</span>
      </nav>
      <header className="pt-5 pb-2">
        <h1 className="text-[clamp(30px,3.6vw,44px)]">Holiday packages</h1>
        <p className="mt-1.5 max-w-[60ch] text-base text-mute">
          {plural(catalogSize, 'trip', 'trips')} across{' '}
          {plural(facets.destinations.length, 'destination', 'destinations')} — every date a real
          departure.
        </p>
      </header>

      <SearchTransition>
        <div className="grid gap-7 pt-5 lg:grid-cols-[280px_1fr] lg:items-start">
          {/* Task 6 replaces this with <FilterPanel query={query} facets={facets} /> */}
          <aside
            aria-label="Filters"
            className="rounded-card border border-line p-4.5 text-sm text-mute"
          >
            Filters arrive in the next step.
          </aside>
          <div className="min-w-0">
            {/* Task 6 replaces this with <ResultsToolbar query={query} total={results.total} chips={chips} /> */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="num font-bold" role="status">
                {resultCount(results.total)}
              </span>
              {chips.map((chip) => (
                <NavLink
                  key={chip.key}
                  href={chip.href}
                  ariaLabel={`Remove ${chip.label}`}
                  className="inline-flex items-center gap-1.5 rounded-chip bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary no-underline hover:bg-primary hover:text-white"
                >
                  {chip.label} <span aria-hidden>×</span>
                </NavLink>
              ))}
            </div>
            <Results>
              {results.total > 0 ? (
                <ResultsGrid key={queryKey} items={results.items} />
              ) : (
                <EmptyState query={query} suggestions={suggestions} />
              )}
            </Results>
          </div>
        </div>
      </SearchTransition>
    </Container>
  );
}
