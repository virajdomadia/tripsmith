'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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
import type { AdminBooking } from '@/lib/admin/booking-filters';
import { addDays } from '@/lib/booking';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import { cn } from '@/lib/utils';
import { formatDate, inr } from '@/lib/format';
import { ActionDialog } from './DeskActions';

type Balance = NonNullable<AdminBooking['balance']>;

/**
 * R43 (P5b): a booking made on a deposit, on the desk — what was paid, what is left and by when
 * (overdue in the grace, and the day the tidy cancels it), and the owner's two moves: record the
 * whole balance paid offline, or move the due day later (up to the departure day, logged). Both
 * re-check on the api under the booking's lock; a refusal lands as a toast.
 */
export function BalanceActions({ booking }: { booking: AdminBooking }) {
  const balance = booking.balance;
  if (!balance) return null;
  const left = balance.balancePaise;
  const overdue = balance.daysLeft < 0;
  return (
    <div className="grid gap-2.5 text-[13px]">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <dt className="text-mute">Deposit</dt>
        <dd className="num m-0 text-right font-bold">{inr(balance.depositPaise)}</dd>
        <dt className="text-mute">Balance</dt>
        <dd className="num m-0 text-right font-bold">{left ? inr(left) : 'Paid in full'}</dd>
        {left > 0 && (
          <>
            <dt className="text-mute">Due by</dt>
            <dd className={cn('m-0 text-right font-bold', overdue && 'text-bad')}>
              {formatDate(balance.dueOn)}
              <span className="block text-[12px] font-semibold text-mute">
                {overdue
                  ? `Overdue · cancelled after ${formatDate(balance.lastDayOn)}`
                  : balance.daysLeft === 0
                    ? 'Today'
                    : `In ${balance.daysLeft} ${balance.daysLeft === 1 ? 'day' : 'days'}`}
              </span>
            </dd>
          </>
        )}
      </dl>
      {(balance.canMarkPaid || balance.canExtend) && (
        <div className="flex flex-wrap gap-2">
          {balance.canMarkPaid && (
            <ActionDialog
              bookingRef={booking.ref}
              action="balance-paid"
              field="reference"
              fieldLabel="Reference (optional)"
              fieldHint="Bank UTR, 'cash at office'…"
              trigger="Mark balance paid (offline)"
              title={`Mark ${booking.ref}'s balance paid — ${inr(left)}`}
              confirm="Record and confirm"
              done="Balance recorded — paid in full"
              description={`Records an offline payment of the whole ${inr(left)} balance. The booking is confirmed, the tax invoice is issued, and the customer gets the paid-in-full email with a fresh voucher.`}
            />
          )}
          {balance.canExtend && <ExtendDue bookingRef={booking.ref} balance={balance} />}
        </div>
      )}
    </div>
  );
}

function ExtendDue({ bookingRef, balance }: { bookingRef: string; balance: Balance }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const earliest = addDays(balance.dueOn, 1);
  const [day, setDay] = useState(() =>
    addDays(balance.dueOn, 7) <= balance.extendUntil ? addDays(balance.dueOn, 7) : earliest,
  );
  const [, startTransition] = useTransition();
  const valid = day >= earliest && day <= balance.extendUntil;

  async function submit() {
    setBusy(true);
    try {
      await adminRequest(`/admin/bookings/${bookingRef}/balance-due`, {
        method: 'POST',
        body: { dueOn: day },
      });
      toast.success(`Balance now due by ${formatDate(day)}`);
      setOpen(false);
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
        <Button type="button" size="sm" variant="outline">
          Extend due date
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {bookingRef}&rsquo;s balance due day</DialogTitle>
          <DialogDescription>
            Now due {formatDate(balance.dueOn)}. Pick a later day, up to the departure on{' '}
            {formatDate(balance.extendUntil)}. The customer sees the new day in My trips, the
            reminders start again for it, and the history logs the change.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`due-${bookingRef}`}>New due day</Label>
          <Input
            id={`due-${bookingRef}`}
            type="date"
            value={day}
            min={earliest}
            max={balance.extendUntil}
            onChange={(e) => setDay(e.target.value)}
            aria-invalid={!valid}
          />
          {!valid && (
            <p className="text-[12.5px] font-semibold text-bad">
              Pick a day from {formatDate(earliest)} to {formatDate(balance.extendUntil)}.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy || !valid}>
            {busy ? 'Saving…' : 'Move the due day'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
