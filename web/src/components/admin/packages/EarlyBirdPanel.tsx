'use client';

import { useId } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { EB_DAYS_MAX, EB_DAYS_MIN, type PackageFieldValues } from '@/lib/admin/package-schema';
import { inr } from '@/lib/format';
import { istToday } from './DealPanel';

type Box = 'eb1Days' | 'eb1OffPaise' | 'eb2Days' | 'eb2OffPaise';

/** Rupees in the box, paise on the wire — the deal panel's rule. Blank stays blank. */
const toRupees = (paise: unknown) =>
  paise === '' || paise == null ? '' : String(Math.round(Number(paise) / 100));
const toPaise = (rupees: string) => (rupees === '' ? '' : Math.round(Number(rupees) * 100));
const num = (v: unknown) => (v === '' || v == null ? NaN : Number(v));

/**
 * R47 (P17): up to two early-bird tiers — ₹ off per traveller when booked N+ days before
 * departure, counted in IST. It stacks with the deal, so the worst case (deal + tier 1 off the
 * cheapest double) is shown as the owner types. A live change reaches new quotes only.
 */
export function EarlyBirdPanel() {
  const form = useFormContext<PackageFieldValues>();
  const switchLabel = useId();
  const [on, departures, dealPrice, eb1Off] = useWatch<
    PackageFieldValues,
    ['ebOn', 'departures', 'dealPricePaise', 'eb1OffPaise']
  >({ name: ['ebOn', 'departures', 'dealPricePaise', 'eb1OffPaise'] });

  const today = istToday();
  const base = Math.min(
    ...(departures ?? [])
      .filter((d) => d.date >= today && Number(d.priceDoublePaise) > 0)
      .map((d) => Number(d.priceDoublePaise)),
  );
  const deal = num(dealPrice);
  const dealOff = Number.isFinite(base) && deal > 0 && deal < base ? base - deal : 0;
  const tierOff = num(eb1Off);
  const worst = Number.isFinite(tierOff) && tierOff > 0 ? dealOff + tierOff : null;

  const box = (name: Box, label: string, rupees: boolean) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <div className="flex items-center gap-1">
            {rupees && (
              <span aria-hidden className="text-mute">
                ₹
              </span>
            )}
            <FormControl>
              <Input
                type="number"
                min={rupees ? 1 : EB_DAYS_MIN}
                max={rupees ? undefined : EB_DAYS_MAX}
                inputMode="numeric"
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={rupees ? toRupees(field.value) : String(field.value ?? '')}
                onChange={(e) => field.onChange(rupees ? toPaise(e.target.value) : e.target.value)}
              />
            </FormControl>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <div className="mt-2 grid gap-3 border-t border-line pt-5">
      <FormField
        control={form.control}
        name="ebOn"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between gap-3">
            <span id={switchLabel} className="text-base font-extrabold">
              Early bird
            </span>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-labelledby={switchLabel}
              />
            </FormControl>
          </FormItem>
        )}
      />
      <p className="text-sm text-mute">
        ₹ off per traveller, children included, when booked this many days or more before departure,
        counted in IST. The furthest tier that fits applies; it comes after the deal, before a
        coupon, never on add-ons, and never takes a traveller below ₹1. Switched off, the tiers are
        kept for next time. Existing bookings keep the price they booked at.
      </p>

      <div className={`grid gap-3 ${on ? '' : 'opacity-60'}`}>
        <fieldset className="grid gap-3 rounded-md border border-line p-3">
          <legend className="px-1 text-sm font-bold">Tier 1 · furthest out</legend>
          <div className="grid grid-cols-2 items-start gap-3">
            {box('eb1Days', 'Days before', false)}
            {box('eb1OffPaise', 'Off per person', true)}
          </div>
        </fieldset>
        <fieldset className="grid gap-3 rounded-md border border-line p-3">
          <legend className="px-1 text-sm font-bold">Tier 2 · optional</legend>
          <div className="grid grid-cols-2 items-start gap-3">
            {box('eb2Days', 'Days before', false)}
            {box('eb2OffPaise', 'Off per person', true)}
          </div>
          <FormDescription>Nearer the date, and a smaller amount than tier 1</FormDescription>
        </fieldset>
      </div>

      {worst !== null && Number.isFinite(base) && (
        <p role="status" className="rounded-md bg-eb-soft px-3 py-2 text-sm font-semibold text-eb">
          Most off one traveller: {dealOff ? `deal ${inr(dealOff)} + ` : ''}tier 1 {inr(tierOff)} ={' '}
          {inr(Math.min(worst, base - 100))} off the cheapest double {inr(base)} (
          {Math.round((Math.min(worst, base - 100) / base) * 100)} %)
        </p>
      )}
    </div>
  );
}
