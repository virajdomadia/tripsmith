'use client';

import { Download, FlaskConical } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageHead } from '@/components/admin/PageHead';
import {
  PRESETS,
  SECTIONS,
  SECTION_TITLES,
  change,
  csvHref,
  dayLabel,
  inr,
  lakh,
  pct,
  rangeLabel,
  parseReportParams,
  reportsHref,
  type ReportParams,
  type Reports,
  type TileSection,
} from '@/lib/admin/reports';
import { cn } from '@/lib/utils';
import { buildSections, type Section } from './sections';

/**
 * `/admin/reports` (R55, P12), mockup Reports B "KPI cockpit": the range bar, six KPI tiles,
 * nine section tiles and a drill-in panel (Chart / Table, CSV, "What it says"). The range and
 * the open section live in the URL; picking a tile only rewrites the URL (no refetch — the one
 * payload already holds every section). The page follows the system's dark mode on its own.
 */
export function ReportsCockpit({ data, params }: { data: Reports; params: ReportParams }) {
  const sections = useMemo(() => buildSections(data), [data]);
  const [open, setOpen] = useState<TileSection>(params.section);
  const [views, setViews] = useState<Partial<Record<TileSection, 'chart' | 'table'>>>({});
  // A tile only rewrites the URL (no server render), so every link is built from the open
  // section, not the one the page was loaded with; and back / forward reopen the URL's tile.
  const current = useMemo(() => ({ ...params, section: open }), [params, open]);
  useEffect(() => setOpen(params.section), [params.section]);
  useEffect(() => {
    const onPop = () =>
      setOpen(parseReportParams(Object.fromEntries(new URLSearchParams(location.search))).section);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const s = sections[open];

  const pick = (id: TileSection) => {
    setOpen(id);
    window.history.replaceState(null, '', reportsHref(params, { section: id }));
    // Below xl the panel sits under the tiles: bring it into view.
    if (!window.matchMedia('(min-width: 80rem)').matches) {
      requestAnimationFrame(() =>
        document.getElementById('rpt-panel')?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
          block: 'start',
        }),
      );
    }
  };

  return (
    <div className="rpt grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <PageHead
        title="Reports"
        subtitle={
          <>{rangeLabel(data.range.from, data.range.to)} · IST · bookings by departure date</>
        }
      />
      <RangeBar params={current} data={data} />
      <Kpis data={data} />
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] xl:items-start">
        <div
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
          role="group"
          aria-label="Report sections"
        >
          {SECTIONS.map((id, i) => (
            <Tile
              key={id}
              n={i + 1}
              section={sections[id]}
              active={id === open}
              onPick={() => pick(id)}
            />
          ))}
        </div>
        <Panel
          key={open}
          n={SECTIONS.indexOf(open) + 1}
          section={s}
          view={views[open] ?? 'chart'}
          onView={(v) => setViews((was) => ({ ...was, [open]: v }))}
          params={current}
        />
      </div>
    </div>
  );
}

// --- the range ----------------------------------------------------------------------------------

function RangeBar({ params, data }: { params: ReportParams; data: Reports }) {
  const demoOn = params.demo;
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <nav aria-label="Date range" className="w-full min-w-0 overflow-x-auto sm:w-auto">
        <ul className="flex w-max gap-1 rounded-btn border border-line bg-bg p-1">
          {PRESETS.map((p) => {
            const on = p.id === params.preset;
            const href =
              p.id === 'custom'
                ? reportsHref(params, { preset: 'custom' })
                : reportsHref(params, { preset: p.id });
            return (
              <li key={p.id}>
                <Link
                  href={href}
                  scroll={false}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'block rounded-[9px] px-3 py-1.5 text-[13px] font-bold whitespace-nowrap transition-colors',
                    on ? 'bg-ink text-bg' : 'text-ink2 hover:bg-bg2',
                  )}
                >
                  {p.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {params.preset === 'custom' && (
        <form
          action="/admin/reports"
          className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-mute"
        >
          <input type="hidden" name="p" value="custom" />
          {!demoOn && <input type="hidden" name="demo" value="0" />}
          {params.section !== 'money' && <input type="hidden" name="s" value={params.section} />}
          <label className="flex items-center gap-1.5">
            From
            <input
              type="date"
              name="from"
              defaultValue={params.from}
              className="rpt-date rounded-[9px] border border-line bg-bg px-2 py-1 text-ink tabular-nums"
            />
          </label>
          <label className="flex items-center gap-1.5">
            To
            <input
              type="date"
              name="to"
              defaultValue={params.to}
              className="rpt-date rounded-[9px] border border-line bg-bg px-2 py-1 text-ink tabular-nums"
            />
          </label>
          <button type="submit" className="rounded-[9px] bg-ink px-3 py-1.5 text-bg">
            Apply
          </button>
        </form>
      )}
      <Link
        href={reportsHref(params, { demo: !demoOn })}
        scroll={false}
        title={
          demoOn
            ? 'Includes the seeded demo year (seed.py --history). Click to hide it.'
            : 'The seeded demo year is hidden. Click to include it.'
        }
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors sm:ml-auto',
          demoOn ? 'bg-primary-soft text-primary-ink' : 'border border-line text-mute',
        )}
      >
        <FlaskConical className="size-3.5" aria-hidden />
        Demo history {demoOn ? `on · ${data.range.demoBookings}` : 'off'}
      </Link>
    </div>
  );
}

