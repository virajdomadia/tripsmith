import Image from 'next/image';
import type { components } from '@/lib/api-types';
import { SearchBar } from './SearchBar';

type Facets = components['schemas']['SearchFacets'];

/** Full-bleed hero (the LCP element: `priority`), centred copy, the search bar over its foot. */
export function Hero({ facets, trips }: { facets: Facets; trips: number }) {
  return (
    <section aria-labelledby="hero-title">
      <div className="relative h-[560px] overflow-hidden md:h-[620px]">
        <Image
          src="/home/hero.jpg"
          alt="A houseboat moored under coconut palms on the Alleppey backwaters, Kerala"
          fill
          priority
          sizes="100vw"
          className="animate-kenburns object-cover object-[50%_70%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(10_30_40/0.35),rgb(10_30_40/0.05)_40%,rgb(10_30_40/0.55))]"
        />
        <div className="absolute inset-x-0 top-20 px-5 text-center text-white [text-shadow:0_2px_24px_rgb(0_0_0/0.35)] md:top-24">
          <h1
            id="hero-title"
            className="animate-rise mx-auto max-w-[16ch] text-[clamp(40px,5.6vw,72px)] leading-[1.02]"
          >
            Holidays across India, planned by people who’ve been.
          </h1>
          <p
            className="animate-rise mx-auto mt-3.5 max-w-[560px] text-lg font-medium opacity-95"
            style={{ animationDelay: '120ms' }}
          >
            {trips} trips we run ourselves. Real dates, real hotels, real seats — and a person who
            calls you back.
          </p>
        </div>
      </div>
      <SearchBar facets={facets} />
    </section>
  );
}
