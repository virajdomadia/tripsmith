'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/site/Badge';
import { LeaderAvatar } from '@/components/site/LeaderAvatar';
import { Stars } from '@/components/site/Stars';
import { SaveHeart } from '@/components/site/saved/SaveHeart';
import {
  type CompareTrip,
  compareHref,
  compareRows,
  MAX_COMPARE,
  priceFrom,
  replaceTray,
  type Row,
  type RowKey,
  winners,
} from '@/lib/compare';
import { dealEnds, dealLabel } from '@/lib/deal';
import { enquireHref } from '@/lib/enquiry-form-state';
import { inr, MONTHS, priceOrOnRequest } from '@/lib/format';
import { CANCELLATION_SCHEDULE } from '@/lib/policies';
import { reviewsCount } from '@/lib/reviews';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const day = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Compare A · Sticky table (R39, P1b). One column per trip, one row per fact, grouped as in the
 * mockup. Rows whose facts differ carry a marigold tint and a bar on the row name; "Show only
 * differences" hides the rest. From `lg` the trip headers stay pinned under the site header as
 * the rows scroll; on a phone the table scrolls sideways a trip at a time (scroll-snap) with the
 * row names pinned on the left, the next trip peeking in, and dots to jump between trips.
 */
export function CompareView({ trips, missing }: { trips: CompareTrip[]; missing: string[] }) {
  const router = useRouter();
  const rows = useMemo(() => compareRows(trips), [trips]);
  const wins = useMemo(() => winners(trips), [trips]);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [flash, setFlash] = useState(0);
  const differing = rows.filter((r) => r.differs).length;
  const shown = onlyDiff && trips.length > 1 ? rows.filter((r) => r.differs) : rows;
  const slot = trips.length < MAX_COMPARE;

  // The tray becomes what this page shows, so browsing on keeps the same trips.
  useEffect(() => {
    replaceTray(trips.map((t) => ({ slug: t.slug, name: t.name, coverUrl: t.cover?.url ?? null })));
  }, [trips]);

  function remove(slug: string) {
    router.replace(compareHref(trips.filter((t) => t.slug !== slug).map((t) => t.slug)), {
      scroll: false,
    });
  }

  let lastGroup = '';
  return (
    <>
      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[clamp(30px,4vw,44px)]">Compare {plural(trips.length, 'trip')}</h1>
          <p className="mt-1 text-[14px] text-mute">
            Live seats and today&rsquo;s prices
            {missing.length > 0 && (
              <>
                {' · '}
                <b className="font-semibold text-warn">
                  {plural(missing.length, 'trip')} in this link{' '}
                  {missing.length === 1 ? 'is' : 'are'} no longer listed
                </b>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={onlyDiff && trips.length > 1}
            disabled={trips.length < 2}
            onClick={() => {
              setOnlyDiff((v) => !v);
              setFlash((n) => n + 1);
            }}
            className="inline-flex h-11 items-center gap-2 rounded-btn border-[1.5px] border-line px-3.5 text-[14px] font-bold text-ink transition-colors hover:border-ink disabled:opacity-50 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white"
          >
            <span
              aria-hidden
              className="relative h-4 w-7 rounded-full bg-line transition-colors [[aria-pressed=true]_&]:bg-action"
            >
              <span className="absolute top-0.5 left-0.5 size-3 rounded-full bg-white transition-transform [[aria-pressed=true]_&]:translate-x-3" />
            </span>
            Show only differences
            <span className="num font-semibold opacity-70">
              {differing} of {rows.length}
            </span>
          </button>
          <ShareLink slugs={trips.map((t) => t.slug)} />
        </div>
      </header>

      {trips.length < 2 ? (
        <p className="mt-5 rounded-btn bg-primary-soft px-3.5 py-2.5 text-[14px] text-ink2">
          Add a second trip to see where they differ.
        </p>
      ) : (
        <p className="mt-5 flex items-center gap-2 text-[13px] text-mute">
          <i aria-hidden className="inline-block h-3.5 w-1 rounded-full bg-action" />
          Highlighted rows differ between trips
          <span className="lg:hidden">· swipe sideways, row names stay put</span>
        </p>
      )}

      <Swiper count={trips.length + (slot ? 1 : 0)}>
        <table className="w-max table-fixed border-separate border-spacing-0 text-[14px] lg:w-full">
          <caption className="sr-only">
            {trips.map((t) => t.name).join(', ')} compared, one row per fact
          </caption>
          <colgroup>
            <col className="w-[108px] sm:w-[160px] lg:w-[200px]" />
            {trips.map((t) => (
              <col key={t.slug} className="w-[min(78vw,340px)] lg:w-auto" />
            ))}
            {slot && <col className="w-[min(60vw,240px)] lg:w-auto" />}
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 bg-bg align-bottom lg:top-[65px] lg:z-30"
              >
                <span className="sr-only">Fact</span>
              </th>
              {trips.map((t) => (
                <th
                  key={t.slug}
                  scope="col"
                  data-col
                  className="snap-start bg-bg p-2 pb-3 text-left align-top font-normal lg:sticky lg:top-[65px] lg:z-20"
                >
                  <TripHead trip={t} canRemove={trips.length > 1} onRemove={() => remove(t.slug)} />
                </th>
              ))}
              {slot && (
                <th
                  scope="col"
                  data-col
                  className="snap-start bg-bg p-2 align-top lg:sticky lg:top-[65px] lg:z-20"
                >
                  <Link
                    href="/packages"
                    className="grid h-full min-h-[180px] place-items-center rounded-card border-[1.5px] border-dashed border-line p-4 text-center font-normal text-ink2 no-underline transition-colors hover:border-ink"
                  >
                    <span>
                      <b className="block text-[16px] text-ink">+ Add a trip</b>
                      <small className="mt-1 block text-[12.5px] text-mute">
                        {MAX_COMPARE - trips.length} of {MAX_COMPARE} free · tick Compare on any
                        trip
                      </small>
                    </span>
                  </Link>
                </th>
              )}
            </tr>
          </thead>
          <tbody key={flash}>
            {shown.map((r, i) => {
              const group = r.group !== lastGroup ? r.group : null;
              lastGroup = r.group;
              return (
                <Fragment key={r.key}>
                  {group && (
                    <tr>
                      <th
                        scope="colgroup"
                        colSpan={1}
                        className="sticky left-0 z-10 bg-bg pt-6 pb-2 text-left"
                      >
                        <span className="label-caps text-mute">{group}</span>
                      </th>
                      <td colSpan={trips.length + (slot ? 1 : 0)} className="pt-6 pb-2" />
                    </tr>
                  )}
                  <tr>
                    <th
                      scope="row"
                      className={`sticky left-0 z-10 border-t border-line bg-bg py-3 pr-2 text-left align-top ${
                        r.differs ? 'shadow-[inset_3px_0_0_var(--color-action)] pl-2.5' : 'pl-0'
                      }`}
                    >
                      <b className="block text-[13.5px] leading-snug text-ink">{r.label}</b>
                      {r.sub && (
                        <small className="mt-0.5 block text-[11.5px] leading-snug text-mute">
                          {r.sub}
                        </small>
                      )}
                    </th>
                    {trips.map((t) => (
                      <td
                        key={t.slug}
                        className={`border-t border-line px-3 py-3 align-top ${
                          r.differs ? 'bg-action/12' : ''
                        } ${flash ? 'animate-rise' : ''}`}
                        style={flash ? { animationDelay: `${Math.min(i, 8) * 30}ms` } : undefined}
                      >
                        <Cell row={r} trip={t} />
                        {wins.get(t.slug)?.get(r.key) && (
                          <span className="mt-2 inline-flex items-center gap-1 rounded-chip bg-ok-soft px-2 py-0.5 text-[11.5px] font-extrabold text-ok">
                            ✓ {wins.get(t.slug)?.get(r.key)}
                          </span>
                        )}
                      </td>
                    ))}
                    {slot && <td className="border-t border-line" />}
                  </tr>
                </Fragment>
              );
            })}
            <tr>
              <th
                scope="row"
                className="sticky left-0 z-10 border-t border-line bg-bg py-4 pr-2 text-left align-top"
              >
                <b className="block text-[13.5px] text-ink">Ready?</b>
                <small className="block text-[11.5px] text-mute">Holds your seats for 10 min</small>
              </th>
              {trips.map((t) => (
                <td key={t.slug} className="border-t border-line px-3 py-4 align-top">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/packages/${t.slug}#book`}
                      className="inline-flex h-11 items-center rounded-btn bg-action px-4 font-bold text-ink no-underline transition-colors hover:bg-action-ink"
                    >
                      Book now
                    </Link>
                    <Link
                      href={enquireHref(t.slug)}
                      className="inline-flex h-11 items-center rounded-btn border-[1.5px] border-line px-4 font-bold text-ink no-underline transition-colors hover:border-ink"
                    >
                      Enquire
                    </Link>
                  </div>
                </td>
              ))}
              {slot && <td className="border-t border-line" />}
            </tr>
          </tbody>
        </table>
      </Swiper>
    </>
  );
}

function TripHead({
  trip: t,
  canRemove,
  onRemove,
}: {
  trip: CompareTrip;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="relative aspect-[16/10] overflow-hidden rounded-card bg-bg2">
        {t.cover && (
          <Image
            src={t.cover.url}
            alt={t.cover.alt}
            fill
            sizes="(min-width: 1024px) 340px, 78vw"
            className="object-cover"
          />
        )}
        <div className="absolute top-2 right-2 left-2 flex justify-between">
          <SaveHeart slug={t.slug} name={t.name} variant="card" />
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            aria-label={`Remove ${t.name} from compare`}
            title={canRemove ? 'Remove' : 'Keep at least one trip'}
            className="grid size-11 place-items-center rounded-full bg-white/94 text-[20px] leading-none font-bold text-ink shadow-[0_6px_16px_-8px_rgb(0_0_0/0.45)] hover:bg-white disabled:opacity-40"
          >
            ×
          </button>
        </div>
      </div>
      <span className="label-caps text-[11px] text-mute">
        {t.destination.name} · {t.nights}N
      </span>
      <Link
        href={`/packages/${t.slug}`}
        className="text-[17px] leading-snug font-extrabold text-ink no-underline hover:underline"
      >
        {t.name}
      </Link>
      <p className="num text-[13px] text-mute">
        <b className="text-[18px] font-extrabold text-ink">{priceOrOnRequest(priceFrom(t))}</b> per
        person
      </p>
    </div>
  );
}

function List({ items, empty }: { items: readonly ReactNode[]; empty: string }) {
  if (!items.length) return <p className="text-mute">{empty}</p>;
  return (
    <ul className="grid gap-1.5">
      {items.map((x, i) => (
        <li key={i} className="leading-snug">
          {x}
        </li>
      ))}
    </ul>
  );
}

function Cell({ row, trip: t }: { row: Row; trip: CompareTrip }): ReactNode {
  const key: RowKey = row.key;
  switch (key) {
    case 'price': {
      const top = t.earlyBird?.tiers[0];
      return (
        <div className="grid gap-1">
          <b className="num text-[20px] font-extrabold tracking-tight">
            {t.deal && (
              <s className="mr-1.5 text-[13px] font-semibold text-mute">
                <span className="sr-only">was </span>
                {inr(t.startingPricePaise)}
              </s>
            )}
            {priceOrOnRequest(priceFrom(t))}
          </b>
          {t.deal ? (
            <small className="text-[12.5px] font-bold text-warn">
              {dealLabel(t.deal)} · {dealEnds(t.deal)}
            </small>
          ) : top ? (
            <small className="text-[12.5px] font-bold text-eb">
              Early bird up to −{inr(top.offPaise)} when booked {top.days}+ days ahead
            </small>
          ) : (
            <small className="text-[12.5px] text-mute">No offer running</small>
          )}
        </div>
      );
    }
    case 'departures':
      return t.departures.length ? (
        <ul className="grid gap-2">
          {t.departures.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="num min-w-[78px] font-semibold">{day(d.date)}</span>
              {d.badge && d.badge !== 'guaranteed' ? (
                <Badge value={d.badge} />
              ) : (
                <span
                  className={`text-[12.5px] font-semibold ${d.seatsLeft <= 4 ? 'text-warn' : 'text-mute'}`}
                >
                  {plural(d.seatsLeft, 'seat')} left{d.guaranteed ? ' · guaranteed' : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-mute">No dates on sale right now</p>
      );
    case 'duration':
      return (
        <p>
          <b className="num">{plural(t.nights, 'night')}</b> · {plural(t.days, 'day')}
        </p>
      );
    case 'places':
      return (
        <p className="leading-snug">
          {t.places.map((p, i) => (
            <Fragment key={`${p}-${i}`}>
              {i > 0 && (
                <span aria-hidden className="mx-1 text-mute">
                  →
                </span>
              )}
              {p}
            </Fragment>
          ))}
        </p>
      );
    case 'startsFrom':
      return <p>{t.departureCity}</p>;
    case 'stays':
      return (
        <List
          empty="Stays listed on the trip page"
          items={t.hotels.map((h) => (
            <>
              <b className="font-semibold">{h.name}</b>
              <span className="block text-[12.5px] text-mute">
                {h.city} · {h.stars}★ · {plural(h.nights, 'night')}
              </span>
            </>
          ))}
        />
      );
    case 'meals': {
      const m = t.meals;
      const parts = [
        m.breakfasts && plural(m.breakfasts, 'breakfast'),
        m.lunches && plural(m.lunches, 'lunch', 'lunches'),
        m.dinners && plural(m.dinners, 'dinner'),
      ].filter(Boolean);
      return <p>{parts.length ? parts.join(' · ') : 'No meals included'}</p>;
    }
    case 'included':
      return (
        <List
          empty="—"
          items={t.inclusions.map((x) => (
            <>✓ {x}</>
          ))}
        />
      );
    case 'excluded':
      return (
        <List
          empty="Nothing listed"
          items={t.exclusions.map((x) => (
            <>✕ {x}</>
          ))}
        />
      );
    case 'rating':
      return t.rating ? (
        <p className="flex flex-wrap items-center gap-1.5">
          <Stars
            value={t.rating.avg}
            label={`Rated ${t.rating.avg.toFixed(1)} out of 5`}
            number={t.rating.avg.toFixed(1)}
          />
          <span className="text-[12.5px] text-mute">({reviewsCount(t.rating.count)})</span>
        </p>
      ) : (
        <p className="text-mute">No reviews yet</p>
      );
    case 'leader':
      return t.leader ? (
        <Link
          href={`/leaders/${t.leader.slug}`}
          className="inline-flex items-center gap-2 text-ink no-underline hover:underline"
        >
          <LeaderAvatar leader={t.leader} size={34} />
          <b className="font-semibold">{t.leader.name}</b>
        </Link>
      ) : (
        <p className="text-mute">Named before departure</p>
      );
    case 'deposit':
      return (
        <p>
          {t.deposit
            ? 'Reserve with 25 % now, the rest 30 days before departure'
            : 'Pay in full when you book'}
        </p>
      );
    case 'cancellation':
      // One policy for every trip; the wording lives in lib/policies.ts.
      return (
        <p className="leading-snug">
          {CANCELLATION_SCHEDULE.map((r) => `${r.window}: ${r.refund}`)[0]}.{' '}
          <Link href="/cancellation-policy" className="whitespace-nowrap">
            Full policy
          </Link>
        </p>
      );
  }
}

/** The sideways scroller: snaps a trip at a time on a phone, with dots that follow and jump. */
function Swiper({ count, children }: { count: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const cols = () => [...(ref.current?.querySelectorAll<HTMLElement>('thead [data-col]') ?? [])];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const left = el.getBoundingClientRect().left;
      const label = (el.querySelector('thead th') as HTMLElement | null)?.offsetWidth ?? 0;
      const found = cols().findIndex((c) => c.getBoundingClientRect().left - left >= label - 8);
      setAt(found < 0 ? count - 1 : found);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [count]);

  return (
    <>
      <div
        ref={ref}
        className="relative mt-3 -mr-4 snap-x snap-mandatory overflow-x-auto overscroll-x-contain pr-4 [scroll-padding-left:108px] sm:[scroll-padding-left:160px] lg:mr-0 lg:snap-none lg:overflow-visible lg:pr-0"
      >
        {children}
      </div>
      <div className="mt-4 flex justify-center gap-2 lg:hidden" role="group" aria-label="Trips">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Show column ${i + 1} of ${count}`}
            aria-pressed={i === at}
            onClick={() =>
              cols()[i]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
            }
            className="grid size-6 place-items-center"
          >
            <span
              className={`block h-2 rounded-full transition-all ${i === at ? 'w-5 bg-ink' : 'w-2 bg-line'}`}
            />
          </button>
        ))}
      </div>
    </>
  );
}

function ShareLink({ slugs }: { slugs: string[] }) {
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === 'function'), []);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  const url = () => `${window.location.origin}${compareHref(slugs)}`;
  return (
    <>
      <button
        type="button"
        aria-live="polite"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url());
            setCopied(true);
          } catch {
            window.prompt('Copy this link', url());
          }
        }}
        className="inline-flex h-11 items-center rounded-btn border-[1.5px] border-line px-3.5 text-[14px] font-bold text-ink transition-colors hover:border-ink"
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
      {canShare && (
        <button
          type="button"
          onClick={() =>
            navigator.share({ title: 'Compare trips on Tripsmith', url: url() }).catch(() => {})
          }
          className="inline-flex h-11 items-center rounded-btn bg-primary px-3.5 text-[14px] font-bold text-white transition-colors hover:bg-primary-ink"
        >
          Share
        </button>
      )}
    </>
  );
}
