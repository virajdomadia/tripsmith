import { PageHead } from '@/components/admin/PageHead';
import { DestinationForm } from '@/components/admin/destinations/DestinationForm';

export const metadata = { title: 'New destination' };

export default function NewDestinationPage() {
  return (
    <>
      <PageHead
        title="New destination"
        subtitle="It appears on the public grid once it has a live package."
      />
      <DestinationForm mode="create" />
    </>
  );
}
