import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A styled native `<select>`, which is what mockup A4 specifies for the short single-choice
 * lists (destination, star rating). Native is the right control here: it needs no JavaScript,
 * is keyboard- and screen-reader-correct for free, and gives phones their own wheel picker.
 *
 * Styled to match `Input` so the two sit together in a row without looking foreign.
 */
export function NativeSelect({
  className,
  children,
  // Forwarded explicitly: the wrapper span is not the control, and react-hook-form needs this
  // ref to focus the field when a server error lands on it.
  ref,
  ...props
}: React.ComponentProps<'select'>) {
  return (
    <span className="relative block">
      <select
        ref={ref}
        data-slot="native-select"
        className={cn(
          'h-9 w-full appearance-none rounded-md border border-input bg-transparent px-3 py-1 pr-8 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 opacity-50"
        aria-hidden
      />
    </span>
  );
}
