CREATE TABLE "ai_faq_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_type" text NOT NULL,
	"page_key" text NOT NULL,
	"locale" text NOT NULL,
	"faq_items" jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_ref" text NOT NULL,
	"user_id" varchar NOT NULL,
	"vin" text,
	"vehicle" text NOT NULL,
	"photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_analysis_json" jsonb,
	"quote_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_bmw_new" real DEFAULT 0 NOT NULL,
	"total_our_price" real DEFAULT 0 NOT NULL,
	"total_saving" real DEFAULT 0 NOT NULL,
	"csv_url" text,
	"customer_name" text,
	"customer_email" text,
	"customer_phone" text,
	"customer_postcode" text,
	"vehicle_year" text,
	"vehicle_colour" text,
	"mperformance_ref" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "photo_quotes_quote_ref_unique" UNIQUE("quote_ref")
);
--> statement-breakpoint
CREATE TABLE "seo_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"token_label" text,
	"action" text NOT NULL,
	"content_type" text,
	"target_id" integer,
	"target_slug" text,
	"target_url" text,
	"summary" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "seo_content_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"project" text DEFAULT 'bmv.vin' NOT NULL,
	"url" text NOT NULL,
	"page_type" text NOT NULL,
	"primary_keyword" text,
	"word_count" integer,
	"indexed" boolean DEFAULT false NOT NULL,
	"content_ref" text,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"last_refreshed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "seo_keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"project" text DEFAULT 'bmv.vin' NOT NULL,
	"keyword" text NOT NULL,
	"intent" text NOT NULL,
	"estimated_volume" integer,
	"difficulty" integer,
	"cpc" real,
	"priority" integer DEFAULT 1 NOT NULL,
	"page_targeting" text,
	"cluster_id" text,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_publisher_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"content_type" text DEFAULT 'page' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"meta_description" text,
	"canonical_url" text,
	"h1" text,
	"body_html" text,
	"excerpt" text,
	"schema_json" jsonb,
	"internal_links" jsonb,
	"featured_image_url" text,
	"og_title" text,
	"og_description" text,
	"og_image_url" text,
	"category" text,
	"tags" text[],
	"source" text DEFAULT 'roman-hermes' NOT NULL,
	"author" text,
	"domain" text DEFAULT 'bmv.parts' NOT NULL,
	"published_at" timestamp,
	"archived_at" timestamp,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_refresh_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"due_at" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"completed_at" timestamp,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "vin_backfill_daily_counts" (
	"utc_date" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vin_enrichment_queue" (
	"vin" varchar(17) PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempted_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bmv_vin_brand_decoder_copy" DROP CONSTRAINT "bmv_vin_brand_decoder_copy_brand_unique";--> statement-breakpoint
ALTER TABLE "bmv_vin_glossary" DROP CONSTRAINT "bmv_vin_glossary_term_unique";--> statement-breakpoint
ALTER TABLE "bmv_vin_guide" DROP CONSTRAINT "bmv_vin_guide_slug_unique";--> statement-breakpoint
ALTER TABLE "bmv_vin_home_copy" DROP CONSTRAINT "bmv_vin_home_copy_key_unique";--> statement-breakpoint
ALTER TABLE "external_catalog_parts" DROP CONSTRAINT "external_catalog_parts_external_id_unique";--> statement-breakpoint
ALTER TABLE "part_pricing" DROP CONSTRAINT "part_pricing_part_number_clean_unique";--> statement-breakpoint
ALTER TABLE "vin_cache" DROP CONSTRAINT "vin_cache_vin_unique";--> statement-breakpoint
ALTER TABLE "photo_quotes" ADD CONSTRAINT "photo_quotes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_refresh_queue" ADD CONSTRAINT "seo_refresh_queue_page_id_seo_content_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."seo_content_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_faq_cache_unique_idx" ON "ai_faq_cache" USING btree ("page_type","page_key","locale");--> statement-breakpoint
CREATE INDEX "ai_faq_cache_page_type_idx" ON "ai_faq_cache" USING btree ("page_type");--> statement-breakpoint
CREATE INDEX "ai_faq_cache_page_key_idx" ON "ai_faq_cache" USING btree ("page_key");--> statement-breakpoint
CREATE INDEX "ai_usage_logs_created_at_idx" ON "ai_usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_logs_feature_idx" ON "ai_usage_logs" USING btree ("feature");--> statement-breakpoint
CREATE INDEX "photo_quotes_user_idx" ON "photo_quotes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_quotes_ref_idx" ON "photo_quotes" USING btree ("quote_ref");--> statement-breakpoint
CREATE INDEX "seo_audit_log_timestamp_idx" ON "seo_audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "seo_audit_log_actor_idx" ON "seo_audit_log" USING btree ("actor");--> statement-breakpoint
CREATE INDEX "seo_audit_log_target_idx" ON "seo_audit_log" USING btree ("target_slug");--> statement-breakpoint
CREATE INDEX "seo_content_pages_project_idx" ON "seo_content_pages" USING btree ("project");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_content_pages_url_unique_idx" ON "seo_content_pages" USING btree ("url","project");--> statement-breakpoint
CREATE INDEX "seo_content_pages_type_idx" ON "seo_content_pages" USING btree ("page_type");--> statement-breakpoint
CREATE INDEX "seo_keywords_project_idx" ON "seo_keywords" USING btree ("project");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_keywords_keyword_project_unique_idx" ON "seo_keywords" USING btree ("keyword","project");--> statement-breakpoint
CREATE INDEX "seo_keywords_intent_idx" ON "seo_keywords" USING btree ("intent");--> statement-breakpoint
CREATE INDEX "seo_keywords_priority_idx" ON "seo_keywords" USING btree ("priority");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_publisher_pages_slug_domain_unique" ON "seo_publisher_pages" USING btree ("slug","domain");--> statement-breakpoint
CREATE INDEX "seo_publisher_pages_status_idx" ON "seo_publisher_pages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "seo_publisher_pages_source_idx" ON "seo_publisher_pages" USING btree ("source");--> statement-breakpoint
CREATE INDEX "seo_publisher_pages_domain_idx" ON "seo_publisher_pages" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "seo_refresh_queue_status_idx" ON "seo_refresh_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "seo_refresh_queue_due_idx" ON "seo_refresh_queue" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "vin_enrichment_queue_status_idx" ON "vin_enrichment_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vin_enrichment_queue_status_created_idx" ON "vin_enrichment_queue" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "bmv_vin_brand_decoder_copy" ADD CONSTRAINT "bmv_vin_brand_decoder_copy_brand_key" UNIQUE("brand");--> statement-breakpoint
ALTER TABLE "bmv_vin_glossary" ADD CONSTRAINT "bmv_vin_glossary_term_key" UNIQUE("term");--> statement-breakpoint
ALTER TABLE "bmv_vin_guide" ADD CONSTRAINT "bmv_vin_guide_slug_key" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "bmv_vin_home_copy" ADD CONSTRAINT "bmv_vin_home_copy_key_key" UNIQUE("key");--> statement-breakpoint
ALTER TABLE "external_catalog_parts" ADD CONSTRAINT "external_catalog_parts_external_id_key" UNIQUE("external_id");--> statement-breakpoint
ALTER TABLE "part_pricing" ADD CONSTRAINT "part_pricing_part_number_clean_key" UNIQUE("part_number_clean");--> statement-breakpoint
ALTER TABLE "vin_cache" ADD CONSTRAINT "vin_cache_vin_key" UNIQUE("vin");