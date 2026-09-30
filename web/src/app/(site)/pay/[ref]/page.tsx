import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/site/Container';
import { LinkReturn } from '@/components/site/booking/LinkReturn';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your payment',
  robots: { index: false, follow: false },
};

const REF = /^TB-[A-Z0-9]{6}$/;
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

/**
 * Where Razorpay sends the customer back after paying a counter payment link (R56, P18b), with
 * its signed parameters in the query. The page posts them to the api, which checks the signature
 * and confirms the booking through the same capture as the website.
 */
export default async function PayReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Search>;
}) {
  const { ref } = await params;
  if (!REF.test(ref)) notFound();
  const q = await searchParams;
  return (
    <Container className="grid min-h-[60dvh] place-items-center py-14">
      <LinkReturn
        bookingRef={ref}
        callback={{
          razorpayPaymentId: one(q.razorpay_payment_id),
          razorpayPaymentLinkId: one(q.razorpay_payment_link_id),
          razorpayPaymentLinkReferenceId: one(q.razorpay_payment_link_reference_id),
          razorpayPaymentLinkStatus: one(q.razorpay_payment_link_status),
          razorpaySignature: one(q.razorpay_signature),
        }}
      />
    </Container>
  );
}
