import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TYPE_LABELS } from '@/lib/admin/enquiry-filters';
import type { components } from '@/lib/api-types';
import { MONTHS } from '@/lib/format';
import { StatusBadge } from './StatusBadge';

type EnquiryRow = components['schemas']['EnquiryRow'];

/** `2026-11-01` → `Nov 2026`; the travel month is stored as the first of the month. */
export function monthLabel(iso: string | null): string {
  if (!iso) return '—';
  const [year, month] = iso.split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/** `2 adults, 1 child` — the owner needs the party size at a glance to quote a price. */
export function partyLabel(adults: number, children: number): string {
  const parts = [`${adults} ${adults === 1 ? 'adult' : 'adults'}`];
  if (children > 0) parts.push(`${children} ${children === 1 ? 'child' : 'children'}`);
  return parts.join(', ');
}

/** `9845022110` → `98450 22110`, how an Indian mobile is read out. */
export const phoneLabel = (phone: string) => `${phone.slice(0, 5)} ${phone.slice(5)}`;

/** Received as a relative age up to a week old, then the calendar date (A6 "12 min ago"). */
export function receivedLabel(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Mockup A6. A server component: the rows arrive already filtered, searched and paged by the
 * api, so there is nothing here for the browser to recompute.
 */
export function EnquiriesTable({ items }: { items: EnquiryRow[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-card border border-line bg-bg p-6 text-center text-mute">
        No enquiries match these filters.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-bg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ref</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Package</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Month · pax</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Received</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="num font-bold">{e.ref}</TableCell>
              <TableCell>
                <b className="block">{e.name}</b>
                <span className="text-xs text-mute">{phoneLabel(e.phone)}</span>
              </TableCell>
              <TableCell className="text-ink2">{e.package?.name ?? '—'}</TableCell>
              <TableCell className="text-ink2">{TYPE_LABELS[e.type]}</TableCell>
              <TableCell className="whitespace-nowrap text-ink2">
                {e.travelMonth
                  ? `${monthLabel(e.travelMonth)} · ${partyLabel(e.adults, e.children)}`
                  : '—'}
              </TableCell>
              <TableCell>
                <StatusBadge status={e.status} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-mute">
                {receivedLabel(e.createdAt)}
              </TableCell>
              <TableCell className="text-right text-[13px] font-bold">
                <Link href={`/admin/enquiries/${e.id}`} className="text-primary">
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
