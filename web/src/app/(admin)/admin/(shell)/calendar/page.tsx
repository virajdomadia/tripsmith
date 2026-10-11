import { CalendarBoard } from '@/components/admin/calendar/CalendarBoard';
import { parseCalendarParams, type CalendarPanel } from '@/lib/admin/calendar';
import { api, ApiRequestError } from '@/lib/api';

export const metadata = { title: 'Calendar' };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The departure calendar (R50, P11), mockup Calendar A: the month strip, filters, the month grid
 * (a week agenda on a phone) and a side panel. The month and the open departure live in the URL
 * (`?month=&dest=&package=&leader=&dep=`); filters run in the browser over the whole month.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = parseCalendarParams(await searchParams);
  const [month, panel] = await Promise.all([
    api('/admin/calendar', {
      auth: true,
      searchParams: params.month ? { month: params.month } : {},
    }),
    params.dep ? loadPanel(params.dep) : Promise.resolve(null),
  ]);
  return <CalendarBoard data={month} params={params} initialPanel={panel} />;
}

/** A stale `?dep=` (a date since deleted) just opens nothing. */
async function loadPanel(id: string): Promise<CalendarPanel | null> {
  try {
    return await api('/admin/calendar/departures/{id}', { auth: true, params: { id } });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) return null;
    throw e;
  }
}
