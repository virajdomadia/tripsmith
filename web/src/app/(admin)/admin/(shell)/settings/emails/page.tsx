import { PageHead } from '@/components/admin/PageHead';
import { EmailSettingsBoard } from '@/components/admin/emails/EmailSettingsBoard';
import { api } from '@/lib/api';

export const metadata = { title: 'Emails · Settings' };

/**
 * Settings · Emails (R53, P15b): each automatic email with its switch, when it goes, how many
 * went in the last 30 days, a preview with a real booking and a test to the owner's own inbox.
 */
export default async function EmailSettingsPage() {
  const settings = await api('/admin/emails', { auth: true });
  return (
    <>
      <PageHead
        title="Emails"
        subtitle={`Automatic trip emails · the daily run sends at ${settings.sendsAt} · each goes at most once per booking, and every send is in the booking’s history`}
      />
      <EmailSettingsBoard settings={settings} />
    </>
  );
}
