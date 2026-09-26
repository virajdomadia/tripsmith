import Link from 'next/link';

/** Numbered pages, windowed to seven so a year of enquiries does not wrap the footer (A6). */
export function pageWindow(page: number, totalPages: number, size = 7): number[] {
  const start = Math.max(1, Math.min(page - Math.floor(size / 2), totalPages - size + 1));
  const from = Math.max(1, start);
  const count = Math.min(size, totalPages - from + 1);
  return Array.from({ length: count }, (_, i) => from + i);
}

/** A server component: `href` builds page N's address from the list's own URL filters, so the
 *  inbox and the bookings desk share it. */
export function Pager({
  href,
  noun = ['enquiry', 'enquiries'],
  page,
  totalPages,
  total,
  shown,
}: {
  href: (page: number) => string;
  noun?: readonly [string, string];
  page: number;
  totalPages: number;
  total: number;
  shown: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-mute">
      <span>
        Showing {shown} of {total} {total === 1 ? noun[0] : noun[1]}
      </span>
      {totalPages > 1 && (
        <nav className="flex gap-1 sm:ml-auto" aria-label="Pages">
          {pageWindow(page, totalPages).map((n) => (
            <Link
              key={n}
              href={href(n)}
              aria-current={n === page ? 'page' : undefined}
              className={`min-w-8 rounded-md px-2 py-1 text-center font-bold ${
                n === page ? 'bg-ink text-white' : 'text-ink2 hover:bg-bg2'
              }`}
            >
              {n}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
