'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import type { AdminBooking } from '@/lib/admin/booking-filters';
import { inr } from '@/lib/format';

const NOTE_MAX = 80; // api schemas/admin_bookings.py NOTE_MAX

type Action = 'mark-paid' | 'release' | 'refund-made';

/**
 * The desk's three writes, each behind a confirm dialog. The api re-checks everything under the
 * departure lock and answers 409 with the reason (a seat shortfall, a booking no longer
 * pending), which lands as a toast; `router.refresh()` then re-renders the page and the
 * sidebar badge from the server.
 */
export function DeskActions({ booking }: { booking: AdminBooking }) {
  const { ref, canMarkPaid, canRelease, refundNeeded } = booking;
  if (!canMarkPaid && !canRelease && !refundNeeded) {
    return <p className="text-sm text-mute">Nothing to do here.</p>;
  }
  const owed = booking.totalPaise - booking.paidPaise;
  return (
    <div className="grid gap-2">
      {canMarkPaid && (
        <ActionDialog
          bookingRef={ref}
          action="mark-paid"
          field="reference"
          fieldLabel="Reference (optional)"
          fieldHint="Bank UTR, 'cash at office'…"
          trigger="Mark paid (offline)"
          title={`Mark ${ref} paid — ${inr(owed)}`}
          confirm="Mark paid and confirm"
          done="Marked paid — confirmation sent"
          description={
            <>
              Records an offline payment of the full {inr(owed)} and confirms the booking; the
              customer gets the confirmation email with the voucher. The seats are re-checked first
              — the hold has usually lapsed.
              {booking.seatsShort > 0 && (
                <b className="mt-2 block text-bad">
                  Right now the party is {booking.seatsShort}{' '}
                  {booking.seatsShort === 1 ? 'seat' : 'seats'} short, so this will be refused
                  unless seats free up.
                </b>
              )}
            </>
          }
        />
      )}
      {canRelease && (
        <ActionDialog
          bookingRef={ref}
          action="release"
          trigger="Release hold"
          variant="outline"
          title={`Release ${ref}?`}
          confirm="Release and cancel"
          done="Hold released — seats are free"
          description="Cancels this pending booking and frees its seats at once. No email is sent. A payment that still arrives on it will be flagged for a refund."
        />
      )}
      {refundNeeded && (
        <ActionDialog
          bookingRef={ref}
          action="refund-made"
          field="note"
          fieldLabel="Note (optional)"
          fieldHint="Razorpay refund id…"
          trigger="Refund made"
          variant="outline"
          title={`Record the refund on ${ref}`}
          confirm="Record refund"
          done="Refund recorded"
          description="Refund the money by hand in the Razorpay dashboard first. This only records it here: the payment is marked refunded and the red flag clears. No email is sent."
        />
      )}
    </div>
  );
}

function ActionDialog({
  bookingRef,
  action,
  field,
  fieldLabel,
  fieldHint,
  trigger,
  title,
  description,
  confirm,
  done,
  variant = 'default',
}: {
  bookingRef: string;
  action: Action;
  field?: 'reference' | 'note';
  fieldLabel?: string;
  fieldHint?: string;
  trigger: string;
  title: string;
  description: ReactNode;
  confirm: string;
  done: string;
  variant?: 'default' | 'outline';
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState('');
  const [, startTransition] = useTransition();
  const inputId = `${action}-${field ?? 'none'}`;

  async function submit() {
    setBusy(true);
    try {
      await adminRequest(`/admin/bookings/${bookingRef}/${action}`, {
        method: 'POST',
        body: field ? { [field]: value.trim() || null } : undefined,
      });
      toast.success(done);
      setOpen(false);
      setValue('');
      startTransition(() => router.refresh());
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Could not save — try again' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant={variant}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>{description}</div>
          </DialogDescription>
        </DialogHeader>
        {field && (
          <div className="grid gap-1.5">
            <Label htmlFor={inputId}>{fieldLabel}</Label>
            <Input
              id={inputId}
              value={value}
              maxLength={NOTE_MAX}
              placeholder={fieldHint}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Saving…' : confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
