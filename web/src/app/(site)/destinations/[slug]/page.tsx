import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container } from '@/components/site/Container';
import { BestMonths } from '@/components/site/destinations/BestMonths';
import { DestinationHero } from '@/components/site/destinations/DestinationHero';
import { PackageCard } from '@/components/site/PackageCard';
import { Prose } from '@/components/site/Prose';
import { api } from '@/lib/api';
import { cheapest, loadDestination, REVALIDATE_SECONDS } from '@/lib/catalog';
import { inr, isPriced, monthRange, priceOrOnRequest } from '@/lib/format';
import { breadcrumbJsonLd } from '@/lib/seo/breadcrumb-jsonld';
import { destinationJsonLd } from '@/lib/seo/destination-jsonld';
import { absolute } from '@/lib/seo/site-url';

type Params = { slug: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Prerender every destination with live trips; an unreachable api at build means "none". */
export async function generateStaticParams(): Promise<Params[]> {
  try {
    const { items } = await api('/destinations', {
      tags: ['destinations'],
      revalidate: REVALIDATE_SECONDS,
    });
    return items.map((d) => ({ slug: d.slug }));
  } catch (err) {
    console.warn(
      `generateStaticParams: api unreachable, prerendering no destinations (${String(err)})`,
    );
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const d = await loadDestination(slug);
  const from = cheapest(d.packages.map((p) => p.startingPricePaise));
  const trips = plural(d.packages.length, 'trip', 'trips');
  return {
    title: `${d.name} holiday packages — ${trips}${isPriced(from) ? ` from ${inr(from)}` : ''}`,
    description: `${d.tagline}. Best ${monthRange(d.bestMonths)}. ${d.packages.map((p) => p.name).join(', ')} — real departure dates and per-person prices.`,
    alternates: { canonical: absolute(`/destinations/${d.slug}`) },
    // The image is the generated card from ./opengraph-image.tsx (F13), added by Next.
    openGraph: { title: d.name, description: d.tagline, type: 'website' },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function DestinationPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const d = await loadDestination(slug);
  const url = absolute(`/destinations/${d.slug}`);
  const from = cheapest(d.packages.map((p) => p.startingPricePaise));
  const h2 = 'mb-4 text-[clamp(24px,2.8vw,30px)]';

  return (
    <Container className="pb-20">
      <JsonLd data={destinationJsonLd(d, url)} />
      {/* The trail `DestinationHero` renders. */}
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Destinations', path: '/destinations' },
          { name: d.name, path: `/destinations/${d.slug}` },
        ])}
      />
      <DestinationHero d={d} from={from} />

      <div className="mt-7 grid gap-12 lg:grid-cols-[1fr_380px] lg:items-start">
        <div className="min-w-0">
          <Prose markdown={d.intro} />

          <section aria-labelledby="best-time" className="pt-11">
            <h2 id="best-time" className={h2}>
              Best time to visit
            </h2>
            <BestMonths months={d.bestMonths} />
          </section>

          <section aria-labelledby="trips" className="pt-11">
            <h2 id="trips" className={h2}>
              Trips to {d.name}
            </h2>
            <ul className="grid gap-5 sm:grid-cols-2">
              {d.packages.map((card, i) => (
                <li
                  key={card.slug}
                  className="animate-rise"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <PackageCard card={card} />
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-card border border-line p-5">
            <small className="label-caps">Trips from</small>
            <b className="num block text-[32px] font-extrabold tracking-tight">
              {priceOrOnRequest(from)}
            </b>
            <span className="text-[13px] text-mute">per person, double sharing</span>
            <Link
              href={`/packages?destination=${d.slug}`}
              className="mt-4 block rounded-btn bg-primary px-4 py-3 text-center text-sm font-bold text-white no-underline hover:bg-primary-ink"
            >
              Compare {plural(d.packages.length, 'trip', 'trips')} →
            </Link>
            <p className="mt-3 text-[13px] text-mute">
              Every date listed is a departure we run ourselves.
            </p>
          </div>
        </aside>
      </div>

      <p className="mt-12 text-sm font-semibold">
        <Link href="/destinations">← All destinations</Link>
      </p>
    </Container>
  );
}
