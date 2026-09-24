'use client';

import { useFormContext } from 'react-hook-form';
import { arrayRootMessage, FORM_ERROR_ATTR } from '@/lib/admin/form-errors';
import type { PackageFieldValues } from '@/lib/admin/package-schema';

/**
 * The error on the itinerary or the departures as a whole. A row-level error sits under its
 * input; a list-level one ("a 3-night trip has 4 days at most", a date clash the api caught)
 * has no input to sit under, so without this block the save failed with nothing on screen.
 * Focusable so the failed-submit handler can move the owner straight to it.
 */
export function ArrayError({ name }: { name: 'itinerary' | 'departures' }) {
  const { formState } = useFormContext<PackageFieldValues>();
  const message = arrayRootMessage(formState.errors, name);
  if (!message) return null;
  return (
    <p
      role="alert"
      tabIndex={-1}
      {...{ [FORM_ERROR_ATTR]: name }}
      className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {message}
    </p>
  );
}
