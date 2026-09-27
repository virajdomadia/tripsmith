import { Plus } from 'lucide-react';
import Link from 'next/link';
import { PageHead } from '@/components/admin/PageHead';
import { PackageCatalogue } from '@/components/admin/packages/PackageCatalogue';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';
import { needsLook } from '@/lib/admin/catalogue';

export const metadata = { title: 'Packages' };

/** Packages B · Photo catalogue (R59, P20): the catalogue as photo cards with their health. */
export default async function PackagesPage() {
  const { items } = await api('/admin/packages', { auth: true });
  const live = items.filter((p) => p.status === 'live').length;
  const drafts = items.length - live;
  const featured = items.filter((p) => p.featured).length;
  const look = items.filter(needsLook).length;
  return (
    <>
      <PageHead
        title="Packages"
        subtitle={`${live} live${drafts ? ` · ${drafts} draft` : ''} · ${featured} featured on the home page · ${look} ${look === 1 ? 'needs' : 'need'} a look`}
        actions={
          <Link href="/admin/packages/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="size-4" aria-hidden />
            New package
          </Link>
        }
      />
      <PackageCatalogue items={items} />
    </>
  );
}
