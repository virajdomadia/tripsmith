import type { Metadata } from 'next';
import Link from 'next/link';
import beach from '@/assets/about/beach.jpg';
import lake from '@/assets/about/lake.jpg';
import { Facts } from '@/components/site/about/Facts';
import { Team } from '@/components/site/about/Team';
import { Container } from '@/components/site/Container';
import { FramedPhotos } from '@/components/site/FramedPhotos';
import { SectionHead } from '@/components/site/home/SectionHead';
import { WhyUs } from '@/components/site/home/WhyUs';
import { PageHead } from '@/components/site/PageHead';
import { api } from '@/lib/api';
import { BUSINESS } from '@/lib/business';
import { OPEN_GRAPH } from '@/lib/seo/open-graph';
import { absolute } from '@/lib/seo/site-url';

/** Like `/`: rendered per request (CI builds with no api); the stats fetch is cached 1 h. */
export const dynamic = 'force-dynamic';

const ABOUT_DESCRIPTION =
  'Tripsmith is four people in Bengaluru who plan short Indian holidays the way we would for our own families — hotels we have slept in, departures we run, a phone that gets answered.';

export const metadata: Metadata = {
  title: 'About',
  description: ABOUT_DESCRIPTION,
  alternates: { canonical: absolute('/about') },
  openGraph: {
    ...OPEN_GRAPH,
    title: 'About Tripsmith',
    description: ABOUT_DESCRIPTION,
    url: absolute('/about'),
  },
};

export default async function AboutPage() {
  const { stats } = await api('/home', { tags: ['home'], revalidate: 3600 });
  const facts = [
    [String(stats.packages), 'trips we run'],
    [String(stats.destinations), 'destinations we know'],
    ['2 h', 'callback promise'],
    [String(BUSINESS.founded), 'first departure'],
  ] as const;

  return (
    <Container className="pb-20">
      <PageHead
        crumb="About"
        title={`Four people, ${stats.destinations} destinations, ${stats.packages} trips we would book for our own families.`}
      />
      <section className="mt-6 grid items-center gap-11 md:grid-cols-[1fr_1.1fr]">
        <FramedPhotos
          main={{ src: beach, alt: 'Radhanagar beach, Havelock' }}
          inset={{ src: lake, alt: 'Pangong Tso, Ladakh' }}
          stamp={{ top: 'Tripsmith', big: String(BUSINESS.founded), bottom: 'first departure' }}
        />
        <div className="grid max-w-[58ch] gap-4 leading-relaxed text-ink2">
          <p className="text-lg">
            Tripsmith started in {BUSINESS.founded} with one Goa departure for twelve
            friends-of-friends. We still run trips the same way: small groups, hotels we have slept
            in, a coach or a driver we trust, and a phone that gets answered by the person who
            planned your trip.
          </p>
          <p>
            We don&rsquo;t do Europe, we don&rsquo;t do fourteen-day marathons, and we won&rsquo;t
            list a date we can&rsquo;t run. {stats.destinations} destinations is all we can know
            properly — every hotel on this site is one that one of us has stayed in, and every
            departure has real seats behind it.
          </p>
          <p>
            Prices are per person and say what they include. If something goes wrong on the road — a
            cancelled ferry, a closed pass — you get us on WhatsApp, not a call centre.
          </p>
          <Facts items={facts} />
        </div>
      </section>
      <section className="mt-18">
        <SectionHead title="The team" sub="Four of us. You will talk to at least two." />
        <Team />
      </section>
      <section className="mt-18">
        <SectionHead
          title="How we work"
          sub="The four things every trip on this site is built on."
        />
        <WhyUs />
      </section>
      <p className="mt-12 text-mute">
        Want to talk it through? <Link href="/contact">Contact us</Link> — {BUSINESS.hours}.
      </p>
    </Container>
  );
}
