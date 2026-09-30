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
import { lastProblem, sendPreview, staleFlag, type SplitPart } from '@/lib/admin/refunds';
import { inr } from '@/lib/format';

const NOTE_MAX = 80; // api schemas/admin_bookings.py NOTE_MAX

export type DeskAction = 'mark-paid' | 'release' | 'refund-made';
type Action = 'mark-paid' | 'release' | 'refund' | 'refund-made' | 'balance-paid';

/**
 * The desk's writes, each behind a confirm dialog — mark paid, release, and (P13) the refunds:
 * "Send refund" sends through Razorpay whatever is owed and resends anything that never reached
 * it; "Refund made (offline)" records an offline payment's share handed back. The api re-checks everything under the
 * departure lock and answers 409 with the reason (a seat shortfall, a booking no longer
 * pending), which lands as a toast; `router.refresh()` then re-renders the page and the
 * sidebar badge from the server.
 */
export function DeskActions({ booking, only }: { booking: AdminBooking; only?: DeskAction }) {
  const { ref } = booking;
  // P20: `only` shows one action (a Lifecycle move); unset shows every one that applies.
  const canMarkPaid = booking.canMarkPaid && (!only || only === 'mark-paid');
  const canRelease = booking.canRelease && (!only || only === 'release');
  const refundNeeded = booking.refundNeeded && (!only || only === 'refund-made');
  if (only && !canMarkPaid && !canRelease && !refundNeeded) return null;
  if (!canMarkPaid && !canRelease && !refundNeeded) {
    return (
      <p className="text-sm text-mute">
        {booking.cancellation?.status === 'requested'
          ? 'Answer the cancellation request below.'
          : 'Nothing to do here.'}
      </p>
    );
  }
  const owed = booking.totalPaise - booking.paidPaise;
  const send = booking.refundToSendPaise;
  const byHand = booking.refundOfflinePaise;
  const split = sendPreview(booking);
  const problem = lastProblem(booking);
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
      {refundNeeded && send > 0 && (
        <ActionDialog
          bookingRef={ref}
          action="refund"
          body={{}}
          trigger={`Send refund · ${inr(send)}`}
          title={`Send ${inr(send)} back to the customer?`}
          confirm={`Refund ${inr(send)}`}
          done="Refund sent to Razorpay"
          description={
            <>
              {problem && (
                <b className="mb-2 block text-bad">The last try didn’t go through: {problem}</b>
              )}
              Goes back through Razorpay to the way they paid, newest payment first:
              <SplitList parts={split} />
              Each refund is sent once — pressing this again never refunds twice. Banks take 5–7
              working days.
            </>
          }
        />
      )}
      {refundNeeded && staleFlag(booking) && (
        <ActionDialog
          bookingRef={ref}
          action="refund"
          body={{}}
          trigger="Clear the refund flag"
          variant="outline"
          title={`Clear the refund flag on ${ref}?`}
          confirm="Clear the flag"
          done="Nothing left to refund — flag cleared"
          description="Nothing is left to send or hand back on this booking, so the flag only needs clearing. No money moves and no email is sent."
        />
      )}
      {refundNeeded && byHand > 0 && (
        <ActionDialog
          bookingRef={ref}
          action="refund-made"
          field="note"
          fieldLabel="Note (optional)"
          fieldHint="UPI ref, 'cash at office'…"
          trigger={`Refund made (offline) · ${inr(byHand)}`}
          variant="outline"
          title={`Record ${inr(byHand)} handed back on ${ref}`}
          confirm="Record refund"
          done="Offline refund recorded"
          description={`This booking was paid offline, so ${inr(byHand)} of the refund is yours to hand back by cash, UPI or bank. Do that first; this records it and clears the flag. The customer sees "Refund made" on their trip.`}
        />
      )}
    </div>
  );
}

export function SplitList({ parts }: { parts: SplitPart[] }) {
  if (parts.length === 0) return null;
  return (
    <ul className="my-2 grid gap-1 rounded-card border border-line bg-bg2 p-2.5 text-[13px]">
      {parts.map((p) => (
        <li key={p.paymentId} className="flex justify-between gap-3">
          <span className="min-w-0 break-all text-ink2">{p.label}</span>
          <b className="num shrink-0 text-ink">{inr(p.amountPaise)}</b>
        </li>
      ))}
    </ul>
  );
}

export function ActionDialog({
  bookingRef,
  action,
  body: fixedBody,
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
  /** Sent as is when there is no field (a route that takes an optional body). */
  body?: Record<string, never>;
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
        body: field ? { [field]: value.trim() || null } : fixedBody,
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
