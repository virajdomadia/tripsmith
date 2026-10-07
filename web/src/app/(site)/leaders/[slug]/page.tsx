import { Languages, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container } from '@/components/site/Container';
import { LeaderAvatar } from '@/components/site/LeaderAvatar';
import { PackageCard } from '@/components/site/PackageCard';
import { api } from '@/lib/api';
import { loadLeader, REVALIDATE_SECONDS } from '@/lib/catalog';
import { shortDate } from '@/lib/format';
import { breadcrumbJsonLd } from '@/lib/seo/breadcrumb-jsonld';
import { leaderJsonLd } from '@/lib/seo/leader-jsonld';
import { pageOpenGraph } from '@/lib/seo/open-graph';
import { absolute, SITE_URL } from '@/lib/seo/site-url';

type Params = { slug: string };

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Prerender every switched-on leader from ONE list read (build-time fetches stay light); an
 *  unreachable api at build means "none" — they render on first request instead. */
export async function generateStaticParams(): Promise<Params[]> {
  try {
    const { items } = await api('/leaders', { tags: ['leaders'], revalidate: REVALIDATE_SECONDS });
    return items.map((l) => ({ slug: l.slug }));
  } catch (err) {
    console.warn(`generateStaticParams: api unreachable, prerendering no leaders (${String(err)})`);
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const l = await loadLeader(slug);
  const description = `${l.name} has led trips for ${plural(l.yearsLeading, 'year', 'years')} across ${l.regions.join(', ')}. ${l.bio}`;
  return {
    title: `${l.name} — trip leader`,
    description: description.slice(0, 300),
    alternates: { canonical: absolute(`/leaders/${l.slug}`) },
    openGraph: pageOpenGraph({
      title: `${l.name} — trip leader`,
      description: l.bio,
      path: `/leaders/${l.slug}`,
    }),
  };
}

/**
 * `/leaders/[slug]` (R41): one leader — who they are, then the live trips with upcoming dates
 * they lead (their own dates and the packages they lead by default), soonest first.
 */
export default async function LeaderPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const l = await loadLeader(slug);
  const url = absolute(`/leaders/${l.slug}`);
  const first = firstName(l.name);
  return (
    <Container className="pb-20">
      <JsonLd data={leaderJsonLd(l, url, SITE_URL)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Trip leaders', path: '/leaders' },
          { name: l.name, path: `/leaders/${l.slug}` },
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
        <Link href="/leaders" className="hover:text-ink">
          Trip leaders
        </Link>
        <span aria-hidden>›</span>
        <span aria-current="page" className="text-ink">
          {l.name}
        </span>
      </nav>

      <header className="relative mt-5 grid gap-6 overflow-hidden rounded-card bg-bg2 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:p-8">
        <svg
          aria-hidden
          viewBox="0 0 400 120"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32 w-full text-primary/[.08]"
        >
          <path
            d="M0 96 L60 58 L96 74 L150 30 L196 70 L232 52 L300 88 L352 60 L400 82 L400 120 L0 120 Z"
            fill="currentColor"
          />
        </svg>
        <LeaderAvatar
          leader={l}
          size={160}
          priority
          className="relative ring-[6px] ring-bg max-sm:size-[120px]!"
        />
        <div className="relative grid min-w-0 gap-3">
          <p className="label-caps">Trip leader · {plural(l.yearsLeading, 'year', 'years')}</p>
          <h1 className="text-[clamp(30px,4vw,48px)]">{l.name}</h1>
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[14px] text-ink2">
            <li className="flex items-center gap-1.5">
              <Languages className="size-4 text-primary" aria-hidden />
              <span className="sr-only">Speaks </span>
              {l.languages.join(' · ')}
            </li>
            <li className="flex items-center gap-1.5">
              <MapPin className="size-4 text-primary" aria-hidden />
              <span className="sr-only">Leads trips in </span>
              {l.regions.join(' · ')}
            </li>
          </ul>
          <p className="max-w-[62ch] text-[17px] leading-relaxed">{l.bio}</p>
          {l.funFact && (
            <p className="relative mt-1 w-fit max-w-[56ch] -rotate-[0.6deg] rounded-[10px] bg-warn-soft px-3.5 py-2.5 text-[14px]">
              <span
                aria-hidden
                className="absolute -top-2 left-5 h-3.5 w-12 rotate-2 rounded-[2px] bg-action/50"
              />
              <b className="font-extrabold">Ask {first} about it: </b>
              {l.funFact}
            </p>
          )}
        </div>
      </header>

      <section aria-labelledby="trips" className="pt-11">
        <h2 id="trips" className="mb-4 text-[clamp(24px,2.8vw,30px)]">
          Upcoming trips with {first}
        </h2>
        {l.trips.length === 0 ? (
          <p className="rounded-card border border-line bg-bg2 p-6 text-mute">
            No dates on sale with {first} right now — <Link href="/packages">see every trip</Link>.
          </p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {l.trips.map((t, i) => (
              <li
                key={t.package.slug}
                className="grid animate-rise content-start gap-2.5"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <PackageCard card={t.package} />
                <p className="text-[13px] text-ink2">
                  <b className="font-bold text-ink">
                    {first} leads {t.dates.length === 1 ? '' : `${t.dates.length} dates: `}
                  </b>
                  {t.dates.map(shortDate).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-12 text-sm font-semibold">
        <Link href="/leaders">← All trip leaders</Link>
      </p>
    </Container>
  );
}
