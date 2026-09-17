import Link from 'next/link';
import { Photo } from '@/components/site/Photo';
import type { components } from '@/lib/api-types';
import { inr, monthRange } from '@/lib/format';

type Card = components['schemas']['DestinationCard'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * S2 tile: cover with a dark foot, a pill with the trip count and best months, name and
 * "tagline · starting ₹X". 4:3 on the grid, 16:9 one-up on phones; rises in by `index`.
 */
export function DestinationTile({ card, index }: { card: Card; index: number }) {
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
      <Link href={`/destinations/${card.slug}`} className="block text-white no-underline">
        <Photo
          src={card.coverUrl}
          alt=""
          sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
          className="aspect-[16/9] rounded-card sm:aspect-[4/3]"
        >
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-[rgb(10_20_30/0.8)] to-transparent to-55%"
          />
          <span className="num absolute top-3 left-3 rounded-chip bg-bg/90 px-2.5 py-1 text-xs font-bold text-ink">
            {plural(card.packageCount, 'trip', 'trips')} · best {monthRange(card.bestMonths)}
          </span>
          <span className="absolute inset-x-3.5 bottom-3.5 grid gap-0.5 [text-shadow:0_2px_16px_rgb(0_0_0/0.35)]">
            <b className="text-[24px] leading-tight font-extrabold tracking-tight sm:text-[26px]">
              {card.name}
            </b>
            <small className="num text-xs font-semibold opacity-95">
              {card.tagline}
              {card.startingPricePaise > 0 && ` · starting ${inr(card.startingPricePaise)}`}
            </small>
          </span>
        </Photo>
      </Link>
    </li>
  );
}
