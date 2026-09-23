import Link from 'next/link';
import type { components } from '@/lib/api-types';
import { formatDate } from '@/lib/format';
import { StatusBadge } from './StatusBadge';

type RelatedEnquiry = components['schemas']['RelatedEnquiry'];

/** A7's "other enquiries · same phone": a returning caller is the owner's best lead. */
export function RelatedEnquiries({ items }: { items: RelatedEnquiry[] }) {
  if (items.length === 0) return <p className="text-sm text-mute">None — first enquiry.</p>;
  return (
    <ul className="grid gap-2">
      {items.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/admin/enquiries/${r.id}`} className="num font-bold text-primary">
            {r.ref}
          </Link>
          <span className="text-ink2">{r.packageName ?? 'General enquiry'}</span>
          <StatusBadge status={r.status} />
          <span className="ml-auto text-xs text-mute">{formatDate(r.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}
