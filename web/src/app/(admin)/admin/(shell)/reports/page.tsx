import { ReportsCockpit } from '@/components/admin/reports/ReportsCockpit';
import { apiQuery, parseReportParams } from '@/lib/admin/reports';
import { api } from '@/lib/api';

export const metadata = { title: 'Reports' };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The owner's reports (R55, P12), mockup Reports B: one api call for the whole range
 * (`?p=&from=&to=&demo=0&s=`), every section drawn from it in the browser.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = parseReportParams(await searchParams);
  const data = await api('/admin/reports', { auth: true, searchParams: apiQuery(params) });
  return <ReportsCockpit data={data} params={params} />;
}
