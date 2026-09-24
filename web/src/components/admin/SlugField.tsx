'use client';

import type { ChangeEvent } from 'react';
import {
  useFormContext,
  type FieldPath,
  type FieldValues,
  type Path,
  type PathValue,
  type UseFormReturn,
} from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

/** Mirrors the api's SLUG_LOCKED (api/app/services/catalog/slug_lock.py). */
export const SLUG_LOCKED_HINT = 'The URL is fixed once a trip has been published.';

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * On a create form the slug follows the name until the owner writes one of their own. Derived
 * from the values themselves, not from a "slug was edited" flag: a flag resets on every mount,
 * so after a restored draft the next keystroke in Name would overwrite a hand-written slug.
 * The slug still follows while it is empty or exactly what the previous name produced.
 */
export function followSlug<T extends { name: string; slug: string }>(
  form: UseFormReturn<T, unknown, unknown>,
  editing: boolean,
) {
  const name = 'name' as Path<T>;
  const slug = 'slug' as Path<T>;
  return function onNameChange(e: ChangeEvent<HTMLInputElement>, onChange: (e: unknown) => void) {
    const before = String(form.getValues(name) ?? '');
    const current = String(form.getValues(slug) ?? '');
    onChange(e);
    if (editing || (current !== '' && current !== slugify(before))) return;
    // After a failed submit, re-validate so a stale "Required" clears as it fills.
    form.setValue(slug, slugify(e.target.value) as PathValue<T, Path<T>>, {
      shouldValidate: form.formState.isSubmitted,
    });
  };
}

/**
 * The slug input both admin forms share. Once a trip has been published the public URL is
 * fixed — the api refuses a change too — so the field turns read-only and says why.
 */
export function SlugField<T extends FieldValues>({
  name,
  editing,
  locked,
  placeholder,
  publicPath,
}: {
  name: FieldPath<T>;
  editing: boolean;
  locked: boolean;
  placeholder: string;
  /** e.g. `/packages` — shown as the address pattern on a create form. */
  publicPath: string;
}) {
  const form = useFormContext<T>();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Slug</FormLabel>
          <FormControl>
            <Input
              {...field}
              placeholder={placeholder}
              readOnly={locked}
              aria-readonly={locked || undefined}
              className={locked ? 'bg-bg2 text-mute' : undefined}
            />
          </FormControl>
          <FormDescription>
            {locked
              ? SLUG_LOCKED_HINT
              : editing
                ? 'Changing this moves the public page; the old address stops working.'
                : `The public address: ${publicPath}/<slug>.`}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
