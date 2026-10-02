import Link from 'next/link';
import { LeaderAvatar } from '@/components/site/LeaderAvatar';
import type { AdminLeader } from '@/lib/admin/leader-schema';
import { cn } from '@/lib/utils';
import { LeaderActive } from './LeaderActive';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const leadsLabel = (l: AdminLeader) =>
  l.defaultFor || l.upcoming
    ? `${plural(l.defaultFor, 'package')} · ${plural(l.upcoming, 'upcoming date')}`
    : 'Not leading anything yet';

/**
 * Trip leaders, admin style A (R41): one card each — face, name, years, regions, languages, what
 * they lead — opening the editor beside the grid (`?sel=`); the switch sits outside the link.
 */
export function LeaderCards({ items, selected }: { items: AdminLeader[]; selected?: string }) {
  if (items.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line bg-bg p-8 text-center text-sm text-mute">
        No trip leaders yet — add the first one, then pick them on a package.
      </p>
    );
  }
  return (
    <ul
      aria-label="Trip leaders"
      className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]"
    >
      {items.map((l) => {
        const on = l.id === selected;
        return (
          <li
            key={l.id}
            className={cn(
              'grid min-w-0 overflow-hidden rounded-card border border-line bg-bg transition-[box-shadow,border-color]',
              on && 'border-primary shadow-[inset_0_0_0_1px_var(--color-primary)]',
              !l.active && 'bg-bg2',
            )}
          >
            <Link
              href={`/admin/leaders?sel=${encodeURIComponent(l.id)}#edit`}
              aria-current={on ? 'true' : undefined}
              className="grid gap-3 p-4 text-ink no-underline"
            >
              <span className="flex items-center gap-3">
                <LeaderAvatar
                  leader={l}
                  size={56}
                  className={cn(!l.active && 'opacity-60 grayscale')}
                />
                <span className="grid min-w-0">
                  <b className="truncate text-[16px] font-extrabold">{l.name}</b>
                  <small className="truncate text-[12.5px] text-mute">
                    {plural(l.yearsLeading, 'year')} leading · {l.regions.join(', ')}
                  </small>
                </span>
              </span>
              <span className="line-clamp-2 text-[13px] text-ink2">{l.bio}</span>
              <span className="flex flex-wrap gap-1">
                {l.languages.map((lang) => (
                  <span
                    key={lang}
                    className="rounded-chip bg-bg2 px-2 py-0.5 text-[11.5px] font-semibold text-ink2"
                  >
                    {lang}
                  </span>
                ))}
              </span>
            </Link>
            <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
              <small
                className={cn(
                  'rounded-chip px-2 py-0.5 text-[11.5px] font-bold',
                  !l.active
                    ? 'bg-bg text-mute'
                    : l.upcoming
                      ? 'bg-ok-soft text-ok'
                      : 'bg-warn-soft text-warn',
                )}
              >
                {l.active ? leadsLabel(l) : 'Switched off'}
              </small>
              <span className="ml-auto">
                <LeaderActive leader={l} />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
