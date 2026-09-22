'use client';

import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import type { PackageFieldValues } from '@/lib/admin/package-schema';

type ListName = 'highlights' | 'inclusions' | 'exclusions';

type Props = {
  name: ListName;
  label: string;
  description: string;
  rows?: number;
};

/**
 * Mockup A4's "one per line" editors. The split deliberately does **not** drop blank lines: the
 * owner has to be able to press Enter and keep typing. The zod `lines` transform trims and
 * discards the empties at submit, so what reaches the api is clean either way.
 */
export function ListEditor({ name, label, description, rows = 6 }: Props) {
  const form = useFormContext<PackageFieldValues>();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => {
        const value = (field.value ?? []) as string[];
        const filled = value.filter((line) => line.trim()).length;
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Textarea
                rows={rows}
                value={value.join('\n')}
                onChange={(e) => field.onChange(e.target.value.split('\n'))}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
            </FormControl>
            <FormDescription>
              {description} · {filled} {filled === 1 ? 'entry' : 'entries'}
            </FormDescription>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
