import type { CSSProperties } from 'react';
import { pct, type CalendarDeparture } from '@/lib/admin/calendar';

type Seats = Pick<CalendarDeparture, 'sold' | 'held' | 'seatsTotal'>;

/** Sold (solid) then held (hatched) over the free track; `i` staggers the grow-in. */
export function FillBar({ d, i = 0 }: { d: Seats; i?: number }) {
  const style = {
    '--s': `${pct(d.sold, d.seatsTotal)}%`,
    '--h': `${pct(d.held, d.seatsTotal)}%`,
    '--i': i,
  } as CSSProperties;
  return (
    <span className="cal-bar" style={style} aria-hidden>
      <i />
      <i className="h" />
    </span>
  );
}

/** The panel's and the strip's thicker meter (no grow-in). */
export function Meter({ sold, held = 0, of }: { sold: number; held?: number; of: number }) {
  const style = { '--s': `${pct(sold, of)}%`, '--h': `${pct(held, of)}%` } as CSSProperties;
  return (
    <span className="cal-meter" style={style} aria-hidden>
      <i />
      <i className="h" />
    </span>
  );
}
