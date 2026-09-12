CREATE TYPE "public"."email_status" AS ENUM('sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."enquiry_status" AS ENUM('new', 'contacted', 'converted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."enquiry_type" AS ENUM('standard', 'custom', 'contact', 'callback', 'group', 'chat-handoff');--> statement-breakpoint
CREATE TYPE "public"."occupancy" AS ENUM('double', 'triple', 'single', 'child');--> statement-breakpoint
CREATE TYPE "public"."package_status" AS ENUM('draft', 'live');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('beach', 'hills', 'honeymoon', 'family', 'adventure', 'heritage');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'customer');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departures" (
	"id" text PRIMARY KEY NOT NULL,
	"package_id" text NOT NULL,
	"date" date NOT NULL,
	"seats_total" smallint NOT NULL,
	"guaranteed" boolean DEFAULT false NOT NULL,
	"price_double_paise" integer NOT NULL,
	"price_triple_paise" integer NOT NULL,
	"price_child_paise" integer NOT NULL,
	"single_supplement_paise" integer NOT NULL,
	"whatsapp_group_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destinations" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text NOT NULL,
	"intro" text NOT NULL,
	"cover_url" text,
	"region" text NOT NULL,
	"best_months" smallint[] NOT NULL,
	"climate" jsonb,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destinations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"type" "enquiry_type" NOT NULL,
	"package_id" text,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"travel_month" date,
	"adults" smallint DEFAULT 2 NOT NULL,
	"children" smallint DEFAULT 0 NOT NULL,
	"message" text,
	"preferred_dates" text,
	"budget_paise" integer,
	"changes" text,
	"preferred_time" text,
	"status" "enquiry_status" DEFAULT 'new' NOT NULL,
	"email_status" "email_status" DEFAULT 'skipped' NOT NULL,
	"conversation_id" text,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enquiries_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "enquiry_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"enquiry_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itinerary_days" (
	"id" text PRIMARY KEY NOT NULL,
	"package_id" text NOT NULL,
	"day_no" smallint NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"meal_b" boolean DEFAULT false NOT NULL,
	"meal_l" boolean DEFAULT false NOT NULL,
	"meal_d" boolean DEFAULT false NOT NULL,
	"stay" text,
	"location_name" text,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_images" (
	"id" text PRIMARY KEY NOT NULL,
	"package_id" text NOT NULL,
	"url" text NOT NULL,
	"alt" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_views" (
	"package_id" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "package_views_package_id_day_pk" PRIMARY KEY("package_id","day")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"destination_id" text NOT NULL,
	"name" text NOT NULL,
	"summary" text NOT NULL,
	"themes" "theme"[] NOT NULL,
	"nights" smallint NOT NULL,
	"days" smallint NOT NULL,
	"departure_city" text DEFAULT 'Ex-Mumbai' NOT NULL,
	"highlights" text[] NOT NULL,
	"inclusions" text[] NOT NULL,
	"exclusions" text[] NOT NULL,
	"hotels" jsonb NOT NULL,
	"faq" jsonb NOT NULL,
	"cover_image_id" text,
	"status" "package_status" DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"starting_price_paise" integer,
	"deal_price_paise" integer,
	"deal_label" text,
	"deal_ends_at" timestamp with time zone,
	"rating_avg" numeric(2, 1),
	"rating_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packages_slug_unique" UNIQUE("slug"),
	CONSTRAINT "packages_days_check" CHECK ("packages"."days" = "packages"."nights" + 1)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"text" text NOT NULL,
	"rating" smallint NOT NULL,
	"package_id" text,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "testimonials_rating_check" CHECK ("testimonials"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departures" ADD CONSTRAINT "departures_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiry_notes" ADD CONSTRAINT "enquiry_notes_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_images" ADD CONSTRAINT "package_images_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_views" ADD CONSTRAINT "package_views_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_cover_image_id_package_images_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."package_images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "departures_package_date_uq" ON "departures" USING btree ("package_id","date");--> statement-breakpoint
CREATE INDEX "departures_date_idx" ON "departures" USING btree ("date");--> statement-breakpoint
CREATE INDEX "enquiries_status_created_idx" ON "enquiries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "enquiries_package_idx" ON "enquiries" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "enquiries_dedupe_idx" ON "enquiries" USING btree ("phone","package_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "itinerary_days_package_day_uq" ON "itinerary_days" USING btree ("package_id","day_no");--> statement-breakpoint
CREATE INDEX "package_images_package_position_idx" ON "package_images" USING btree ("package_id","position");--> statement-breakpoint
CREATE INDEX "package_views_day_idx" ON "package_views" USING btree ("day");--> statement-breakpoint
CREATE INDEX "packages_destination_status_idx" ON "packages" USING btree ("destination_id","status");--> statement-breakpoint
CREATE INDEX "packages_status_featured_idx" ON "packages" USING btree ("status","featured");--> statement-breakpoint
CREATE INDEX "packages_themes_gin" ON "packages" USING gin ("themes");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE VIEW "public"."departure_availability" AS (select "id", "seats_total" from "departures");