import Link from 'next/link';
import { Badge } from '@/components/site/Badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type UpcomingDeparture, seats } from '@/lib/admin/dashboard';
import { formatDate } from '@/lib/format';

/**
 * Mockup A2's last panel. The badge is the api's (`pricing.badge_for`) and the seat count comes
 * from the `departure_availability` view, so this table can never disagree with the public one.
 * Sold-out dates stay in the list — a full departure three weeks out is news too.
 */
export function UpcomingDepartures({ departures }: { departures: UpcomingDeparture[] }) {
  if (departures.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-mute">
        No departures in the next 30 days.{' '}
        <Link href="/admin/packages" className="font-semibold text-primary hover:underline">
          Add dates to a package
        </Link>
        .
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Package</TableHead>
          <TableHead>Seats</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {departures.map((d) => {
          const { fill, low, left } = seats(d);
          return (
            <TableRow key={d.id}>
              <TableCell className="whitespace-nowrap font-bold">{formatDate(d.date)}</TableCell>
              <TableCell className="text-ink2">{d.packageName}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <i
                    aria-hidden
                    className="inline-block h-1.5 w-14 overflow-hidden rounded-chip bg-line"
                  >
                    <b
                      className={`block h-full rounded-chip ${low ? 'bg-warn' : 'bg-primary'}`}
                      style={{ width: `${fill}%` }}
                    />
                  </i>
                  <span className="num text-sm">
                    {left > 0 ? `${left} of ${d.seatsTotal} left` : 'Sold out'}
                  </span>
                </span>
              </TableCell>
              <TableCell>
                <Badge value={d.badge} />
              </TableCell>
              <TableCell className="text-right text-[13px] font-bold">
                <Link
                  href={`/admin/packages/${d.packageId}`}
                  className="text-primary"
                  aria-label={`Edit ${d.packageName}`}
                >
                  Edit
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
