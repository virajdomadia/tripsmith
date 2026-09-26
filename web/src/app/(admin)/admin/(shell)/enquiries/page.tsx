import { Download } from 'lucide-react';
import { PageHead } from '@/components/admin/PageHead';
import { EnquiriesTable } from '@/components/admin/enquiries/EnquiriesTable';
import { InboxFilters } from '@/components/admin/enquiries/InboxFilters';
import { Pager } from '@/components/admin/enquiries/Pager';
import { buttonVariants } from '@/components/ui/button';
import { redirect } from 'next/navigation';
import {
  clampPageHref,
  csvHref,
  filterHref,
  parseFilters,
  toQuery,
} from '@/lib/admin/enquiry-filters';
import { api } from '@/lib/api';

export const metadata = { title: 'Enquiries' };

type SearchParams = Record<string, string | string[] | undefined>;

/** Mockup A6. Everything the owner filters by lives in the URL, so this page re-renders on the
 *  server for each view — nothing here is client state. */
export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = parseFilters(await searchParams);
  const [inbox, catalogue] = await Promise.all([
    api('/admin/enquiries', { auth: true, searchParams: toQuery(filters) }),
    api('/admin/packages', { auth: true }),
  ]);
  const clamped = clampPageHref(filters, inbox.totalPages);
  if (clamped) redirect(clamped);
  const { counts } = inbox;
  return (
    <>
      <PageHead
        title="Enquiries"
        subtitle={`${counts.new} new · ${counts.contacted} contacted · ${counts.converted} converted`}
        actions={
          // A plain anchor, not `next/link`: `/api/admin/enquiries.csv` is not a Next route, so
          // the client router must not intercept it and try to fetch it as one.
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
      <InboxFilters
        filters={filters}
        counts={counts}
        packages={catalogue.items.map((p) => ({ id: p.id, name: p.name }))}
      />
      <EnquiriesTable items={inbox.items} />
      <Pager
        href={(page) => filterHref(filters, { page })}
        page={inbox.page}
        totalPages={inbox.totalPages}
        total={inbox.total}
        shown={inbox.items.length}
      />
    </>
  );
}
