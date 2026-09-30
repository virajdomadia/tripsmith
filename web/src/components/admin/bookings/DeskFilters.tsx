import Link from 'next/link';
import { Search } from 'lucide-react';
import { NativeSelect } from '@/components/admin/NativeSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CHANNEL_LABEL } from '@/lib/admin/counter';
import {
  CHANNELS,
  DESK_PATH,
  STATUSES,
  STATUS_LABELS,
  deskHref,
  type BookingFlag,
  type DeskFilters as Filters,
} from '@/lib/admin/booking-filters';
import type { components } from '@/lib/api-types';
import { shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LiveFilterForm } from './LiveFilterForm';

type Counts = components['schemas']['BookingCounts'];
type DepartureOption = components['schemas']['DepartureOption'];

/** Desk A's attention tiles: what is waiting on the owner, counted with the other filters on.
 *  "Balance due" is P5's; "Details missing" (P9) joins them later. */
const TILES: { flag: BookingFlag; label: string; hint: string; tone: string }[] = [
  { flag: 'refund', label: 'Refund needed', hint: 'Money in, no seat behind it', tone: 'text-bad' },
  {
    flag: 'cancellation',
    label: 'Cancellation requested',
    hint: 'Seats held until you decide',
    tone: 'text-warn',
  },
  {
    flag: 'balance',
    label: 'Balance due',
    hint: 'On a deposit, the rest still to pay',
    tone: 'text-primary',
  },
];

/**
 * Mockup Bookings desk A: counted attention tiles (a filter each), status tabs, then filters that
 * apply as you type. Tiles and tabs are links and the form is a GET form, so every view is a URL
 * and the desk still works with JavaScript off.
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
    ...STATUSES.map((s) => ({
      value: s,
      label: STATUS_LABELS[s],
      // `?? 0`: an api from before P5 has no deposit count (the web/api deploy race).
      count: (s === 'partially_paid' ? counts.partiallyPaid : counts[s]) ?? 0,
    })),
  ];
  return (
    <div className="grid gap-3">
      <nav aria-label="Needs attention" className="grid gap-2.5 sm:grid-cols-3">
        {TILES.map((t) => {
          const active = filters.flag === t.flag;
          const n = counts[t.flag] ?? 0;
          return (
            <Link
              key={t.flag}
              href={deskHref(filters, { flag: active ? undefined : t.flag })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'grid gap-0.5 rounded-card border border-line bg-bg px-3.5 py-3 text-ink no-underline transition-[border-color,box-shadow] hover:border-ink',
                active &&
                  'border-primary bg-primary-soft/40 shadow-[inset_0_0_0_1px_var(--color-primary)]',
              )}
            >
              <span
                className={cn(
                  'num text-[24px] leading-none font-extrabold',
                  n ? t.tone : 'text-mute',
                )}
              >
                {n}
              </span>
              <span className="text-[13px] font-extrabold">
                {t.label}
                {active && <span className="font-bold text-primary"> · filtering</span>}
              </span>
              <span className="text-[12px] text-mute">{t.hint}</span>
            </Link>
          );
        })}
      </nav>

      <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="Filter by status">
        {tabs.map((tab) => {
          const active = filters.status === tab.value;
          return (
            <Link
              key={tab.label}
              href={deskHref(filters, { status: tab.value })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-bold no-underline transition-colors',
                active ? 'border-ink text-ink' : 'border-transparent text-mute hover:text-ink',
              )}
            >
              {tab.label} <span className="num font-semibold text-mute">{tab.count}</span>
            </Link>
          );
        })}
      </nav>

      <LiveFilterForm
        action={DESK_PATH}
        submit={
          <Button type="submit" size="sm">
            Apply
          </Button>
        }
        clear={
          <Link
            href={deskHref(filters, {
              q: undefined,
              packageId: undefined,
              departureId: undefined,
              channel: undefined,
              from: undefined,
              to: undefined,
            })}
            className="px-2 py-1.5 text-sm font-bold text-mute hover:text-ink"
          >
            Clear
          </Link>
        }
      >
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
          <label htmlFor="channel" className="text-xs font-bold text-mute">
            Channel
          </label>
          <NativeSelect id="channel" name="channel" defaultValue={filters.channel ?? ''}>
            <option value="">Any channel</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
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
        {/* Tiles and tabs are links: carry them, and the open booking, through the form. */}
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
        {filters.flag && <input type="hidden" name="flag" value={filters.flag} />}
        {filters.sel && <input type="hidden" name="sel" value={filters.sel} />}
      </LiveFilterForm>
    </div>
  );
}
