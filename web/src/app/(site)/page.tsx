import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { Container } from '@/components/site/Container';
import { DestinationTile } from '@/components/site/destinations/DestinationTile';
import { AboutBand } from '@/components/site/home/AboutBand';
import { CallbackBand } from '@/components/site/home/CallbackBand';
import { Hero } from '@/components/site/home/Hero';
import { SectionHead } from '@/components/site/home/SectionHead';
import { Testimonials } from '@/components/site/home/Testimonials';
import { ThemeChips } from '@/components/site/home/ThemeChips';
import { TrustStrip } from '@/components/site/home/TrustStrip';
import { WhyUs } from '@/components/site/home/WhyUs';
import { PackageCard } from '@/components/site/PackageCard';
import { api } from '@/lib/api';
import { siteJsonLd } from '@/lib/seo/site-jsonld';
import { absolute, SITE_URL } from '@/lib/seo/site-url';

/** Like /destinations: rendered per request (CI builds with no api); fetches cached 1 h + tagged. */
export const dynamic = 'force-dynamic';

const REVALIDATE_SECONDS = 60 * 60;

export const metadata: Metadata = {
  title: { absolute: 'Tripsmith · Holidays across India, planned by people who’ve been' },
  description:
    'Short Indian holidays with real departure dates, hotels we have stayed in and per-person prices. Goa, Kerala, Himachal and more — a person calls you back within two hours.',
  alternates: { canonical: absolute('/') },
};

const GRID = 'grid gap-4.5 sm:grid-cols-2 lg:grid-cols-3';

export default async function Home() {
  const [home, { facets }] = await Promise.all([
    api('/home', { tags: ['home', 'packages', 'destinations'], revalidate: REVALIDATE_SECONDS }),
    api('/packages', { tags: ['packages'], revalidate: 60 }),
  ]);
  const { destinations, packages, testimonials, stats } = home;

  return (
    <>
      {siteJsonLd(SITE_URL).map((data, i) => (
        <JsonLd key={i} data={data} />
      ))}
      <Hero facets={facets} trips={stats.packages} />
      <Container className="pb-4">
        <ThemeChips />
        <TrustStrip departures={stats.departures} />

        <section className="mt-18">
          <SectionHead
            title="Trending destinations"
            sub="Where our travellers are going this season."
            href="/destinations"
            link="All destinations"
          />
          <ul className={GRID}>
            {destinations.map((d, i) => (
              <DestinationTile key={d.slug} card={d} index={i} />
            ))}
          </ul>
        </section>

        <section className="mt-18">
          <SectionHead
            title="Handpicked holiday packages"
            sub="Every package with a hotel we know and a departure you can count on."
            href="/packages"
            link={`All ${stats.packages} packages`}
          />
          <ul className={GRID}>
            {packages.map((p, i) => (
              <li
                key={p.slug}
                className="animate-rise"
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              >
                <PackageCard card={p} />
              </li>
            ))}
          </ul>
        </section>

        <AboutBand stats={stats} />

        <section className="mt-18">
          <SectionHead title="Why book with Tripsmith" />
          <WhyUs />
        </section>

        <section className="mt-18">
          <SectionHead title="Travellers say" sub="Real trips, real names, real dates." />
          <Testimonials items={testimonials} />
        </section>

        <CallbackBand />
      </Container>
    </>
  );
}
