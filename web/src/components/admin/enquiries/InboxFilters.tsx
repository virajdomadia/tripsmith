import Link from 'next/link';
import { Search } from 'lucide-react';
import { NativeSelect } from '@/components/admin/NativeSelect';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  INBOX_PATH,
  STATUSES,
  STATUS_LABELS,
  TYPES,
  TYPE_LABELS,
  filterHref,
  type Filters,
} from '@/lib/admin/enquiry-filters';
import type { components } from '@/lib/api-types';

type StatusCounts = components['schemas']['StatusCounts'];
type PackageOption = { id: string; name: string };

/**
 * Tabs are links and everything else is one GET form, so the whole inbox works with JavaScript
 * off and every view is a URL the owner can bookmark or send. Counts come from the api with all
 * the other filters applied, so "New 3" means new *in this view* (A6).
 */
export function InboxFilters({
  filters,
  counts,
  packages,
}: {
  filters: Filters;
  counts: StatusCounts;
  packages: PackageOption[];
}) {
  const tabs = [
    { value: undefined, label: 'All', count: counts.all },
    ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s], count: counts[s] })),
  ];
  return (
    <div className="grid gap-3">
      <nav className="flex flex-wrap gap-1" aria-label="Filter by status">
        {tabs.map((tab) => {
          const active = filters.status === tab.value;
          return (
            <Link
              key={tab.label}
              href={filterHref(filters, { status: tab.value })}
              aria-current={active ? 'page' : undefined}
              className={`rounded-[10px] px-3 py-1.5 text-sm font-bold transition-colors ${
                active ? 'bg-ink text-white' : 'text-ink2 hover:bg-bg2'
              }`}
            >
              {tab.label} {tab.count}
            </Link>
          );
        })}
      </nav>

      <form method="get" action={INBOX_PATH} className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <label htmlFor="q" className="sr-only">
            Search name or phone
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
            placeholder="Search name or phone…"
            className="pl-9"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="type" className="text-xs font-bold text-mute">
            Type
          </label>
          <NativeSelect id="type" name="type" defaultValue={filters.type ?? ''}>
            <option value="">Any type</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
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
          <label htmlFor="from" className="text-xs font-bold text-mute">
            Received from
          </label>
          <Input id="from" name="from" type="date" defaultValue={filters.from ?? ''} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="to" className="text-xs font-bold text-mute">
            <span className="sr-only">Received </span>to
          </label>
          <Input id="to" name="to" type="date" defaultValue={filters.to ?? ''} />
        </div>
        {/* The status tab is a link, so carry it through the form rather than losing it. */}
        {filters.status && <input type="hidden" name="status" value={filters.status} />}
        <Button type="submit" size="sm">
          Apply
        </Button>
        <Link
          href={filterHref(filters, {
            q: undefined,
            type: undefined,
            packageId: undefined,
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
