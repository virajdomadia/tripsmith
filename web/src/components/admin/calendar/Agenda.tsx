import { BadgeCheck, Plus } from 'lucide-react';
import { LeaderAvatar } from '@/components/site/LeaderAvatar';
import {
  chipLabel,
  dayLabel,
  dayOf,
  FILL_LABEL,
  fillOf,
  monthOfDay,
  WEEKDAYS,
  weekday,
  weeksOf,
  type CalendarDeparture,
  type CalendarLeader,
} from '@/lib/admin/calendar';
import { cn } from '@/lib/utils';
import { FillBar } from './FillBar';
import type { ChipProps } from './MonthGrid';

const chip = 'rounded-chip px-2 py-0.5 text-[11.5px] font-bold';

/**
 * The calendar on a phone (below lg): the chosen month week by week, each departure a row with
 * its leader, seat bar and flags, and "+ Day" buttons for the open future days.
 */
export function Agenda({
  month,
  deps,
  leaderOf,
  nightsOf,
  onAdd,
  ...row
}: ChipProps & {
  month: string;
  deps: readonly CalendarDeparture[];
  leaderOf: (id: string | null) => CalendarLeader | undefined;
  nightsOf: (packageId: string) => number;
  onAdd: (day: string) => void;
}) {
  let i = 0;
  return (
    <div className="grid gap-4">
      {weeksOf(month).map((week) => {
        const items = deps.filter((d) => week.includes(d.date));
        const now = week.includes(row.today);
        const open = week.filter(
          (d) => monthOfDay(d) === month && d >= row.today && !items.some((x) => x.date === d),
        );
        const sold = items.reduce((n, d) => n + d.sold, 0);
        const seats = items.reduce((n, d) => n + d.seatsTotal, 0);
        const miss = items.reduce((n, d) => n + d.missingTravellers, 0);
        return (
          <section
            key={week[0]}
            className="grid gap-2"
            aria-label={`Week of ${dayLabel(week[0]!)}`}
          >
            <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line pb-1.5">
              <h3 className="text-[13.5px] font-extrabold">
                {now ? 'This week · ' : 'Week of '}
                {dayLabel(week[0]!)} – {dayLabel(week[6]!)}
              </h3>
              <span className="num text-[12px] text-mute">
                {items.length
                  ? `${items.length} ${items.length === 1 ? 'departure' : 'departures'} · ${sold}/${seats} sold${miss ? ` · details missing for ${miss}` : ''}`
                  : 'No departures'}
              </span>
            </header>
            {items.map((d) => {
              const fill = fillOf(d);
              const leader = leaderOf(d.leaderId);
              const draft = row.draftOf(d.packageId);
              const name = row.nameOf(d.packageId);
              return (
                <button
                  key={d.id}
                  type="button"
                  data-dep={d.id}
                  data-day={d.date}
                  tabIndex={row.focusId === d.id ? 0 : -1}
                  aria-pressed={row.sel === d.id}
                  aria-label={chipLabel(d, name)}
                  onClick={() => row.onPick(d.id)}
                  className={cn(
                    'ag-row grid w-full grid-cols-[44px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-btn bg-bg p-3 text-left',
                    `st-${fill}`,
                    d.date < row.today && 'opacity-70',
                  )}
                >
                  <span className="row-span-2 grid content-start justify-items-center leading-none">
                    <small className="text-[11px] font-bold text-mute">
                      {WEEKDAYS[weekday(d.date)]}
                    </small>
                    <b className="num text-[22px]">{dayOf(d.date)}</b>
                  </span>
                  <span className="grid min-w-0 gap-1">
                    <b className="flex items-center gap-1 truncate text-[14px]">
                      <span className="truncate">{name}</span>
                      {d.guaranteed && (
                        <BadgeCheck className="size-4 shrink-0 text-ok" aria-hidden />
                      )}
                    </b>
                    <span className="flex items-center gap-1.5 text-[12px] text-mute">
                      {leader && <LeaderAvatar leader={leader} size={18} />}
                      <span className="truncate">
                        {leader ? `${leader.name} · ` : ''}
                        {nightsOf(d.packageId)}N · back {dayLabel(d.returns)}
                      </span>
                    </span>
                  </span>
                  <span className="col-start-2 grid gap-1.5">
                    <FillBar d={d} i={i++} />
                    <span className="num text-[12px] text-ink2">
                      <b>
                        {d.sold}/{d.seatsTotal}
                      </b>{' '}
                      sold{d.held ? ` · ${d.held} held` : ''} · {d.free} free
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <span className={cn(chip, 'bg-(--c) text-white')}>
                        {draft ? 'Draft' : FILL_LABEL[fill]}
                      </span>
                      {d.waiting > 0 && (
                        <span className={cn(chip, 'bg-primary-soft text-primary-ink')}>
                          {d.waiting} waiting
                        </span>
                      )}
                      {d.missingTravellers > 0 && (
                        <span className={cn(chip, 'bg-bad-soft text-bad')}>
                          Details missing · {d.missingTravellers}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
            {!items.length && <p className="text-[13px] text-mute">Nothing leaves this week.</p>}
            {open.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] font-bold text-mute">Open days</span>
                {open.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onAdd(day)}
                    aria-label={`Add departure on ${dayLabel(day)}`}
                    className="inline-flex items-center gap-1 rounded-btn border border-line px-2 py-1 text-[12px] font-bold text-primary hover:border-primary"
                  >
                    <Plus className="size-3.5" aria-hidden />
                    {WEEKDAYS[weekday(day)]} {dayOf(day)}
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
