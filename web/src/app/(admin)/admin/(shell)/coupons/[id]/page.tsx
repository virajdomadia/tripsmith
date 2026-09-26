import { notFound } from 'next/navigation';
import { PageHead } from '@/components/admin/PageHead';
import { CouponForm } from '@/components/admin/coupons/CouponForm';
import { couponTerms, STATE_LABEL } from '@/lib/admin/coupon-schema';
import { api, ApiRequestError } from '@/lib/api';
import { istToday } from '@/lib/booking';

export const metadata = { title: 'Edit coupon' };

export default async function EditCouponPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let coupon;
  try {
    coupon = await api('/admin/coupons/{id}', { params: { id }, auth: true });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
  const { items } = await api('/admin/packages', { auth: true });
  const uses = `${coupon.uses}${coupon.useLimit !== null ? ` of ${coupon.useLimit}` : ''} used`;
  return (
    <>
      <PageHead
        title={coupon.code}
        subtitle={`${couponTerms(coupon)} · ${STATE_LABEL[coupon.state]} · ${uses}`}
      />
      <CouponForm
        mode="edit"
        coupon={coupon}
        today={istToday()}
        packages={items.map((p) => ({ id: p.id, name: p.name }))}
      />
    </>
  );
}
