'use client';

import Link from 'next/link';
import { useFormContext, useWatch } from 'react-hook-form';
import { FormField, FormItem, FormMessage } from '@/components/ui/form';
import { LeaderAvatar } from '@/components/site/LeaderAvatar';
import type { components } from '@/lib/api-types';
import type { PackageFieldValues } from '@/lib/admin/package-schema';
import { cn } from '@/lib/utils';

type AdminLeader = components['schemas']['AdminLeader'];

/**
 * R41 (P3): the package's default trip leader, as avatar cards — native radios underneath, so the
 * keyboard and screen readers get a real radio group. A date can switch to someone else in
 * "Dates and prices". Switched-off leaders are not offered (the one saved here still shows).
 */
export function LeaderPanel({ leaders }: { leaders: AdminLeader[] }) {
  const { control } = useFormContext<PackageFieldValues>();
  const value = useWatch({ control, name: 'leaderId' });
  const offered = leaders.filter((l) => l.active || l.id === value);
  const option =
    'flex cursor-pointer items-center gap-3 rounded-card border border-line bg-bg p-3 transition-colors hover:border-ink has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:checked]:border-primary has-[:checked]:bg-primary-soft/40';
  return (
    <FormField
      control={control}
      name="leaderId"
      render={({ field }) => (
        <FormItem>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm text-mute">
              Leads every date unless a date picks someone else. Shown on the package page and the
              voucher.
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {offered.map((l) => (
                <label key={l.id} className={option}>
                  <input
                    type="radio"
                    name={field.name}
                    value={l.id}
                    checked={field.value === l.id}
                    onChange={() => field.onChange(l.id)}
                    onBlur={field.onBlur}
                    ref={field.value === l.id ? field.ref : undefined}
                    className="sr-only"
                  />
                  <LeaderAvatar leader={l} size={40} />
                  <span className="grid min-w-0">
                    <b className="truncate text-[14px] font-extrabold">{l.name}</b>
                    <small className="truncate text-[12px] text-mute">
                      {l.regions.join(', ')}
                      {!l.active && ' · switched off'}
                    </small>
                  </span>
                </label>
              ))}
              <label className={cn(option, 'text-[13.5px] font-semibold text-mute')}>
                <input
                  type="radio"
                  name={field.name}
                  value=""
                  checked={field.value === ''}
                  onChange={() => field.onChange('')}
                  onBlur={field.onBlur}
                  className="sr-only"
                />
                No leader — the page shows no leader card
              </label>
            </div>
          </fieldset>
          {offered.length === 0 && (
            <p className="text-sm text-mute">
              No trip leaders yet.{' '}
              <Link href="/admin/leaders/new" className="font-semibold">
                Add one
              </Link>
              .
            </p>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
