import { Plus } from 'lucide-react';
import Link from 'next/link';
import { PageHead } from '@/components/admin/PageHead';
import { DestinationsTable } from '@/components/admin/destinations/DestinationsTable';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';

export const metadata = { title: 'Destinations' };

export default async function DestinationsPage() {
  const { items } = await api('/admin/destinations', { auth: true });
  const hidden = items.filter((d) => d.livePackageCount === 0).length;
  return (
    <>
      <PageHead
        title="Destinations"
        subtitle={`${items.length} ${items.length === 1 ? 'destination' : 'destinations'}${hidden ? ` · ${hidden} hidden from the public grid (no live package)` : ''}`}
        actions={
          <Link href="/admin/destinations/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="size-4" aria-hidden />
            New destination
          </Link>
        }
      />
      <DestinationsTable items={items} />
    </>
  );
}
