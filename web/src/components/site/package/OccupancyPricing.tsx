import type { components } from '@/lib/api-types';
import { afterDeal, dealLabel, type Deal } from '@/lib/deal';
import { inr, isPriced } from '@/lib/format';

type Departure = components['schemas']['DepartureOut'];

const range = (values: number[]) => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? inr(lo) : `${inr(lo)} – ${inr(hi)}`;
};

/** R4 occupancy table: adult double / triple, child 5–11, single supplement — as a range across
 * the upcoming departures when prices differ by date. Departures still "on request" (price 0)
 * are left out, so a parked date never drags a range down to ₹0. */
export function OccupancyPricing({
  departures: all,
  deal,
}: {
  departures: Departure[];
  deal?: Deal | null;
}) {
  const departures = all.filter((d) => isPriced(d.priceDoublePaise));
  if (departures.length === 0) return null;
  // With a deal: each occupancy's price after the flat amount off (capped at the price itself,
  // the quote's rule). The single supplement is not a traveller, so it never carries the deal.
  const off = (values: number[]) => values.map((v) => afterDeal(v, deal));
  const cells: [string, string][] = [
    ['Adult · double sharing', range(off(departures.map((d) => d.priceDoublePaise)))],
    ['Adult · triple sharing', range(off(departures.map((d) => d.priceTriplePaise)))],
    ['Child 5–11 · with parents', range(off(departures.map((d) => d.priceChildPaise)))],
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
        {deal &&
          `${dealLabel(deal)}: ${inr(deal.offPaise)} off per traveller is already taken off these prices and the dates above. `}
        Prices vary by departure date; the table above is per adult on double sharing.
      </p>
    </div>
  );
}
