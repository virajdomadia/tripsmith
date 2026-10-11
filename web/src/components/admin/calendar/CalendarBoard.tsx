'use client';

import { ChevronLeft, ChevronRight, Filter, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { NativeSelect } from '@/components/admin/NativeSelect';
import { PageHead } from '@/components/admin/PageHead';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { adminGet } from '@/lib/admin/client';
import {
  addDays,
  calendarHref,
  dayLabel,
  dayOf,
  FILL_LABEL,
  fillOf,
  monthLabel,
  monthName,
  monthOfDay,
  shiftMonth,
  shown as shownOf,
  stripOf,
  WEEKDAYS,
  weekday,
  type CalendarFilters,
  type CalendarMonth,
  type CalendarPanel,
  type CalendarParams,
  type Fill,
} from '@/lib/admin/calendar';
import { cn } from '@/lib/utils';
import { AddDeparture } from './AddDeparture';
import { Agenda } from './Agenda';
import { DeparturePanel, type Waitlist } from './DeparturePanel';
import { MonthGrid } from './MonthGrid';
import { MonthStrip } from './MonthStrip';
import { Overview } from './Overview';

const WIDE = '(min-width: 1280px)';
function subscribe(cb: () => void) {
  const mq = matchMedia(WIDE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
/** The side panel sits beside the grid from xl; below it opens as a sheet. */
const useWide = () =>
  useSyncExternalStore(
    subscribe,
    () => matchMedia(WIDE).matches,
    () => true,
  );

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);

const LEGEND: Fill[] = ['full', 'hot', 'open', 'low'];
const LEGEND_NOTE: Record<Fill, string> = {
  full: 'Sold out',
  hot: 'Filling 70%+',
  open: 'Open',
  low: 'Low, under 35%',
};

/**
 * The departure calendar's client half (R50, P11): filters (in the URL, applied here over the
 * month the server sent), the grid or the phone agenda, keyboard moves, and the side panel —
 * the month overview, a departure (read on click), a day's list, or the add form.
 */
export function CalendarBoard({
  data,
  params,
  initialPanel,
}: {
  data: CalendarMonth;
  params: CalendarParams;
  initialPanel: CalendarPanel | null;
}) {
  const router = useRouter();
  const wide = useWide();
  const month = data.month;
  const today = data.today;

  const [filters, setFilters] = useState<CalendarFilters>({
    dest: params.dest,
    pkg: params.pkg,
    leader: params.leader,
  });
  const [sel, setSel] = useState<string | null>(initialPanel?.departure.id ?? null);
  const [panel, setPanel] = useState<CalendarPanel | null>(initialPanel);
  const [waitlist, setWaitlist] = useState<Waitlist | null>(null);
  const [adding, setAdding] = useState<{ day: string; pkg: string } | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  // A new month from the server: slide in from the side we moved to, and start the panel over.
  const [seen, setSeen] = useState({ month, panel: initialPanel?.departure.id ?? null });
  const [dir, setDir] = useState<'next' | 'prev' | null>(null);
  if (seen.month !== month || seen.panel !== (initialPanel?.departure.id ?? null)) {
    if (seen.month !== month) {
      setDir(month > seen.month ? 'next' : 'prev');
      setAdding(null);
      setDay(null);
      setFocusId(null);
    }
    setSeen({ month, panel: initialPanel?.departure.id ?? null });
    setSel(initialPanel?.departure.id ?? null);
    setPanel(initialPanel);
    setWaitlist(null);
  }

  const pkgs = useMemo(() => new Map(data.packages.map((p) => [p.id, p])), [data.packages]);
  const leaders = useMemo(() => new Map(data.leaders.map((l) => [l.id, l])), [data.leaders]);
  const deps = useMemo(
    () => shownOf(data.departures, data.packages, filters),
    [data.departures, data.packages, filters],
  );
  const strip = useMemo(() => stripOf(deps), [deps]);
  const nameOf = useCallback((id: string) => pkgs.get(id)?.name ?? 'Package', [pkgs]);
  const draftOf = useCallback((id: string) => pkgs.get(id)?.draft ?? false, [pkgs]);

  // The URL is the state: filters and the open departure, without a server round trip.
  useEffect(() => {
    const href = calendarHref({ month, ...filters, dep: sel });
    if (href !== `${location.pathname}${location.search}`) history.replaceState(null, '', href);
  }, [month, filters, sel]);

  // Every read of a departure is numbered: a slow answer for a chip since left is dropped.
  const reads = useRef(0);
  const load = useCallback(async (id: string) => {
    const n = ++reads.current;
    const enc = encodeURIComponent(id);
    const [p, w] = await Promise.allSettled([
      adminGet<CalendarPanel>(`/admin/calendar/departures/${enc}`, {}),
      adminGet<Waitlist>(`/admin/departures/${enc}/waitlist`, {}),
    ]);
    if (n !== reads.current) return;
    if (p.status === 'fulfilled') setPanel(p.value);
    else setSel(null);
    setWaitlist(w.status === 'fulfilled' ? w.value : null);
  }, []);

  useEffect(() => {
    if (initialPanel) void load(initialPanel.departure.id);
  }, [initialPanel, load]);

  const pick = (id: string) => {
    setSel(id);
    setFocusId(id);
    setAdding(null);
    setDay(null);
    if (panel?.departure.id !== id) setPanel(null);
    setWaitlist(null);
    void load(id);
  };
  const close = () => {
    reads.current++;
    setSel(null);
    setPanel(null);
    setAdding(null);
    setDay(null);
  };
  const openAdd = (d: string) => {
    close();
    setAdding({ day: d, pkg: filters.pkg });
  };

  const monthHref = (m: string) => calendarHref({ month: m, ...filters });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (typing(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      // Not while the phone's sheet is open: it is a dialog over the month.
      if ((e.key === 'PageUp' || e.key === 'PageDown') && (wide || !(sel || adding || day))) {
        e.preventDefault();
        router.push(monthHref(shiftMonth(month, e.key === 'PageUp' ? -1 : 1)), { scroll: false });
      } else if (e.key === 'Escape' && wide && (sel || adding || day)) {
        close();
      }
    }
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  /** Arrow keys over the chips (grid) or rows (agenda); up and down jump a week on the grid. */
  function onArrows(e: React.KeyboardEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (!t.dataset.dep || !e.key.startsWith('Arrow')) return;
    // Only the view the key was pressed in: the grid and the agenda both sit in the DOM.
    const view = t.closest('[data-view]') ?? e.currentTarget;
    const nodes = Array.from(view.querySelectorAll<HTMLElement>('[data-dep]'));
    const i = nodes.indexOf(t);
    const grid = t.classList.contains('ga-chip');
    const at = t.dataset.day!;
    let next: HTMLElement | undefined;
    if (e.key === 'ArrowRight' || (!grid && e.key === 'ArrowDown')) next = nodes[i + 1];
    else if (e.key === 'ArrowLeft' || (!grid && e.key === 'ArrowUp')) next = nodes[i - 1];
    else if (e.key === 'ArrowDown') {
      const to = addDays(at, 7);
      next = nodes.find((n) => n.dataset.day! >= to);
    } else if (e.key === 'ArrowUp') {
      const to = addDays(at, -7);
      next = [...nodes].reverse().find((n) => n.dataset.day! <= to);
    }
    if (!next) return;
    e.preventDefault();
    setFocusId(next.dataset.dep!);
    next.focus();
  }

  const destinations = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of data.packages) m.set(p.destinationId, p.destinationName);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data.packages]);
  const pkgOptions = data.packages.filter((p) => !filters.dest || p.destinationId === filters.dest);
  const filtering = Boolean(filters.dest || filters.pkg || filters.leader);
  const setFilter = (k: keyof CalendarFilters, v: string) => {
    setFilters((f) => {
      const next = { ...f, [k]: v };
      if (k === 'dest' && v && f.pkg && pkgs.get(f.pkg)?.destinationId !== v) next.pkg = '';
      return next;
    });
  };

  const firstOpenDay = () => {
    const first = `${month}-01`;
    return first > today ? first : today;
  };
  const chipProps = {
    sel,
    focusId: focusId ?? sel ?? deps[0]?.id ?? null,
    today,
    nameOf,
    draftOf,
    onPick: pick,
  };

  const panelBody = adding ? (
    <AddDeparture
      key={`${adding.day}-${adding.pkg}`}
      day={adding.day}
      packageId={adding.pkg}
      packages={data.packages}
      leaders={data.leaders}
      trips={data.leaderTrips}
      today={today}
      onCancel={() => setAdding(null)}
      onCreated={(out) => {
        setAdding(null);
        if (monthOfDay(out.date) === month) {
          router.refresh();
          pick(out.id);
        } else {
          router.push(calendarHref({ month: monthOfDay(out.date), ...filters, dep: out.id }));
        }
      }}
    />
  ) : day ? (
    <DayList
      day={day}
      deps={deps.filter((d) => d.date === day)}
      nameOf={nameOf}
      onPick={pick}
      onAdd={day >= today ? () => openAdd(day) : undefined}
      onClose={() => setDay(null)}
    />
  ) : sel && panel ? (
    <DeparturePanel
      key={sel}
      p={panel}
      waitlist={waitlist}
      today={today}
      onClose={close}
      onChanged={() => {
        router.refresh();
        void load(sel);
      }}
    />
  ) : sel ? (
    <p className="p-6 text-sm text-mute" role="status">
      Loading the departure…
    </p>
  ) : null;

  const overview = (
    <Overview month={month} deps={deps} today={today} nameOf={nameOf} onPick={pick} />
  );

  return (
    <div className="cal grid gap-4">
      <PageHead
        title="Calendar"
        subtitle={`${monthLabel(month)} · every departure, its seats and what needs doing. IST; the numbers match the bookings desk.`}
        actions={
          <button
            type="button"
            onClick={() => openAdd(firstOpenDay())}
            className="inline-flex items-center gap-1.5 rounded-btn bg-action px-3 py-2 text-sm font-bold text-ink hover:bg-action-ink"
          >
            <Plus className="size-4" aria-hidden />
            Add departure
          </button>
        }
      />
      <MonthStrip month={month} s={strip} />

      <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-bg p-3">
        <Filter className="size-4 text-mute" aria-hidden />
        <NativeSelect
          aria-label="Destination"
          value={filters.dest}
          onChange={(e) => setFilter('dest', e.target.value)}
          className="w-auto min-w-40"
        >
          <option value="">All destinations</option>
          {destinations.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Package"
          value={filters.pkg}
          onChange={(e) => setFilter('pkg', e.target.value)}
          className="w-auto min-w-44"
        >
          <option value="">All packages</option>
          {pkgOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Trip leader"
          value={filters.leader}
          onChange={(e) => setFilter('leader', e.target.value)}
          className="w-auto min-w-40"
        >
          <option value="">All leaders</option>
          {data.leaders.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </NativeSelect>
        <span className="text-[13px] text-mute sm:ml-auto" aria-live="polite">
          Showing <b className="num text-ink">{deps.length}</b> of {data.departures.length}{' '}
          departures
        </span>
        {filtering && (
          <button
            type="button"
            onClick={() => setFilters({ dest: '', pkg: '', leader: '' })}
            className="rounded-btn px-2 py-1 text-[13px] font-bold text-primary hover:bg-primary-soft"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Clipped: the month slides in from 36 px aside, never a page-wide scrollbar. */}
        <div className="grid min-w-0 gap-3 overflow-x-clip">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1">
              <Link
                href={monthHref(shiftMonth(month, -1))}
                scroll={false}
                aria-label="Previous month"
                className="grid size-8 place-items-center rounded-btn border border-line hover:border-ink"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Link>
              <h2 className="min-w-36 text-center text-[18px] font-extrabold" aria-live="polite">
                {monthLabel(month)}
              </h2>
              <Link
                href={monthHref(shiftMonth(month, 1))}
                scroll={false}
                aria-label="Next month"
                className="grid size-8 place-items-center rounded-btn border border-line hover:border-ink"
              >
                <ChevronRight className="size-4" aria-hidden />
              </Link>
              {monthOfDay(today) !== month && (
                <Link
                  href={monthHref(monthOfDay(today))}
                  scroll={false}
                  className="ml-1 rounded-btn border border-line px-2.5 py-1 text-[13px] font-bold hover:border-ink"
                >
                  Today
                </Link>
              )}
            </div>
            <span className="text-[12.5px] text-mute">Today {dayLabel(today)} · IST</span>
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink2 lg:ml-auto"
              aria-hidden
            >
              {LEGEND.map((f) => (
                <span key={f} className={cn(`st-${f}`, 'inline-flex items-center gap-1.5')}>
                  <i className="cal-key" />
                  {LEGEND_NOTE[f]}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <i className="cal-key hh" />
                Held
              </span>
              <span className="inline-flex items-center gap-1.5">
                <b className="cal-wl">3</b>
                Waitlist
              </span>
            </div>
          </div>

          {data.departures.length === 0 && (
            <p className="rounded-card border border-dashed border-line bg-bg p-4 text-[13.5px] text-ink2">
              No departures in {monthName(month)}.{' '}
              {data.nextBusyMonth && (
                <Link href={monthHref(data.nextBusyMonth)} className="font-bold text-primary">
                  Next busy month → {monthLabel(data.nextBusyMonth)}
                </Link>
              )}
              {!data.nextBusyMonth && data.prevBusyMonth && (
                <Link href={monthHref(data.prevBusyMonth)} className="font-bold text-primary">
                  ← Last busy month, {monthLabel(data.prevBusyMonth)}
                </Link>
              )}
            </p>
          )}

          <div
            key={month}
            className={cn('min-w-0', dir && `cal-slide-${dir}`)}
            onKeyDown={onArrows}
          >
            <div data-view="grid" className="hidden overflow-x-auto lg:block">
              <div className="min-w-[620px]">
                <MonthGrid
                  month={month}
                  deps={deps}
                  onAdd={openAdd}
                  onMore={(d) => {
                    close();
                    setDay(d);
                  }}
                  {...chipProps}
                />
              </div>
            </div>
            <div data-view="agenda" className="lg:hidden">
              <Agenda
                month={month}
                deps={deps}
                leaderOf={(id) => (id ? leaders.get(id) : undefined)}
                nightsOf={(id) => pkgs.get(id)?.nights ?? 0}
                onAdd={openAdd}
                {...chipProps}
              />
            </div>
          </div>
        </div>

        {wide ? (
          <aside
            aria-label="Calendar panel"
            className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card border border-line bg-bg"
          >
            {panelBody ?? overview}
          </aside>
        ) : (
          <>
            <section
              aria-label={`${monthName(month)} overview`}
              className="rounded-card border border-line bg-bg"
            >
              {overview}
            </section>
            <Sheet open={panelBody !== null} onOpenChange={(open) => !open && close()}>
              <SheetContent className="cal overflow-y-auto max-sm:top-auto max-sm:h-[88dvh] max-sm:rounded-t-2xl">
                <SheetTitle className="sr-only">
                  {adding ? 'Add departure' : day ? dayLabel(day) : 'Departure'}
                </SheetTitle>
                {panelBody}
              </SheetContent>
            </Sheet>
          </>
        )}
      </div>
    </div>
  );
}

/** "+N more": every departure that day, then add another. */
function DayList({
  day,
  deps,
  nameOf,
  onPick,
  onAdd,
  onClose,
}: {
  day: string;
  deps: readonly CalendarMonth['departures'][number][];
  nameOf: (id: string) => string;
  onPick: (id: string) => void;
  onAdd?: () => void;
  onClose: () => void;
}) {
  return (
    <section className="grid gap-2.5 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-extrabold">
          {WEEKDAYS[weekday(day)]} {dayOf(day)} · {deps.length} departures
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-btn px-2 py-1 text-[13px] font-bold text-ink2 hover:bg-bg2"
        >
          Back
        </button>
      </div>
      <ul className="grid gap-1.5">
        {deps.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => onPick(d.id)}
              className={cn(
                `st-${fillOf(d)}`,
                'flex w-full items-center justify-between gap-2 rounded-btn border border-line border-l-[3px] border-l-(--c) p-2.5 text-left hover:bg-bg2',
              )}
            >
              <b className="truncate text-[13.5px]">{nameOf(d.packageId)}</b>
              <span className="num shrink-0 text-[12.5px] text-ink2">
                {d.sold}/{d.seatsTotal} · {FILL_LABEL[fillOf(d)]}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex w-fit items-center gap-1.5 rounded-btn border border-line px-3 py-2 text-[13px] font-bold text-primary hover:border-primary"
        >
          <Plus className="size-4" aria-hidden />
          Add another departure
        </button>
      )}
    </section>
  );
}
