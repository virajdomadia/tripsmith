import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type AdminCoupon, couponTerms, STATE_LABEL } from '@/lib/admin/coupon-schema';
import { formatDate, inr } from '@/lib/format';
import { ActiveToggle } from './ActiveToggle';

const TONE: Record<AdminCoupon['state'], string> = {
  active: 'bg-ok-soft text-ok',
  scheduled: 'bg-primary-soft text-primary-ink',
  paused: 'bg-bg2 text-mute',
  expired: 'bg-bg2 text-mute',
  used_up: 'bg-warn-soft text-warn',
};

const dates = (c: AdminCoupon) =>
  c.endsOn
    ? `${formatDate(c.startsOn)} – ${formatDate(c.endsOn)}`
    : `From ${formatDate(c.startsOn)}`;

/** Code, what it gives, trips, dates, uses / limit, state, the on switch, Edit (B15). */
export function CouponsTable({ items }: { items: AdminCoupon[] }) {
  if (items.length === 0)
    return (
      <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-mute">
        No coupons yet. Create one and customers can type it in the Book-now sheet.
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-bg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Gives</TableHead>
            <TableHead>Trips</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Uses</TableHead>
            <TableHead>State</TableHead>
            <TableHead>On</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono font-bold tracking-wide">{c.code}</TableCell>
              <TableCell>
                {couponTerms(c)}
                {c.minPaise ? (
                  <span className="block text-[12.5px] text-mute">
                    on {inr(c.minPaise)} or more
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="max-w-[220px] truncate text-ink2">
                {c.allPackages ? 'Every package' : c.packages.map((p) => p.name).join(', ')}
              </TableCell>
              <TableCell className="whitespace-nowrap">{dates(c)}</TableCell>
              <TableCell className="num whitespace-nowrap">
                {c.uses}
                {c.useLimit !== null ? ` / ${c.useLimit}` : ''}
                {c.liveHolds > 0 && (
                  <span className="block text-[12.5px] text-mute">+{c.liveHolds} in checkout</span>
                )}
              </TableCell>
              <TableCell>
                <span
                  className={`rounded-chip px-2 py-0.5 text-[12px] font-bold whitespace-nowrap ${TONE[c.state]}`}
                >
                  {STATE_LABEL[c.state]}
                </span>
              </TableCell>
              <TableCell>
                <ActiveToggle id={c.id} code={c.code} active={c.active} />
              </TableCell>
              <TableCell className="text-right text-[13px] font-bold">
                <Link href={`/admin/coupons/${c.id}`} className="text-primary">
                  Edit
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
