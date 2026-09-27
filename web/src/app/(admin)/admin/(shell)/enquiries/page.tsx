import { Download, Search } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHead } from '@/components/admin/PageHead';
import { LiveFilterForm } from '@/components/admin/bookings/LiveFilterForm';
import { InboxKeys } from '@/components/admin/enquiries/InboxKeys';
import { InboxList } from '@/components/admin/enquiries/InboxList';
import { InboxPanel } from '@/components/admin/enquiries/InboxPanel';
import { Pager } from '@/components/admin/enquiries/Pager';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { duration, type TripFacts } from '@/lib/admin/inbox';
import {
  INBOX_PATH,
  clampPageHref,
  csvHref,
  filterHref,
  parseFilters,
  toQuery,
  type Filters,
} from '@/lib/admin/enquiry-filters';
import { api, ApiRequestError } from '@/lib/api';
import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Enquiries' };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Enquiries A2 (R59, P20): saved filter chips for the jobs of the day, rows to scan, and the
 * enquiry open beside them as a conversation (`?sel=`). The URL is the state, as it always was
 * on the inbox (F21): every view is a link and the page works with JavaScript off. Longest
 * waiting first unless the owner asks for newest.
 */
export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseFilters(await searchParams);
  const sort = filters.sort ?? 'waiting';
  const [inbox, session, selected] = await Promise.all([
    api('/admin/enquiries', { auth: true, searchParams: { ...toQuery(filters), sort } }),
    getSession(),
    filters.sel ? loadEnquiry(filters.sel) : Promise.resolve(null),
  ]);
  const clamped = clampPageHref(filters, inbox.totalPages);
  if (clamped) redirect(clamped);
  const trip = selected?.package?.status === 'live' ? await tripFacts(selected.package.slug) : null;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const { counts, attention: a } = inbox;
  const oldest = a.oldestWaitingSince
    ? duration(Math.floor((Date.now() - new Date(a.oldestWaitingSince).getTime()) / 60_000))
    : null;
  const hrefFor = (id: string) => filterHref(filters, { sel: id, page: filters.page });
  const chips: { label: string; n: number; patch: Partial<Filters>; hot?: boolean; on: boolean }[] =
    [
      {
        label: 'All',
        n: counts.all,
        patch: { status: undefined, view: undefined },
        on: !filters.status && !filters.view,
      },
      {
        label: 'New',
        n: counts.new,
        patch: { status: 'new', view: undefined },
        on: filters.status === 'new' && !filters.view,
      },
      {
        label: 'Needs reply',
        n: a.needsReply,
        patch: { status: undefined, view: 'reply' },
        hot: true,
        on: filters.view === 'reply',
      },
      {
        label: 'Follow up today',
        n: a.followUpDue,
        patch: { status: undefined, view: 'followup' },
        hot: true,
        on: filters.view === 'followup',
      },
      {
        label: 'Contacted',
        n: counts.contacted,
        patch: { status: 'contacted', view: undefined },
        on: filters.status === 'contacted' && !filters.view,
      },
      {
        label: 'Won',
        n: counts.converted,
        patch: { status: 'converted', view: undefined },
        on: filters.status === 'converted',
      },
      {
        label: 'Lost',
        n: counts.closed,
        patch: { status: 'closed', view: undefined },
        on: filters.status === 'closed',
      },
    ];
  const firstName = (session?.user.name ?? 'Tripsmith').split(' ')[0];

  return (
    <>
      <div className={cn('grid gap-5', selected && 'max-lg:hidden')}>
        <PageHead
          title="Enquiries"
          subtitle={`${a.needsReply} need a reply · ${a.overTarget} over the 2 h target · ${a.followUpDue} to follow up today${oldest ? ` · oldest waiting ${oldest}` : ''}`}
          actions={
            // A plain anchor: the CSV is an api route behind the rewrite, not a Next page.
            <a
              href={csvHref(filters)}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
              download
            >
              <Download className="size-4" aria-hidden />
              Export CSV
            </a>
          }
        />
        <div className="grid gap-2.5">
          <nav
            aria-label="Saved filters"
            className="flex gap-1.5 overflow-x-auto pb-1 max-sm:[scrollbar-width:none] sm:flex-wrap"
          >
            {chips.map((c) => (
              <Link
                key={c.label}
                href={filterHref(filters, c.patch)}
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
                    c.hot && c.n > 0
                      ? 'rounded-chip bg-action px-1.5 text-ink'
                      : c.on
                        ? 'text-white'
                        : 'text-mute',
                  )}
                >
                  {c.n}
                </span>
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <LiveFilterForm
              action={INBOX_PATH}
              submit={
                <button type="submit" className={buttonVariants({ size: 'sm' })}>
                  Search
                </button>
              }
              clear={null}
            >
              <div className="relative min-w-[220px] flex-1 sm:max-w-[420px]">
                <label htmlFor="q" className="sr-only">
                  Search enquiries
                </label>
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute"
                  aria-hidden
                />
                <Input
                  id="q"
                  name="q"
                  type="search"
                  defaultValue={filters.q ?? ''}
                  placeholder="Name or phone"
                  className="pl-9"
                />
              </div>
              {(['status', 'type', 'packageId', 'from', 'to', 'view', 'sort', 'sel'] as const).map(
                (k) =>
                  filters[k] ? (
                    <input key={k} type="hidden" name={k} value={String(filters[k])} />
                  ) : null,
              )}
            </LiveFilterForm>
            <div role="group" aria-label="Sort" className="flex gap-1 rounded-lg bg-bg2 p-1">
              {(
                [
                  ['waiting', 'Longest waiting first'],
                  ['newest', 'Newest'],
                ] as const
              ).map(([s, label]) => (
                <Link
                  key={s}
                  href={filterHref(filters, { sort: s === 'waiting' ? undefined : s })}
                  aria-current={sort === s ? 'true' : undefined}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[12.5px] font-bold no-underline',
                    sort === s ? 'bg-bg text-ink shadow-sm' : 'text-mute hover:text-ink',
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className={cn('grid gap-3', selected && 'max-lg:hidden')}>
          <div className="overflow-hidden rounded-card border border-line bg-bg">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-[12px] font-bold text-mute">
              <span>{inbox.items.length} shown</span>
              <span className="ml-auto max-sm:hidden">
                {sort === 'waiting' ? 'Needs reply first, then follow-ups due' : 'Newest first'} ·{' '}
                <kbd className="rounded border border-b-2 border-line bg-bg2 px-1 text-[10.5px]">
                  J
                </kbd>{' '}
                <kbd className="rounded border border-b-2 border-line bg-bg2 px-1 text-[10.5px]">
                  K
                </kbd>{' '}
                move ·{' '}
                <kbd className="rounded border border-b-2 border-line bg-bg2 px-1 text-[10.5px]">
                  R
                </kbd>{' '}
                reply ·{' '}
                <kbd className="rounded border border-b-2 border-line bg-bg2 px-1 text-[10.5px]">
                  F
                </kbd>{' '}
                follow up
              </span>
            </div>
            <InboxList items={inbox.items} selected={filters.sel} hrefFor={hrefFor} today={today} />
          </div>
          <Pager
            href={(page) => filterHref(filters, { page })}
            page={inbox.page}
            totalPages={inbox.totalPages}
            total={inbox.total}
            shown={inbox.items.length}
          />
        </div>
        <div className="lg:sticky lg:top-4">
          <InboxPanel
            e={selected}
            today={today}
            trip={trip}
            backHref={filterHref(filters, { sel: undefined, page: filters.page })}
            signOff={`${firstName}, Tripsmith`}
            hrefFor={hrefFor}
          />
        </div>
      </div>
      <InboxKeys
        ids={inbox.items.map((e) => e.id)}
        selected={filters.sel}
        hrefs={Object.fromEntries(inbox.items.map((e) => [e.id, hrefFor(e.id)]))}
      />
    </>
  );
}

/** A stale `?sel=` (an enquiry that no longer exists) just leaves the panel empty. */
async function loadEnquiry(id: string) {
  try {
    return await api('/admin/enquiries/{id}', { auth: true, params: { id } });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) return null;
    throw e;
  }
}

/** The package facts the snippets drop into a reply: its price from and the next dates with
 *  seats left (the public detail, the same numbers the customer sees). */
async function tripFacts(slug: string): Promise<TripFacts | null> {
  try {
    const p = await api('/packages/{slug}', { params: { slug } });
    return {
      name: p.name,
      nights: p.nights,
      fromPaise: p.startingPricePaise ?? 0,
      dates: p.departures
        .filter((d) => d.seatsLeft > 0)
        .slice(0, 3)
        .map((d) => [formatDate(d.date).slice(0, -5), d.seatsLeft]),
    };
  } catch {
    return null;
  }
}
