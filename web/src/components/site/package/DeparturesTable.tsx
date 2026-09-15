import { Badge } from '@/components/site/Badge';
import type { components } from '@/lib/api-types';
import { formatDate, inr } from '@/lib/format';

type Departure = components['schemas']['DepartureOut'];

/** Seat bar + status pill per departure. The Enquire column arrives with the CTAs (F12). */
export function DeparturesTable({ departures }: { departures: Departure[] }) {
  if (departures.length === 0) {
    return (
      <p className="rounded-[14px] border border-line bg-bg2 p-5 text-mute">
        No fixed departures are open right now — dates on request.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[14px] border border-line">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="bg-bg2 text-left">
            <th className="label-caps px-3.5 py-3">Departure</th>
            <th className="label-caps px-3.5 py-3">Per person</th>
            <th className="label-caps px-3.5 py-3">Seats</th>
            <th className="label-caps px-3.5 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {departures.map((d) => {
            const fill = Math.max(0, Math.min(1, d.seatsLeft / d.seatsTotal));
            const low = d.seatsLeft > 0 && d.seatsLeft <= 4;
            return (
              <tr key={d.id} className="border-t border-line hover:bg-bg2/60">
                <td className="px-3.5 py-3 font-bold">{formatDate(d.date)}</td>
                <td className="num px-3.5 py-3">{inr(d.priceDoublePaise)}</td>
                <td className="px-3.5 py-3">
                  <span className="inline-flex items-center gap-2">
                    <i
                      aria-hidden
                      className="inline-block h-1.5 w-14 overflow-hidden rounded-chip bg-line"
                    >
                      <b
                        className={`block h-full rounded-chip ${low ? 'bg-warn' : 'bg-primary'}`}
                        style={{ width: `${fill * 100}%` }}
                      />
                    </i>
                    <span className="num">{d.seatsLeft > 0 ? `${d.seatsLeft} left` : '—'}</span>
                  </span>
                </td>
                <td className="px-3.5 py-3">
                  <Badge value={d.badge} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
