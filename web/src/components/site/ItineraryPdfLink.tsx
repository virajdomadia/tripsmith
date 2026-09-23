import { File } from '@/components/site/home/icons';
import { itineraryPdfHref } from '@/lib/pdf';

const STYLES = {
  button:
    'inline-flex items-center justify-center gap-2 rounded-btn border-[1.5px] border-line px-5 py-2.5 font-bold text-ink no-underline transition-colors hover:border-ink',
  link: 'inline-flex min-h-6 items-center gap-1.5 text-sm font-bold text-primary no-underline hover:underline',
} as const;

/** R6: a plain `<a>` to the api (F11) — opens the PDF in a new tab; the browser saves it from there. */
export function ItineraryPdfLink({
  slug,
  variant = 'link',
  className = '',
  label = 'Download itinerary (PDF)',
}: {
  slug: string;
  variant?: keyof typeof STYLES;
  className?: string;
  label?: string;
}) {
  return (
    <a
      href={itineraryPdfHref(slug)}
      target="_blank"
      rel="noopener"
      className={`${STYLES[variant]} ${className}`.trim()}
    >
      <File className={variant === 'button' ? 'size-4.5 text-primary' : 'size-4'} />
      {label}
    </a>
  );
}
