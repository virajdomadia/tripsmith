import { BadgeCheck, Plus } from 'lucide-react';
import {
  CELL_CHIPS,
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
} from '@/lib/admin/calendar';
import { cn } from '@/lib/utils';
import { FillBar } from './FillBar';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type ChipProps = {
  sel: string | null;
  focusId: string | null;
  today: string;
  nameOf: (packageId: string) => string;
  draftOf: (packageId: string) => boolean;
  onPick: (id: string) => void;
};

/**
 * Mockup A's month grid: weeks from Sunday, a chip per departure (name, guaranteed tick,
 * waitlist count, fill bar, sold/total and fill word), up to three a day then "+N more", and an
 * "Add departure" target on every empty future day. Chips are one roving tab stop (the board
 * moves focus with the arrow keys).
 */
export function MonthGrid({
  month,
  deps,
  onAdd,
  onMore,
  ...chip
}: ChipProps & {
  month: string;
  deps: readonly CalendarDeparture[];
  onAdd: (day: string) => void;
  onMore: (day: string) => void;
}) {
  let i = 0;
  const byDay = new Map<string, CalendarDeparture[]>();
  for (const d of deps) byDay.set(d.date, [...(byDay.get(d.date) ?? []), d]);
  return (
    <div className="overflow-hidden rounded-[12px] border border-line bg-bg">
      <div className="grid grid-cols-7" aria-hidden>
        {WEEKDAYS.map((d) => (
          <span
            key={d}
            className="border-b border-line bg-bg2 px-2 py-1.5 text-[11px] font-extrabold tracking-[.08em] text-mute uppercase"
          >
            {d}
          </span>
        ))}
      </div>
      {weeksOf(month).map((week) => (
        <div key={week[0]} className="ga-wk grid grid-cols-7">
          {week.map((day) => {
            const inMonth = monthOfDay(day) === month;
            const future = day >= chip.today;
            const list = inMonth ? (byDay.get(day) ?? []) : [];
            const more = list.length - CELL_CHIPS;
            const canAdd = inMonth && future;
            return (
              <div
                key={day}
                className={cn(
                  'ga-c',
                  !inMonth && 'out',
                  inMonth && !future && 'past',
                  day === chip.today && 'today',
                  weekday(day) % 6 === 0 && 'we',
                )}
              >
                <div className="ga-dn flex min-h-[22px] items-center gap-1.5 text-[12.5px] font-extrabold">
                  <span className="num">
                    {dayOf(day)}
                    {inMonth ? '' : ` ${MON[Number(day.slice(5, 7)) - 1]}`}
                  </span>
                  {day === chip.today && (
                    <em className="rounded-chip bg-action px-1.5 py-px text-[10px] font-extrabold tracking-[.06em] text-ink uppercase not-italic">
                      Today
                    </em>
                  )}
                  {canAdd && list.length > 0 && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => onAdd(day)}
                      aria-label={`Add departure on ${dayLabel(day)}`}
                      className="ga-add ml-auto grid size-[22px] place-items-center rounded-md text-mute hover:bg-primary-soft hover:text-primary"
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
                {list.slice(0, CELL_CHIPS).map((d) => (
                  <Chip key={d.id} d={d} i={i++} {...chip} />
                ))}
                {more > 0 && (
                  <button
                    type="button"
                    onClick={() => onMore(day)}
                    className="rounded-md px-1.5 py-0.5 text-left text-[11.5px] font-bold text-primary hover:bg-primary-soft"
                  >
                    +{more} more
                  </button>
                )}
                {canAdd && list.length === 0 && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => onAdd(day)}
                    aria-label={`Add departure on ${dayLabel(day)}`}
                    className="ga-empty flex min-h-14 flex-1 items-center justify-center gap-1 rounded-lg text-[11.5px] font-bold text-primary"
                  >
                    <Plus className="size-4" aria-hidden />
                    Add departure
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Chip({
  d,
  i,
  sel,
  focusId,
  today,
  nameOf,
  draftOf,
  onPick,
}: ChipProps & { d: CalendarDeparture; i: number }) {
  const fill = fillOf(d);
  const name = nameOf(d.packageId);
  const draft = draftOf(d.packageId);
  return (
    <button
      type="button"
      data-dep={d.id}
      data-day={d.date}
      tabIndex={focusId === d.id ? 0 : -1}
      aria-pressed={sel === d.id}
      aria-label={`${chipLabel(d, name)}${draft ? ', draft' : ''}${d.date < today ? ', past' : ''}`}
      onClick={() => onPick(d.id)}
      className={cn('ga-chip', `st-${fill}`, draft && 'draft', d.date < today && 'past')}
    >
      {/* Two lines for the name: a day column is ~85 px beside the panel at 1280. */}
      <span className="flex min-w-0 items-start gap-1 text-[11.5px] leading-[1.2]">
        <b className="line-clamp-2 min-w-0 flex-1 font-extrabold break-words">{name}</b>
        {d.waiting > 0 && <span className="cal-wl num">{d.waiting}</span>}
      </span>
      <FillBar d={d} i={i} />
      <span className="flex flex-wrap items-center justify-between gap-x-1 text-[11px] leading-tight font-bold">
        <span className="num inline-flex items-center gap-0.5">
          {d.sold}/{d.seatsTotal}
          {d.guaranteed && <BadgeCheck className="size-3 shrink-0" aria-label="Guaranteed" />}
        </span>
        <span className="w">{draft ? 'Draft' : FILL_LABEL[fill]}</span>
      </span>
    </button>
  );
}
