import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A styled native checkbox. Radix's `Checkbox` renders a `<button role="checkbox">`, which a
 * `<label for>` cannot legally point at — Chrome reports "Incorrect use of <label>" and the
 * association is not guaranteed to reach assistive technology. A real `<input type="checkbox">`
 * is labelable, so `FormLabel` works as intended, and `accent-color` keeps it on-brand.
 */
export function NativeCheckbox({ className, ref, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      ref={ref}
      type="checkbox"
      data-slot="native-checkbox"
      className={cn(
        'size-4 shrink-0 rounded-[4px] border-input accent-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
