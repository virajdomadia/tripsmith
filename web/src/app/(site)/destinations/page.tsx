import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { DestinationTile } from '@/components/site/destinations/DestinationTile';
import { api } from '@/lib/api';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/**
 * Rendered on request like `/packages` (CI builds with no api reachable, and a static page would
 * bake whatever the api said at deploy time). The fetch itself is cached for an hour and tagged
 * `destinations` so admin edits (F18) can purge it on demand.
 */
export const dynamic = 'force-dynamic';

const REVALIDATE_SECONDS = 60 * 60;

const load = () => api('/destinations', { tags: ['destinations'], revalidate: REVALIDATE_SECONDS });

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** `['Goa', 'Kerala', 'Himachal']` → `Goa, Kerala and Himachal` */
const listNames = (names: string[]) =>
  names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    : names.join('');

export async function generateMetadata(): Promise<Metadata> {
  const { items } = await load();
  return {
    title: 'Destinations',
    description: `${listNames(items.map((d) => d.name))} — every place Tripsmith runs trips to, with how many trips, the best months and the starting price.`,
    alternates: { canonical: `${SITE_URL}/destinations` },
  };
}

export default async function DestinationsPage() {
  const { items } = await load();
  const trips = items.reduce((n, d) => n + d.packageCount, 0);

  return (
    <Container className="pb-20">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 pt-3.5 text-[13px] text-mute">
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <span aria-hidden>›</span>
        <span aria-current="page" className="text-ink">
          Destinations
        </span>
      </nav>
      <header className="pt-5 pb-2">
        <h1 className="text-[clamp(30px,3.6vw,44px)]">Places we know like the back of our hand.</h1>
        <p className="num mt-1.5 max-w-[60ch] text-base text-mute">
          {plural(trips, 'trip', 'trips')} across{' '}
          {plural(items.length, 'destination', 'destinations')} — every one run by us, with
          departures you can count on.
        </p>
      </header>
      {items.length > 0 ? (
        <ul className="grid gap-4 pt-5 sm:grid-cols-2 sm:gap-[18px] lg:grid-cols-3">
          {items.map((d, i) => (
            <DestinationTile key={d.slug} card={d} index={i} />
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded-card border border-dashed border-line p-8 text-center text-mute">
          No destinations with live trips right now — see{' '}
          <Link href="/packages">holiday packages</Link>.
        </p>
      )}
    </Container>
  );
}
