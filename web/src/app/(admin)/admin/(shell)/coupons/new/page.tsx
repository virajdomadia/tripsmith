import { PageHead } from '@/components/admin/PageHead';
import { CouponForm } from '@/components/admin/coupons/CouponForm';
import { api } from '@/lib/api';
import { istToday } from '@/lib/booking';

export const metadata = { title: 'New coupon' };

export default async function NewCouponPage() {
  const { items } = await api('/admin/packages', { auth: true });
  return (
    <>
      <PageHead
        title="New coupon"
        subtitle="Customers type the code in the Book-now sheet; the price drops before they pay."
      />
      <CouponForm
        mode="create"
        today={istToday()}
        packages={items.map((p) => ({ id: p.id, name: p.name }))}
      />
    </>
  );
}
