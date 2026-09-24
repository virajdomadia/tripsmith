import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container } from '@/components/site/Container';
import { EmptyState } from '@/components/site/packages/EmptyState';
import { FilterPanel } from '@/components/site/packages/FilterPanel';
import { ResultsGrid } from '@/components/site/packages/ResultsGrid';
import { ResultsToolbar } from '@/components/site/packages/ResultsToolbar';
import { Results, SearchTransition } from '@/components/site/packages/SearchTransition';
import { api } from '@/lib/api';
import {
  activeChips,
  EMPTY_QUERY,
  isFiltered,
  parseSearchQuery,
  toApiSearchParams,
  toSearchParams,
  type RawSearchParams,
  type SearchQuery,
} from '@/lib/search';
import { breadcrumbJsonLd } from '@/lib/seo/breadcrumb-jsonld';
import { OPEN_GRAPH } from '@/lib/seo/open-graph';
import { absolute } from '@/lib/seo/site-url';

type Props = { searchParams: Promise<RawSearchParams> };

/** Cached 60 s per distinct query (the api's own s-maxage); tagged so admin edits (F18) can purge it. */
const search = (query: SearchQuery) =>
  api('/packages', { searchParams: toApiSearchParams(query), tags: ['packages'], revalidate: 60 });

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = parseSearchQuery(await searchParams);
  const description =
    'Every Tripsmith trip with real departure dates and per-person prices. Filter by destination, budget, nights, theme and travel month.';
  return {
    title: 'Holiday packages',
    description,
    // One indexable URL. Filtered views are shareable, but crawlers are pointed at the listing.
    alternates: { canonical: absolute('/packages') },
    robots: isFiltered(query) ? { index: false, follow: true } : undefined,
    openGraph: {
      ...OPEN_GRAPH,
      title: 'Holiday packages · Tripsmith',
      description,
      url: absolute('/packages'),
    },
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
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Holiday packages', path: '/packages' },
        ])}
      />
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 pt-3.5 text-[13px] text-mute [&_a]:inline-flex [&_a]:min-h-6 [&_a]:items-center"
      >
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <span aria-hidden>›</span>
        <span aria-current="page" className="text-ink">
          Holiday packages
        </span>
      </nav>
      <header className="pt-5 pb-2">
        <h1 className="text-[clamp(30px,3.6vw,44px)]">Holiday packages</h1>
        <p className="num mt-1.5 max-w-[60ch] text-base text-mute">
          {plural(catalogSize, 'trip', 'trips')} across{' '}
          {plural(facets.destinations.length, 'destination', 'destinations')} — every date a real
          departure.
        </p>
      </header>

      <SearchTransition>
        <div className="grid gap-7 pt-5 lg:grid-cols-[280px_1fr] lg:items-start">
          <FilterPanel query={query} facets={facets} />
          <div className="min-w-0">
            {/* The card titles are h3; without this the listing jumps h1 → h3 (H3 heading order). */}
            <h2 className="sr-only">Matching trips</h2>
            <ResultsToolbar query={query} total={results.total} chips={chips} />
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
