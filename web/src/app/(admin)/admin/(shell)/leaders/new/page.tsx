import { PageHead } from '@/components/admin/PageHead';
import { LeaderForm } from '@/components/admin/leaders/LeaderForm';

export const metadata = { title: 'New trip leader' };

export default function NewLeaderPage() {
  return (
    <>
      <PageHead
        title="New trip leader"
        subtitle="Pick them as a package's leader, or for one date, once they are added."
      />
      <LeaderForm mode="create" />
    </>
  );
}
