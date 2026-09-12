import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as s from '../src/infra/db/schema';
import { createTestDb, type TestDb } from './setup/pglite';

let db: TestDb;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());

describe('0001_v1 migration', () => {
  it('creates every v1 table and the availability view', async () => {
    const rows = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    const names = rows.rows.map((r) => r.table_name);
    for (const t of [
      'user',
      'session',
      'account',
      'verification',
      'destinations',
      'packages',
      'itinerary_days',
      'departures',
      'package_images',
      'testimonials',
      'enquiries',
      'enquiry_notes',
      'package_views',
      'departure_availability',
    ])
      expect(names).toContain(t);
  });
  it('enforces days = nights + 1', async () => {
    await db.insert(s.destinations).values({
      id: 'd1',
      slug: 'goa',
      name: 'Goa',
      tagline: 't',
      intro: 'i',
      coverUrl: null,
      region: 'West',
      bestMonths: [11],
      position: 0,
    });
    // drizzle-orm wraps the driver's Postgres error as `cause` and does not fold its
    // message into the top-level DrizzleQueryError message, so `.rejects.toThrow(regex)`
    // (which only inspects the top-level message) can't see the constraint name directly.
    const err: unknown = await db
      .insert(s.packages)
      .values({
        id: 'p0',
        slug: 'bad',
        destinationId: 'd1',
        name: 'Bad',
        summary: 's',
        themes: ['beach'],
        nights: 3,
        days: 5,
        departureCity: 'Ex-Mumbai',
        highlights: [],
        inclusions: [],
        exclusions: [],
        hotels: [],
        faq: [],
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const cause = (err as Error & { cause?: unknown }).cause;
    expect(String((cause as Error | undefined)?.message ?? (err as Error).message)).toMatch(
      /days_check/,
    );
  });
  it('departure_availability reports seats_total as seats_left in v1', async () => {
    await db.insert(s.packages).values({
      id: 'p1',
      slug: 'ok',
      destinationId: 'd1',
      name: 'Ok',
      summary: 's',
      themes: ['beach'],
      nights: 3,
      days: 4,
      departureCity: 'Ex-Mumbai',
      highlights: [],
      inclusions: [],
      exclusions: [],
      hotels: [],
      faq: [],
    });
    await db.insert(s.departures).values({
      id: 'dep1',
      packageId: 'p1',
      date: '2026-11-14',
      seatsTotal: 6,
      guaranteed: false,
      priceDoublePaise: 1499900,
      priceTriplePaise: 1399900,
      priceChildPaise: 899900,
      singleSupplementPaise: 450000,
    });
    const [row] = await db.select().from(s.departureAvailability);
    expect(row).toEqual({ departureId: 'dep1', seatsLeft: 6 });
  });
  it('rejects a duplicate itinerary day', async () => {
    await db.insert(s.itineraryDays).values({
      id: 'i1',
      packageId: 'p1',
      dayNo: 1,
      title: 'A',
      description: 'a',
      mealB: false,
      mealL: false,
      mealD: true,
      stay: 'Candolim',
    });
    await expect(
      db.insert(s.itineraryDays).values({
        id: 'i2',
        packageId: 'p1',
        dayNo: 1,
        title: 'B',
        description: 'b',
        mealB: true,
        mealL: false,
        mealD: false,
        stay: null,
      }),
    ).rejects.toThrow();
  });
});
