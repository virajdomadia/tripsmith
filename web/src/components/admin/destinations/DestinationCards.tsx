import Image from 'next/image';
import Link from 'next/link';
import type { components } from '@/lib/api-types';
import { monthRange, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

type AdminDestination = components['schemas']['AdminDestination'];

const LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export const packagesLabel = (d: AdminDestination) => {
  const drafts = d.packageCount - d.livePackageCount;
  if (!d.packageCount) return 'No packages';
  return drafts ? `${d.livePackageCount} live · ${drafts} draft` : `${d.livePackageCount} live`;
};

/**
 * Mockup Destinations A's cover cards: the photo with its order, name and region, the tagline,
 * the twelve months with the best ones lit, the packages and the next departure. A card opens
 * the destination in the editor beside the grid (`?sel=`); on a phone it jumps down to it.
 */
export function DestinationCards({
  items,
  selected,
}: {
  items: AdminDestination[];
  selected?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line bg-bg p-8 text-center text-sm text-mute">
        No destinations yet — add the first one.
      </p>
    );
  }
  return (
    <ul
      aria-label="Destinations"
      className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]"
    >
      {items.map((d) => {
        const on = d.id === selected;
        const drafts = d.packageCount - d.livePackageCount;
        return (
          <li key={d.id} className="min-w-0">
            <Link
              href={`/admin/destinations?sel=${encodeURIComponent(d.id)}#edit`}
              scroll={false}
              aria-current={on ? 'true' : undefined}
              className={cn(
                'grid h-full overflow-hidden rounded-card border border-line bg-bg text-ink no-underline transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-20px_rgba(20,32,42,.4)] motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                on && 'border-primary shadow-[inset_0_0_0_1px_var(--color-primary)]',
              )}
            >
              <span className="relative block aspect-[16/10] bg-bg2">
                <Image
                  src={d.coverUrl}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, 300px"
                  className="object-cover"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/10 to-transparent"
                />
                <span
                  className="num absolute top-2.5 left-2.5 grid size-7 place-items-center rounded-full bg-bg text-[12px] font-extrabold"
                  title="Order"
                >
                  <span className="sr-only">Order </span>
                  {d.position}
                </span>
                <span className="absolute right-3 bottom-2.5 left-3 grid text-white">
                  <b className="text-[19px] leading-tight font-extrabold">{d.name}</b>
                  <small className="text-[12.5px] font-semibold text-white/85">{d.region}</small>
                </span>
              </span>
              <span className="grid gap-2.5 p-3.5">
                <span className="line-clamp-2 text-[13px] text-ink2">{d.tagline}</span>
                <span
                  role="img"
                  aria-label={`Best months: ${monthRange(d.bestMonths) || 'none set'}`}
                  className="grid grid-cols-12 gap-0.5"
                >
                  {LETTERS.map((m, i) => (
                    <i
                      key={i}
                      className={cn(
                        'rounded-[4px] py-0.5 text-center text-[10px] font-bold not-italic',
                        d.bestMonths.includes(i + 1) ? 'bg-primary text-white' : 'bg-bg2 text-mute',
                      )}
                    >
                      {m}
                    </i>
                  ))}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={cn(
                      'rounded-chip px-2 py-0.5 text-[11.5px] font-bold',
                      !d.packageCount
                        ? 'bg-bg2 text-mute'
                        : drafts
                          ? 'bg-warn-soft text-warn'
                          : 'bg-ok-soft text-ok',
                    )}
                  >
                    {packagesLabel(d)}
                  </span>
                  <small className="text-[12px] text-mute">
                    {d.nextDepartureOn
                      ? `Next departure ${shortDate(d.nextDepartureOn)}`
                      : 'No dates on sale'}
                  </small>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
