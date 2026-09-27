'use client';

import { ArrowRight, Eye, FileText, Info, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import {
  type AdminPackageRow,
  health,
  type HealthTone,
  inPill,
  matches,
  needsLook,
  PILLS,
  type Pill,
  type Sort,
  SORTS,
  sortRows,
} from '@/lib/admin/catalogue';
import { inr, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dealNotice, NOTICE_TONE } from './DealPanel';
import { DuplicatePackage } from './DuplicatePackage';

const TONE: Record<HealthTone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-primary-soft text-primary-ink',
};

const chip = 'inline-flex items-center rounded-chip px-2 py-0.5 text-[11.5px] font-bold';

function Photo({
  src,
  sizes,
  className,
}: {
  src: string | null;
  sizes: string;
  className?: string;
}) {
  return (
    <span className={cn('relative block overflow-hidden bg-bg2', className)} aria-hidden>
      {src && <Image src={src} alt="" fill sizes={sizes} className="object-cover" />}
    </span>
  );
}

function Card({ p }: { p: AdminPackageRow }) {
  const h = health(p);
  const deal = dealNotice(p);
  const done = p.publishRules.filter((r) => r.ok).length;
  const next = p.nextDeparture;
  const pct = next && next.seats ? Math.round((next.taken / next.seats) * 100) : 0;
  const edit = `/admin/packages/${p.id}`;
  return (
    <article
      aria-label={p.name}
      className="grid min-w-0 content-start overflow-hidden rounded-card border border-line bg-bg transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-20px_rgba(20,32,42,.4)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative">
        <Photo src={p.coverUrl} sizes="(max-width: 640px) 100vw, 360px" className="aspect-[16/9]" />
        <span className="absolute top-2.5 left-2.5 flex gap-1">
          <span
            className={cn(chip, p.status === 'live' ? 'bg-ok-soft text-ok' : 'bg-bg2 text-mute')}
          >
            {p.status === 'live' ? 'Live' : 'Draft'}
          </span>
          {p.featured && (
            <span className={cn(chip, 'bg-primary-soft text-primary-ink')}>Featured</span>
          )}
        </span>
        <span className={cn(chip, 'absolute top-2.5 right-2.5', TONE[h.tone])}>{h.word}</span>
        {deal && p.dealPricePaise != null && (
          <span
            className={cn(
              'absolute bottom-2.5 left-2.5 rounded-md px-2 py-0.5 text-[12px] font-extrabold shadow-sm',
              NOTICE_TONE[deal.tone],
            )}
          >
            {p.dealState === 'active'
              ? `Deal ${inr(p.dealPricePaise)}`
              : p.dealState === 'ended'
                ? 'Deal ended'
                : 'Deal inactive'}
          </span>
        )}
      </div>
      <div className="grid gap-2.5 p-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="min-w-0 flex-1 text-[16px] leading-snug font-extrabold">{p.name}</h3>
          <span className="num text-[15px] font-extrabold whitespace-nowrap">
            <small className="mr-1 text-[11.5px] font-semibold text-mute">from</small>
            {inr(p.startingPricePaise)}
          </span>
        </div>
        <p className="text-[12.5px] text-mute">
          {p.destination.name} · {p.nights} {p.nights === 1 ? 'night' : 'nights'} ·{' '}
          {p.departureCount} {p.departureCount === 1 ? 'date' : 'dates'}
        </p>
        <dl className="grid grid-cols-3 gap-2 border-y border-line py-2.5 text-[12px]">
          <div className="grid min-w-0 content-start gap-1">
            <dt className="font-bold text-mute">Publish checks</dt>
            <dd className="flex gap-1" aria-label={`${done} of 4 publish checks done`}>
              {p.publishRules.map((r) => (
                <i
                  key={r.key}
                  title={`${r.label}: ${r.detail}`}
                  className={cn('size-2.5 rounded-full', r.ok ? 'bg-ok' : 'bg-bad')}
                />
              ))}
            </dd>
            <dd className="text-ink2">{done} of 4 done</dd>
          </div>
          <div className="grid min-w-0 content-start gap-1">
            <dt className="truncate font-bold text-mute">
              {next ? `Next · ${shortDate(next.date)}` : 'Next date'}
            </dt>
            {next ? (
              <>
                <dd aria-hidden className="h-1.5 overflow-hidden rounded-full bg-bg2">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </dd>
                <dd className="text-ink2">
                  {next.taken} of {next.seats} taken
                </dd>
              </>
            ) : (
              <dd className="text-ink2">None on sale</dd>
            )}
          </div>
          <div className="grid min-w-0 content-start gap-0.5">
            <dt className="font-bold text-mute">Enquiries</dt>
            <dd className="num text-[18px] leading-tight font-extrabold">{p.recentEnquiryCount}</dd>
            <dd className="text-ink2">in 30 days</dd>
          </div>
        </dl>
        {h.why && (
          <p
            className={cn(
              'flex gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold',
              TONE[h.tone],
            )}
          >
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{h.why}</span>
          </p>
        )}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-line px-4 py-2.5">
        <Link href={edit} className={buttonVariants({ size: 'sm' })}>
          <FileText className="size-3.5" aria-hidden />
          Edit
        </Link>
        <DuplicatePackage id={p.id} name={p.name} />
        {p.status === 'live' && (
          <a
            href={`/packages/${p.slug}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ size: 'sm', variant: 'ghost' })}
          >
            <Eye className="size-3.5" aria-hidden />
            View
          </a>
        )}
      </div>
    </article>
  );
}

/**
 * Packages B · Photo catalogue (R59, P20): photo cards the owner recognises trips by, each with
 * its own health — a status word, the four publish checks, the next date's seat fill, 30-day
 * enquiries and the deal stamp. A "Needs a look" row names what to fix today, each with the one
 * verb that fixes it. Filtering stays client-side: the catalogue is a dozen packages.
 */
export function PackageCatalogue({ items }: { items: AdminPackageRow[] }) {
  const [pill, setPill] = useState<Pill>('all');
  const [q, setQ] = useState('');
  const [dest, setDest] = useState('');
  const [sort, setSort] = useState<Sort>('next');
  const ids = { q: useId(), dest: useId(), sort: useId() };

  const dests = useMemo(
    () =>
      [...new Map(items.map((p) => [p.destination.slug, p.destination.name])).entries()].sort(
        (a, b) => a[1].localeCompare(b[1]),
      ),
    [items],
  );
  const look = useMemo(() => sortRows(items.filter(needsLook), 'next'), [items]);
  const shown = useMemo(
    () => sortRows(items, sort).filter((p) => matches(p, { pill, q, dest })),
    [items, sort, pill, q, dest],
  );

  if (items.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line bg-bg p-8 text-center text-sm text-mute">
        No packages yet — add the first one.
      </div>
    );
  }
  const control =
    'h-9 rounded-md border border-line bg-bg px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

  return (
    <div className="grid gap-5">
      {look.length > 0 && (
        <section aria-labelledby="pk-look" className="grid min-w-0 gap-2.5">
          <h2 id="pk-look" className="label-caps flex items-center gap-2 text-[12px] text-mute">
            Needs a look
            <span className="num rounded-chip bg-warn-soft px-1.5 text-warn">{look.length}</span>
          </h2>
          <ul className="flex gap-2.5 overflow-x-auto pb-1 max-sm:[scrollbar-width:none]">
            {look.map((p) => {
              const h = health(p);
              return (
                <li
                  key={p.id}
                  className="grid w-[300px] flex-none grid-cols-[56px_minmax(0,1fr)] items-start gap-3 rounded-card border border-line bg-bg p-3"
                >
                  <Photo src={p.coverUrl} sizes="56px" className="h-11 w-14 rounded-lg" />
                  <div className="grid min-w-0 justify-items-start gap-1">
                    <span className={cn(chip, TONE[h.tone])}>{h.word}</span>
                    <b className="max-w-full truncate text-[13.5px]">{p.name}</b>
                    <small className="line-clamp-2 text-[12px] text-mute">{h.why}</small>
                    <Link
                      href={`/admin/packages/${p.id}`}
                      className="inline-flex items-center gap-1 text-[12.5px] font-bold text-primary"
                    >
                      {h.action}
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-2.5">
        <div
          role="group"
          aria-label="Show"
          className="flex gap-1.5 overflow-x-auto pb-1 max-sm:[scrollbar-width:none] sm:flex-wrap"
        >
          {PILLS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={pill === key}
              onClick={() => setPill(key)}
              className={cn(
                'inline-flex flex-none items-center gap-1.5 rounded-chip border px-3 py-1.5 text-[13px] font-bold whitespace-nowrap transition-colors',
                pill === key
                  ? 'border-ink bg-ink text-white'
                  : 'border-line bg-bg text-ink2 hover:border-ink',
              )}
            >
              {label}
              <span className={cn('num text-[11.5px]', pill === key ? 'text-white' : 'text-mute')}>
                {items.filter((p) => inPill(key, p)).length}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-[320px]">
            <label htmlFor={ids.q} className="sr-only">
              Search packages
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
              aria-hidden
            />
            <input
              id={ids.q}
              type="search"
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search packages…"
              className={cn(control, 'w-full pl-9')}
            />
          </div>
          <label htmlFor={ids.dest} className="sr-only">
            Destination
          </label>
          <select
            id={ids.dest}
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            className={control}
          >
            <option value="">All destinations</option>
            {dests.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
          <label htmlFor={ids.sort} className="sr-only">
            Sort
          </label>
          <select
            id={ids.sort}
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className={control}
          >
            {SORTS.map(([key, label]) => (
              <option key={key} value={key}>
                Sort: {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {shown.length ? (
        <div className="grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {shown.map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <p className="rounded-card border border-dashed border-line bg-bg p-6 text-center text-sm text-mute">
          No packages match.{' '}
          <button
            type="button"
            className="font-bold text-primary"
            onClick={() => {
              setPill('all');
              setQ('');
              setDest('');
            }}
          >
            Clear filters
          </button>
        </p>
      )}
    </div>
  );
}
