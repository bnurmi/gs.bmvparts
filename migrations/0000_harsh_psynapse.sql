CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"tier" text DEFAULT 'basic' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"last_used_at" timestamp,
	"request_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_keys_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "backup_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"backup_type" text NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"label" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"storage_key" text,
	"size_bytes" integer,
	"checksum" text,
	"duration_ms" integer,
	"offsite_status" text DEFAULT 'skipped' NOT NULL,
	"offsite_key" text,
	"offsite_error" text,
	"error_message" text,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "bmv_vin_brand_decoder_copy" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand" text NOT NULL,
	"hero" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"intro" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta_title" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"meta_description" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"wmis" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bmv_vin_brand_decoder_copy_brand_unique" UNIQUE("brand")
);
--> statement-breakpoint
CREATE TABLE "bmv_vin_facet_blurb" (
	"id" serial PRIMARY KEY NOT NULL,
	"facet_kind" text NOT NULL,
	"facet_value" text NOT NULL,
	"blurb" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta_title" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"meta_description" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bmv_vin_glossary" (
	"id" serial PRIMARY KEY NOT NULL,
	"term" text NOT NULL,
	"term_set" text,
	"display" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"long_form" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"meta_title" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"meta_description" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"related_terms" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bmv_vin_glossary_term_unique" UNIQUE("term")
);
--> statement-breakpoint
CREATE TABLE "bmv_vin_guide" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"schema_type" text DEFAULT 'Article' NOT NULL,
	"category" text,
	"title" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta_title" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"meta_description" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_slugs" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bmv_vin_guide_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "bmv_vin_home_copy" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text DEFAULT 'default' NOT NULL,
	"hero" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"intro" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta_title" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"meta_description" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bmv_vin_home_copy_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "bmw_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"chassis" text NOT NULL,
	"type_code" text NOT NULL,
	"model_name" text NOT NULL,
	"development_code" text,
	"market" text,
	"body_type" text,
	"engine_displacement" text,
	"engine_power_kw" integer,
	"engine_code" text,
	"image_url" text,
	"source_url" text
);
--> statement-breakpoint
CREATE TABLE "bootstrap_locks" (
	"name" text PRIMARY KEY NOT NULL,
	"acquired_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cars" (
	"id" serial PRIMARY KEY NOT NULL,
	"chassis" text NOT NULL,
	"generation" text NOT NULL,
	"series" text DEFAULT 'M' NOT NULL,
	"body_type" text NOT NULL,
	"model_name" text NOT NULL,
	"display_name" text NOT NULL,
	"engine" text,
	"year_start" integer,
	"year_end" integer,
	"catalog_url" text NOT NULL,
	"catalog_id" text,
	"type_code" text,
	"image_url" text,
	"scrape_status" text DEFAULT 'idle' NOT NULL,
	"scrape_progress" integer DEFAULT 0,
	"total_categories" integer DEFAULT 0,
	"total_subcategories" integer DEFAULT 0,
	"total_parts" integer DEFAULT 0,
	"last_scraped_at" timestamp,
	"scrape_error" text,
	"slug" text,
	"realoem_partgrp_id" text,
	"realoem_skip" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"car_id" integer NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_editorial" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_key" text NOT NULL,
	"subcategory_key" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"blurb" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_catalog_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" integer NOT NULL,
	"brand" text DEFAULT 'BMW' NOT NULL,
	"model_series" text,
	"model" text,
	"part_group" text,
	"subgroup" text,
	"part_number" text NOT NULL,
	"part_number_clean" text NOT NULL,
	"description" text,
	"price" text,
	"currency" text,
	"supersession_part_number" text,
	"supersession_info" text,
	"quantity" integer,
	"diagram_image_path" text,
	"diagram_ref_number" text,
	"compatibility" jsonb,
	"hierarchy_path" text,
	"source_url" text,
	"metadata" jsonb,
	"catalog_last_scraped_at" timestamp,
	"imported_at" timestamp DEFAULT now(),
	CONSTRAINT "external_catalog_parts_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "global_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_editorial" (
	"id" serial PRIMARY KEY NOT NULL,
	"hub_type" text NOT NULL,
	"hub_key" text NOT NULL,
	"blurb" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ista_ecu_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ecu_name" text NOT NULL,
	"brv_code" text NOT NULL,
	"part_number" text NOT NULL,
	"part_number_clean" text,
	"bestell_option" text,
	"ecu_description" text,
	"diag_address" text,
	"ista_version" text DEFAULT '4.59' NOT NULL,
	"imported_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ista_fub_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"ista_id" text NOT NULL,
	"chassis" text NOT NULL,
	"doc_type_code" text,
	"title_en" text,
	"description_en" text,
	"process_type" text,
	"raw_node_id" text,
	"imported_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ista_ingest_locks" (
	"version" text PRIMARY KEY NOT NULL,
	"bucket_key" text NOT NULL,
	"acquired_at" timestamp DEFAULT now() NOT NULL,
	"acquired_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ista_ingest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"bucket_key" text NOT NULL,
	"file_size_bytes" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"trigger" text DEFAULT 'scheduled' NOT NULL,
	"triggered_by" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"duration_ms" integer,
	"ssp_rows" integer DEFAULT 0 NOT NULL,
	"fub_rows" integer DEFAULT 0 NOT NULL,
	"diff" jsonb,
	"failed_step" text,
	"error_message" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ista_ssp_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"ista_id" text NOT NULL,
	"chassis" text NOT NULL,
	"doc_type_code" text,
	"title_en" text,
	"description_en" text,
	"keywords" text,
	"raw_node_id" text,
	"imported_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "language_request_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"day" text NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"destination" text NOT NULL,
	"label" text,
	"part_number" text,
	"source" text,
	"referrer" text,
	"user_agent" text,
	"ip" text,
	"clicked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "paint_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"names" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rgb" text,
	"finish" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_chassis_appearances" (
	"id" serial PRIMARY KEY NOT NULL,
	"part_number_clean" text NOT NULL,
	"chassis" text NOT NULL,
	"chassis_label_raw" text NOT NULL,
	"production_from" text,
	"production_to" text,
	"source_car_id" text NOT NULL,
	"source_part_url" text NOT NULL,
	"harvested_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_cross_references" (
	"id" serial PRIMARY KEY NOT NULL,
	"part_number_clean" text NOT NULL,
	"series_code" text NOT NULL,
	"chassis_code" text,
	"source" text DEFAULT 'realoem' NOT NULL,
	"checked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "part_editorial_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"part_number_clean" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"note" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_pricing" (
	"id" serial PRIMARY KEY NOT NULL,
	"part_number_clean" text NOT NULL,
	"source" text,
	"deal_price" real,
	"msrp" real,
	"savings" real,
	"gbp_price" real,
	"aud_approx" real,
	"currency" text,
	"product_url" text,
	"found" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp DEFAULT now(),
	"eur_list_price" real,
	"eur_net_price" real,
	"eur_vat_percent" real,
	"eur_tier" text,
	"eur_aud_approx" real,
	"eur_source_file" text,
	"eur_updated_at" timestamp,
	CONSTRAINT "part_pricing_part_number_clean_unique" UNIQUE("part_number_clean")
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"subcategory_id" integer NOT NULL,
	"car_id" integer NOT NULL,
	"item_no" text,
	"part_number" text,
	"part_number_clean" text,
	"description" text NOT NULL,
	"additional_info" text,
	"part_date" text,
	"quantity" text,
	"weight" real,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "provisioned_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'gearswap' NOT NULL,
	"source_user_id" integer NOT NULL,
	"account_type" text NOT NULL,
	"user_id" varchar NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"full_name" text,
	"company" text,
	"phone" text,
	"country" text,
	"role" text,
	"tier" text,
	"employer_source_id" integer,
	"store_slug" text,
	"store_name" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "proxy_provider_config" (
	"scraper" text PRIMARY KEY NOT NULL,
	"primary_provider" text NOT NULL,
	"backup_provider" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proxy_usage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"scraper" text NOT NULL,
	"provider" text NOT NULL,
	"role" text NOT NULL,
	"url_hash" text NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"success" boolean NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realoem_audit_findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"audit_run_id" integer NOT NULL,
	"car_id" integer NOT NULL,
	"subcategory_id" integer NOT NULL,
	"realoem_diagram_url" text NOT NULL,
	"realoem_diagram_id" text,
	"realoem_part_count" integer DEFAULT 0 NOT NULL,
	"our_part_count" integer DEFAULT 0 NOT NULL,
	"missing_part_count" integer DEFAULT 0 NOT NULL,
	"missing_parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extra_parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"backfilled_at" timestamp,
	"backfilled_by" varchar,
	"parts_backfilled" integer DEFAULT 0 NOT NULL,
	"dismissed_at" timestamp,
	"dismissed_by" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realoem_chassis_scrape_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"chassis" text NOT NULL,
	"part_type" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_pages" integer DEFAULT 0,
	"completed_pages" integer DEFAULT 0,
	"parts_imported" integer DEFAULT 0,
	"started_at" timestamp DEFAULT now(),
	"finished_at" timestamp,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "realoem_checked_parts" (
	"part_number_clean" text PRIMARY KEY NOT NULL,
	"series_codes" text[],
	"checked_at" timestamp DEFAULT now(),
	"found" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "realoem_diagram_canonical" (
	"id" serial PRIMARY KEY NOT NULL,
	"chassis" text NOT NULL,
	"diag_id" text NOT NULL,
	"realoem_diagram_url" text NOT NULL,
	"realoem_diagram_title" text,
	"parts_payload" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"part_count" integer DEFAULT 0 NOT NULL,
	"content_hash" text NOT NULL,
	"diagram_class" text DEFAULT 'unknown' NOT NULL,
	"source_car_id" integer,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realoem_unmatched_diagrams" (
	"id" serial PRIMARY KEY NOT NULL,
	"car_id" integer NOT NULL,
	"realoem_diagram_url" text NOT NULL,
	"realoem_diagram_id" text,
	"realoem_diagram_title" text,
	"realoem_part_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"discovered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realoem_vehicles" (
	"partgrp_id" text PRIMARY KEY NOT NULL,
	"series" text,
	"model_name" text NOT NULL,
	"type_code" text,
	"body" text,
	"chassis" text NOT NULL,
	"market" text NOT NULL,
	"prod_month" integer,
	"prod_year" integer,
	"prod_range" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "realoem_vin_cache" (
	"vin_last7" varchar(7) PRIMARY KEY NOT NULL,
	"full_vin" text,
	"status" text NOT NULL,
	"chassis" text,
	"part_type" text,
	"series" text,
	"model_name" text,
	"raw_html_path" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sa_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"category" text,
	"names" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicing_coverage_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"chassis" text NOT NULL,
	"engine" text NOT NULL,
	"email" text,
	"vin" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicing_filter_pins" (
	"id" serial PRIMARY KEY NOT NULL,
	"chassis" text NOT NULL,
	"engine" text NOT NULL,
	"filter_key" text NOT NULL,
	"part_number" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'ai_draft' NOT NULL,
	"verified_by" text,
	"verified_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicing_specs" (
	"id" serial PRIMARY KEY NOT NULL,
	"chassis" text NOT NULL,
	"engine" text NOT NULL,
	"fluids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcategories" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"car_id" integer NOT NULL,
	"subcategory_id" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"url" text NOT NULL,
	"diagram_image_url" text
);
--> statement-breakpoint
CREATE TABLE "subcategory_realoem_map" (
	"id" serial PRIMARY KEY NOT NULL,
	"subcategory_id" integer NOT NULL,
	"car_id" integer NOT NULL,
	"realoem_diagram_url" text NOT NULL,
	"realoem_diagram_id" text,
	"confidence" real DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upholstery_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"names" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"material" text,
	"rgb" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_cars" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"vin" text NOT NULL,
	"nickname" text,
	"chassis" text,
	"series" text,
	"model_name" text,
	"model_year" integer,
	"matched_car_id" integer,
	"vin_data" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vin_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"vin" text NOT NULL,
	"source" text,
	"enriched_data" jsonb,
	"catalog_matches" jsonb,
	"decoded_data" jsonb,
	"enrichment_source" jsonb,
	"bimmerwork_hash" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "vin_cache_vin_unique" UNIQUE("vin")
);
--> statement-breakpoint
CREATE TABLE "vin_factory_options" (
	"vin" varchar(17) PRIMARY KEY NOT NULL,
	"sa_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"paint_code" text,
	"upholstery_code" text,
	"production_date" text,
	"source" text DEFAULT 'unknown' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioned_accounts" ADD CONSTRAINT "provisioned_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realoem_audit_findings" ADD CONSTRAINT "realoem_audit_findings_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realoem_audit_findings" ADD CONSTRAINT "realoem_audit_findings_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realoem_unmatched_diagrams" ADD CONSTRAINT "realoem_unmatched_diagrams_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategory_realoem_map" ADD CONSTRAINT "subcategory_realoem_map_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategory_realoem_map" ADD CONSTRAINT "subcategory_realoem_map_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cars" ADD CONSTRAINT "user_cars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cars" ADD CONSTRAINT "user_cars_matched_car_id_cars_id_fk" FOREIGN KEY ("matched_car_id") REFERENCES "public"."cars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backup_logs_created_at_idx" ON "backup_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "backup_logs_type_status_idx" ON "backup_logs" USING btree ("backup_type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "bmv_vin_facet_blurb_unique_idx" ON "bmv_vin_facet_blurb" USING btree ("facet_kind","facet_value");--> statement-breakpoint
CREATE INDEX "category_editorial_key_idx" ON "category_editorial" USING btree ("category_key","subcategory_key","locale");--> statement-breakpoint
CREATE INDEX "hub_editorial_key_idx" ON "hub_editorial" USING btree ("hub_type","hub_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ista_ecu_parts_unique_idx" ON "ista_ecu_parts" USING btree ("ecu_name","part_number","brv_code");--> statement-breakpoint
CREATE INDEX "ista_ecu_parts_ecu_idx" ON "ista_ecu_parts" USING btree ("ecu_name");--> statement-breakpoint
CREATE INDEX "ista_ecu_parts_part_idx" ON "ista_ecu_parts" USING btree ("part_number_clean");--> statement-breakpoint
CREATE INDEX "ista_ecu_parts_brv_idx" ON "ista_ecu_parts" USING btree ("brv_code");--> statement-breakpoint
CREATE UNIQUE INDEX "ista_fub_records_unique_idx" ON "ista_fub_records" USING btree ("version","ista_id","chassis");--> statement-breakpoint
CREATE INDEX "ista_fub_records_version_idx" ON "ista_fub_records" USING btree ("version");--> statement-breakpoint
CREATE INDEX "ista_fub_records_chassis_idx" ON "ista_fub_records" USING btree ("chassis");--> statement-breakpoint
CREATE INDEX "ista_fub_records_ista_id_idx" ON "ista_fub_records" USING btree ("ista_id");--> statement-breakpoint
CREATE INDEX "ista_ingest_runs_version_idx" ON "ista_ingest_runs" USING btree ("version");--> statement-breakpoint
CREATE INDEX "ista_ingest_runs_created_at_idx" ON "ista_ingest_runs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ista_ssp_records_unique_idx" ON "ista_ssp_records" USING btree ("version","ista_id","chassis");--> statement-breakpoint
CREATE INDEX "ista_ssp_records_version_idx" ON "ista_ssp_records" USING btree ("version");--> statement-breakpoint
CREATE INDEX "ista_ssp_records_chassis_idx" ON "ista_ssp_records" USING btree ("chassis");--> statement-breakpoint
CREATE INDEX "ista_ssp_records_ista_id_idx" ON "ista_ssp_records" USING btree ("ista_id");--> statement-breakpoint
CREATE INDEX "language_request_stats_locale_day_idx" ON "language_request_stats" USING btree ("locale","day");--> statement-breakpoint
CREATE UNIQUE INDEX "part_chassis_appearances_unique_idx" ON "part_chassis_appearances" USING btree ("part_number_clean","chassis");--> statement-breakpoint
CREATE INDEX "part_chassis_appearances_part_idx" ON "part_chassis_appearances" USING btree ("part_number_clean");--> statement-breakpoint
CREATE INDEX "part_chassis_appearances_chassis_idx" ON "part_chassis_appearances" USING btree ("chassis");--> statement-breakpoint
CREATE INDEX "part_editorial_notes_pn_locale_idx" ON "part_editorial_notes" USING btree ("part_number_clean","locale");--> statement-breakpoint
CREATE INDEX "idx_parts_car_id" ON "parts" USING btree ("car_id");--> statement-breakpoint
CREATE INDEX "idx_parts_subcategory_id" ON "parts" USING btree ("subcategory_id");--> statement-breakpoint
CREATE INDEX "idx_parts_part_number_clean" ON "parts" USING btree ("part_number_clean");--> statement-breakpoint
CREATE INDEX "idx_parts_part_number" ON "parts" USING btree ("part_number");--> statement-breakpoint
CREATE INDEX "idx_parts_description_trgm" ON "parts" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_parts_part_number_trgm" ON "parts" USING gin ("part_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_parts_part_number_clean_trgm" ON "parts" USING gin ("part_number_clean" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expires_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "proxy_usage_logs_scraper_created_idx" ON "proxy_usage_logs" USING btree ("scraper","created_at");--> statement-breakpoint
CREATE INDEX "proxy_usage_logs_created_idx" ON "proxy_usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "proxy_usage_logs_provider_idx" ON "proxy_usage_logs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "realoem_audit_findings_run_idx" ON "realoem_audit_findings" USING btree ("audit_run_id");--> statement-breakpoint
CREATE INDEX "realoem_audit_findings_car_idx" ON "realoem_audit_findings" USING btree ("car_id");--> statement-breakpoint
CREATE INDEX "realoem_audit_findings_status_idx" ON "realoem_audit_findings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_realoem_jobs_chassis" ON "realoem_chassis_scrape_jobs" USING btree ("chassis");--> statement-breakpoint
CREATE INDEX "idx_realoem_jobs_status" ON "realoem_chassis_scrape_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "realoem_diagram_canonical_chassis_idx" ON "realoem_diagram_canonical" USING btree ("chassis");--> statement-breakpoint
CREATE INDEX "realoem_unmatched_car_idx" ON "realoem_unmatched_diagrams" USING btree ("car_id");--> statement-breakpoint
CREATE INDEX "idx_realoem_vehicles_chassis" ON "realoem_vehicles" USING btree ("chassis");--> statement-breakpoint
CREATE INDEX "idx_realoem_vehicles_type_code" ON "realoem_vehicles" USING btree ("type_code");--> statement-breakpoint
CREATE INDEX "idx_realoem_vehicles_chassis_year" ON "realoem_vehicles" USING btree ("chassis","prod_year");--> statement-breakpoint
CREATE INDEX "idx_realoem_vin_cache_chassis" ON "realoem_vin_cache" USING btree ("chassis");--> statement-breakpoint
CREATE INDEX "idx_realoem_vin_cache_fetched_at" ON "realoem_vin_cache" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "servicing_coverage_requests_created_idx" ON "servicing_coverage_requests" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "servicing_filter_pins_unique_idx" ON "servicing_filter_pins" USING btree ("chassis","engine","filter_key");--> statement-breakpoint
CREATE UNIQUE INDEX "servicing_specs_chassis_engine_unique_idx" ON "servicing_specs" USING btree ("chassis","engine");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "session" USING btree ("expire");--> statement-breakpoint
CREATE UNIQUE INDEX "subcategory_realoem_map_subcategory_unique_idx" ON "subcategory_realoem_map" USING btree ("subcategory_id");--> statement-breakpoint
CREATE INDEX "subcategory_realoem_map_car_idx" ON "subcategory_realoem_map" USING btree ("car_id");