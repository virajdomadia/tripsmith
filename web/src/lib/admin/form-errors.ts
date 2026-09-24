import type { FieldErrors, FieldValues } from 'react-hook-form';

/** Marks an error block that is not an input (a list-level message) as a focus target. */
export const FORM_ERROR_ATTR = 'data-form-error';

/**
 * The message on a field array as a whole — "a 3-night trip has 4 days at most", "two
 * departures cannot share the same date". zodResolver files it under `<name>.root` once the
 * array is registered with `useFieldArray`; a plain `setError(name)` puts it on `<name>`.
 */
export function arrayRootMessage<T extends FieldValues>(
  errors: FieldErrors<T>,
  name: string,
): string | undefined {
  const e = (errors as Record<string, unknown>)[name] as
    { message?: unknown; root?: { message?: unknown } } | undefined;
  const message = e?.root?.message ?? e?.message;
  return typeof message === 'string' && message ? message : undefined;
}

/**
 * After a failed submit, bring the first error on screen: the first invalid input, or the first
 * list-level message, whichever comes first in the page. Deferred a tick so the error state has
 * rendered — `aria-invalid` and the message blocks only exist after that commit.
 */
export function focusFirstError(root: HTMLElement | null): void {
  setTimeout(() => {
    const target = root?.querySelector<HTMLElement>(`[aria-invalid="true"], [${FORM_ERROR_ATTR}]`);
    if (!target) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    target.focus({ preventScroll: true });
  }, 0);
}
