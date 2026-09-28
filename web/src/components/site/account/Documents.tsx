import { FileText } from 'lucide-react';
import { documentHref, type GstDocument } from '@/lib/gst';
import { formatDate, inr } from '@/lib/format';

/**
 * GST documents (R51, P13b) — receipts, the tax invoice, credit notes — as plain download links,
 * on My trips and on the desk (the same web route serves the customer and the owner). A number
 * shows once issued — at the event (payment, full payment, refund); a booking from before P13b
 * gets its numbers on first download.
 */
export function Documents({
  bookingRef,
  documents,
  className = '',
}: {
  bookingRef: string;
  documents: readonly GstDocument[];
  className?: string;
}) {
  if (documents.length === 0) return null;
  return (
    <ul className={`grid gap-1.5 ${className}`}>
      {documents.map((d) => (
        <li key={d.key}>
          <a
            href={documentHref(bookingRef, d.key)}
            className="group flex items-center gap-3 rounded-btn border border-line px-3 py-2.5 no-underline transition-colors hover:border-ink"
          >
            <FileText className="size-4.5 shrink-0 text-mute group-hover:text-ink" aria-hidden />
            <span className="grid min-w-0 flex-1 gap-px">
              <b className="text-[13.5px] text-ink">
                {d.title}
                {d.kind === 'credit_note' && (
                  <span className="font-semibold text-mute"> · refund</span>
                )}
              </b>
              <span className="num text-[12px] break-all text-mute">
                {formatDate(d.dated)}
                {d.number && ` · ${d.number}`}
              </span>
            </span>
            <span className="num shrink-0 text-[13px] font-bold text-ink">
              {d.kind === 'credit_note' ? '−' : ''}
              {inr(d.amountPaise)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
