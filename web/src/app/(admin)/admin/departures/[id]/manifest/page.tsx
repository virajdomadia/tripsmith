import { notFound, redirect } from 'next/navigation';
import { PrintButton } from '@/components/admin/bookings/PrintButton';
import { WaitlistPanel } from '@/components/admin/bookings/WaitlistPanel';
import { istFullDate, istTime } from '@/components/admin/enquiries/ist-date';
import { ACCOUNT_PATH, LOGIN_PATH } from '@/lib/auth/gate';
import { getSession } from '@/lib/auth/session';
import { api, ApiRequestError } from '@/lib/api';
import { foodLabel, idTypeLabel } from '@/lib/account';
import { OCCUPANCY_LABEL } from '@/lib/booking';
import { duration, formatDate } from '@/lib/format';

export const metadata = { title: 'Manifest', robots: { index: false, follow: false } };

/**
 * A departure's passenger manifest (R22), print-first: outside the admin shell, so no sidebar,
 * and laid out for A4. Confirmed travellers grouped by booking, lead's phone on each group, and
 * the seat counts the desk shows — all from the `departure_availability` view's rules. Since P9
 * (R49) each traveller carries every detail — the ID number in full, the one place it is ever
 * shown — with the departure's readiness in the header; required fields still empty print as
 * "missing". Landscape, so the details fit a row.
 */
