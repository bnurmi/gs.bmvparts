CREATE TABLE "seo_content_clusters" (
	"id" serial PRIMARY KEY NOT NULL,
	"cluster_name" text NOT NULL,
	"hub_url" text NOT NULL,
	"spoke_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seo_content_clusters_hub_url_key" UNIQUE("hub_url")
);
--> statement-breakpoint
DROP INDEX "idx_parts_description_trgm";--> statement-breakpoint
DROP INDEX "idx_parts_part_number_trgm";--> statement-breakpoint
DROP INDEX "idx_parts_part_number_clean_trgm";--> statement-breakpoint
ALTER TABLE "bmv_vin_brand_decoder_copy" ALTER COLUMN "wmis" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "bmv_vin_glossary" ALTER COLUMN "related_terms" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "bmv_vin_guide" ALTER COLUMN "related_slugs" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "vin_factory_options" ALTER COLUMN "sa_codes" SET DEFAULT '{}';