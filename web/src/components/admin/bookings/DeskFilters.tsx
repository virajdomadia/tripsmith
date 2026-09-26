import Link from 'next/link';
import { Search } from 'lucide-react';
import { NativeSelect } from '@/components/admin/NativeSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DESK_PATH,
  FLAGS,
  FLAG_LABELS,
  STATUSES,
  STATUS_LABELS,
  deskHref,
  type DeskFilters as Filters,
} from '@/lib/admin/booking-filters';
import type { components } from '@/lib/api-types';
import { shortDate } from '@/lib/format';

type Counts = components['schemas']['BookingCounts'];
type DepartureOption = components['schemas']['DepartureOption'];

const tabClass = (active: boolean, loud = false) =>
  `rounded-[10px] px-3 py-1.5 text-sm font-bold transition-colors ${
    active ? 'bg-ink text-white' : loud ? 'text-bad hover:bg-bad-soft' : 'text-ink2 hover:bg-bg2'
  }`;

/**
 * The enquiry inbox's pattern (InboxFilters): tabs are links, the rest is one GET form, so the
 * desk works with JavaScript off and every view is a URL. Two tab rows — status, and the two
 * things waiting on the owner — each counted with the other filters applied.
 */
export function DeskFilters({
  filters,
  counts,
  packages,
  departures,
}: {
  filters: Filters;
  counts: Counts;
  packages: { id: string; name: string }[];
  departures: DepartureOption[];
}) {
  const tabs = [
    { value: undefined, label: 'All', count: counts.all },
    ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s], count: counts[s] })),
  ];
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <nav className="flex flex-wrap gap-1" aria-label="Filter by status">
          {tabs.map((tab) => (
            <Link
              key={tab.label}
              href={deskHref(filters, { status: tab.value })}
              aria-current={filters.status === tab.value ? 'page' : undefined}
              className={tabClass(filters.status === tab.value)}
            >
              {tab.label} {tab.count}
            </Link>
          ))}
        </nav>
        <nav className="flex flex-wrap gap-1" aria-label="Needs attention">
          {FLAGS.map((flag) => {
            const active = filters.flag === flag;
            return (
              <Link
                key={flag}
                href={deskHref(filters, { flag: active ? undefined : flag })}
                aria-current={active ? 'page' : undefined}
                className={tabClass(active, counts[flag] > 0)}
              >
                {FLAG_LABELS[flag]} {counts[flag]}
              </Link>
            );
          })}
        </nav>
      </div>

      <form method="get" action={DESK_PATH} className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <label htmlFor="q" className="sr-only">
            Search ref, name, phone or email
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
            aria-hidden
          />
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.q ?? ''}
            placeholder="Ref, name, phone or email…"
            className="pl-9"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="packageId" className="text-xs font-bold text-mute">
            Package
          </label>
          <NativeSelect id="packageId" name="packageId" defaultValue={filters.packageId ?? ''}>
            <option value="">Any package</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <label htmlFor="departureId" className="text-xs font-bold text-mute">
            Departure
          </label>
          <NativeSelect
            id="departureId"
            name="departureId"
            defaultValue={filters.departureId ?? ''}
          >
            <option value="">Any departure</option>
            {departures.map((d) => (
              <option key={d.id} value={d.id}>
                {shortDate(d.date)} {d.date.slice(0, 4)} · {d.packageName}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <label htmlFor="from" className="text-xs font-bold text-mute">
            Departing from
          </label>
          <Input id="from" name="from" type="date" defaultValue={filters.from ?? ''} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="to" className="text-xs font-bold text-mute">
            <span className="sr-only">Departing </span>to
          </label>
          <Input id="to" name="to" type="date" defaultValue={filters.to ?? ''} />
        </div>
        {/* The tabs are links: carry them through the form. */}
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
        {filters.flag && <input type="hidden" name="flag" value={filters.flag} />}
        <Button type="submit" size="sm">
          Apply
        </Button>
        <Link
          href={deskHref(filters, {
            q: undefined,
            packageId: undefined,
            departureId: undefined,
            from: undefined,
            to: undefined,
          })}
          className="px-2 py-1.5 text-sm font-bold text-mute hover:text-ink"
        >
          Clear
        </Link>
      </form>
    </div>
  );
}
