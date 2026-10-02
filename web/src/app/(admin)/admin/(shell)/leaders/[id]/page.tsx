import { redirect } from 'next/navigation';

/** Trip leaders edit beside the cards (R41): an edit link opens that panel. */
export default async function EditLeaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/leaders?sel=${encodeURIComponent(id)}`);
}
