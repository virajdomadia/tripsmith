import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/admin/Sidebar';
import { Toaster } from '@/components/ui/sonner';
import { UnsavedChangesProvider } from '@/lib/admin/unsaved';
import { ACCOUNT_PATH, LOGIN_PATH } from '@/lib/auth/gate';
import { getSession } from '@/lib/auth/session';

/**
 * The owner shell (mockup `adm`): dark sidebar + content column. Sits under `/admin` as a route
 * group so `/admin/login` stays chrome-free. The middleware already gates `/admin/*`; the redirect
 * here covers a session that expires mid-visit (and, like the middleware, sends a non-owner to
 * `/account`). `newEnquiries` comes with the session payload — owner sessions only.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect(LOGIN_PATH);
  if (session.user.role !== 'owner') redirect(ACCOUNT_PATH);
  return (
    <UnsavedChangesProvider>
      <div className="grid min-h-dvh bg-bg2 lg:grid-cols-[240px_1fr]">
        <Sidebar session={session} />
        <div className="grid content-start gap-5 px-4 py-5 sm:px-7 sm:py-6">{children}</div>
        <Toaster position="bottom-right" richColors />
      </div>
    </UnsavedChangesProvider>
  );
}
