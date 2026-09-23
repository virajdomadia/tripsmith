import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container } from '@/components/site/Container';
import { ItineraryPdfLink } from '@/components/site/ItineraryPdfLink';
import { DeparturesTable } from '@/components/site/package/DeparturesTable';
import { Faq } from '@/components/site/package/Faq';
import { Gallery } from '@/components/site/package/Gallery';
import { Highlights } from '@/components/site/package/Highlights';
import { Hotels } from '@/components/site/package/Hotels';
import { Inclusions } from '@/components/site/package/Inclusions';
import { Itinerary } from '@/components/site/package/Itinerary';
import { ItineraryMotion } from '@/components/site/package/ItineraryMotion';
import { MobileCtaBar } from '@/components/site/package/MobileCtaBar';
import { OccupancyPricing } from '@/components/site/package/OccupancyPricing';
import { PackageHero } from '@/components/site/package/PackageHero';
import { PriceBox } from '@/components/site/package/PriceBox';
import { QuickFacts } from '@/components/site/package/QuickFacts';
import { RelatedPackages } from '@/components/site/package/RelatedPackages';
import { Section } from '@/components/site/package/Section';
import { SectionNav } from '@/components/site/package/SectionNav';
import { ViewBeacon } from '@/components/site/package/ViewBeacon';
import { WhatsAppPageMessage } from '@/components/site/whatsapp/WhatsAppContext';
import { api } from '@/lib/api';
import { loadPackage, REVALIDATE_SECONDS } from '@/lib/catalog';
import { whatsappInterest } from '@/lib/business';
import { duration, inr } from '@/lib/format';
import { breadcrumbJsonLd } from '@/lib/seo/breadcrumb-jsonld';
import { faqJsonLd, packageJsonLd } from '@/lib/seo/package-jsonld';
import { absolute } from '@/lib/seo/site-url';

type Params = { slug: string };

/**
 * Prerender every live package at build; new slugs render on first request. CI builds with no
 * api reachable, so an unreachable api means "prerender nothing" rather than a failed build.
 */
export async function generateStaticParams(): Promise<Params[]> {
  try {
    const { items } = await api('/packages', {
      tags: ['packages'],
      revalidate: REVALIDATE_SECONDS,
    });
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
    alternates: { canonical: absolute(`/packages/${p.slug}`) },
    // The image is the generated card from ./opengraph-image.tsx (F13), added by Next.
    openGraph: { title: p.name, description: p.summary, type: 'website' },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function PackagePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const pkg = await loadPackage(slug);
  const url = absolute(`/packages/${pkg.slug}`);
  const faq = faqJsonLd(pkg);

  return (
    <Container>
      <JsonLd data={packageJsonLd(pkg, url)} />
      <JsonLd
        // The very trail `PackageHero` renders: Home › destination › this package.
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: pkg.destination.name, path: `/destinations/${pkg.destination.slug}` },
          { name: pkg.name, path: `/packages/${pkg.slug}` },
        ])}
      />
      {faq && <JsonLd data={faq} />}
      <WhatsAppPageMessage message={whatsappInterest(pkg.name, url)} hidden />
      <ViewBeacon slug={pkg.slug} />
      <PackageHero pkg={pkg} url={url} />
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

      {/* No items-start: the aside must stretch to the row height so PriceBox's sticky has room to travel. */}
      <div className="mt-7 grid gap-12 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <Section id="overview" title={null}>
            <p className="max-w-[62ch] text-lg leading-relaxed text-ink2">{pkg.summary}</p>
            <Highlights items={pkg.highlights} />
          </Section>
          <Section id="itinerary" title="Day by day" action={<ItineraryPdfLink slug={pkg.slug} />}>
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
            <OccupancyPricing departures={pkg.departures} />
          </Section>
          {pkg.faq.length > 0 && (
            <Section id="faq" title="Questions">
              <Faq items={pkg.faq} />
            </Section>
          )}
        </div>
        <aside className="hidden lg:block">
          <PriceBox pkg={pkg} url={url} />
        </aside>
      </div>

      <RelatedPackages cards={pkg.related} />
      <MobileCtaBar pkg={pkg} url={url} />
    </Container>
  );
}
