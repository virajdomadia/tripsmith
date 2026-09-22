import { notFound } from 'next/navigation';
import { PageHead } from '@/components/admin/PageHead';
import { DestinationForm } from '@/components/admin/destinations/DestinationForm';
import { api, ApiRequestError } from '@/lib/api';

export const metadata = { title: 'Edit destination' };

export default async function EditDestinationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let destination;
  try {
    destination = await api('/admin/destinations/{id}', { params: { id }, auth: true });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
  const trips =
    destination.packageCount === 1 ? '1 package' : `${destination.packageCount} packages`;
  return (
    <>
      <PageHead
        title={destination.name}
        subtitle={`${trips} · ${destination.livePackageCount ? 'on the public grid' : 'hidden until a package goes live'}`}
      />
      <DestinationForm mode="edit" destination={destination} />
    </>
  );
}