// --- KPIs ---------------------------------------------------------------------------------------

function Kpis({ data }: { data: Reports }) {
  const k = data.kpis;
  const prev = `${dayLabel(data.range.previousFrom)} – ${dayLabel(data.range.previousTo)}`;
  const delta = (now: number, before: number) => {
    const c = change(now, before);
    return c ? (
      <span className={c.up ? 'text-ok' : 'text-bad'} title={`Against ${prev}`}>
        {c.text} vs the {daysWord(data)} before
      </span>
    ) : (
      <span>nothing to compare before</span>
    );
  };
  const tiles: [string, string, React.ReactNode][] = [
    ['Booked', lakh(k.bookedPaise), delta(k.bookedPaise, k.previous.bookedPaise)],
    ['Collected', lakh(k.collectedPaise), 'payments in, online and offline'],
    ['Net after refunds', lakh(k.netPaise), `${inr(k.refundedPaise)} refunded`],
    ['Bookings', k.bookings.toLocaleString('en-IN'), delta(k.bookings, k.previous.bookings)],
    ['Seats filled', pct(k.seatsSold, k.seatsTotal), `${k.departures} departures`],
    ['Balances due', lakh(k.balancePaise), 'on deposit bookings'],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
      {tiles.map(([label, value, note], i) => (
        <div
          key={label}
          className="rpt-rise grid content-start gap-0.5 rounded-card border border-line bg-bg px-3.5 py-3"
          style={{ animationDelay: `${i * 30}ms` }}
        >
          <dt className="text-xs font-bold text-mute">{label}</dt>
          <dd className="text-[22px] leading-tight font-extrabold tracking-tight tabular-nums">
            {value}
          </dd>
          <dd className="text-xs text-mute">{note}</dd>
        </div>
      ))}
    </dl>
  );
}

const daysWord = (data: Reports) => {
  const days =
    Math.round(
      (new Date(`${data.range.to}T00:00:00Z`).getTime() -
        new Date(`${data.range.from}T00:00:00Z`).getTime()) /
        864e5,
    ) + 1;
  return `${days} days`;
};

// --- tiles and the panel ------------------------------------------------------------------------

function Tile({
  n,
  section,
  active,
  onPick,
}: {
  n: number;
  section: Section;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      aria-controls="rpt-panel"
      className={cn(
        'grid min-w-0 content-start gap-0.5 rounded-card border bg-bg px-3 py-3 text-left transition-[border-color,box-shadow,translate] duration-200 hover:-translate-y-px',
        active
          ? 'border-primary shadow-[0_0_0_2px_var(--color-primary-soft)]'
          : 'border-line hover:border-mute',
      )}
    >
      <span className="text-[10.5px] font-extrabold tracking-[.12em] text-mute uppercase">
        {String(n).padStart(2, '0')} · {section.title}
      </span>
      <b className="truncate text-lg font-extrabold tracking-tight tabular-nums">
        {section.tile.value}
      </b>
      <small className="line-clamp-2 text-xs leading-snug font-semibold text-mute">
        {section.tile.sub}
      </small>
      <span className="mt-1.5 block">{section.tile.mini}</span>
    </button>
  );
}

function Panel({
  n,
  section: s,
  view,
  onView,
  params,
}: {
  n: number;
  section: Section;
  view: 'chart' | 'table';
  onView: (v: 'chart' | 'table') => void;
  params: ReportParams;
}) {
  return (
    <section
      id="rpt-panel"
      aria-label={`${s.title} detail`}
      className="rpt-rise grid min-w-0 gap-4 rounded-card border border-line bg-bg p-4 sm:p-5 xl:sticky xl:top-4"
    >
      <header className="flex flex-wrap items-center gap-2.5">
        <span className="basis-full text-[10.5px] font-extrabold tracking-[.12em] text-mute uppercase">
          Drill-in · {String(n).padStart(2, '0')}
        </span>
        <h2 className="text-xl font-extrabold">{SECTION_TITLES[s.id]}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label={`${s.title} view`}
            className="flex gap-0.5 rounded-[10px] border border-line p-0.5"
          >
            {(['chart', 'table'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => onView(v)}
                className={cn(
                  'rounded-[8px] px-2.5 py-1 text-[12.5px] font-bold capitalize',
                  view === v ? 'bg-ink text-bg' : 'text-ink2 hover:bg-bg2',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          {s.csv.map((c) => (
            <a
              key={c}
              href={csvHref(params, c)}
              download
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-line px-2.5 py-1 text-[12.5px] font-bold text-ink2 hover:bg-bg2"
            >
              <Download className="size-3.5" aria-hidden />
              {s.csv.length > 1 ? `${c === 'cash' ? 'Cash' : 'Money'} CSV` : 'CSV'}
            </a>
          ))}
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {s.facts.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-mute">{k}</dt>
            <dd className="truncate font-bold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div data-view={view} className="min-w-0">
        {view === 'chart' ? s.chart : s.table}
      </div>
      <div className="grid gap-1.5 border-t border-line pt-3">
        <span className="text-[10.5px] font-extrabold tracking-[.12em] text-mute uppercase">
          What it says
        </span>
        <ul className="grid list-disc gap-1.5 pl-4 text-[13.5px] text-ink2">
          {s.story.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
