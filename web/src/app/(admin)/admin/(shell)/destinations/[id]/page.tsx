import { redirect } from 'next/navigation';

/** Destinations A (R59, P20) edits beside the cards: the old edit page opens that panel. */
export default async function EditDestinationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/destinations?sel=${encodeURIComponent(id)}`);
}
