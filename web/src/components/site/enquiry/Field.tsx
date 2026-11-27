import type { ReactNode } from 'react';

export const control =
  'min-h-12 w-full rounded-btn border-[1.5px] border-field-border bg-bg px-3.5 py-2.5 text-ink transition-colors placeholder:text-mute focus:border-primary aria-invalid:border-warn';

type Props = {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  /** Says "(required)" beside the label: the form is `noValidate`, so errors arrive on submit. */
  required?: boolean;
  children: ReactNode;
};

/**
 * Label + control + inline error (S6 `.form label` / `.err`). The control gets `id={name}` and
 * points `aria-describedby` at `{name}-error` or `{name}-hint` (EnquiryForm's `describe`). No
 * `role="alert"` per field: a failed submit moves focus to the first invalid control, which reads
 * its own error — several alerts firing at once would talk over each other.
 */
export function Field({ label, name, error, hint, required, children }: Props) {
  // Review 2026-11-27 (M2): 13px sentence-case labels (were 11px tracked caps) and equal control
  // heights (`min-h-12`), so a row of two fields lines up.
  return (
    <div className="grid content-start gap-1.5">
      <span className="text-[13px] text-mute">
        <label htmlFor={name} className="font-semibold text-ink2">
          {label}
        </label>
        {/* The control's own `required` tells assistive tech; this tells everyone else. */}
        {required && <span aria-hidden> (required)</span>}
      </span>
      {children}
      {error ? (
        <p id={`${name}-error`} className="text-xs font-semibold text-warn">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${name}-hint`} className="text-xs text-mute">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
