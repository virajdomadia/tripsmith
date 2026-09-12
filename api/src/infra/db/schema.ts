import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  pgView,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// ---- enums (all v1 values + ⏩ forward-compat values) ----
export const userRole = pgEnum('user_role', ['owner', 'customer']);
export const packageStatus = pgEnum('package_status', ['draft', 'live']);
export const theme = pgEnum('theme', [
  'beach',
  'hills',
  'honeymoon',
  'family',
  'adventure',
  'heritage',
]);
export const occupancy = pgEnum('occupancy', ['double', 'triple', 'single', 'child']);
export const enquiryType = pgEnum('enquiry_type', [
  'standard',
  'custom',
  'contact',
  'callback',
  'group',
  'chat-handoff',
]);
export const enquiryStatus = pgEnum('enquiry_status', ['new', 'contacted', 'converted', 'closed']);
export const emailStatus = pgEnum('email_status', ['sent', 'failed', 'skipped']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---- auth (Better Auth column set; the auth module arrives in 1.3) ----
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: userRole('role').notNull().default('customer'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);
export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
);
export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---- catalog ----
export const destinations = pgTable('destinations', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  tagline: text('tagline').notNull(),
  intro: text('intro').notNull(),
  coverUrl: text('cover_url'),
  region: text('region').notNull(),
  bestMonths: smallint('best_months').array().notNull(),
  climate:
    jsonb('climate').$type<
      { month: number; rain: 1 | 2 | 3; heat: 1 | 2 | 3; crowd: 1 | 2 | 3; price: 1 | 2 | 3 }[]
    >(), // ⏩ add-on B
  position: smallint('position').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type Hotel = { name: string; city: string; stars: number; nights: number };
export type Faq = { q: string; a: string };

export const packages = pgTable(
  'packages',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    destinationId: text('destination_id')
      .notNull()
      .references(() => destinations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    summary: text('summary').notNull(),
    themes: theme('themes').array().notNull(),
    nights: smallint('nights').notNull(),
    days: smallint('days').notNull(),
    departureCity: text('departure_city').notNull().default('Ex-Mumbai'),
    highlights: text('highlights').array().notNull(),
    inclusions: text('inclusions').array().notNull(),
    exclusions: text('exclusions').array().notNull(),
    hotels: jsonb('hotels').$type<Hotel[]>().notNull(),
    faq: jsonb('faq').$type<Faq[]>().notNull(),
    coverImageId: text('cover_image_id').references((): AnyPgColumn => packageImages.id, {
      onDelete: 'set null',
    }),
    status: packageStatus('status').notNull().default('draft'),
    featured: boolean('featured').notNull().default(false),
    startingPricePaise: integer('starting_price_paise'),
    dealPricePaise: integer('deal_price_paise'),
    dealLabel: text('deal_label'),
    dealEndsAt: timestamp('deal_ends_at', { withTimezone: true }), // ⏩ v2
    ratingAvg: numeric('rating_avg', { precision: 2, scale: 1 }),
    ratingCount: integer('rating_count').notNull().default(0), // ⏩ v2
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('packages_destination_status_idx').on(t.destinationId, t.status),
    index('packages_status_featured_idx').on(t.status, t.featured),
    index('packages_themes_gin').using('gin', t.themes),
    check('packages_days_check', sql`${t.days} = ${t.nights} + 1`),
  ],
);

export const itineraryDays = pgTable(
  'itinerary_days',
  {
    id: text('id').primaryKey(),
    packageId: text('package_id')
      .notNull()
      .references(() => packages.id, { onDelete: 'cascade' }),
    dayNo: smallint('day_no').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    mealB: boolean('meal_b').notNull().default(false),
    mealL: boolean('meal_l').notNull().default(false),
    mealD: boolean('meal_d').notNull().default(false),
    stay: text('stay'),
    locationName: text('location_name'),
    lat: numeric('lat', { precision: 9, scale: 6 }),
    lng: numeric('lng', { precision: 9, scale: 6 }), // ⏩ storyboard / map
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('itinerary_days_package_day_uq').on(t.packageId, t.dayNo)],
);

export const departures = pgTable(
  'departures',
  {
    id: text('id').primaryKey(),
    packageId: text('package_id')
      .notNull()
      .references(() => packages.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    seatsTotal: smallint('seats_total').notNull(),
    guaranteed: boolean('guaranteed').notNull().default(false),
    priceDoublePaise: integer('price_double_paise').notNull(),
    priceTriplePaise: integer('price_triple_paise').notNull(),
    priceChildPaise: integer('price_child_paise').notNull(),
    singleSupplementPaise: integer('single_supplement_paise').notNull(),
    whatsappGroupUrl: text('whatsapp_group_url'), // ⏩ add-on C
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('departures_package_date_uq').on(t.packageId, t.date),
    index('departures_date_idx').on(t.date),
  ],
);

/** v1: seats_left = seats_total. v2 replaces this view with the bookings-aware one. */
export const departureAvailability = pgView('departure_availability').as((qb) =>
  qb.select({ departureId: departures.id, seatsLeft: departures.seatsTotal }).from(departures),
);

export const packageImages = pgTable(
  'package_images',
  {
    id: text('id').primaryKey(),
    packageId: text('package_id')
      .notNull()
      .references(() => packages.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    alt: text('alt').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    position: smallint('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('package_images_package_position_idx').on(t.packageId, t.position)],
);

export const testimonials = pgTable(
  'testimonials',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    city: text('city').notNull(),
    text: text('text').notNull(),
    rating: smallint('rating').notNull(),
    packageId: text('package_id').references(() => packages.id, { onDelete: 'set null' }),
    position: smallint('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [check('testimonials_rating_check', sql`${t.rating} between 1 and 5`)],
);

// ---- enquiries (tables now, endpoints in 1.2) ----
export const enquiries = pgTable(
  'enquiries',
  {
    id: text('id').primaryKey(),
    ref: text('ref').notNull().unique(),
    type: enquiryType('type').notNull(),
    packageId: text('package_id').references(() => packages.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email').notNull(),
    travelMonth: date('travel_month'),
    adults: smallint('adults').notNull().default(2),
    children: smallint('children').notNull().default(0),
    message: text('message'),
    preferredDates: text('preferred_dates'),
    budgetPaise: integer('budget_paise'),
    changes: text('changes'),
    preferredTime: text('preferred_time'), // ⏩ callback
    status: enquiryStatus('status').notNull().default('new'),
    emailStatus: emailStatus('email_status').notNull().default('skipped'),
    conversationId: text('conversation_id'), // ⏩ v3 (FK enforced in 0003)
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('enquiries_status_created_idx').on(t.status, t.createdAt),
    index('enquiries_package_idx').on(t.packageId),
    index('enquiries_dedupe_idx').on(t.phone, t.packageId, t.createdAt),
  ],
);

export const enquiryNotes = pgTable('enquiry_notes', {
  id: text('id').primaryKey(),
  enquiryId: text('enquiry_id')
    .notNull()
    .references(() => enquiries.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: createdAt(),
});

// ---- analytics ----
export const packageViews = pgTable(
  'package_views',
  {
    packageId: text('package_id')
      .notNull()
      .references(() => packages.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.packageId, t.day] }), index('package_views_day_idx').on(t.day)],
);
