import Link from 'next/link';
import { Printer } from 'lucide-react';
import { manifestHref, type DepartureSeats } from '@/lib/admin/booking-filters';
import { formatDate } from '@/lib/format';

/**
 * One departure's seats, as the `departure_availability` view counts them: the api reads
 * `seatsLeft` from the view and counts `booked`/`held` by the view's own rules, so this strip,
 * the manifest and the public page always agree (R22 accept).
 */
export function SeatStrip({
  seats,
  manifest = true,
}: {
  seats: DepartureSeats;
  manifest?: boolean;
}) {
  const cells = [
    { label: 'Seats', value: seats.seatsTotal },
    { label: 'Booked', value: seats.booked },
    { label: 'On hold', value: seats.held },
    { label: 'Left', value: seats.seatsLeft },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-line bg-bg p-4">
      <div className="min-w-0">
        <b className="block truncate text-sm">{seats.packageName}</b>
        <span className="text-[13px] text-mute">{formatDate(seats.date)}</span>
      </div>
      <dl className="flex gap-5">
        {cells.map((c) => (
          <div key={c.label}>
            <dt className="text-xs font-bold text-mute">{c.label}</dt>
            <dd className="num text-lg font-extrabold">{c.value}</dd>
          </div>
        ))}
      </dl>
      {manifest && (
        <Link
          href={manifestHref(seats.departureId)}
          target="_blank"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-primary sm:ml-auto"
        >
          <Printer className="size-4" aria-hidden />
          Print manifest
        </Link>
      )}
    </div>
  );
}
