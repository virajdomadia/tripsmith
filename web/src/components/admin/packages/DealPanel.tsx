'use client';

import { useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DEAL_LABEL_MAX, type PackageFieldValues } from '@/lib/admin/package-schema';
import type { components } from '@/lib/api-types';
import { formatDate, inr } from '@/lib/format';

type AdminPackage = components['schemas']['AdminPackage'];
type Row = Pick<AdminPackage, 'dealState' | 'dealPricePaise' | 'dealEndsOn' | 'dealBasePaise'>;

/** Rupees in the box, paise on the wire — the departures editor's rule. Blank stays blank. */
const toRupees = (paise: number | string | null | undefined) =>
  paise === '' || paise == null ? '' : String(Math.round(Number(paise) / 100));
const toPaise = (rupees: string) => (rupees === '' ? '' : Math.round(Number(rupees) * 100));

/** Today in IST as `YYYY-MM-DD`: the deal's end date is an IST day. */
export const istToday = (now = new Date()) =>
  new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/**
 * The saved deal as the owner needs to hear it — running, ended, or saved but switched off
 * because a departure price moved (03 R20; the api's `dealState`). Null when there is none.
 * Shared with the packages table.
 */
export function dealNotice(row: Row): { tone: 'ok' | 'mute' | 'warn'; text: string } | null {
  const price = row.dealPricePaise;
  const ends = row.dealEndsOn;
  if (price == null || !ends) return null;
  switch (row.dealState) {
    case 'active':
      return {
        tone: 'ok',
        text: `Running: ${inr(row.dealBasePaise - price)} off per traveller until ${formatDate(ends)}`,
      };
    case 'ended':
      return { tone: 'mute', text: `Deal ended on ${formatDate(ends)}` };
    case 'inactive':
      return {
        tone: 'warn',
        text: row.dealBasePaise
          ? `Deal inactive: ${inr(price)} is not below the starting price ${inr(row.dealBasePaise)}`
          : 'Deal inactive: no upcoming departure has a price',
      };
    default:
      return null;
  }
}

export const NOTICE_TONE = {
  ok: 'bg-ok-soft text-ok',
  mute: 'bg-line text-ink2',
  warn: 'bg-warn-soft text-warn',
} as const;

/**
 * B12 (03 R24): the deal's three fields. The starting price the deal is measured from is the
 * cheapest upcoming priced double in the departures above — seats ignored, as the quote does —
 * so the "off" preview follows edits to that table before they are saved.
 */
export function DealPanel({ saved }: { saved: AdminPackage | null }) {
  const form = useFormContext<PackageFieldValues>();
  const today = istToday();
  const departures = form.watch('departures') ?? [];
  const base = Math.min(
    ...departures
      .filter((d) => d.date >= today && Number(d.priceDoublePaise) > 0)
      .map((d) => Number(d.priceDoublePaise)),
  );
  const price = Number(form.watch('dealPricePaise'));
  const hasPrice = form.watch('dealPricePaise') !== '' && Number.isFinite(price) && price > 0;
  const off = Number.isFinite(base) && hasPrice ? base - price : null;
  const notice = saved && !form.formState.dirtyFields.dealPricePaise ? dealNotice(saved) : null;
  const any =
    form.watch('dealPricePaise') !== '' || form.watch('dealEndsOn') || form.watch('dealLabel');

  function clear() {
    for (const name of ['dealPricePaise', 'dealLabel', 'dealEndsOn'] as const) {
      form.setValue(name, '', { shouldDirty: true });
      form.clearErrors(name);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-extrabold">Deal</h3>
        {any && (
          <Button type="button" variant="outline" size="sm" onClick={clear}>
            Clear deal
          </Button>
        )}
      </div>
      <p className="text-sm text-mute">
        A flat amount off per traveller on every date: starting price − deal price. It ends at
        midnight IST after the last day.
      </p>
      {notice && (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-sm font-semibold ${NOTICE_TONE[notice.tone]}`}
        >
          {notice.text}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          control={form.control}
          name="dealPricePaise"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deal price per person</FormLabel>
              <div className="flex items-center gap-1">
                <span aria-hidden className="text-mute">
                  ₹
                </span>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={toRupees(field.value as number | string | null | undefined)}
                    onChange={(e) => field.onChange(toPaise(e.target.value))}
                  />
                </FormControl>
              </div>
              <FormDescription>
                {!Number.isFinite(base)
                  ? 'Price an upcoming departure first'
                  : off === null
                    ? `Below the starting price ${inr(base)}`
                    : off > 0
                      ? `${inr(off)} off the starting price ${inr(base)}`
                      : `Must be below the starting price ${inr(base)}`}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dealEndsOn"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last day</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} type="date" min={today} />
              </FormControl>
              <FormDescription>Ends at midnight IST after this day</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dealLabel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Label · optional</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  maxLength={DEAL_LABEL_MAX}
                  placeholder="Deal"
                />
              </FormControl>
              <FormDescription>On the card&apos;s stamp; “Deal” when blank</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
