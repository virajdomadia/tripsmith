'use client';

import { useId } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { NativeSelect } from '@/components/admin/NativeSelect';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { THEMES, type PackageFieldValues } from '@/lib/admin/package-schema';
import type { components } from '@/lib/api-types';

type AdminDestination = components['schemas']['AdminDestination'];
type Theme = (typeof THEMES)[number]['value'];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Mockup A4's Basics panel: name, slug, destination, nights, departure city, themes, summary. */
export function BasicsPanel({
  destinations,
  editing,
}: {
  destinations: AdminDestination[];
  editing: boolean;
}) {
  const form = useFormContext<PackageFieldValues>();
  const themesLabelId = useId();
  const featuredLabelId = useId();
  const nights = Number(form.watch('nights'));
  const days = Number.isFinite(nights) ? nights + 1 : 0;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onChange={(e) => {
                    field.onChange(e);
                    // Follow the name until the owner edits the slug themselves; after a failed
                    // submit, re-validate so a stale "Required" clears as it fills.
                    if (!editing && !form.getFieldState('slug').isDirty)
                      form.setValue('slug', slugify(e.target.value), {
                        shouldValidate: form.formState.isSubmitted,
                      });
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input {...field} placeholder="north-goa-beaches" />
              </FormControl>
              <FormDescription>
                {editing
                  ? 'Changing this moves the public page; the old address stops working.'
                  : 'The public address: /packages/<slug>.'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          control={form.control}
          name="destinationId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Destination</FormLabel>
              <FormControl>
                <NativeSelect {...field}>
                  {!field.value && <option value="">Pick a destination</option>}
                  {destinations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
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
          name="nights"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nights</FormLabel>
              <FormControl>
                <Input {...field} type="number" min={1} max={30} inputMode="numeric" />
              </FormControl>
              <FormDescription>{days > 0 ? `${days} days` : 'Set the nights'}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="departureCity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Departure city</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Ex-Mumbai" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="themes"
        render={({ field }) => {
          const selected = (field.value ?? []) as Theme[];
          const toggle = (theme: Theme) =>
            field.onChange(
              selected.includes(theme) ? selected.filter((t) => t !== theme) : [...selected, theme],
            );
          return (
            <FormItem>
              {/* A plain span, not <FormLabel>: a role="group" is not a labelable element, so
                  the <label for> FormLabel emits is invalid markup. The group points at this
                  id with aria-labelledby instead. */}
              <span id={themesLabelId} className="text-sm leading-none font-medium">
                Themes
              </span>
              <FormControl>
                <div role="group" aria-labelledby={themesLabelId} className="flex flex-wrap gap-2">
                  {THEMES.map((t) => {
                    const on = selected.includes(t.value);
                    return (
                      <button
                        key={t.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(t.value)}
                        className={
                          on
                            ? 'rounded-full border border-primary bg-primary px-3 py-1 text-[13px] font-semibold text-primary-foreground'
                            : 'rounded-full border border-line px-3 py-1 text-[13px] font-semibold text-ink2 transition-colors hover:border-ink hover:text-ink'
                        }
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <FormField
        control={form.control}
        name="summary"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Summary</FormLabel>
            <FormControl>
              <Textarea {...field} rows={3} />
            </FormControl>
            <FormDescription>
              Two or three lines — this is the card and the meta description.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="featured"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-3">
            <FormControl>
              {/* Radix renders a <button role="switch">, which <label for> cannot point at;
                  aria-labelledby is the correct association. */}
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-labelledby={featuredLabelId}
              />
            </FormControl>
            <div className="grid gap-0.5">
              <span id={featuredLabelId} className="text-sm leading-none font-medium">
                Featured
              </span>
              <FormDescription>Featured packages lead the home page.</FormDescription>
            </div>
          </FormItem>
        )}
      />
    </div>
  );
}
