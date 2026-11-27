import Image from 'next/image';
import hero from '@/assets/home/hero.jpg';
import type { components } from '@/lib/api-types';
import { SearchBar } from './SearchBar';

type Facets = components['schemas']['SearchFacets'];

/**
 * Full-bleed hero (the LCP element: `priority`), copy on the left, the search bar over its foot.
 * Review 2026-11-27 (H2): the copy sat centred on bright sky; it now has its own scrim (from the
 * top on a phone, from the left from `md`) so white text clears WCAG AA, and on a phone the hero
 * is short enough that the whole search card, Search button included, is above the fold.
 */
export function Hero({ facets, trips }: { facets: Facets; trips: number }) {
  return (
    <section aria-labelledby="hero-title">
      <div className="relative h-[390px] overflow-hidden md:h-[600px]">
        <Image
          src={hero}
          alt="A houseboat moored under coconut palms on the Alleppey backwaters, Kerala"
          fill
          priority
          fetchPriority="high"
          sizes="100vw"
          className="animate-kenburns object-cover object-[50%_70%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(10_30_40/0.78),rgb(10_30_40/0.62)_70%,rgb(10_30_40/0.45))] md:bg-[linear-gradient(to_right,rgb(10_30_40/0.82),rgb(10_30_40/0.72)_66%,rgb(10_30_40/0.12)_90%)]"
        />
        <div className="absolute inset-x-0 top-9 mx-auto w-[min(1220px,100%-32px)] text-white md:top-28">
          <h1
            id="hero-title"
            className="animate-rise max-w-[15ch] text-[clamp(34px,5vw,64px)] leading-[1.05] tracking-[-0.01em]"
          >
            Holidays across India, planned by people who’ve been.
          </h1>
          <p
            className="animate-rise mt-3 max-w-[30rem] text-base font-medium md:mt-4 md:text-lg"
            style={{ animationDelay: '120ms' }}
          >
            {trips} trips we run ourselves, with real dates, real hotels and a person who calls you
            back.
          </p>
        </div>
      </div>
      <SearchBar facets={facets} />
    </section>
  );
}
