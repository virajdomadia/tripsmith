import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container } from '@/components/site/Container';
import { DeparturesTable } from '@/components/site/package/DeparturesTable';
import { Faq } from '@/components/site/package/Faq';
import { Gallery } from '@/components/site/package/Gallery';
import { Highlights } from '@/components/site/package/Highlights';
import { Hotels } from '@/components/site/package/Hotels';
import { Inclusions } from '@/components/site/package/Inclusions';
import { Itinerary } from '@/components/site/package/Itinerary';
import { ItineraryMotion } from '@/components/site/package/ItineraryMotion';
import { OccupancyPricing } from '@/components/site/package/OccupancyPricing';
import { PackageHero } from '@/components/site/package/PackageHero';
import { PriceBox } from '@/components/site/package/PriceBox';
import { QuickFacts } from '@/components/site/package/QuickFacts';
import { RelatedPackages } from '@/components/site/package/RelatedPackages';
import { Section } from '@/components/site/package/Section';
import { SectionNav } from '@/components/site/package/SectionNav';
import { api, ApiRequestError } from '@/lib/api';
import { duration, inr } from '@/lib/format';
import { packageJsonLd } from '@/lib/seo/package-jsonld';

type Params = { slug: string };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Tagged + cached until the api revalidates `package:<slug>` (admin edits, F18). Draft/unknown → 404 page. */
async function loadPackage(slug: string) {
  try {
    return await api('/packages/{slug}', {
      params: { slug },
      tags: [`package:${slug}`],
      revalidate: false,
    });
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) notFound();
    throw err;
  }
}

/**
 * Prerender every live package at build; new slugs render on first request. CI builds with no
 * api reachable, so an unreachable api means "prerender nothing" rather than a failed build.
 */
export async function generateStaticParams(): Promise<Params[]> {
  try {
    const { items } = await api('/packages', { tags: ['packages'], revalidate: false });
    return items.map((p) => ({ slug: p.slug }));
  } catch (err) {
    console.warn(
      `generateStaticParams: api unreachable, prerendering no packages (${String(err)})`,
    );
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await loadPackage(slug);
  const title = `${p.name} — ${duration(p.nights, p.days)} ${p.destination.name} package from ${inr(p.startingPricePaise)}`;
  return {
    title,
    description: p.summary,
    alternates: { canonical: `${SITE_URL}/packages/${p.slug}` },
    openGraph: {
      title: p.name,
      description: p.summary,
      type: 'website',
      images: p.cover
        ? [{ url: p.cover.url, width: p.cover.width, height: p.cover.height, alt: p.cover.alt }]
        : [],
    },
  };
}

export default async function PackagePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const pkg = await loadPackage(slug);
  const url = `${SITE_URL}/packages/${pkg.slug}`;

  return (
    <Container>
      <JsonLd data={packageJsonLd(pkg, url)} />
      <PackageHero pkg={pkg} />
      <Gallery images={pkg.images} />
      <QuickFacts pkg={pkg} />
      <SectionNav
        sections={[
          { id: 'overview', label: 'Overview' },
          { id: 'itinerary', label: 'Itinerary' },
          { id: 'inclusions', label: 'Inclusions' },
          { id: 'hotels', label: 'Hotels' },
          { id: 'dates', label: 'Dates & prices' },
          ...(pkg.faq.length ? [{ id: 'faq', label: 'FAQ' }] : []),
        ]}
      />

      <div className="mt-7 grid items-start gap-12 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <Section id="overview" title={null}>
            <p className="max-w-[62ch] text-lg leading-relaxed text-ink2">{pkg.summary}</p>
            <Highlights items={pkg.highlights} />
          </Section>
          <Section id="itinerary" title="Day by day">
            <ItineraryMotion>
              <Itinerary days={pkg.itinerary} />
            </ItineraryMotion>
          </Section>
          <Section id="inclusions" title="What's in the price">
            <Inclusions inclusions={pkg.inclusions} exclusions={pkg.exclusions} />
          </Section>
          <Section id="hotels" title="Where you stay">
            <Hotels hotels={pkg.hotels} />
          </Section>
          <Section id="dates" title="Dates & prices">
            <DeparturesTable departures={pkg.departures} />
            <h3 className="mt-8 mb-3 text-lg">Price per person</h3>
            <OccupancyPricing departures={pkg.departures} />
          </Section>
          {pkg.faq.length > 0 && (
            <Section id="faq" title="Questions">
              <Faq items={pkg.faq} />
            </Section>
          )}
        </div>
        <aside className="hidden lg:block">
          <PriceBox pkg={pkg} />
        </aside>
      </div>

      <RelatedPackages cards={pkg.related} />
    </Container>
  );
}
