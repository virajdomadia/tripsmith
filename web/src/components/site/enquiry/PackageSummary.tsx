import Link from 'next/link';
import type { components } from '@/lib/api-types';
import { duration, formatDate, inr } from '@/lib/format';
import { Photo } from '../Photo';

type PackageDetail = components['schemas']['PackageDetail'];

/** S6 `.summary`: cover, name, duration, next departure, from-price, first hotel. The PDF button joins in F11. */
export function PackageSummary({ pkg }: { pkg: PackageDetail }) {
  const next = pkg.departures.find((d) => d.seatsLeft > 0) ?? pkg.departures[0];
  const rows: [string, string][] = [
    ['Duration', duration(pkg.nights, pkg.days)],
    ...(next ? [['Next departure', formatDate(next.date)] as [string, string]] : []),
    ['From', pkg.startingPricePaise ? `${inr(pkg.startingPricePaise)} / person` : 'On request'],
    ...(pkg.hotels[0] ? [['Hotel', pkg.hotels[0].name] as [string, string]] : []),
  ];
  return (
    <aside className="overflow-hidden rounded-card border border-line bg-bg">
      {pkg.cover && (
        <Photo
          src={pkg.cover.url}
          alt={pkg.cover.alt}
          sizes="(min-width: 1024px) 380px, 100vw"
          className="aspect-[16/10]"
        />
      )}
      <div className="grid gap-2.5 p-5">
        <h2 className="text-xl">
          <Link href={`/packages/${pkg.slug}`} className="text-ink no-underline hover:underline">
            {pkg.name}
          </Link>
        </h2>
        <dl className="grid gap-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between gap-4 border-b border-line pb-1.5 last:border-0"
            >
              <dt className="text-mute">{k}</dt>
              <dd className="num font-bold text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
