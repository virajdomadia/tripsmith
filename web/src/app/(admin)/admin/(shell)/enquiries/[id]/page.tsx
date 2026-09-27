import { redirect } from 'next/navigation';
import { INBOX_PATH } from '@/lib/admin/enquiry-filters';

/** P20 · Enquiries A2 reads an enquiry in the inbox's panel; old links (emails, bookmarks, the
 *  dashboard) land there with it open. */
export default async function EnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`${INBOX_PATH}?sel=${encodeURIComponent(id)}`);
}
