import type { ReactNode } from 'react';

export const control =
  'w-full rounded-btn border-[1.5px] border-line bg-bg px-3.5 py-2.5 text-ink transition-colors placeholder:text-mute focus:border-primary aria-invalid:border-warn';

type Props = { label: string; name: string; error?: string; hint?: string; children: ReactNode };

/** Label + control + inline error (S6 `.form label` / `.err`). The control gets `id={name}`. */
export function Field({ label, name, error, hint, children }: Props) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={name} className="label-caps text-mute">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} role="alert" className="text-xs font-semibold text-warn">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-mute">{hint}</p>
      )}
    </div>
  );
}
