import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui's class merger: `clsx` resolves conditionals, `twMerge` drops earlier conflicting
 * Tailwind classes (so `className` overrides can win over a component's own defaults). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
