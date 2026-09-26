import { notFound, redirect } from 'next/navigation';
import { PrintButton } from '@/components/admin/bookings/PrintButton';
import { istFullDate, istTime } from '@/components/admin/enquiries/ist-date';
import { ACCOUNT_PATH, LOGIN_PATH } from '@/lib/auth/gate';
import { getSession } from '@/lib/auth/session';
import { api, ApiRequestError } from '@/lib/api';
import { OCCUPANCY_LABEL } from '@/lib/booking';
import { duration, formatDate } from '@/lib/format';

export const metadata = { title: 'Manifest', robots: { index: false, follow: false } };

/**
 * A departure's passenger manifest (R22), print-first: outside the admin shell, so no sidebar,
 * and laid out for A4. Confirmed travellers grouped by booking, lead's phone on each group, and
 * the seat counts the desk shows — all from the `departure_availability` view's rules.
 */
export default async function ManifestPage({ params }: { params: Promise<{ id: string }> }) {
  // Outside the (shell) layout, so its session check is repeated here (the middleware gates
  // /admin/* too).
  const session = await getSession();
  if (!session) redirect(LOGIN_PATH);
  if (session.user.role !== 'owner') redirect(ACCOUNT_PATH);
  const { id } = await params;
  let m;
  try {
    m = await api('/admin/departures/{id}/manifest', { auth: true, params: { id } });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
  const { seats } = m;
  const counts = [
    ['Seats', seats.seatsTotal],
    ['Booked', seats.booked],
    ['On hold', seats.held],
    ['Left', seats.seatsLeft],
  ] as const;
  // Running traveller numbers across the groups: group i starts after everyone before it.
  const starts = m.bookings.map((_, i) =>
    m.bookings.slice(0, i).reduce((sum, b) => sum + b.travellers.length, 0),
  );
  return (
    <div className="mx-auto max-w-[800px] px-6 py-8 text-ink print:max-w-none print:p-0">
      {/* A4 with sane margins; the browser's own header/footer is the owner's choice. */}
      <style>{'@page { size: A4; margin: 14mm; }'}</style>
      <header className="flex flex-wrap items-start gap-4 border-b-2 border-ink pb-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wide text-mute uppercase">
            Tripsmith · passenger manifest
          </p>
          <h1 className="mt-1 text-2xl font-extrabold">{seats.packageName}</h1>
          <p className="mt-1 text-sm text-ink2">
            {formatDate(seats.date)} → {formatDate(m.returns)} · {duration(m.nights, m.days)} ·{' '}
            {m.departureCity}
          </p>
        </div>
        <PrintButton />
      </header>

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 break-inside-avoid">
        {counts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-bold text-mute">{label}</dt>
            <dd className="num text-xl font-extrabold">{value}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs font-bold text-mute">On this manifest</dt>
          <dd className="num text-xl font-extrabold">{m.travellers}</dd>
        </div>
      </dl>

      {m.bookings.length === 0 ? (
        <p className="mt-8 text-mute">No confirmed travellers on this departure yet.</p>
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink text-left text-xs text-mute">
              <th className="w-8 py-1.5 pr-2 font-bold">#</th>
              <th className="py-1.5 pr-2 font-bold">Traveller</th>
              <th className="py-1.5 pr-2 font-bold">Age</th>
              <th className="py-1.5 pr-2 font-bold">Room</th>
            </tr>
          </thead>
          {m.bookings.map((b, g) => (
            <tbody key={b.ref} className="break-inside-avoid border-b border-line">
              <tr className="bg-bg2 print:bg-transparent">
                <td colSpan={4} className="px-1 pt-3 pb-1">
                  <b className="num">{b.ref}</b> · lead <b>{b.leadName}</b> ·{' '}
                  <span className="num">+91 {b.leadPhone}</span>
                  {b.status === 'completed' && <span className="text-mute"> · completed</span>}
                  {b.cancellationRequested && (
                    <span className="font-bold text-warn"> · cancellation requested</span>
                  )}
                </td>
              </tr>
              {b.travellers.map((t, i) => (
                <tr key={`${b.ref}-${i}`}>
                  <td className="num py-1 pr-2 text-mute">{starts[g]! + i + 1}</td>
                  <td className="py-1 pr-2 font-semibold">{t.name}</td>
                  <td className="num py-1 pr-2">{t.age}</td>
                  <td className="py-1 pr-2">{OCCUPANCY_LABEL[t.occupancy]}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}

      <p className="mt-6 text-xs text-mute">
        Printed {istFullDate(m.generatedAt)}, {istTime(m.generatedAt)} IST · confirmed and completed
        bookings only; holds are counted above but not listed.
      </p>
    </div>
  );
}
