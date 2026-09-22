'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { NativeSelect } from '@/components/admin/NativeSelect';
import { Input } from '@/components/ui/input';
import type { PackageFieldValues } from '@/lib/admin/package-schema';

const STARS = [1, 2, 3, 4, 5];

/** Mockup A4's Hotel side panel, as a repeatable list — a multi-city trip has more than one. */
export function HotelsEditor() {
  const form = useFormContext<PackageFieldValues>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'hotels' });

  return (
    <div className="grid gap-3">
      {fields.length === 0 && <p className="text-sm text-mute">No hotels listed yet.</p>}

      {fields.map((row, i) => (
        <div key={row.id} className="grid gap-2 rounded-md border border-line p-3">
          <div className="flex items-start gap-2">
            <FormField
              control={form.control}
              name={`hotels.${i}.name`}
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Lemon Tree Amarante Beach Resort" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-6"
              aria-label={`Remove hotel ${i + 1}`}
              onClick={() => remove(i)}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
          <div className="grid grid-cols-[1fr_90px_90px] gap-2">
            <FormField
              control={form.control}
              name={`hotels.${i}.city`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Candolim" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`hotels.${i}.stars`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stars</FormLabel>
                  <FormControl>
                    <NativeSelect
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={String(field.value ?? '')}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    >
                      {STARS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`hotels.${i}.nights`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nights</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={1} max={30} inputMode="numeric" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ name: '', city: '', stars: 4, nights: 1 })}
          disabled={fields.length >= 10}
        >
          <Plus className="size-4" aria-hidden />
          Add hotel
        </Button>
      </div>
    </div>
  );
}
