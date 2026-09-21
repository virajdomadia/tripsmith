import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BrandMark } from '@/components/site/BrandMark';
import { LOGIN_PATH } from '@/lib/auth/gate';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'Admin' };

/** Signed-in landing until F16–F22 build the shell and dashboard. The middleware already gates
 *  this route; the redirect below is the belt to its braces (a session that expired mid-visit). */
export default async function AdminHome() {
  const session = await getSession();
  if (!session) redirect(LOGIN_PATH);

  return (
    <section className="mx-auto grid max-w-[560px] gap-4 px-4 py-16">
      <span className="flex items-center gap-2 font-extrabold">
        <BrandMark size={28} />
        Tripsmith admin
      </span>
      <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">
        Signed in as {session.user.name}
      </h1>
      <p className="text-ink2">
        {session.user.email} · {session.user.role}. The dashboard, packages, destinations and
        enquiries inbox arrive with F16–F22.
      </p>
      <div className="flex flex-wrap gap-3">
        <form method="post" action="/api/auth/logout">
          <button
            type="submit"
            className="rounded-btn border-[1.5px] border-line bg-white px-5 py-3 font-bold text-ink transition-colors hover:border-ink"
          >
            Sign out
          </button>
        </form>
        <Link
          href="/"
          className="inline-flex items-center rounded-btn bg-primary px-5 py-3 font-bold text-white transition-colors hover:bg-primary-ink"
        >
          View site
        </Link>
      </div>
    </section>
  );
}
