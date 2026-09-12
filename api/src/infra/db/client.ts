import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/** The one DB type every module accepts — satisfied by Neon (prod) and PGlite (tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createNeonDb(url: string): NeonHttpDatabase<typeof schema> {
  return drizzle(neon(url), { schema });
}

let cached: NeonHttpDatabase<typeof schema> | undefined;
/** Lazily created so importing the module never needs DATABASE_URL (tests inject their own db). */
export function getDb(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    cached = createNeonDb(url);
  }
  return cached as unknown as Db;
}
