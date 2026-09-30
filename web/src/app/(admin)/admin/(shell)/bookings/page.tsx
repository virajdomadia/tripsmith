import { Download, Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHead } from '@/components/admin/PageHead';
import { BookingsTable } from '@/components/admin/bookings/BookingsTable';
import { DeskPanel } from '@/components/admin/bookings/DeskPanel';
import { DeskFilters } from '@/components/admin/bookings/DeskFilters';
import { SeatStrip } from '@/components/admin/bookings/SeatStrip';
import { Pager } from '@/components/admin/enquiries/Pager';
import { buttonVariants } from '@/components/ui/button';
import {
  clampDeskPage,
  deskCsvHref,
  deskHref,
  deskQuery,
  parseDeskFilters,
} from '@/lib/admin/booking-filters';
import { api, ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Bookings' };

type SearchParams = Record<string, string | string[] | undefined>;

/** The bookings desk (R22), laid out as mockup A (R59, P20): attention tiles, status tabs, live
 *  filters, and a side panel for the row picked (`?sel=`). Built on the enquiry inbox: the URL is
 *  the state, the api filters, counts and pages. */
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseDeskFilters(await searchParams);
  const [desk, catalogue, selected] = await Promise.all([
    api('/admin/bookings', { auth: true, searchParams: deskQuery(filters) }),
    api('/admin/packages', { auth: true }),
    filters.sel ? loadBooking(filters.sel) : Promise.resolve(null),
  ]);
  const clamped = clampDeskPage(filters, desk.totalPages);
  if (clamped) redirect(clamped);
  const { counts } = desk;
  const waiting = counts.refund + counts.cancellation;
  return (
    <>
      <PageHead
        title="Bookings"
        subtitle={`${counts.confirmed} confirmed · ${counts.pending} pending${
          waiting ? ` · ${waiting} waiting on you` : ''
        }`}
        actions={
          <>
            {/* A plain anchor: the CSV is an api route behind the rewrite, not a Next page. */}
            <a
              href={deskCsvHref(filters)}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
              download
            >
              <Download className="size-4" aria-hidden />
              Export CSV
            </a>
            <Link
              href="/admin/bookings/new"
              className={cn(
                buttonVariants({ size: 'sm' }),
                'bg-action text-ink hover:bg-action-ink',
              )}
            >
              <Plus className="size-4" aria-hidden />
              New booking
            </Link>
          </>
        }
      />
      <DeskFilters
        filters={filters}
        counts={counts}
        packages={catalogue.items.map((p) => ({ id: p.id, name: p.name }))}
        departures={desk.departures}
      />
      {desk.seats && <SeatStrip seats={desk.seats} />}
      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-3">
          <BookingsTable
            items={desk.items}
            selected={filters.sel}
            selectHref={(ref) => deskHref(filters, { sel: ref, page: filters.page })}
          />
          <Pager
            href={(page) => deskHref(filters, { page })}
            noun={['booking', 'bookings']}
            page={desk.page}
            totalPages={desk.totalPages}
            total={desk.total}
            shown={desk.items.length}
          />
        </div>
        <DeskPanel
          // Keyed on the booking: a dialog's typed reference or picked day never carries over.
          key={selected?.ref ?? 'none'}
          b={selected}
          closeHref={deskHref(filters, { sel: undefined, page: filters.page })}
        />
      </div>
    </>
  );
}

/** The panel's booking; a stale `?sel=` (a ref that no longer exists) just leaves it empty. */
async function loadBooking(ref: string) {
  try {
    return await api('/admin/bookings/{ref}', { auth: true, params: { ref } });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) return null;
    throw e;
  }
}
