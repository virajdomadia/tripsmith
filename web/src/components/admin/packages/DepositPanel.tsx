'use client';

import { useId } from 'react';
import { useFormContext } from 'react-hook-form';
import { FormControl, FormField, FormItem } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import type { PackageFieldValues } from '@/lib/admin/package-schema';

/**
 * R43 (P5): whether the Book-now sheet offers "Reserve with 25 % now" on this trip. The rules are
 * fixed (25 %, rounded up; balance due 30 days before departure, in parts; cancelled 2 days after
 * if unpaid); only the switch is the owner's. Bookings already on a deposit are not affected.
 */
export function DepositPanel() {
  const { control } = useFormContext<PackageFieldValues>();
  const label = useId();
  return (
    <div className="grid gap-2 border-t border-line pt-4">
      <FormField
        control={control}
        name="depositOn"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between gap-3">
            <span id={label} className="text-base font-extrabold">
              Deposit
            </span>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-labelledby={label}
              />
            </FormControl>
          </FormItem>
        )}
      />
      <p className="text-sm text-mute">
        Offer &ldquo;Reserve with 25% now&rdquo; on this trip. The balance is due 30 days before
        departure and can be paid in parts from My trips; unpaid 2 days after that, the booking is
        cancelled under the cancellation policy. Dates inside 30 days are always paid in full.
        Switching it off changes new bookings only.
      </p>
    </div>
  );
}
