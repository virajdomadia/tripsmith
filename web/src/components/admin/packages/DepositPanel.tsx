'use client';

import { useId } from 'react';
import { useFormContext } from 'react-hook-form';
import { FormControl, FormField, FormItem } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import type { PackageFieldValues } from '@/lib/admin/package-schema';
import { useRules } from '@/components/rules/RulesProvider';

/**
 * R43 (P5): whether the Book-now sheet offers "Reserve with the deposit now" on this trip. The
 * rules are fixed (served by `/meta`: percent, balance days, grace); only the switch is the owner's. Bookings already on a deposit are not affected.
 */
export function DepositPanel() {
  const { control } = useFormContext<PackageFieldValues>();
  const r = useRules();
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
        Offer &ldquo;Reserve with {r.depositPercent}% now&rdquo; on this trip. The balance is due{' '}
        {r.balanceDays} days before departure and can be paid in parts from My trips; unpaid{' '}
        {r.graceDays} days after that, the booking is cancelled under the cancellation policy. Dates
        inside {r.balanceDays} days are always paid in full. Switching it off changes new bookings
        only.
      </p>
    </div>
  );
}
