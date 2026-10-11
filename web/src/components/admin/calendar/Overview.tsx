import {
  dayOf,
  FILL_LABEL,
  fillOf,
  monthName,
  needsOf,
  WEEKDAYS,
  weekday,
  type CalendarDeparture,
  type Fill,
} from '@/lib/admin/calendar';
import { cn } from '@/lib/utils';

const TONE = {
  ok: 'bg-ok-soft text-ok',
  bad: 'bg-bad-soft text-bad',
  warn: 'bg-warn-soft text-warn',
} as const;

const FILLS: Fill[] = ['full', 'hot', 'open', 'low'];
const NEEDS_SHOWN = 7;

/**
 * The panel with nothing picked (mockup A): what needs the owner this month — free seats a
 * waiting party fits, low fill within 70 days, details missing, balances due within 14 days —
 * the month's fill mix, and the keyboard keys.
 */
export function Overview({
  month,
  deps,
  today,
  nameOf,
  onPick,
}: {
  month: string;
  deps: readonly CalendarDeparture[];
  today: string;
  nameOf: (packageId: string) => string;
  onPick: (id: string) => void;
}) {
  const needs = deps
    .map((d) => [d, needsOf(d, today)] as const)
    .filter(([, n]) => n.length)
    .slice(0, NEEDS_SHOWN);
  const name = monthName(month);
  return (
    <div className="grid gap-0">
      <section className="grid gap-2.5 border-b border-line p-4">
        <h3 className="text-[15px] font-extrabold">Needs you in {name}</h3>
        {needs.length ? (
          <ul className="grid gap-1.5">
            {needs.map(([d, n]) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onPick(d.id)}
                  className={cn(
                    `st-${fillOf(d)}`,
                    'grid w-full grid-cols-[38px_minmax(0,1fr)] items-start gap-2.5 rounded-btn border border-line border-l-[3px] border-l-(--c) p-2 text-left transition-colors hover:bg-bg2',
                  )}
                >
                  <span className="grid justify-items-center leading-none">
                    <b className="num text-lg">{dayOf(d.date)}</b>
                    <small className="text-[11px] font-bold text-mute">
                      {WEEKDAYS[weekday(d.date)]}
                    </small>
                  </span>
                  <span className="grid min-w-0 gap-1">
                    <b className="truncate text-[13.5px]">{nameOf(d.packageId)}</b>
                    <span className="flex flex-wrap gap-1">
                      {n.map((x) => (
                        <span
                          key={x.text}
                          className={cn(
                            'rounded-chip px-2 py-0.5 text-[11.5px] font-bold',
                            TONE[x.tone],
                          )}
                        >
                          {x.text}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-btn bg-bg2 p-3 text-[13px] text-ink2">
            Nothing needs you in {name}. Every departure is paid, filled in and on track.
          </p>
        )}
      </section>
      <section className="grid gap-2 border-b border-line p-4">
        <h3 className="text-[15px] font-extrabold">Fill this month</h3>
        <div className="grid grid-cols-4 gap-2">
          {FILLS.map((f) => (
            <span key={f} className={cn(`st-${f}`, 'grid gap-0.5 text-[12px] font-bold text-ink2')}>
              <i className="block h-1.5 rounded-full bg-(--c)" aria-hidden />
              <b className="num text-lg leading-tight text-ink">
                {deps.filter((d) => fillOf(d) === f).length}
              </b>
              {FILL_LABEL[f]}
            </span>
          ))}
        </div>
      </section>
      <section className="grid gap-1.5 p-4">
        <h3 className="text-[15px] font-extrabold">Keyboard</h3>
        <p className="text-[12.5px] text-mute">
          Tab to a departure; arrow keys move between them (up and down jump a week); Enter opens
          it; Esc closes the panel; Page Up and Page Down change month. Click an empty day to add a
          departure there.
        </p>
      </section>
    </div>
  );
}
