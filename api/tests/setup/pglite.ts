import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../../src/infra/db/schema';
import { MIGRATIONS_FOLDER } from '../../src/infra/db/migrate';

/** Fresh in-memory Postgres with the real migrations applied. One per test file. */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, close: () => client.close() };
}
export type TestDb = Awaited<ReturnType<typeof createTestDb>>['db'];
