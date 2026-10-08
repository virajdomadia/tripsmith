'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { NativeCheckbox } from '@/components/admin/NativeCheckbox';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { CHECKLIST_MAX, type PackageFieldValues } from '@/lib/admin/package-schema';
import { FIELD_LABEL, type DetailField } from '@/lib/account';

const FIELDS: { id: DetailField; hint: string }[] = [
  { id: 'id', hint: 'Aadhaar, passport, driving licence or voter ID — shown masked' },
  { id: 'emergency', hint: 'A name and a mobile number' },
  { id: 'food', hint: 'Veg, non-veg, Jain or vegan, plus allergies' },
  { id: 'dob', hint: 'Must fit the child or adult rate booked' },
  { id: 'medical', hint: 'Anything the trip leader should know' },
];

/**
 * R49 (P9b): what this trip asks of every traveller after payment, and the owner's pre-trip
 * tick items. Customers fill the details on My trips until 3 days before departure; each item
 * becomes a coupon they tick there. Renaming an item keeps the ticks (its key stays).
 */
export function DetailsPanel() {
  const form = useFormContext<PackageFieldValues>();
  const required = useWatch({ control: form.control, name: 'detailsRequired' }) ?? [];
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'checklist' });

  function toggle(f: DetailField, on: boolean) {
    const next = on ? [...required, f] : required.filter((x) => x !== f);
    form.setValue('detailsRequired', next, { shouldDirty: true });
  }

  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-bold">Required before the trip</legend>
        <p className="text-[13px] text-mute">
          Travellers can save without them, but their card stays “details missing” on the desk and
          in their readiness until these are in.
        </p>
        {FIELDS.map((f) => (
          <label
            key={f.id}
            className="flex items-start gap-2.5 rounded-md border border-line p-2.5"
          >
            <NativeCheckbox
              className="mt-0.5"
              checked={required.includes(f.id)}
              onChange={(e) => toggle(f.id, e.target.checked)}
            />
            <span className="grid">
              <b className="text-sm">{FIELD_LABEL[f.id]}</b>
              <span className="text-[12.5px] text-mute">{f.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold">Pre-trip checklist</h4>
          <span className="text-[13px] text-mute">
            {fields.length} of {CHECKLIST_MAX}
          </span>
        </div>
        {fields.length === 0 && (
          <p className="text-sm text-mute">
            None yet — add what the leader asks every group to do, like “A light rain jacket each”.
            No uploads: customers just tick them.
          </p>
        )}
        {fields.map((row, i) => (
          <div key={row.id} className="grid gap-2 rounded-md border border-line p-3">
            <div className="flex items-start gap-2">
              <FormField
                control={form.control}
                name={`checklist.${i}.label`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel className="sr-only">Item {i + 1}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="A light rain jacket each" maxLength={80} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove item ${i + 1}`}
                onClick={() => remove(i)}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
            <FormField
              control={form.control}
              name={`checklist.${i}.note`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">Why, for item {i + 1}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Why — Munnar gets evening showers into mid-November"
                      maxLength={160}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ key: null, label: '', note: '' })}
            disabled={fields.length >= CHECKLIST_MAX}
          >
            <Plus className="size-4" aria-hidden />
            Add item
          </Button>
        </div>
      </div>
    </div>
  );
}
