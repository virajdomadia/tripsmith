import type { components } from '@/lib/api-types';
import { duration, priceOrOnRequest, shortDate } from '@/lib/format';

type PackageDetail = components['schemas']['PackageDetail'];

export function QuickFacts({ pkg }: { pkg: PackageDetail }) {
  const stay = pkg.hotels[0];
  const next = pkg.departures[0];
  const facts: [string, string][] = [
    ['Duration', duration(pkg.nights, pkg.days)],
    ['From', priceOrOnRequest(pkg.startingPricePaise)],
    ['Departs', pkg.departureCity.replace(/^Ex-/, '')],
    ['Stay', stay ? `${stay.stars}★ ${stay.city}` : '—'],
    ['Next date', next ? shortDate(next.date) : 'On request'],
  ];
  return (
    <dl className="mt-4.5 grid grid-cols-2 overflow-hidden rounded-[14px] border border-line bg-bg2 sm:grid-cols-3 lg:grid-cols-5">
      {facts.map(([label, value]) => (
        <div
          key={label}
          className="border-r border-b border-line px-4.5 py-4 last:border-r-0 lg:border-b-0"
        >
          <dt className="label-caps mb-1">{label}</dt>
          <dd className="num text-lg font-extrabold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
