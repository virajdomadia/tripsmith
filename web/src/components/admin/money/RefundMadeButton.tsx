'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import { inr } from '@/lib/format';

/**
 * Money desk "Going out": record a refund already made in the Razorpay dashboard, in two taps —
 * the second one names the amount, so it is never pressed by accident. The same
 * `POST …/refund-made` as the booking page; the page refreshes and the equation moves.
 */
export function RefundMadeButton({
  bookingRef,
  amountPaise,
}: {
  bookingRef: string;
  amountPaise: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();

  function record() {
    start(async () => {
      try {
        await adminRequest(`/admin/bookings/${bookingRef}/refund-made`, {
          method: 'POST',
          body: {},
        });
        toast.success(`Refund of ${inr(amountPaise)} recorded on ${bookingRef}`);
        router.refresh();
      } catch (e) {
        reportAdminError(e, { router, pathname, fallback: 'Could not record the refund' });
        setSure(false);
      }
    });
  }

  if (!sure) {
    return (
      <Button size="sm" onClick={() => setSure(true)}>
        Refund made
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={record} disabled={pending}>
        {pending ? 'Recording…' : `Yes, ${inr(amountPaise)} refunded`}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setSure(false)} disabled={pending}>
        Cancel
      </Button>
    </span>
  );
}
