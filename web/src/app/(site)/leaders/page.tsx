import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container } from '@/components/site/Container';
import { LeaderAvatar } from '@/components/site/LeaderAvatar';
import { PageHead } from '@/components/site/PageHead';
import { api } from '@/lib/api';
import { breadcrumbJsonLd } from '@/lib/seo/breadcrumb-jsonld';
import { absolute } from '@/lib/seo/site-url';

/**
 * `/leaders` (R41): everyone who leads our trips. Rendered on request like `/destinations` (CI
 * builds with no api); the fetch is cached for an hour and purged by the `leaders` tag.
 */
export const dynamic = 'force-dynamic';

const REVALIDATE_SECONDS = 60 * 60;

// `packages` too: the upcoming-date counts move when a trip is published or a date changes.
const load = () =>
  api('/leaders', { tags: ['leaders', 'packages'], revalidate: REVALIDATE_SECONDS });

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const metadata: Metadata = {
  title: 'Meet your trip leaders',
  description:
    'The people who lead Tripsmith trips — the languages they speak, the regions they know and the trips they lead next.',
  alternates: { canonical: absolute('/leaders') },
};

export default async function LeadersPage() {
  const { items } = await load();
  return (
    <Container className="pb-20">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Trip leaders', path: '/leaders' },
        ])}
      />
      <PageHead
        crumb="Trip leaders"
        title="Meet your trip leaders"
        lede="Every group trip travels with one of them — from the first chai to the last drop at the station."
      />
      {items.length === 0 ? (
        <p className="mt-6 rounded-card border border-line bg-bg2 p-6 text-mute">
          Our leaders&rsquo; profiles are on their way.
        </p>
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((l, i) => (
            <li key={l.slug} className="animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
              <Link
                href={`/leaders/${l.slug}`}
                className="group grid h-full content-start gap-4 rounded-card border border-line bg-bg p-5 text-ink no-underline transition-[transform,box-shadow] duration-500 ease-(--ease-out) hover:-translate-y-1 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <span className="flex items-center gap-4">
                  <LeaderAvatar leader={l} size={72} />
                  <span className="grid min-w-0">
                    <b className="text-[19px] font-extrabold tracking-tight">{l.name}</b>
                    <small className="text-[13px] font-semibold text-mute">
                      {plural(l.yearsLeading, 'year', 'years')} leading · {l.regions.join(', ')}
                    </small>
                  </span>
                </span>
                <span className="line-clamp-3 text-[14.5px] text-ink2">{l.bio}</span>
                <span className="mt-auto flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-mute">{l.languages.join(' · ')}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 font-bold text-primary">
                    {l.upcoming ? plural(l.upcoming, 'date', 'dates') : 'Profile'}
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden
                    />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
