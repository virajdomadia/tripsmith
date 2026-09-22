import { PageHead } from '@/components/admin/PageHead';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'Dashboard' };

/** Signed-in landing until F22 builds the real dashboard. The layout already redirected a null session. */
export default async function AdminHome() {
  const session = await getSession();
  const name = session?.user.name ?? 'there';
  return (
    <>
      <PageHead
        title={`Hello, ${name}.`}
        subtitle="The dashboard arrives with F22 — destinations are live below."
      />
      <section className="rounded-card border border-line bg-bg p-5 text-ink2">
        Use the sidebar: <b>Destinations</b> is ready; Packages and Enquiries follow in F18 and F21.
      </section>
    </>
  );
}
