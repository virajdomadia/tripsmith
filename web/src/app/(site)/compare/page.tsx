import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { CompareView } from '@/components/site/compare/CompareView';
import { api, ApiRequestError } from '@/lib/api';
import { MAX_COMPARE, slugsFromParam } from '@/lib/compare';

type Search = Record<string, string | string[] | undefined>;

// Every combination of trips is its own page and the seats are live: rendered per request,
// never prerendered. The api answer itself is CDN-cached for 60 s (its Cache-Control).
export const dynamic = 'force-dynamic';

// A shortlist, not a landing page: crawlers follow the trip links but never index the
// combinations. No canonical (there is no one URL to point at) and the site's own OG card.
export const metadata: Metadata = {
  title: 'Compare trips',
  description:
    'Up to three Tripsmith trips side by side — prices, dates, stays and what is included.',
  robots: { index: false, follow: true },
};

/** `/compare?p=a,b,c` (R39, P1b, mockup Compare A · Sticky table): rendered from the URL alone. */
export default async function ComparePage({ searchParams }: { searchParams: Promise<Search> }) {
  // At most three: an over-long `p` would otherwise trip the api's length cap (422).
  const asked = slugsFromParam((await searchParams).p).slice(0, MAX_COMPARE);
  let result: Awaited<ReturnType<typeof load>> = null;
  if (asked.length) result = await load(asked);

  return (
    <Container className="pt-6 pb-16 sm:pt-8">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 text-[13px] text-mute [&_a]:inline-flex [&_a]:min-h-6 [&_a]:items-center"
      >
        <Link href="/packages" className="hover:text-ink">
          Trips
        </Link>
        <span aria-hidden>›</span>
        <Link href="/account?tab=saved" className="hover:text-ink">
          Saved
        </Link>
        <span aria-hidden>›</span>
        <span className="text-ink">Compare</span>
      </nav>
      {result === null || result.items.length === 0 ? (
        <Empty
          unavailable={asked.length > 0 && result === null}
          gone={result?.missing.length ?? 0}
        />
      ) : (
        <CompareView trips={result.items} missing={result.missing} />
      )}
    </Container>
  );
}

async function load(slugs: string[]) {
  try {
    // force-dynamic means no-store here; the 60 s cache is the api's own CDN header.
    return await api('/compare', { searchParams: { slugs: slugs.join(',') } });
  } catch (e) {
    // An api from before P1b (the web/api deploy race) has no /compare: say so, don't 500.
    if (e instanceof ApiRequestError) return null;
    throw e;
  }
}

function Empty({ unavailable, gone }: { unavailable: boolean; gone: number }) {
  return (
    <section className="mt-8 grid max-w-[640px] justify-items-start gap-3 rounded-card border border-dashed border-line bg-bg2 p-8">
      <h1 className="text-[clamp(26px,3.4vw,34px)]">
        {unavailable ? 'Compare isn’t available just now.' : 'Nothing to compare yet.'}
      </h1>
      <p className="max-w-[52ch] text-ink2">
        {unavailable
          ? 'Try again in a minute.'
          : gone
            ? 'The trips in this link are no longer listed. Tick Compare on up to three trips to line them up side by side.'
            : 'Tick Compare on up to three trips and they line up here side by side — prices, dates, stays and what is included.'}
      </p>
      <Link
        href="/packages"
        className="mt-1 rounded-btn bg-action px-5 py-3 font-bold text-ink no-underline transition-colors hover:bg-action-ink"
      >
        Browse trips
      </Link>
    </section>
  );
}
