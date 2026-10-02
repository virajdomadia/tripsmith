import { ArrowRight, Languages, MapPin } from 'lucide-react';
import Link from 'next/link';
import { LeaderAvatar } from '@/components/site/LeaderAvatar';
import type { components } from '@/lib/api-types';
import { shortDate } from '@/lib/format';

type Leader = components['schemas']['LeaderCardOut'];
type Departure = components['schemas']['DepartureOut'];

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;
const years = (n: number) => (n === 1 ? '1 year leading trips' : `${n} years leading trips`);

/** Leaders other than the default who lead some of the upcoming dates, with those dates. */
export function otherLeaders(leader: Leader | null, departures: Departure[]) {
  const others = new Map<string, { ref: NonNullable<Departure['leader']>; dates: string[] }>();
  for (const d of departures) {
    if (!d.leader || d.leader.slug === leader?.slug) continue;
    const seen = others.get(d.leader.slug) ?? { ref: d.leader, dates: [] };
    seen.dates.push(d.date);
    others.set(d.leader.slug, seen);
  }
  return [...others.values()];
}

/**
 * "Your trip leader" (R41): the package's default leader as a field-guide card — face, years,
 * languages, regions, the short bio and a taped fun-fact note — linking to their page. Dates led
 * by someone else are named underneath, so the card never promises the wrong person.
 */
export function LeaderCard({ leader, departures }: { leader: Leader; departures: Departure[] }) {
  const others = otherLeaders(leader, departures);
  return (
    <div className="grid gap-4">
      <article className="group relative grid gap-5 overflow-hidden rounded-card border border-line bg-bg p-5 shadow-[0_18px_40px_-30px_rgb(20_32_42/0.45)] sm:grid-cols-[auto_1fr] sm:p-6">
        {/* A faint contour behind the card, echoing the monogram's ridge line. */}
        <svg
          aria-hidden
          viewBox="0 0 400 120"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full text-primary/[.07]"
        >
          <path
            d="M0 96 L60 58 L96 74 L150 30 L196 70 L232 52 L300 88 L352 60 L400 82 L400 120 L0 120 Z"
            fill="currentColor"
          />
        </svg>
        <div className="relative justify-self-start">
          <LeaderAvatar
            leader={leader}
            size={96}
            className="ring-4 ring-bg2 transition-transform duration-500 ease-(--ease-out) group-hover:-rotate-3 motion-reduce:transition-none motion-reduce:group-hover:rotate-0"
          />
        </div>
        <div className="relative grid min-w-0 content-start gap-3">
          <div>
            <h3 className="text-[22px] font-extrabold tracking-tight">{leader.name}</h3>
            <p className="text-sm font-semibold text-mute">{years(leader.yearsLeading)}</p>
          </div>
          <ul className="grid gap-1.5 text-[13.5px] text-ink2">
            <li className="flex items-start gap-2">
              <Languages className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="sr-only">Speaks </span>
                {leader.languages.join(' · ')}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="sr-only">Leads trips in </span>
                {leader.regions.join(' · ')}
              </span>
            </li>
          </ul>
          <p className="max-w-[60ch] text-[15px] leading-relaxed">{leader.bio}</p>
          {leader.funFact && (
            <p className="relative w-fit max-w-[52ch] -rotate-[0.6deg] rounded-[10px] bg-warn-soft px-3.5 py-2.5 text-[13.5px] text-ink">
              <span
                aria-hidden
                className="absolute -top-2 left-5 h-3.5 w-12 rotate-2 rounded-[2px] bg-action/50"
              />
              <b className="font-extrabold">Ask {firstName(leader.name)} about it: </b>
              {leader.funFact}
            </p>
          )}
          <Link
            href={`/leaders/${leader.slug}`}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-primary"
          >
            More trips with {firstName(leader.name)}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              aria-hidden
            />
          </Link>
        </div>
      </article>
      {others.length > 0 && (
        <ul className="grid gap-2" aria-label="Dates with another leader">
          {others.map(({ ref, dates }) => (
            <li key={ref.slug} className="flex flex-wrap items-center gap-2 text-sm text-ink2">
              <LeaderAvatar leader={ref} size={28} />
              <span>
                <Link href={`/leaders/${ref.slug}`} className="font-bold text-ink">
                  {ref.name}
                </Link>{' '}
                leads {dates.length === 1 ? 'the' : 'these'} {dates.map(shortDate).join(', ')}{' '}
                {dates.length === 1 ? 'departure' : 'departures'}.
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
