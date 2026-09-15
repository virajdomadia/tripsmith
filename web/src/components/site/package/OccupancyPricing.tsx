import type { components } from '@/lib/api-types';
import { inr } from '@/lib/format';

type Departure = components['schemas']['DepartureOut'];

const range = (values: number[]) => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? inr(lo) : `${inr(lo)} – ${inr(hi)}`;
};

/** R4 occupancy table: adult double / triple, child 5–11, single supplement — as a range across
 * the upcoming departures when prices differ by date. */
export function OccupancyPricing({ departures }: { departures: Departure[] }) {
  if (departures.length === 0) return null;
  const cells: [string, string][] = [
    ['Adult · double sharing', range(departures.map((d) => d.priceDoublePaise))],
    ['Adult · triple sharing', range(departures.map((d) => d.priceTriplePaise))],
    ['Child 5–11 · with parents', range(departures.map((d) => d.priceChildPaise))],
    ['Single supplement', `+ ${range(departures.map((d) => d.singleSupplementPaise))}`],
  ];
  return (
    <div>
      <h3 className="mt-8 mb-3 text-lg">Price per person</h3>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cells.map(([label, value]) => (
          <div key={label} className="rounded-btn border border-line p-3.5">
            <dt className="mb-1 text-xs font-semibold text-mute">{label}</dt>
            <dd className="num text-xl font-extrabold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-mute">
        Prices vary by departure date; the table above is per adult on double sharing.
      </p>
    </div>
  );
}
