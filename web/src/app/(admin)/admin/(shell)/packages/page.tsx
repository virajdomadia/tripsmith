import { Plus } from 'lucide-react';
import Link from 'next/link';
import { PageHead } from '@/components/admin/PageHead';
import { PackagesTable } from '@/components/admin/packages/PackagesTable';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';

export const metadata = { title: 'Packages' };

export default async function PackagesPage() {
  const { items } = await api('/admin/packages', { auth: true });
  const live = items.filter((p) => p.status === 'live').length;
  const drafts = items.length - live;
  return (
    <>
      <PageHead
        title="Packages"
        subtitle={`${live} live${drafts ? ` · ${drafts} draft` : ''}`}
        actions={
          <Link href="/admin/packages/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="size-4" aria-hidden />
            New package
          </Link>
        }
      />
      <PackagesTable items={items} />
    </>
  );
}
