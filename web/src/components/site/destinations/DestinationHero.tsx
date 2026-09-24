import Link from 'next/link';
import { Photo } from '@/components/site/Photo';
import type { components } from '@/lib/api-types';
import { inr, isPriced, monthRange } from '@/lib/format';

type DestinationDetail = components['schemas']['DestinationDetail'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** S3 `.phero`: breadcrumb, 21:9 cover (4:5 on phones), caption with name, tagline, best months, trips-from. */
export function DestinationHero({ d, from }: { d: DestinationDetail; from: number }) {
  return (
    <>
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 pt-3.5 text-[13px] text-mute [&_a]:inline-flex [&_a]:min-h-6 [&_a]:items-center"
      >
        <Link href="/" className="hover:text-ink">
          Home
        </Link>
        <span aria-hidden>›</span>
        <Link href="/destinations" className="hover:text-ink">
          Destinations
        </Link>
        <span aria-hidden>›</span>
        <span aria-current="page" className="text-ink">
          {d.name}
        </span>
      </nav>
      <div className="relative mt-3.5">
        <Photo
          src={d.coverUrl}
          alt={`${d.name} — ${d.tagline}`}
          sizes="(min-width: 1280px) 1220px, 100vw"
          priority
          className="aspect-[4/5] rounded-card sm:aspect-[21/9]"
        />
        <div className="absolute inset-x-0 bottom-0 rounded-b-card bg-gradient-to-t from-[rgb(10_20_30/0.7)] to-transparent p-5 text-white [text-shadow:0_2px_20px_rgb(0_0_0/0.4)] sm:p-8">
          <h1 className="text-[clamp(32px,4.6vw,56px)]">{d.name}</h1>
          <div className="num mt-2.5 flex flex-wrap gap-3.5 text-sm font-semibold">
            <span>{d.tagline}</span>
            <span>Best {monthRange(d.bestMonths)}</span>
            <span>
              {plural(d.packages.length, 'trip', 'trips')}
              {isPriced(from) && ` from ${inr(from)}`}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
