import { Plus } from 'lucide-react';
import Link from 'next/link';
import { PageHead } from '@/components/admin/PageHead';
import { BarList } from '@/components/admin/dashboard/BarList';
import { Panel } from '@/components/admin/dashboard/Panel';
import { StatTile } from '@/components/admin/dashboard/StatTile';
import { UpcomingDepartures } from '@/components/admin/dashboard/UpcomingDepartures';
import { buttonVariants } from '@/components/ui/button';
import { greeting, trend, waited } from '@/lib/admin/dashboard';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'Dashboard' };

const STATUS_TONE = {
  new: 'bg-primary',
  contacted: 'bg-action',
  converted: 'bg-ok',
  closed: 'bg-mute',
} as const;

/**
 * Mockup A2. Every number on this page comes from one `GET /admin/dashboard`, which measures
 * its windows in IST and counts enquiries by the day they arrived — the same rule the inbox
 * filters by, so the two screens reconcile (R12).
 */
export default async function AdminHome() {
  const [session, data] = await Promise.all([
    getSession(),
    api('/admin/dashboard', { auth: true }),
  ]);
  const firstName = (session?.user.name ?? 'there').split(' ')[0];
  const { byStatus } = data;

  return (
    <>
      <PageHead
        title={`${greeting()}, ${firstName}.`}
        subtitle={`${formatDate(data.today)} · ${data.awaitingFirstCall} awaiting a first call`}
        actions={
          <>
            <Link
              href="/admin/enquiries"
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              Open inbox
            </Link>
            <Link href="/admin/packages/new" className={buttonVariants({ size: 'sm' })}>
              <Plus className="size-4" aria-hidden />
              New package
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="New enquiries · this week"
          value={data.enquiriesThisWeek}
          hint={trend(data.enquiriesThisWeek, data.enquiriesLastWeekToDate, 'last week to date')}
        />
        <StatTile
          label="Awaiting first call"
          value={data.awaitingFirstCall}
          hint={
            data.oldestNewAt ? `Oldest waiting ${waited(data.oldestNewAt)}` : 'Inbox is clear 🎉'
          }
        />
        <StatTile
          label="Converted · 30 days"
          value={data.convertedLast30Days}
          hint={`of ${data.enquiriesLast30Days} received`}
        />
        <StatTile
          label="Package views · 7 days"
          value={data.viewsLast7Days}
          hint={trend(data.viewsLast7Days, data.viewsPrevious7Days, 'the previous 7 days')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Top packages by enquiries"
          sub="· 30 days"
          action={
            <Link
              href="/admin/packages"
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              All packages
            </Link>
          }
        >
          <BarList
            rows={data.topByEnquiries.map((p) => ({
              key: p.id,
              label: p.name,
              count: p.count,
              // `from` carries the panel's own window into the inbox, so the row that reads 6
              // opens an inbox holding those six and not every enquiry the package ever had.
              href: `/admin/enquiries?packageId=${p.id}&from=${data.windowStart}`,
            }))}
            empty="No enquiries in the last 30 days."
          />
        </Panel>

        <Panel
          title="Top packages by views"
          sub="· 30 days"
          action={
            <Link href="/packages" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              View site
            </Link>
          }
        >
          <BarList
            rows={data.topByViews.map((p) => ({
              key: p.id,
              label: p.name,
              count: p.count,
              href: `/packages/${p.slug}`,
            }))}
            empty="No page views recorded yet."
          />
        </Panel>
      </div>

      <Panel title="Enquiries by status" sub={`· ${byStatus.all} in total`}>
        <BarList
          rows={(['new', 'contacted', 'converted', 'closed'] as const).map((status) => ({
            key: status,
            label: status[0]!.toUpperCase() + status.slice(1),
            count: byStatus[status],
            href: `/admin/enquiries?status=${status}`,
            tone: STATUS_TONE[status],
          }))}
          empty="No enquiries yet."
        />
      </Panel>

      <Panel title="Upcoming departures" sub="· next 30 days">
        <UpcomingDepartures
          departures={data.upcomingDepartures}
          total={data.upcomingDeparturesTotal}
        />
      </Panel>
    </>
  );
}
