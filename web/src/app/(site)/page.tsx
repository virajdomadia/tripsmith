import { ApiStatus } from '@/components/site/ApiStatus';
import { api } from '@/lib/api';

// Live status, not a build-time snapshot: the placeholder exists to show the api is up.
export const dynamic = 'force-dynamic';

const API_URL = process.env.API_URL ?? 'http://localhost:8000';

export default async function Home() {
  try {
    const [health, meta, packages] = await Promise.all([
      api('/health'),
      api('/meta', { tags: ['meta'] }),
      api('/packages', { tags: ['packages'] }),
    ]);
    return <ApiStatus health={health} meta={meta} packages={packages} apiUrl={API_URL} />;
  } catch (err) {
    return <ApiStatus error={err instanceof Error ? err.message : String(err)} apiUrl={API_URL} />;
  }
}
