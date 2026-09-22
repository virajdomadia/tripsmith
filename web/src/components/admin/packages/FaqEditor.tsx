'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PackageFieldValues } from '@/lib/admin/package-schema';

/** Mockup A4's FAQ block. Order is not meaningful here, so there is nothing to drag. */
export function FaqEditor() {
  const form = useFormContext<PackageFieldValues>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'faq' });

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold">FAQ</h4>
        <span className="text-[13px] text-mute">
          {fields.length} {fields.length === 1 ? 'question' : 'questions'}
        </span>
      </div>

      {fields.length === 0 && (
        <p className="text-sm text-mute">
          No questions yet — add the ones people actually ask before booking.
        </p>
      )}

      {fields.map((row, i) => (
        <div key={row.id} className="grid gap-2 rounded-md border border-line p-3">
          <div className="flex items-start gap-2">
            <FormField
              control={form.control}
              name={`faq.${i}.q`}
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel className="sr-only">Question {i + 1}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Is this package suitable for children?" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove question ${i + 1}`}
              onClick={() => remove(i)}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
          <FormField
            control={form.control}
            name={`faq.${i}.a`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">Answer {i + 1}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    placeholder="Answer it the way you would on a call."
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
          onClick={() => append({ q: '', a: '' })}
          disabled={fields.length >= 15}
        >
          <Plus className="size-4" aria-hidden />
          Add question
        </Button>
      </div>
    </div>
  );
}
