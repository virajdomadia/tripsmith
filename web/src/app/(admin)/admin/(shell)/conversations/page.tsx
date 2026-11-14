import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHead } from '@/components/admin/PageHead';
import { ConversationPanel, OutcomePill } from '@/components/admin/conversations/ConversationPanel';
import { istShortDate, istTime } from '@/components/admin/enquiries/ist-date';
import { Pager } from '@/components/admin/enquiries/Pager';
import {
  clampLogHref,
  logHref,
  parseLogFilters,
  pct,
  tokens,
  type LogFilters,
} from '@/lib/admin/conversations';
import { api, ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Concierge log' };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * R31 (v3 C5): every AI concierge chat, newest first, filtered by where it ended up, with the
 * selected one open beside the list (`?sel=`). Same shape as the enquiry inbox: the URL is the
 * state, so every view is a link and the page works with JavaScript off.
 */
export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseLogFilters(await searchParams);
  const [log, selected] = await Promise.all([
    api('/admin/conversations', {
      auth: true,
      searchParams: { outcome: filters.outcome, page: filters.page?.toString() },
    }),
    filters.sel ? load(filters.sel) : Promise.resolve(null),
  ]);
  const clamped = clampLogHref(filters, log.totalPages);
  if (clamped) redirect(clamped);
  const { counts } = log;
  const chips: { label: string; n: number; patch: Partial<LogFilters>; on: boolean }[] = [
    { label: 'All', n: counts.all, patch: { outcome: undefined }, on: !filters.outcome },
    {
      label: 'Booking started',
      n: counts.bookingStarted,
      patch: { outcome: 'booking_started' },
      on: filters.outcome === 'booking_started',
    },
    {
      label: 'Handed off',
      n: counts.enquiryCreated,
      patch: { outcome: 'enquiry_created' },
      on: filters.outcome === 'enquiry_created',
    },
    {
      label: 'No hand-off',
      n: counts.open,
      patch: { outcome: 'open' },
      on: filters.outcome === 'open',
    },
  ];

  return (
    <>
      <div className={cn('grid gap-5', selected && 'max-lg:hidden')}>
        <PageHead
          title="Concierge log"
          subtitle={`${counts.all} conversations · ${pct(counts.bookingStarted, counts.all)} started a booking · ${pct(counts.enquiryCreated, counts.all)} handed off to you`}
        />
        <nav
          aria-label="Filter by outcome"
          className="flex gap-1.5 overflow-x-auto pb-1 max-sm:[scrollbar-width:none] sm:flex-wrap"
        >
          {chips.map((c) => (
            <Link
              key={c.label}
              href={logHref(filters, { ...c.patch, page: undefined, sel: undefined })}
              aria-current={c.on ? 'page' : undefined}
              className={cn(
                'inline-flex flex-none items-center gap-1.5 rounded-chip border px-3 py-1.5 text-[13px] font-bold whitespace-nowrap no-underline transition-colors',
                c.on
                  ? 'border-ink bg-ink text-white'
                  : 'border-line bg-bg text-ink2 hover:border-ink',
              )}
            >
              {c.label}
              <span
                className={cn(
                  'num text-[11.5px] font-extrabold',
                  c.on ? 'text-white' : 'text-mute',
                )}
              >
                {c.n}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_460px]">
        <div className={cn('grid gap-3', selected && 'max-lg:hidden')}>
          <div className="overflow-hidden rounded-card border border-line bg-bg">
            {log.items.length === 0 ? (
              <p className="p-6 text-center text-sm text-mute">
                {counts.all
                  ? 'No conversation ended this way yet.'
                  : 'No one has chatted with the concierge yet. Chats appear here as they happen.'}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {log.items.map((c) => {
                  const on = c.id === filters.sel;
                  return (
                    <li key={c.id}>
                      <Link
                        href={logHref(filters, { sel: c.id })}
                        aria-current={on ? 'true' : undefined}
                        className={cn(
                          'grid gap-1 px-4 py-3 text-ink no-underline transition-colors hover:bg-bg2',
                          on && 'bg-primary-soft hover:bg-primary-soft',
                        )}
                      >
                        <span className="flex items-center gap-2 text-[12px] text-mute">
                          <span>
                            {istShortDate(c.createdAt)} · {istTime(c.createdAt)}
                          </span>
                          <OutcomePill outcome={c.outcome} />
                          {c.hasError && (
                            <span className="inline-flex items-center gap-1 font-bold text-bad">
                              <AlertTriangle className="size-3.5" aria-hidden />
                              Error
                            </span>
                          )}
                          <span className="num ml-auto whitespace-nowrap">
                            {c.messageCount} {c.messageCount === 1 ? 'message' : 'messages'} ·{' '}
                            {tokens(c.tokensIn + c.tokensOut)} tokens
                          </span>
                        </span>
                        <span className="line-clamp-2 text-[14px] font-semibold break-words">
                          {c.firstMessage}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <Pager
            href={(page) => logHref(filters, { page })}
            noun={['conversation', 'conversations']}
            page={log.page}
            totalPages={log.totalPages}
            total={log.total}
            shown={log.items.length}
          />
        </div>
        <div className="lg:sticky lg:top-4">
          <ConversationPanel c={selected} backHref={logHref(filters, { sel: undefined })} />
        </div>
      </div>
    </>
  );
}

/** A stale `?sel=` just leaves the panel empty. */
async function load(id: string) {
  try {
    return await api('/admin/conversations/{id}', { auth: true, params: { id } });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) return null;
    throw e;
  }
}
