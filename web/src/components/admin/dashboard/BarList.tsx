import Link from 'next/link';
import { barWidth } from '@/lib/admin/dashboard';

export interface BarRow {
  key: string;
  label: string;
  count: number;
  href?: string;
  /** A Tailwind background utility; the top-five lists leave it at the default ocean. */
  tone?: string;
}

/**
 * Mockup A2 `.bars`: name, a proportional bar, the number. Widths are relative to the biggest
 * row in the list, so a quiet month still reads as a ranking rather than five empty tracks.
 */
export function BarList({ rows, empty }: { rows: BarRow[]; empty: string }) {
  const max = Math.max(0, ...rows.map((r) => r.count));
  if (rows.length === 0 || max === 0) {
    return <p className="px-4 py-6 text-center text-sm text-mute">{empty}</p>;
  }
  return (
    <ol className="grid gap-2.5 p-4">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_88px_auto] items-center gap-3">
          <span className="truncate text-sm">
            {row.href ? (
              <Link href={row.href} className="font-semibold hover:text-primary hover:underline">
                {row.label}
              </Link>
            ) : (
              row.label
            )}
          </span>
          <i aria-hidden className="h-1.5 overflow-hidden rounded-chip bg-line">
            <b
              className={`block h-full rounded-chip ${row.tone ?? 'bg-primary'}`}
              style={{ width: `${barWidth(row.count, max)}%` }}
            />
          </i>
          <span className="num w-10 text-right text-sm font-extrabold">
            {row.count.toLocaleString('en-IN')}
          </span>
        </li>
      ))}
    </ol>
  );
}
