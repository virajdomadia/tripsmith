import { Eye } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead } from '@/components/admin/PageHead';
import { DuplicatePackage } from '@/components/admin/packages/DuplicatePackage';
import { PackageForm } from '@/components/admin/packages/PackageForm';
import { buttonVariants } from '@/components/ui/button';
import { api, ApiRequestError } from '@/lib/api';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'Edit package' };

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let pkg;
  let destinations;
  try {
    [pkg, destinations] = await Promise.all([
      api('/admin/packages/{id}', { params: { id }, auth: true }),
      api('/admin/destinations', { auth: true }),
    ]);
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }

  const live = pkg.status === 'live';
  return (
    <>
      <PageHead
        title={pkg.name}
        subtitle={`${live ? 'Live' : 'Draft'} · updated ${formatDate(pkg.updatedAt)}`}
        actions={
          <>
            {live && (
              <Link
                href={`/packages/${pkg.slug}`}
                target="_blank"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <Eye className="size-4" aria-hidden />
                Preview
              </Link>
            )}
            <DuplicatePackage id={pkg.id} name={pkg.name} />
          </>
        }
      />
      <PackageForm mode="edit" pkg={pkg} destinations={destinations.items} />
    </>
  );
}
