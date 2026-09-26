import Link from 'next/link';
import { phoneLabel, receivedLabel } from '@/components/admin/enquiries/EnquiriesTable';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { BookingRow } from '@/lib/admin/booking-filters';
import { travellersLabel } from '@/lib/account';
import { formatDate, inr } from '@/lib/format';
import { CancelRequested, RefundFlag, StateBadge } from './StateBadge';

/** A server component, like the inbox's table: rows arrive filtered and paged by the api. */
export function BookingsTable({ items }: { items: BookingRow[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-card border border-line bg-bg p-6 text-center text-mute">
        No bookings match these filters.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-bg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ref</TableHead>
            <TableHead>Lead</TableHead>
            <TableHead>Trip</TableHead>
            <TableHead>Paid</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Booked</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((b) => (
            <TableRow key={b.ref}>
              <TableCell className="num font-bold">{b.ref}</TableCell>
              <TableCell>
                <b className="block">{b.leadName}</b>
                <span className="text-xs text-mute">{phoneLabel(b.leadPhone)}</span>
              </TableCell>
              <TableCell className="text-ink2">
                <span className="block">{b.packageName}</span>
                <span className="text-xs text-mute">
                  {formatDate(b.departs)} · {travellersLabel(b.travellers)}
                </span>
              </TableCell>
              <TableCell className="num whitespace-nowrap">
                {inr(b.paidPaise)} <span className="text-mute">/ {inr(b.totalPaise)}</span>
                {b.couponCode && (
                  <span className="block font-mono text-xs tracking-wide text-ok">
                    {b.couponCode}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <StateBadge
                    status={b.status}
                    holdLive={b.holdLive}
                    cancelReason={b.cancelReason}
                  />
                  {b.refundNeeded && <RefundFlag />}
                  {b.cancellation === 'requested' && <CancelRequested />}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-mute">
                {receivedLabel(b.bookedAt)}
              </TableCell>
              <TableCell className="text-right text-[13px] font-bold">
                <Link
                  href={`/admin/bookings/${b.ref}`}
                  className="text-primary"
                  aria-label={`Open ${b.ref}`}
                >
                  Open
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
