import { notFound } from 'next/navigation';
import { api } from '@/lib/api';

/** Dev-only smoke check that web can reach the api through the typed client. */
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function ApiHealth() {
  if (process.env.NODE_ENV === 'production') notFound();
  const h = await api<{ ok: boolean; version: string; time: string }>('/health');
  return <pre>{JSON.stringify(h, null, 2)}</pre>;
}
