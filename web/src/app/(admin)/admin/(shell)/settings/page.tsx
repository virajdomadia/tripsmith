import { redirect } from 'next/navigation';
import { EMAILS_PATH } from '@/lib/admin/emails';

/** Settings has one page so far — the automatic emails (R53, P15b). */
export default function SettingsPage() {
  redirect(EMAILS_PATH);
}
