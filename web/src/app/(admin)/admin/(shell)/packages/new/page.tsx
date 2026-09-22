import Link from 'next/link';
import { PageHead } from '@/components/admin/PageHead';
import { PackageForm } from '@/components/admin/packages/PackageForm';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';

export const metadata = { title: 'New package' };

export default async function NewPackagePage() {
  const { items } = await api('/admin/destinations', { auth: true });

  // A <Select> with no options would make the form unsubmittable with no visible reason.
  if (items.length === 0) {
    return (
      <>
        <PageHead title="New package" />
        <div className="grid max-w-[560px] gap-3 rounded-card border border-line bg-bg p-5">
          <p>Add a destination first — every package belongs to one.</p>
          <div>
            <Link href="/admin/destinations/new" className={buttonVariants({ size: 'sm' })}>
              New destination
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead title="New package" subtitle="Save the draft first, then add photos and publish." />
      <PackageForm mode="create" destinations={items} />
    </>
  );
}
