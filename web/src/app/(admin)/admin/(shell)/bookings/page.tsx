import { Download } from 'lucide-react';
import { redirect } from 'next/navigation';
import { PageHead } from '@/components/admin/PageHead';
import { BookingsTable } from '@/components/admin/bookings/BookingsTable';
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
import { api } from '@/lib/api';

export const metadata = { title: 'Bookings' };

type SearchParams = Record<string, string | string[] | undefined>;

/** The bookings desk (R22). Built on the enquiry inbox: the URL is the filter state, the api
 *  filters, counts and pages; nothing here is client state. */
export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseDeskFilters(await searchParams);
  const [desk, catalogue] = await Promise.all([
    api('/admin/bookings', { auth: true, searchParams: deskQuery(filters) }),
    api('/admin/packages', { auth: true }),
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
          // A plain anchor: the CSV is an api route behind the rewrite, not a Next page.
          <a
            href={deskCsvHref(filters)}
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
            download
          >
            <Download className="size-4" aria-hidden />
            Export CSV
          </a>
        }
      />
      <DeskFilters
        filters={filters}
        counts={counts}
        packages={catalogue.items.map((p) => ({ id: p.id, name: p.name }))}
        departures={desk.departures}
      />
      {desk.seats && <SeatStrip seats={desk.seats} />}
      <BookingsTable items={desk.items} />
      <Pager
        href={(page) => deskHref(filters, { page })}
        noun={['booking', 'bookings']}
        page={desk.page}
        totalPages={desk.totalPages}
        total={desk.total}
        shown={desk.items.length}
      />
    </>
  );
}
