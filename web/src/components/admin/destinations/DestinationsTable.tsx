import Image from 'next/image';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { components } from '@/lib/api-types';
import { monthRange } from '@/lib/format';

type AdminDestination = components['schemas']['AdminDestination'];

const packages = (d: AdminDestination) => {
  const drafts = d.packageCount - d.livePackageCount;
  if (!d.packageCount) return '—';
  return drafts ? `${d.livePackageCount} live · ${drafts} draft` : `${d.livePackageCount} live`;
};

/** Mockup A5: thumb + name, tagline, best months, packages, order, View / Edit. */
export function DestinationsTable({ items }: { items: AdminDestination[] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-bg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Destination</TableHead>
            <TableHead>Tagline</TableHead>
            <TableHead>Best months</TableHead>
            <TableHead>Packages</TableHead>
            <TableHead>Order</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-bold">
                <span className="flex items-center gap-2.5">
                  <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md bg-line">
                    <Image src={d.coverUrl} alt="" fill sizes="56px" className="object-cover" />
                  </span>
                  {d.name}
                </span>
              </TableCell>
              <TableCell className="max-w-[320px] truncate text-ink2">{d.tagline}</TableCell>
              <TableCell>{monthRange(d.bestMonths)}</TableCell>
              <TableCell className="num">{packages(d)}</TableCell>
              <TableCell className="num">{d.position}</TableCell>
              <TableCell className="whitespace-nowrap text-right text-[13px] font-bold">
                {d.livePackageCount > 0 && (
                  <Link
                    href={`/destinations/${d.slug}`}
                    className="ml-3 text-primary"
                    target="_blank"
                  >
                    View
                  </Link>
                )}
                <Link href={`/admin/destinations/${d.id}`} className="ml-3 text-primary">
                  Edit
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {items.length === 0 && (
        <p className="p-6 text-center text-mute">No destinations yet — add the first one.</p>
      )}
    </div>
  );
}
