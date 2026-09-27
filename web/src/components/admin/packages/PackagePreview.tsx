'use client';

import { Check } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { PackageFieldValues } from '@/lib/admin/package-schema';
import { formatDate, inr, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The editor's sections, in the order the customer page reads. */
export type SectionKey =
  'photos' | 'title' | 'highlights' | 'itinerary' | 'prices' | 'deal' | 'stays' | 'included';

export const LABEL: Record<SectionKey, string> = {
  photos: 'Photos',
  title: 'Title and summary',
  highlights: 'Highlights',
  itinerary: 'Day by day',
  prices: 'Dates and prices',
  deal: 'Deal',
  stays: 'Hotels',
  included: 'Included, not included, FAQ',
};

type Mode = 'page' | 'phone' | 'card';
const MODES: [Mode, string][] = [
  ['page', 'Page'],
  ['phone', 'Phone'],
  ['card', 'Card'],
];

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * What the customer sees for the prices typed: the lowest double price of the dates from today
 * (what the page calls "From"), and the deal only when it is below that — otherwise the page
 * hides it, and the preview says so to the owner alone.
 */
export function previewPrice<T extends { date: string; priceDoublePaise: unknown }>(
  departures: readonly T[],
  dealPricePaise: unknown,
  dealEndsOn: string,
  on: string,
) {
  const upcoming = departures.filter((d) => d.date >= on && num(d.priceDoublePaise) > 0);
  const from = upcoming.length ? Math.min(...upcoming.map((d) => num(d.priceDoublePaise))) : 0;
  const deal = num(dealPricePaise);
  const dealLive = deal > 0 && !!dealEndsOn && dealEndsOn >= on;
  return {
    from,
    deal: dealLive && deal < from ? deal : null,
    hiddenDeal: dealLive && from > 0 && deal >= from ? deal : null,
    upcoming: upcoming.slice().sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * Package editor B's live preview (R59, P20): the customer page at a small scale, updating as
 * the owner types — name, summary, highlights, day titles, the double prices and the deal,
 * including the warning when a deal would be hidden. Page, Phone and the listing Card; clicking
 * a part opens its section in the form. The trip pack and leader arrive with their v2.5 rows.
 */
export function PackagePreview({
  destination,
  coverUrl,
  photos,
  onPick,
}: {
  destination: string;
  coverUrl: string | null;
  photos: string[];
  onPick: (s: SectionKey) => void;
}) {
  const [mode, setMode] = useState<Mode>('page');
  const { control } = useFormContext<PackageFieldValues>();
  const v = useWatch({ control }) as Partial<PackageFieldValues>;
  const on = today();
  const deps = (v.departures ?? []).map((d) => ({
    date: d?.date ?? '',
    priceDoublePaise: d?.priceDoublePaise,
    seatsTotal: num(d?.seatsTotal),
    guaranteed: !!d?.guaranteed,
  }));
  const price = previewPrice(deps, v.dealPricePaise, v.dealEndsOn ?? '', on);
  const nights = num(v.nights);
  const name = v.name?.trim() || 'Untitled package';
  const highlights = (v.highlights ?? []).map((s) => s?.trim()).filter(Boolean) as string[];
  const days = v.itinerary ?? [];
  const hotels = v.hotels ?? [];
  const inclusions = (v.inclusions ?? []).map((s) => s?.trim()).filter(Boolean) as string[];
  const dealLabel = v.dealLabel?.trim() || 'Deal';

  /** A clickable part of the preview: opens its section on the left. */
  const part = (s: SectionKey, className = '') => ({
    'data-part': s,
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': `Edit ${LABEL[s]}`,
    onClick: () => onPick(s),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPick(s);
      }
    },
    className: cn(
      'cursor-pointer rounded-lg outline-offset-2 transition-[outline-color] hover:outline hover:outline-2 hover:outline-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
      className,
    ),
  });

  const priceBlock = (
    <div className="grid gap-0.5">
      <span className="flex items-baseline gap-2">
        <small className="text-[11px] text-mute">From</small>
        {price.deal !== null && <s className="num text-[12px] text-mute">{inr(price.from)}</s>}
        <b className="num text-[20px] font-extrabold">
          {price.from ? inr(price.deal ?? price.from) : '—'}
        </b>
      </span>
      <small className="text-[11px] text-mute">per person, twin sharing</small>
      {price.deal !== null && (
        <span className="w-fit rounded-md bg-action px-1.5 py-0.5 text-[11px] font-extrabold text-ink">
          {dealLabel} · ends {shortDate(v.dealEndsOn!)}
        </span>
      )}
      {price.hiddenDeal !== null && (
        <span className="rounded-md bg-warn-soft px-2 py-1 text-[11px] font-semibold text-warn">
          Only you see this: the deal is hidden because {inr(price.hiddenDeal)} is not below{' '}
          {inr(price.from)}.
        </span>
      )}
    </div>
  );

  const page = (
    <div className={cn('grid gap-3 bg-bg p-4 text-ink', mode === 'phone' && 'p-3')}>
      <div {...part('photos', cn('grid gap-1', mode === 'page' ? 'grid-cols-[2fr_1fr]' : ''))}>
        <span className="relative block aspect-[16/10] overflow-hidden rounded-lg bg-bg2">
          {coverUrl && <Image src={coverUrl} alt="" fill sizes="400px" className="object-cover" />}
        </span>
        {mode === 'page' && (
          <span className="grid gap-1">
            {photos.slice(1, 3).map((src) => (
              <span key={src} className="relative block overflow-hidden rounded-lg bg-bg2">
                <Image src={src} alt="" fill sizes="200px" className="object-cover" />
              </span>
            ))}
          </span>
        )}
      </div>
      <div {...part('title', 'grid gap-1 p-1')}>
        <small className="text-[11px] text-mute">{destination} / Packages</small>
        <h2 className="text-[20px] leading-tight font-extrabold tracking-tight">{name}</h2>
        <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-mute">
          {nights} {nights === 1 ? 'night' : 'nights'} · {nights + 1} days · Ex-
          {v.departureCity || '…'}
        </p>
        <p className="text-[12.5px] text-ink2">{v.summary}</p>
      </div>
      <div
        className={cn(
          'grid gap-3',
          mode === 'page' && 'grid-cols-[minmax(0,1fr)_200px] items-start',
        )}
      >
        <div className="grid min-w-0 gap-3">
          <section {...part('highlights', 'grid gap-1.5 p-1')}>
            <h3 className="text-[13px] font-extrabold">Highlights</h3>
            {highlights.length ? (
              <ul className="grid gap-1 text-[12px]">
                {highlights.map((h, i) => (
                  <li key={i} className="flex gap-1.5">
                    <Check className="mt-0.5 size-3 shrink-0 text-ok" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-mute">No highlights yet</p>
            )}
          </section>
          <section {...part('itinerary', 'grid gap-1.5 p-1')}>
            <h3 className="text-[13px] font-extrabold">Day by day</h3>
            <ol className="grid gap-1.5">
              {days.map((d, i) => (
                <li key={i} className="grid grid-cols-[44px_minmax(0,1fr)] gap-2 text-[12px]">
                  <span className="font-bold text-mute">Day {i + 1}</span>
                  <span className="grid">
                    <b>{d?.title || '…'}</b>
                    <small className="text-mute">
                      {[d?.stay, d?.meals && mealsOf(d.meals)].filter(Boolean).join(' · ')}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
          </section>
          {hotels.length > 0 && (
            <section {...part('stays', 'grid gap-1.5 p-1')}>
              <h3 className="text-[13px] font-extrabold">Where you stay</h3>
              <ul className="grid gap-1 text-[12px]">
                {hotels.map((h, i) => (
                  <li key={i}>
                    <b>{h?.name}</b>{' '}
                    <small className="text-mute">
                      {h?.city} · {num(h?.stars)}-star · {num(h?.nights)}{' '}
                      {num(h?.nights) === 1 ? 'night' : 'nights'}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section {...part('included', 'grid gap-1.5 p-1')}>
            <h3 className="text-[13px] font-extrabold">What’s included</h3>
            <ul className="grid gap-1 text-[12px]">
              {inclusions.slice(0, 4).map((l, i) => (
                <li key={i} className="flex gap-1.5">
                  <Check className="mt-0.5 size-3 shrink-0 text-ok" aria-hidden />
                  {l}
                </li>
              ))}
            </ul>
            {inclusions.length > 4 && (
              <small className="text-[11px] text-mute">+ {inclusions.length - 4} more</small>
            )}
          </section>
        </div>
        <aside
          {...part(
            'prices',
            'grid gap-2.5 rounded-card border border-line p-3 shadow-[0_10px_30px_-20px_rgba(20,32,42,.35)]',
          )}
        >
          {priceBlock}
          <div className="grid gap-1.5">
            {price.upcoming.slice(0, 4).map((d, i) => (
              <div key={i} className="flex items-baseline justify-between gap-2 text-[11.5px]">
                <span>
                  <b>{formatDate(d.date).slice(0, -5)}</b>
                  {d.guaranteed && <small className="ml-1 text-ok">Guaranteed</small>}
                </span>
                <span className="num font-bold">
                  {inr(
                    price.deal !== null
                      ? Math.max(0, num(d.priceDoublePaise) - (price.from - price.deal))
                      : num(d.priceDoublePaise),
                  )}
                </span>
              </div>
            ))}
            {price.upcoming.length === 0 && (
              <small className="text-[11px] text-mute">No dates from today yet</small>
            )}
          </div>
          <span className="rounded-btn bg-action py-2 text-center text-[12.5px] font-bold text-ink">
            Book now
          </span>
        </aside>
      </div>
    </div>
  );

  const card = (
    <div
      {...part(
        'title',
        'mx-auto grid w-[280px] overflow-hidden rounded-card border border-line bg-bg',
      )}
    >
      <span className="relative block aspect-[4/3] bg-bg2">
        {coverUrl && <Image src={coverUrl} alt="" fill sizes="280px" className="object-cover" />}
        {price.deal !== null && (
          <span className="absolute top-2 left-2 rounded-md bg-action px-1.5 py-0.5 text-[11px] font-extrabold text-ink">
            {dealLabel}
          </span>
        )}
      </span>
      <div className="grid gap-1 p-3">
        <small className="text-[11px] text-mute">
          {destination} · {nights} {nights === 1 ? 'night' : 'nights'}
        </small>
        <b className="text-[15px] leading-snug">{name}</b>
        {priceBlock}
      </div>
    </div>
  );

  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Preview" className="flex gap-1 rounded-lg bg-bg2 p-1">
          {MODES.map(([m, label]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[12.5px] font-bold',
                mode === m ? 'bg-bg text-ink shadow-sm' : 'text-mute hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <small className="text-[12px] text-mute">Click any part to edit it</small>
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-bg2">
        <div className="flex items-center gap-2 border-b border-line bg-bg px-3 py-1.5 text-[11.5px] text-mute">
          <span aria-hidden className="flex gap-1">
            <i className="size-2 rounded-full bg-line" />
            <i className="size-2 rounded-full bg-line" />
            <i className="size-2 rounded-full bg-line" />
          </span>
          <span className="min-w-0 truncate font-mono">/packages/{v.slug || '…'}</span>
          <span className="ml-auto rounded-chip bg-ok-soft px-2 py-0.5 font-bold whitespace-nowrap text-ok">
            Updates as you type
          </span>
        </div>
        <div
          aria-label="Live preview of the customer page"
          role="region"
          className="max-h-[calc(100dvh-180px)] overflow-y-auto p-3"
        >
          {mode === 'card' ? (
            <div className="py-4">{card}</div>
          ) : mode === 'phone' ? (
            <div className="mx-auto w-[300px] overflow-hidden rounded-[22px] border-[6px] border-ink">
              {page}
            </div>
          ) : (
            page
          )}
        </div>
      </div>
    </div>
  );
}

function mealsOf(m: { breakfast?: boolean; lunch?: boolean; dinner?: boolean }) {
  return (
    [m.breakfast && 'Breakfast', m.lunch && 'Lunch', m.dinner && 'Dinner']
      .filter(Boolean)
      .join(', ') || 'No meals'
  );
}
