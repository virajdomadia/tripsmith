'use client';

import { Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { components } from '@/lib/api-types';
import { inr } from '@/lib/format';
import { DuplicatePackage } from './DuplicatePackage';

type AdminPackageRow = components['schemas']['AdminPackageRow'];
type Tab = 'all' | 'live' | 'draft';

/** A dash reads better than a zero for "nothing here yet" (mockup A3). */
const orDash = (n: number, render: (n: number) => string = String) => (n ? render(n) : '—');

/**
 * Mockup A3. Filtering is client-side on purpose: the catalogue is a dozen packages, so a
 * round-trip per keystroke would buy nothing. Counts on the tabs come from the full list, not
 * the filtered one — otherwise "Live 12" would change as you type.
 */
export function PackagesTable({ items }: { items: AdminPackageRow[] }) {
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const searchId = useId();

  const counts = useMemo(
    () => ({
      all: items.length,
      live: items.filter((p) => p.status === 'live').length,
      draft: items.filter((p) => p.status === 'draft').length,
    }),
    [items],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (tab !== 'all' && p.status !== tab) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.destination.name.toLowerCase().includes(q);
    });
  }, [items, tab, query]);

  if (items.length === 0) {
    return (
      <div className="rounded-card border border-line bg-bg p-6 text-center text-mute">
        No packages yet — add the first one.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="all">All {counts.all}</TabsTrigger>
            <TabsTrigger value="live">Live {counts.live}</TabsTrigger>
            <TabsTrigger value="draft">Draft {counts.draft}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:ml-auto">
          <label htmlFor={searchId} className="sr-only">
            Search packages
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
            aria-hidden
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search packages…"
            className="h-9 w-full rounded-md border border-line bg-bg pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-64"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-bg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Package</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Nights</TableHead>
              <TableHead>From</TableHead>
              <TableHead>Departures</TableHead>
              <TableHead>Enquiries · 30 d</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-bold">
                  <span className="flex items-center gap-2.5">
                    <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md bg-line">
                      {p.coverUrl && (
                        <Image src={p.coverUrl} alt="" fill sizes="56px" className="object-cover" />
                      )}
                    </span>
                    {p.name}
                  </span>
                </TableCell>
                <TableCell className="text-ink2">{p.destination.name}</TableCell>
                <TableCell className="num">{p.nights}N</TableCell>
                <TableCell className="num">{orDash(p.startingPricePaise, inr)}</TableCell>
                <TableCell className="num">{orDash(p.departureCount)}</TableCell>
                <TableCell className="num">{orDash(p.recentEnquiryCount)}</TableCell>
                <TableCell>
                  <Badge variant={p.status === 'live' ? 'default' : 'secondary'}>
                    {p.status === 'live' ? 'Live' : 'Draft'}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-[13px] font-bold">
                  {p.status === 'live' && (
                    <Link
                      href={`/packages/${p.slug}`}
                      className="ml-3 text-primary"
                      target="_blank"
                    >
                      View
                    </Link>
                  )}
                  <DuplicatePackage id={p.id} name={p.name} variant="link" />
                  <Link href={`/admin/packages/${p.id}`} className="ml-3 text-primary">
                    Edit
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {shown.length === 0 && (
          <p className="p-6 text-center text-mute">No packages match this search.</p>
        )}
      </div>
    </div>
  );
}
