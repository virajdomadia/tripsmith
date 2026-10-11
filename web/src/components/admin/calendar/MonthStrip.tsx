import type { ReactNode } from 'react';
import { dayLabel, monthName, type Strip } from '@/lib/admin/calendar';
import { lakh } from '@/lib/admin/money';
import { Meter } from './FillBar';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Kpi({ k, v, d, extra }: { k: string; v: ReactNode; d: ReactNode; extra?: ReactNode }) {
  return (
    <div className="grid content-start gap-1 rounded-card border border-line bg-bg p-4">
      <span className="text-[11.5px] font-extrabold tracking-[.08em] text-mute uppercase">{k}</span>
      <span className="num text-[26px] leading-none font-extrabold">{v}</span>
      {extra}
      <span className="text-[12.5px] text-mute">{d}</span>
    </div>
  );
}

/**
 * The month at a glance over the departures the filters show — the only place, with the panel,
 * that shows money (R50). Sums match the bookings desk CSV for the same departures.
 */
export function MonthStrip({ month, s }: { month: string; s: Strip }) {
  return (
    <section
      aria-label={`${monthName(month)} at a glance`}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
    >
      <Kpi
        k="Departures"
        v={s.departures}
        d={s.departures ? `${s.soldOut} sold out` : 'None this month'}
      />
      <Kpi
        k="Seats sold"
        v={`${s.soldPercent}%`}
        d={`${s.sold} of ${s.seats} · ${s.held} held`}
        extra={<Meter sold={s.sold} held={s.held} of={s.seats} />}
      />
      <Kpi k="Revenue booked" v={lakh(s.revenuePaise)} d={`${lakh(s.collectedPaise)} collected`} />
      <Kpi
        k="Balances due"
        v={s.balancePaise ? lakh(s.balancePaise) : '₹0'}
        d={
          s.balancePaise && s.firstDueOn
            ? `${plural(s.balanceBookings, 'booking', 'bookings')} · first due ${dayLabel(s.firstDueOn)}`
            : 'All paid in full'
        }
      />
      <Kpi
        k="Details missing"
        v={s.missing}
        d={
          s.missing
            ? `${s.missing === 1 ? 'traveller' : 'travellers'} on ${plural(s.missingDepartures, 'departure', 'departures')}`
            : 'Everyone has filled in'
        }
      />
    </section>
  );
}
