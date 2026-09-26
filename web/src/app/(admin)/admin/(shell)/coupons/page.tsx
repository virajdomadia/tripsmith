import { Plus } from 'lucide-react';
import Link from 'next/link';
import { PageHead } from '@/components/admin/PageHead';
import { CouponsTable } from '@/components/admin/coupons/CouponsTable';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';

export const metadata = { title: 'Coupons' };

/** The owner's coupon codes (R26, B15): what each gives, its rules, uses and an on switch. */
export default async function CouponsPage() {
  const { items } = await api('/admin/coupons', { auth: true });
  const live = items.filter((c) => c.state === 'active').length;
  const uses = items.reduce((n, c) => n + c.uses, 0);
  return (
    <>
      <PageHead
        title="Coupons"
        subtitle={`${live} active · ${uses} ${uses === 1 ? 'use' : 'uses'} in all · a use counts once the payment is captured`}
        actions={
          <Link href="/admin/coupons/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="size-4" aria-hidden />
            New coupon
          </Link>
        }
      />
      <CouponsTable items={items} />
    </>
  );
}
