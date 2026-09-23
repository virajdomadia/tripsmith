import Link from 'next/link';
import aboutOne from '@/assets/home/about-1.jpg';
import aboutTwo from '@/assets/home/about-2.jpg';
import type { components } from '@/lib/api-types';

import { Facts } from '../about/Facts';
import { FramedPhotos } from '../FramedPhotos';

type Stats = components['schemas']['HomeStats'];

/** S1 about band: two framed photos with a postmark, the story, four facts (two of them live). */
export function AboutBand({ stats }: { stats: Stats }) {
  const facts = [
    [String(stats.packages), 'trips we run'],
    [String(stats.destinations), 'destinations we know'],
    ['2 h', 'callback promise'],
    ['2019', 'first departure'],
  ] as const;
  return (
    <section className="mt-18 grid items-center gap-11 md:grid-cols-[1fr_1.1fr]">
      <FramedPhotos
        main={{ src: aboutOne, alt: 'Tea gardens under cloud at Munnar' }}
        inset={{ src: aboutTwo, alt: 'The Ridge at Shimla' }}
        stamp={{ top: 'Tripsmith', big: '2026', bottom: 'Bengaluru · India' }}
      />
      <div>
        <h2 className="text-[clamp(26px,3.2vw,38px)]">A small team that has actually been.</h2>
        <p className="mt-3 max-w-[52ch] text-base text-mute">
          Tripsmith is four people in Bengaluru who plan short Indian holidays the way we would for
          our own families — the same hotels we have slept in, departures we run ourselves, and a
          phone that gets answered.
        </p>
        <Facts items={facts} />
        <Link
          href="/about"
          className="mt-5.5 inline-block rounded-btn bg-primary px-5 py-3 font-bold text-white no-underline transition-colors hover:bg-primary-ink"
        >
          About Tripsmith
        </Link>
      </div>
    </section>
  );
}
