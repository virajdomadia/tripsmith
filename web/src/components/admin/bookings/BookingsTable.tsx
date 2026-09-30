import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { phoneLabel, receivedLabel } from '@/lib/admin/labels';
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
import { formatDate, inr, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CancelRequested, RefundFlag, StateBadge } from './StateBadge';

/** A server component, like the inbox's table: rows arrive filtered and paged by the api.
 *  P20 desk A: a click anywhere on a row opens it in the side panel (`selectHref`, a URL so it
 *  works without JavaScript and survives a reload); the arrow opens the full booking. */
export function BookingsTable({
  items,
  selected,
  selectHref,
}: {
  items: BookingRow[];
  selected?: string;
  selectHref?: (ref: string) => string;
}) {
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
            <TableHead className="hidden 2xl:table-cell">Trip</TableHead>
            <TableHead>Paid</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden 2xl:table-cell">Booked</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((b) => (
            <TableRow
              key={b.ref}
              aria-selected={selected === b.ref}
              className={cn(
                'relative',
                selectHref && 'cursor-pointer',
                selected === b.ref &&
                  'bg-primary-soft/60 shadow-[inset_3px_0_0_var(--color-primary)]',
                b.status === 'cancelled' && !b.refundNeeded && 'text-mute',
              )}
            >
              <TableCell className="num font-bold">
                {selectHref ? (
                  <Link
                    href={selectHref(b.ref)}
                    scroll={false}
                    aria-current={selected === b.ref ? 'true' : undefined}
                    className="text-ink no-underline after:absolute after:inset-0 hover:text-primary"
                  >
                    {b.ref}
                  </Link>
                ) : (
                  b.ref
                )}
                {/* Beside the desk's side panel the Trip and Booked columns fold in here. */}
                <span className="block text-xs font-normal text-mute 2xl:hidden">
                  {b.packageName} · {formatDate(b.departs)}
                </span>
              </TableCell>
              <TableCell>
                <b className="block">{b.leadName}</b>
                <span className="text-xs text-mute">{phoneLabel(b.leadPhone)}</span>
              </TableCell>
              <TableCell className="hidden text-ink2 2xl:table-cell">
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
                {b.balanceDueOn && (
                  // P5: on its deposit — what is left and by when.
                  <span className="block text-xs font-semibold text-warn">
                    {inr(b.totalPaise - b.paidPaise)} due {shortDate(b.balanceDueOn)}
                  </span>
                )}
              </TableCell>
              <TableCell className="min-w-[150px] whitespace-normal">
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
              <TableCell className="hidden whitespace-nowrap text-mute 2xl:table-cell">
                {receivedLabel(b.bookedAt)}
              </TableCell>
              <TableCell className="text-right text-[13px] font-bold">
                <Link
                  href={`/admin/bookings/${b.ref}`}
                  className="relative z-[1] inline-flex rounded-md p-1 text-primary hover:bg-bg2"
                  aria-label={`Open ${b.ref}`}
                  title="Open the booking"
                >
                  <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