export default async function ManifestPage({ params }: { params: Promise<{ id: string }> }) {
  // Outside the (shell) layout, so its session check is repeated here (the middleware gates
  // /admin/* too).
  const session = await getSession();
  if (!session) redirect(LOGIN_PATH);
  if (session.user.role !== 'owner') redirect(ACCOUNT_PATH);
  const { id } = await params;
  // The waitlist first: reading it walks the list, so the seat counts below include its
  // offers. Best effort — the printable manifest must never depend on it.
  const waitlist = await api('/admin/departures/{id}/waitlist', {
    auth: true,
    params: { id },
  }).catch(() => null);
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
    <div className="mx-auto max-w-[1120px] px-6 py-8 text-ink print:max-w-none print:p-0">
      {/* A4 landscape with sane margins; the browser's own header/footer is the owner's choice. */}
      <style>{'@page { size: A4 landscape; margin: 12mm; }'}</style>
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
          {m.leader && (
            // P3: the date's leader, with the phone the team calls on the day.
            <p className="mt-1 text-sm text-ink2">
              Trip leader: <b className="text-ink">{m.leader.name}</b> · {m.leader.phone}
            </p>
          )}
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
        {m.readiness && m.readiness.percent !== null && (
          <div>
            <dt className="text-xs font-bold text-mute">Ready</dt>
            <dd className="num text-xl font-extrabold">
              {m.readiness.percent}%
              {m.readiness.missingTravellers > 0 && (
                <span className="ml-2 text-sm font-bold text-warn">
                  {m.readiness.missingTravellers} missing details
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-3 rounded-btn border border-warn/40 bg-warn-soft px-3 py-2 text-[12.5px] text-ink2 print:bg-transparent">
        <b className="text-warn">Confidential:</b> this page carries travellers’ ID numbers and
        medical notes in full. Keep it with the trip leader and shred it after the trip — the
        details are deleted from Tripsmith 30 days after the return.
      </p>

      {m.addons.length > 0 && (
        <section className="mt-5 break-inside-avoid" aria-labelledby="addons">
          <h2 id="addons" className="text-xs font-bold tracking-wide text-mute uppercase">
            Add-ons to arrange
          </h2>
          <ul className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {m.addons.map((a) => (
              <li key={a.name}>
                <b>{a.name}</b> ·{' '}
                <span className="num">
                  {a.travellers
                    ? `${a.travellers} ${a.travellers === 1 ? 'traveller' : 'travellers'}`
                    : `${a.bookings} ${a.bookings === 1 ? 'booking' : 'bookings'}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {m.bookings.length === 0 ? (
        <p className="mt-8 text-mute">No confirmed travellers on this departure yet.</p>
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink text-left text-xs text-mute">
              <th className="w-8 py-1.5 pr-2 font-bold">#</th>
              <th className="py-1.5 pr-2 font-bold">Traveller</th>
              <th className="py-1.5 pr-2 font-bold">ID</th>
              <th className="py-1.5 pr-2 font-bold">Born</th>
              <th className="py-1.5 pr-2 font-bold">Emergency contact</th>
              <th className="py-1.5 pr-2 font-bold">Food</th>
              <th className="py-1.5 pr-2 font-bold">Medical</th>
            </tr>
          </thead>
          {m.bookings.map((b, g) => (
            <tbody key={b.ref} className="break-inside-avoid border-b border-line">
              <tr className="bg-bg2 print:bg-transparent">
                <td colSpan={7} className="px-1 pt-3 pb-1">
                  <b className="num">{b.ref}</b> · lead <b>{b.leadName}</b> ·{' '}
                  <span className="num">+91 {b.leadPhone}</span>
                  {b.status === 'completed' && <span className="text-mute"> · completed</span>}
                  {b.cancellationRequested && (
                    <span className="font-bold text-warn"> · cancellation requested</span>
                  )}
                  {b.readyPercent !== null && b.readyPercent !== undefined && (
                    <span className="num text-mute"> · {b.readyPercent}% ready</span>
                  )}
                  {b.addons.length > 0 && (
                    <span className="block text-[12.5px] text-ink2">
                      Add-ons: {b.addons.join(' · ')}
                    </span>
                  )}
                </td>
              </tr>
              {b.travellers.map((t, i) => {
                const missing = t.missing ?? [];
                const gap = (f: (typeof missing)[number], have: React.ReactNode) =>
                  have ? (
                    have
                  ) : missing.includes(f) ? (
                    <span className="font-bold text-warn">missing</span>
                  ) : (
                    <span className="text-mute">—</span>
                  );
                return (
                  <tr key={t.travellerId} className="align-top">
                    <td className="num py-1 pr-2 text-mute">{starts[g]! + i + 1}</td>
                    <td className="py-1 pr-2">
                      <b>{t.name}</b>
                      <span className="block text-[12px] text-ink2">
                        {t.age ?? '—'} · {OCCUPANCY_LABEL[t.occupancy]}
                      </span>
                    </td>
                    <td className="py-1 pr-2">
                      {gap(
                        'id',
                        t.idType && (
                          <>
                            <span className="block text-[12px] text-ink2">
                              {idTypeLabel(t.idType)}
                            </span>
                            <span className="num font-semibold tracking-wide">
                              {t.idNumber ?? 'can’t be read'}
                            </span>
                          </>
                        ),
                      )}
                    </td>
                    <td className="num py-1 pr-2">{gap('dob', t.dob && formatDate(t.dob))}</td>
                    <td className="py-1 pr-2">
                      {gap(
                        'emergency',
                        t.emergencyName && (
                          <>
                            {t.emergencyName}
                            {t.emergencyRelation && (
                              <span className="text-ink2"> ({t.emergencyRelation})</span>
                            )}
                            <span className="num block">+91 {t.emergencyPhone}</span>
                          </>
                        ),
                      )}
                    </td>
                    <td className="py-1 pr-2">
                      {gap(
                        'food',
                        t.food && (
                          <>
                            {foodLabel(t.food)}
                            {t.allergies && (
                              <span className="block text-[12px] font-bold text-warn">
                                Allergies: {t.allergies}
                              </span>
                            )}
                          </>
                        ),
                      )}
                    </td>
                    <td className="max-w-[220px] py-1 pr-2 [overflow-wrap:anywhere]">
                      {gap('medical', t.medical)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      )}

      {waitlist && <WaitlistPanel initial={waitlist} />}

      <p className="mt-6 text-xs text-mute">
        Printed {istFullDate(m.generatedAt)}, {istTime(m.generatedAt)} IST · confirmed and completed
        bookings only; holds are counted above but not listed.
      </p>
    </div>
  );
}
