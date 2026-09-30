import { notFound, redirect } from 'next/navigation';
import { CounterBooking, type EnquiryPrefill } from '@/components/admin/counter/CounterBooking';
import { api, ApiRequestError } from '@/lib/api';
import { LOGIN_PATH } from '@/lib/auth/gate';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'New booking' };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Counter booking (R56, P18) — mockup C, wizard + receipt. Bookings → New booking, or
 * "Convert to booking" from an enquiry (`?enquiry=<id>`: trip, party and customer pre-filled;
 * booking marks the enquiry converted and links it). The calendar's entry point lands with P11.
 */
export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getSession();
  if (!session) redirect(LOGIN_PATH);
  const raw = (await searchParams).enquiry;
  const enquiryId = typeof raw === 'string' && /^[a-z0-9]{1,40}$/i.test(raw) ? raw : null;
  const [trips, enquiry] = await Promise.all([
    api('/admin/counter/trips', { auth: true }),
    enquiryId ? loadEnquiry(enquiryId) : Promise.resolve(null),
  ]);
  return (
    <CounterBooking
      packages={trips.packages}
      enquiry={enquiry}
      owner={session.user.name}
      key={enquiryId ?? 'new'}
    />
  );
}

async function loadEnquiry(id: string): Promise<EnquiryPrefill | null> {
  try {
    const e = await api('/admin/enquiries/{id}', { auth: true, params: { id } });
    return {
      id: e.id,
      ref: e.ref,
      status: e.status,
      name: e.name,
      phone: e.phone,
      email: e.email,
      packageSlug: e.package?.slug ?? null,
      travelMonth: e.travelMonth,
      adults: e.adults,
      children: e.children,
      message: e.message,
      createdAt: e.createdAt,
      bookings: e.bookings?.map((b) => b.ref) ?? [],
    };
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) notFound();
    throw err;
  }
}
