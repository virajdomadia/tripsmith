import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function ApiHealth() {
  const h = await api<{ ok: boolean; version: string; time: string }>('/health', { revalidate: 0 });
  return <pre>{JSON.stringify(h, null, 2)}</pre>;
}
