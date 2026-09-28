'use client';

import { ArrowDown, ArrowUp, ImageIcon, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { NativeSelect } from '@/components/admin/NativeSelect';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  ADDON_DESCRIPTION_MAX,
  ADDON_NIGHTS_MAX,
  ADDONS_MAX,
  blankAddon,
  type PackageFieldValues,
} from '@/lib/admin/package-schema';
import type { components } from '@/lib/api-types';
import { ADDON_UNIT, type AddonBasis } from '@/lib/booking';
import { cn } from '@/lib/utils';
import { ArrayError } from './ArrayError';

type AdminImage = components['schemas']['AdminImage'];
type AdminAddon = components['schemas']['AdminAddon'];

const BASES: { value: AddonBasis; label: string }[] = [
  { value: 'booking', label: 'Per booking' },
  { value: 'traveller', label: 'Per traveller' },
  { value: 'night', label: 'Per night' },
];

const toRupees = (paise: number | string | undefined) =>
  paise === '' || paise === undefined ? '' : String(Math.round(Number(paise) / 100));
const toPaise = (rupees: string) => (rupees === '' ? '' : Math.round(Number(rupees) * 100));

/**
 * Add-ons (R46, P8): the extras the Book-now sheet offers under "Make it yours". Each one is
 * charged per booking, per traveller, or per traveller per night (the whole party, up to a
 * maximum); it has no stock — the owner switches it off instead. The list order is the sheet's.
 * Bookings keep their own copy, so editing or deleting one never changes what was sold.
 */
export function AddonsEditor({
  images,
  saved,
}: {
  /** The package's gallery; empty before the first save, when no photo can be picked yet. */
  images: AdminImage[];
  /** As last saved: how many bookings have each one, by id. */
  saved: AdminAddon[];
}) {
  const form = useFormContext<PackageFieldValues>();
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'addons' });
  const rows = useWatch({ control: form.control, name: 'addons' }) ?? [];
  const booked = new Map(saved.map((a) => [a.id, a.booked]));
  const photo = (id: string | null | undefined) => images.find((i) => i.id === id);

  return (
    <div className="grid gap-3">
      <ArrayError name="addons" />

      {fields.length === 0 && (
        <p className="text-sm text-mute">
          No add-ons yet. Offer 3–4 extras a traveller would pay for — a transfer, an activity, an
          extra night.
        </p>
      )}

      <ol className="grid gap-3">
        {fields.map((row, i) => {
          const v = rows[i];
          const basis = (v?.basis ?? 'traveller') as AddonBasis;
          const on = v?.active ?? true;
          const sold = v?.id ? (booked.get(v.id) ?? 0) : 0;
          const pic = photo(v?.imageId);
          return (
            <li
              key={row.id}
              className={cn(
                'grid gap-3 rounded-md border p-3 transition-colors',
                on ? 'border-line' : 'border-dashed border-line bg-bg2/60',
              )}
            >
              <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-3">
                <span
                  aria-hidden
                  className="relative mt-6 grid size-11 place-items-center overflow-hidden rounded-full bg-bg2 text-mute"
                >
                  {pic ? (
                    <Image src={pic.url} alt="" fill sizes="44px" className="object-cover" />
                  ) : (
                    <ImageIcon className="size-4" />
                  )}
                </span>
                <FormField
                  control={form.control}
                  name={`addons.${i}.name`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Kullu river rafting" maxLength={60} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`addons.${i}.pricePaise`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price</FormLabel>
                      <div className="flex items-center gap-1">
                        <span aria-hidden className="text-mute">
                          ₹
                        </span>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            className="w-[96px]"
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            value={toRupees(field.value as number | string | undefined)}
                            onChange={(e) => field.onChange(toPaise(e.target.value))}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name={`addons.${i}.description`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What it is</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={2}
                        maxLength={ADDON_DESCRIPTION_MAX}
                        placeholder="14 km of rapids on the Beas, with a guide, helmet and jacket."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-wrap items-end gap-3">
                <FormField
                  control={form.control}
                  name={`addons.${i}.basis`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel id={`addon-${i}-basis`}>Charged</FormLabel>
                      <div
                        role="radiogroup"
                        aria-labelledby={`addon-${i}-basis`}
                        className="inline-flex overflow-hidden rounded-md border border-line"
                      >
                        {BASES.map((b) => (
                          <button
                            key={b.value}
                            type="button"
                            role="radio"
                            aria-checked={field.value === b.value}
                            ref={field.value === b.value ? field.ref : undefined}
                            onClick={() => {
                              field.onChange(b.value);
                              if (b.value === 'night' && !v?.maxNights)
                                form.setValue(`addons.${i}.maxNights`, 2, { shouldDirty: true });
                            }}
                            className={cn(
                              'px-2.5 py-1.5 text-[13px] font-bold transition-colors [&+&]:border-l [&+&]:border-line',
                              field.value === b.value ? 'bg-ink text-white' : 'bg-bg text-ink',
                            )}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </FormItem>
                  )}
                />
                {basis === 'night' && (
                  <FormField
                    control={form.control}
                    name={`addons.${i}.maxNights`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Up to</FormLabel>
                        <div className="flex items-center gap-1.5">
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ''}
                              type="number"
                              min={1}
                              max={ADDON_NIGHTS_MAX}
                              inputMode="numeric"
                              className="w-[64px]"
                            />
                          </FormControl>
                          <span className="text-[13px] text-mute">nights</span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name={`addons.${i}.imageId`}
                  render={({ field }) => (
                    <FormItem className="min-w-[150px] flex-1">
                      <FormLabel>Photo</FormLabel>
                      <FormControl>
                        <NativeSelect
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value ?? ''}
                          disabled={images.length === 0}
                          onChange={(e) => field.onChange(e.target.value || null)}
                        >
                          <option value="">
                            {images.length ? 'No photo' : 'Add photos first'}
                          </option>
                          {images.map((img, k) => (
                            <option key={img.id} value={img.id}>
                              Photo {k + 1}
                              {img.alt ? ` — ${img.alt}` : ''}
                            </option>
                          ))}
                        </NativeSelect>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
                <FormField
                  control={form.control}
                  name={`addons.${i}.active`}
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          aria-label={`On sale: ${v?.name || `add-on ${i + 1}`}`}
                        />
                      </FormControl>
                      <span className="text-[13px] font-bold">{on ? 'On sale' : 'Off'}</span>
                    </FormItem>
                  )}
                />
                <small className="text-[12.5px] text-mute">
                  {ADDON_UNIT[basis]}
                  {sold > 0 && ` · on ${sold} ${sold === 1 ? 'booking' : 'bookings'}`}
                </small>
                <span className="ml-auto flex gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${v?.name || `add-on ${i + 1}`} up`}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${v?.name || `add-on ${i + 1}`} down`}
                    disabled={i === fields.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${v?.name || `add-on ${i + 1}`}`}
                    title={sold ? 'Bookings that have it keep their copy' : undefined}
                    onClick={() => remove(i)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(blankAddon())}
          disabled={fields.length >= ADDONS_MAX}
        >
          <Plus className="size-4" aria-hidden />
          Add an add-on
        </Button>
        <span className="text-[13px] text-mute">
          No stock limits — switch one off to stop selling it. Deals, coupons and early-bird never
          apply to add-ons. Bookings keep what they bought.
        </span>
      </div>
    </div>
  );
}
