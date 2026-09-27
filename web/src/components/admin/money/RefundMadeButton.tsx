'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import { inr } from '@/lib/format';

/**
 * Money desk "Going out" (P13): send an owed refund through Razorpay, or — when only an offline
 * payment's share is waiting — record it handed back, in two taps; the second names the amount,
 * so it is never pressed by accident. The same `POST …/refund` and `…/refund-made` as the booking
 * page; the api refunds each rupee once however often it is pressed.
 */
export function RefundMadeButton({
  bookingRef,
  amountPaise,
  offline = false,
}: {
  bookingRef: string;
  amountPaise: number;
  offline?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();

  function go() {
    start(async () => {
      try {
        await adminRequest(`/admin/bookings/${bookingRef}/${offline ? 'refund-made' : 'refund'}`, {
          method: 'POST',
          body: {},
        });
        toast.success(
          offline
            ? `Offline refund of ${inr(amountPaise)} recorded on ${bookingRef}`
            : `Refund of ${inr(amountPaise)} sent on ${bookingRef}`,
        );
        router.refresh();
      } catch (e) {
        reportAdminError(e, { router, pathname, fallback: 'Could not send the refund' });
        setSure(false);
      }
    });
  }

  if (!sure) {
    return (
      <Button size="sm" onClick={() => setSure(true)}>
        {offline ? 'Refund made (offline)' : 'Send refund'}
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={go} disabled={pending}>
        {pending
          ? offline
            ? 'Recording…'
            : 'Sending…'
          : offline
            ? `Yes, ${inr(amountPaise)} handed back`
            : `Yes, send ${inr(amountPaise)}`}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setSure(false)} disabled={pending}>
        Cancel
      </Button>
    </span>
  );
}
