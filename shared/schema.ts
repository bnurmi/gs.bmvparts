import { pgTable, text, integer, boolean, timestamp, real, serial, varchar, jsonb, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const cars = pgTable("cars", {
  id: serial("id").primaryKey(),
  chassis: text("chassis").notNull(),
  generation: text("generation").notNull(),
  series: text("series").notNull().default("M"),
  bodyType: text("body_type").notNull(),
  modelName: text("model_name").notNull(),
  displayName: text("display_name").notNull(),
  engine: text("engine"),
  yearStart: integer("year_start"),
  yearEnd: integer("year_end"),
  catalogUrl: text("catalog_url").notNull(),
  catalogId: text("catalog_id"),
  typeCode: text("type_code"),
  imageUrl: text("image_url"),
  scrapeStatus: text("scrape_status").notNull().default("idle"),
  scrapeProgress: integer("scrape_progress").default(0),
  totalCategories: integer("total_categories").default(0),
  totalSubcategories: integer("total_subcategories").default(0),
  totalParts: integer("total_parts").default(0),
  lastScrapedAt: timestamp("last_scraped_at"),
  scrapeError: text("scrape_error"),
  slug: text("slug"),
  // RealOEM partgrp id (canonical chassis-landing key, e.g.
  // `CW82-EUR-11-2019-G07-BMW-X7_30dX`). Resolved by matching this car
  // against `realoem_vehicles` (the crawled /bmw/enUS/vehicles index).
  // When set, `resolveRealoemTarget` builds a `/bmw/enUS/partgrp?id=…`
  // landing URL — the only URL shape RealOEM actually serves catalog
  // content for. Null means we couldn't match the car (the abort guard
  // in realoem-backfill.ts will catch any wholesale failure that
  // results from leaving these unmatched).
  realoemPartgrpId: text("realoem_partgrp_id"),
  // When the chain backfill aborts a chassis due to EMPTY_LANDING_ABORT_THRESHOLD
  // (5 consecutive empty cars), all cars for that chassis are flagged here so
  // subsequent chain passes skip them without wasting proxy budget.
  realoemSkip: boolean("realoem_skip").notNull().default(false),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  carId: integer("car_id").notNull().references(() => cars.id, { onDelete: "cascade" }),
  categoryId: text("category_id").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  url: text("url").notNull(),
});

export const subcategories = pgTable("subcategories", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  carId: integer("car_id").notNull().references(() => cars.id, { onDelete: "cascade" }),
  subcategoryId: text("subcategory_id").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  url: text("url").notNull(),
  diagramImageUrl: text("diagram_image_url"),
});

export const parts = pgTable("parts", {
  id: serial("id").primaryKey(),
  subcategoryId: integer("subcategory_id").notNull().references(() => subcategories.id, { onDelete: "cascade" }),
  carId: integer("car_id").notNull().references(() => cars.id, { onDelete: "cascade" }),
  itemNo: text("item_no"),
  partNumber: text("part_number"),
  partNumberClean: text("part_number_clean"),
  description: text("description").notNull(),
  additionalInfo: text("additional_info"),
  partDate: text("part_date"),
  quantity: text("quantity"),
  weight: real("weight"),
  notes: text("notes"),
}, (t) => ({
  // Btree indexes for foreign-key lookups (already exist on prod; declared
  // here so drizzle diffs stay clean).
  carIdIdx: index("idx_parts_car_id").on(t.carId),
  subcategoryIdIdx: index("idx_parts_subcategory_id").on(t.subcategoryId),
  // Btree indexes for exact-match cross-reference and prefix lookups.
  partNumberCleanIdx: index("idx_parts_part_number_clean").on(t.partNumberClean),
  partNumberIdx: index("idx_parts_part_number").on(t.partNumber),
  // GIN trigram indexes for fast ILIKE '%q%' searches are managed by
  // server/index.ts startup DDL (CONCURRENTLY to avoid table locks).
  // NOT declared here — drizzle-kit cannot round-trip gin_trgm_ops
  // expressions correctly and would always emit DROP+CREATE prompts.
}));

export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").unique(),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  tier: text("tier").notNull().default("basic"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
  requestCount: integer("request_count").notNull().default(0),
});

export const bmwModels = pgTable("bmw_models", {
  id: serial("id").primaryKey(),
  chassis: text("chassis").notNull(),
  typeCode: text("type_code").notNull(),
  modelName: text("model_name").notNull(),
  developmentCode: text("development_code"),
  market: text("market"),
  bodyType: text("body_type"),
  engineDisplacement: text("engine_displacement"),
  enginePowerKw: integer("engine_power_kw"),
  engineCode: text("engine_code"),
  imageUrl: text("image_url"),
  sourceUrl: text("source_url"),
});

export const userCars = pgTable("user_cars", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vin: text("vin").notNull(),
  nickname: text("nickname"),
  chassis: text("chassis"),
  series: text("series"),
  modelName: text("model_name"),
  modelYear: integer("model_year"),
  matchedCarId: integer("matched_car_id").references(() => cars.id),
  vinData: jsonb("vin_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const vinCache = pgTable("vin_cache", {
  id: serial("id").primaryKey(),
  vin: text("vin").notNull().unique('vin_cache_vin_key'),
  source: text("source"),
  enrichedData: jsonb("enriched_data"),
  catalogMatches: jsonb("catalog_matches"),
  decodedData: jsonb("decoded_data"),
  // Per-tab provenance for the four data flows that populate the VIN
  // decoder UI (vehicle, options, images, manuals). Shape:
  //   { vehicle?: { source, fetchedAt }, options?: ..., images?: ..., manuals?: ... }
  // `source` is "etk" | "bmw_configurator" | "bmw_manuals" | "bimmerwork"
  // | "mdecoder" | "vindecoderz" | "none". Exposed in /api/vin/debug so we
  // can monitor how often the bimmer.work fallback still fires.
  enrichmentSource: jsonb("enrichment_source"),
  // Cached bimmer.work hash for this VIN so future lookups skip discovery.
  // Populated by the bulk-discover job and the per-VIN on-demand scraper.
  bimmerworkHash: text("bimmerwork_hash"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Per-tab enrichment source ("etk" first-party = good, "bimmerwork" fallback
// = we still depend on the third-party scrape).
export const ENRICHMENT_TAB_SOURCES = [
  "etk",
  "bmw_configurator",
  "bmw_manuals",
  "bimmerwork",
  "mdecoder",
  "vindecoderz",
  "none",
] as const;
export type EnrichmentTabSource = typeof ENRICHMENT_TAB_SOURCES[number];

export interface EnrichmentSourceInfo {
  source: EnrichmentTabSource;
  fetchedAt: string;
}

export interface EnrichmentSourceMap {
  vehicle?: EnrichmentSourceInfo;
  options?: EnrichmentSourceInfo;
  images?: EnrichmentSourceInfo;
  manuals?: EnrichmentSourceInfo;
}

// Per-VIN data-coverage block returned alongside every enrichment
// response (Task #83). Tells the UI/admin whether this VIN was
// gated to first-party-only by the ETK-coverage rule, and which
// per-VIN factory-order pieces are genuinely missing from the
// dataset (so the UI can render an honest "not in our dataset"
// state instead of pretending we tried to scrape).
export type EnrichmentCoverageMissing = "options" | "paint" | "upholstery" | "productionDate";
export interface EnrichmentCoverage {
  etkCovered: boolean;
  firstPartyOnly: boolean;
  missing: EnrichmentCoverageMissing[];
  importPaths?: string[];
}

export const insertVinCacheSchema = createInsertSchema(vinCache).omit({ id: true, createdAt: true, updatedAt: true });
export type VinCache = typeof vinCache.$inferSelect;
export type InsertVinCache = z.infer<typeof insertVinCacheSchema>;

// RealOEM fallback cache. Keyed by VIN last-7 because RealOEM's vinlookup
// uses last-7 internally so two VINs sharing the same last-7 share the same
// chassis result. status:
//   - "confirmed"      RealOEM resolved a chassis
//   - "vin_not_found"  RealOEM rejected the VIN (negative cache, 30-day TTL)
//   - "fetch_error"    Oxylabs/network failure (short TTL, retryable)
export const realoemVinCache = pgTable("realoem_vin_cache", {
  vinLast7: varchar("vin_last7", { length: 7 }).primaryKey(),
  fullVin: text("full_vin"),
  status: text("status").notNull(),
  chassis: text("chassis"),
  partType: text("part_type"),
  series: text("series"),
  modelName: text("model_name"),
  rawHtmlPath: text("raw_html_path"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
}, (t) => ({
  byChassis: index("idx_realoem_vin_cache_chassis").on(t.chassis),
  byFetchedAt: index("idx_realoem_vin_cache_fetched_at").on(t.fetchedAt),
}));

export const insertRealoemVinCacheSchema = createInsertSchema(realoemVinCache).omit({ fetchedAt: true });
export type RealoemVinCache = typeof realoemVinCache.$inferSelect;
export type InsertRealoemVinCache = z.infer<typeof insertRealoemVinCacheSchema>;

// Crawled snapshot of RealOEM's /bmw/enUS/vehicles index. Each row is
// one (chassis × model × market × production-month) variant exposed by
// RealOEM, keyed by their internal partgrp id. This table is the source
// of truth for the partgrp ids we need to build correct chassis-landing
// URLs (`/bmw/enUS/partgrp?id=<partgrpId>`); without it we can't reach
// any catalog content because RealOEM's slug-based URLs silently serve
// the welcome page. Crawled by `scripts/crawl-realoem-vehicles.ts` and
// consumed by `scripts/match-cars-to-partgrp.ts` to populate
// `cars.realoem_partgrp_id`.
export const realoemVehicles = pgTable("realoem_vehicles", {
  partgrpId: text("partgrp_id").primaryKey(), // CW82-EUR-11-2019-G07-BMW-X7_30dX
  series: text("series"),                     // "5' G30"
  modelName: text("model_name").notNull(),    // "BMW 540iX"
  typeCode: text("type_code"),                // "CW82"
  body: text("body"),                         // "Sedan"
  chassis: text("chassis").notNull(),         // "G07" (segment 5)
  market: text("market").notNull(),           // "EUR" / "USA" (segment 2)
  prodMonth: integer("prod_month"),           // 1..12 (segment 3)
  prodYear: integer("prod_year"),             // 2019 (segment 4)
  prodRange: text("prod_range"),              // raw "11/2019–06/2024"
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
}, (t) => ({
  byChassis: index("idx_realoem_vehicles_chassis").on(t.chassis),
  byTypeCode: index("idx_realoem_vehicles_type_code").on(t.typeCode),
  byChassisYear: index("idx_realoem_vehicles_chassis_year").on(t.chassis, t.prodYear),
}));

export const insertRealoemVehicleSchema = createInsertSchema(realoemVehicles).omit({ fetchedAt: true });
export type RealoemVehicle = typeof realoemVehicles.$inferSelect;
export type InsertRealoemVehicle = z.infer<typeof insertRealoemVehicleSchema>;

// Tier 2 background scrape jobs (admin-triggered per chassis)
export const realoemChassisScrapeJobs = pgTable("realoem_chassis_scrape_jobs", {
  id: serial("id").primaryKey(),
  chassis: text("chassis").notNull(),
  partType: text("part_type"),
  status: text("status").notNull().default("pending"),
  totalPages: integer("total_pages").default(0),
  completedPages: integer("completed_pages").default(0),
  partsImported: integer("parts_imported").default(0),
  startedAt: timestamp("started_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
  error: text("error"),
}, (t) => ({
  byChassis: index("idx_realoem_jobs_chassis").on(t.chassis),
  byStatus: index("idx_realoem_jobs_status").on(t.status),
}));

export type RealoemChassisScrapeJob = typeof realoemChassisScrapeJobs.$inferSelect;

export const externalCatalogParts = pgTable("external_catalog_parts", {
  id: serial("id").primaryKey(),
  externalId: integer("external_id").notNull().unique('external_catalog_parts_external_id_key'),
  brand: text("brand").notNull().default("BMW"),
  modelSeries: text("model_series"),
  model: text("model"),
  partGroup: text("part_group"),
  subgroup: text("subgroup"),
  partNumber: text("part_number").notNull(),
  partNumberClean: text("part_number_clean").notNull(),
  description: text("description"),
  price: text("price"),
  currency: text("currency"),
  supersessionPartNumber: text("supersession_part_number"),
  supersessionInfo: text("supersession_info"),
  quantity: integer("quantity"),
  diagramImagePath: text("diagram_image_path"),
  diagramRefNumber: text("diagram_ref_number"),
  compatibility: jsonb("compatibility"),
  hierarchyPath: text("hierarchy_path"),
  sourceUrl: text("source_url"),
  metadata: jsonb("metadata"),
  catalogLastScrapedAt: timestamp("catalog_last_scraped_at"),
  importedAt: timestamp("imported_at").defaultNow(),
});

export const insertExternalCatalogPartSchema = createInsertSchema(externalCatalogParts).omit({ id: true, importedAt: true });
export type ExternalCatalogPart = typeof externalCatalogParts.$inferSelect;
export type InsertExternalCatalogPart = z.infer<typeof insertExternalCatalogPartSchema>;

export const partPricing = pgTable("part_pricing", {
  id: serial("id").primaryKey(),
  partNumberClean: text("part_number_clean").notNull().unique('part_pricing_part_number_clean_key'),
  source: text("source"),
  dealPrice: real("deal_price"),
  msrp: real("msrp"),
  savings: real("savings"),
  gbpPrice: real("gbp_price"),
  audApprox: real("aud_approx"),
  currency: text("currency"),
  productUrl: text("product_url"),
  found: boolean("found").notNull().default(false),
  lastCheckedAt: timestamp("last_checked_at").defaultNow(),
  // BMW Europe ETK dealer pricing (etkpr*.zip imports)
  eurListPrice: real("eur_list_price"),
  eurNetPrice: real("eur_net_price"),
  eurVatPercent: real("eur_vat_percent"),
  eurTier: text("eur_tier"),
  eurAudApprox: real("eur_aud_approx"),
  eurSourceFile: text("eur_source_file"),
  eurUpdatedAt: timestamp("eur_updated_at"),
});

export const partCrossReferences = pgTable("part_cross_references", {
  id: serial("id").primaryKey(),
  partNumberClean: text("part_number_clean").notNull(),
  seriesCode: text("series_code").notNull(),
  chassisCode: text("chassis_code"),
  source: text("source").notNull().default("realoem"),
  checkedAt: timestamp("checked_at").defaultNow(),
});

export const insertPartCrossRefSchema = createInsertSchema(partCrossReferences).omit({ id: true, checkedAt: true });
export type PartCrossReference = typeof partCrossReferences.$inferSelect;
export type InsertPartCrossRef = z.infer<typeof insertPartCrossRefSchema>;

// Task #105 — RealOEM per-part-page cross-reference harvest.
// Each row records "this part number was rendered as appearing on this
// chassis (with these production dates) on a RealOEM
// `/bmw/enUS/part?id=…&q=…` page we harvested." We keep both the raw
// chassis label as displayed by RealOEM (e.g. "3' E90 LCI",
// "6' F06 Gran Coupé LCI", "X1 E84") and the normalized chassis token
// (e.g. "E90LCI", "F06LCI", "E84") so downstream queries can iterate on
// the normalizer without re-harvesting. Production dates are stored as
// the raw "MM/YYYY" strings RealOEM renders so we don't lose fidelity
// when the page leaves a range open ("ongoing"). Sized for the chassis
// coverage / gap-fill use case in Task #105 — the supersession lineage
// belongs in `partCrossReferences`.
export const partChassisAppearances = pgTable("part_chassis_appearances", {
  id: serial("id").primaryKey(),
  partNumberClean: text("part_number_clean").notNull(),
  chassis: text("chassis").notNull(),
  chassisLabelRaw: text("chassis_label_raw").notNull(),
  productionFrom: text("production_from"),
  productionTo: text("production_to"),
  sourceCarId: text("source_car_id").notNull(),
  sourcePartUrl: text("source_part_url").notNull(),
  harvestedAt: timestamp("harvested_at").defaultNow().notNull(),
}, (t) => ({
  uniquePartChassis: uniqueIndex("part_chassis_appearances_unique_idx").on(t.partNumberClean, t.chassis),
  byPart: index("part_chassis_appearances_part_idx").on(t.partNumberClean),
  byChassis: index("part_chassis_appearances_chassis_idx").on(t.chassis),
}));

export const insertPartChassisAppearanceSchema = createInsertSchema(partChassisAppearances).omit({ id: true, harvestedAt: true });
export type PartChassisAppearance = typeof partChassisAppearances.$inferSelect;
export type InsertPartChassisAppearance = z.infer<typeof insertPartChassisAppearanceSchema>;

export const insertUserCarSchema = createInsertSchema(userCars).omit({ id: true, createdAt: true });
export type UserCar = typeof userCars.$inferSelect;
export type InsertUserCar = z.infer<typeof insertUserCarSchema>;

export const backgroundJobs = pgTable("background_jobs", {
  id: serial("id").primaryKey(),
  jobType: text("job_type").notNull(),
  status: text("status").notNull().default("running"),
  progress: jsonb("progress").default({}),
  startedAt: timestamp("started_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  error: text("error"),
});

export const insertBackgroundJobSchema = createInsertSchema(backgroundJobs).omit({ id: true, startedAt: true, updatedAt: true, completedAt: true });
export type BackgroundJob = typeof backgroundJobs.$inferSelect;
export type InsertBackgroundJob = z.infer<typeof insertBackgroundJobSchema>;

export const provisionedAccounts = pgTable("provisioned_accounts", {
  id: serial("id").primaryKey(),
  source: text("source").notNull().default("gearswap"),
  sourceUserId: integer("source_user_id").notNull(),
  accountType: text("account_type").notNull(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  email: text("email"),
  fullName: text("full_name"),
  company: text("company"),
  phone: text("phone"),
  country: text("country"),
  role: text("role"),
  tier: text("tier"),
  employerSourceId: integer("employer_source_id"),
  storeSlug: text("store_slug"),
  storeName: text("store_name"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProvisionedAccountSchema = createInsertSchema(provisionedAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export type ProvisionedAccount = typeof provisionedAccounts.$inferSelect;
export type InsertProvisionedAccount = z.infer<typeof insertProvisionedAccountSchema>;

export const insertPartPricingSchema = createInsertSchema(partPricing).omit({ id: true, lastCheckedAt: true });
export type PartPricing = typeof partPricing.$inferSelect;
export type InsertPartPricing = z.infer<typeof insertPartPricingSchema>;

export const insertBmwModelSchema = createInsertSchema(bmwModels).omit({ id: true });
export type BmwModel = typeof bmwModels.$inferSelect;
export type InsertBmwModel = z.infer<typeof insertBmwModelSchema>;

export const insertCarSchema = createInsertSchema(cars).omit({ id: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertSubcategorySchema = createInsertSchema(subcategories).omit({ id: true });
export const insertPartSchema = createInsertSchema(parts).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).pick({ username: true, password: true });
export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, createdAt: true, lastUsedAt: true, requestCount: true });

export type Car = typeof cars.$inferSelect;
export type InsertCar = z.infer<typeof insertCarSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Subcategory = typeof subcategories.$inferSelect;
export type InsertSubcategory = z.infer<typeof insertSubcategorySchema>;
export type Part = typeof parts.$inferSelect;
export type InsertPart = z.infer<typeof insertPartSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("password_reset_tokens_user_idx").on(t.userId),
  expiresIdx: index("password_reset_tokens_expires_idx").on(t.expiresAt),
}));

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({ id: true, createdAt: true, usedAt: true });
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;

// Cross-replica bootstrap lock — created at runtime by server/index.ts
// (`CREATE TABLE IF NOT EXISTS bootstrap_locks ...`). Declared here so
// drizzle-kit doesn't try to drop it on every production migration.
export const bootstrapLocks = pgTable("bootstrap_locks", {
  name: text("name").primaryKey(),
  acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
});

// express-session connect-pg-simple table. Created automatically by
// connect-pg-simple at runtime. Declared here so drizzle-kit doesn't
// suggest renames or drops.
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
}, (t) => ({
  expireIdx: index("IDX_session_expire").on(t.expire),
}));

// Runtime cache of which part numbers have been verified against RealOEM.
// Created on demand by the RealOEM scraper.
export const realoemCheckedParts = pgTable("realoem_checked_parts", {
  partNumberClean: text("part_number_clean").primaryKey(),
  seriesCodes: text("series_codes").array(),
  checkedAt: timestamp("checked_at").defaultNow(),
  found: boolean("found").default(false),
});

export const linkClicks = pgTable("link_clicks", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  destination: text("destination").notNull(),
  label: text("label"),
  partNumber: text("part_number"),
  source: text("source"),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  ip: text("ip"),
  clickedAt: timestamp("clicked_at").defaultNow(),
});

export type LinkClick = typeof linkClicks.$inferSelect;

export const backupLogs = pgTable("backup_logs", {
  id: serial("id").primaryKey(),
  backupType: text("backup_type").notNull(),
  trigger: text("trigger").notNull().default("manual"),
  label: text("label"),
  status: text("status").notNull().default("pending"),
  storageKey: text("storage_key"),
  sizeBytes: integer("size_bytes"),
  checksum: text("checksum"),
  durationMs: integer("duration_ms"),
  offsiteStatus: text("offsite_status").notNull().default("skipped"),
  offsiteKey: text("offsite_key"),
  offsiteError: text("offsite_error"),
  errorMessage: text("error_message"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (t) => ({
  createdAtIdx: index("backup_logs_created_at_idx").on(t.createdAt),
  typeStatusIdx: index("backup_logs_type_status_idx").on(t.backupType, t.status),
}));

export const insertBackupLogSchema = createInsertSchema(backupLogs).omit({ id: true, createdAt: true });
export type BackupLog = typeof backupLogs.$inferSelect;
export type InsertBackupLog = z.infer<typeof insertBackupLogSchema>;

export const globalSettings = pgTable("global_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGlobalSettingSchema = createInsertSchema(globalSettings).omit({ updatedAt: true });
export type GlobalSetting = typeof globalSettings.$inferSelect;
export type InsertGlobalSetting = z.infer<typeof insertGlobalSettingSchema>;

// ----- Reference dictionaries for first-party VIN enrichment (Task #59) -----
// These three tables let us render the Options/Vehicle tabs without
// scraping a third-party site. Each row is keyed by the BMW factory code
// and carries display names in every locale we render. Seeded from
// `data/dictionaries/*.json` via the admin importer; safe to truncate +
// re-seed because nothing references these foreign-key-style.

// Sonderausstattung (special equipment) codes such as "S205", "S459".
// `category` lets us group similar codes (audio, comfort, exterior...).
export const saCodes = pgTable("sa_codes", {
  code: text("code").primaryKey(),
  category: text("category"),
  // Locale-keyed display names: { en: "...", de: "...", es: "...", fr: ..., it: ..., zh: ... }
  names: jsonb("names").notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSaCodeSchema = createInsertSchema(saCodes).omit({ updatedAt: true });
export type SaCode = typeof saCodes.$inferSelect;
export type InsertSaCode = z.infer<typeof insertSaCodeSchema>;

// Paint / colour codes (e.g. "300" Alpinweiss, "475" Black Sapphire).
// `rgb` is an optional CSS-friendly hex like "#0A0A0A" used by the UI to
// render a swatch beside the colour name.
export const paintCodes = pgTable("paint_codes", {
  code: text("code").primaryKey(),
  names: jsonb("names").notNull().default({}),
  rgb: text("rgb"),
  finish: text("finish"), // metallic | non-metallic | individual | matte
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPaintCodeSchema = createInsertSchema(paintCodes).omit({ updatedAt: true });
export type PaintCode = typeof paintCodes.$inferSelect;
export type InsertPaintCode = z.infer<typeof insertPaintCodeSchema>;

// Upholstery / interior trim codes (e.g. "LCSW" Black Dakota leather).
export const upholsteryCodes = pgTable("upholstery_codes", {
  code: text("code").primaryKey(),
  names: jsonb("names").notNull().default({}),
  material: text("material"),  // leather | cloth | vinyl | merino | ...
  rgb: text("rgb"),             // optional swatch
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUpholsteryCodeSchema = createInsertSchema(upholsteryCodes).omit({ updatedAt: true });
export type UpholsteryCode = typeof upholsteryCodes.$inferSelect;
export type InsertUpholsteryCode = z.infer<typeof insertUpholsteryCodeSchema>;

// Per-VIN factory option (FA / SA) mapping. The leaked ETK `fztyp.psv`
// dump only carries type-code-level metadata, so this table is the
// local home for the per-VIN SA list, paint code, upholstery code and
// production date. `source` records who populated the row ("etk_fa"
// for trusted local imports, "bimmerwork"/"mdecoder" for promoted
// fallback hits) so we can later prefer trusted rows over promoted
// ones. Reading this table lets the orchestrator fill the Options /
// paint / upholstery fields without calling bimmer.work.
export const vinFactoryOptions = pgTable("vin_factory_options", {
  vin: varchar("vin", { length: 17 }).primaryKey(),
  saCodes: text("sa_codes").array().notNull().default([]),
  paintCode: text("paint_code"),
  upholsteryCode: text("upholstery_code"),
  productionDate: text("production_date"),
  source: text("source").notNull().default("unknown"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVinFactoryOptionsSchema = createInsertSchema(vinFactoryOptions).omit({ updatedAt: true });
export type VinFactoryOptions = typeof vinFactoryOptions.$inferSelect;
export type InsertVinFactoryOptions = z.infer<typeof insertVinFactoryOptionsSchema>;

// AI Photo Quote tool — one row per vendor-generated damage quote
export const photoQuotes = pgTable("photo_quotes", {
  id: serial("id").primaryKey(),
  quoteRef: text("quote_ref").notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vin: text("vin"),
  vehicle: text("vehicle").notNull(),
  photoUrls: jsonb("photo_urls").notNull().default([]),
  aiAnalysisJson: jsonb("ai_analysis_json"),
  quoteRows: jsonb("quote_rows").notNull().default([]),
  totalBmwNew: real("total_bmw_new").notNull().default(0),
  totalOurPrice: real("total_our_price").notNull().default(0),
  totalSaving: real("total_saving").notNull().default(0),
  csvUrl: text("csv_url"),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  customerPostcode: text("customer_postcode"),
  vehicleYear: text("vehicle_year"),
  vehicleColour: text("vehicle_colour"),
  mperformanceRef: text("mperformance_ref"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  byUser: index("photo_quotes_user_idx").on(t.userId),
  byRef: uniqueIndex("photo_quotes_ref_idx").on(t.quoteRef),
}));

export const insertPhotoQuoteSchema = createInsertSchema(photoQuotes).omit({ id: true, createdAt: true, updatedAt: true });
export type PhotoQuote = typeof photoQuotes.$inferSelect;
export type InsertPhotoQuote = z.infer<typeof insertPhotoQuoteSchema>;

export interface QuoteRow {
  id: string;
  estimateItem: string;
  oemDescription: string;
  oemNumber: string | null;
  bmwNew: number;
  ourPrice: number;
  saving: number;
  category: string;
  status: "required" | "optional" | "review";
  notes?: string;
}

// Carvertical affiliate settings persisted under globalSettings. The key
// constant is exported so server + client agree on it.
export const CARVERTICAL_SETTING_KEY = "carvertical_affiliate";
export const carverticalSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  a: z.string().min(1).max(64),
  b: z.string().min(1).max(64),
  chan: z.string().min(1).max(64),
  voucher: z.string().max(64).optional().default("bmv"),
});
export type CarverticalSettings = z.infer<typeof carverticalSettingsSchema>;
export const CARVERTICAL_DEFAULTS: CarverticalSettings = {
  enabled: true,
  a: "69ed8f8d0e46e",
  b: "aa3269f9",
  chan: "bmvparts",
  voucher: "bmv",
};

// ECS Tuning & Turner Motorsport affiliate settings via LinkSynergy.
// Stored under globalSettings; keys exported so server + client agree.
export const ECS_AFFILIATE_SETTING_KEY = "ecs_affiliate";
export const TURNER_AFFILIATE_SETTING_KEY = "turner_affiliate";

export const affiliateShopLinkSchema = z.object({
  enabled: z.boolean().default(true),
  id: z.string().min(1).max(64),
  mid: z.string().min(1).max(64),
  u1: z.string().max(64).default("bmv"),
});
export type AffiliateShopLinkSettings = z.infer<typeof affiliateShopLinkSchema>;

export const ECS_AFFILIATE_DEFAULTS: AffiliateShopLinkSettings = {
  enabled: true,
  id: "6t3MO5i0vLM",
  mid: "43304",
  u1: "bmv",
};
export const TURNER_AFFILIATE_DEFAULTS: AffiliateShopLinkSettings = {
  enabled: true,
  id: "6t3MO5i0vLM",
  mid: "44309",
  u1: "bmv",
};

// eBay affiliate settings.
// The fixed params (mkcid=1, siteid=0, toolid=10001, mkevt=1) are baked into
// the URL builder; only campid, customid, and mkrid are admin-configurable.
export const EBAY_AFFILIATE_SETTING_KEY = "ebay_affiliate";

export const ebayAffiliateSchema = z.object({
  enabled: z.boolean().default(true),
  campid: z.string().min(1).max(64),
  customid: z.string().max(64).default("BMV"),
  mkrid: z.string().min(1).max(64),
});
export type EbayAffiliateSettings = z.infer<typeof ebayAffiliateSchema>;

export const EBAY_AFFILIATE_DEFAULTS: EbayAffiliateSettings = {
  enabled: true,
  campid: "5339155828",
  customid: "BMV",
  mkrid: "711-53200-19255-0",
};

// Amazon affiliate settings.
export const AMAZON_AFFILIATE_SETTING_KEY = "amazon_affiliate";

export const amazonAffiliateSchema = z.object({
  enabled: z.boolean().default(true),
  tag: z.string().min(1).max(64),
});
export type AmazonAffiliateSettings = z.infer<typeof amazonAffiliateSchema>;

export const AMAZON_AFFILIATE_DEFAULTS: AmazonAffiliateSettings = {
  enabled: true,
  tag: "amandadoyle-22",
};

// SEO editorial content
// Per-category buying-guide / context paragraphs. Keyed by a normalized
// category name (lowercased, trimmed). Optional subcategory for finer
// targeting. Admin-edited; rendered server-side as part of generated SEO copy.
export const categoryEditorial = pgTable("category_editorial", {
  id: serial("id").primaryKey(),
  categoryKey: text("category_key").notNull(),
  subcategoryKey: text("subcategory_key"),
  // BCP-47 locale code ("en", "de-DE", "zh-CN", ...). Each (category,
  // subcategory, locale) row is unique so we can author the same blurb
  // in every supported language without colliding on the legacy unique idx.
  locale: text("locale").notNull().default("en"),
  blurb: text("blurb").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  byKey: index("category_editorial_key_idx").on(t.categoryKey, t.subcategoryKey, t.locale),
}));

export const insertCategoryEditorialSchema = createInsertSchema(categoryEditorial).omit({ id: true, updatedAt: true });
export type CategoryEditorial = typeof categoryEditorial.$inferSelect;
export type InsertCategoryEditorial = z.infer<typeof insertCategoryEditorialSchema>;

// Optional admin-authored note shown on a specific part page above the
// templated sections. Keyed by partNumberClean.
export const partEditorialNotes = pgTable("part_editorial_notes", {
  id: serial("id").primaryKey(),
  partNumberClean: text("part_number_clean").notNull(),
  // BCP-47 locale code; uniqueness is on (partNumberClean, locale).
  locale: text("locale").notNull().default("en"),
  note: text("note").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  byPartLocale: index("part_editorial_notes_pn_locale_idx").on(t.partNumberClean, t.locale),
}));

// Lightweight per-locale request counter so admins can prioritize the next
// translation effort by actual demand. One row per (locale, day).
export const languageRequestStats = pgTable("language_request_stats", {
  id: serial("id").primaryKey(),
  locale: text("locale").notNull(),
  day: text("day").notNull(), // YYYY-MM-DD UTC bucket
  hits: integer("hits").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  byLocaleDay: index("language_request_stats_locale_day_idx").on(t.locale, t.day),
}));

export type LanguageRequestStat = typeof languageRequestStats.$inferSelect;

export const insertPartEditorialNoteSchema = createInsertSchema(partEditorialNotes).omit({ id: true, updatedAt: true });
export type PartEditorialNote = typeof partEditorialNotes.$inferSelect;
export type InsertPartEditorialNote = z.infer<typeof insertPartEditorialNoteSchema>;

// Per-hub editorial blurb shown on chassis (`/chassis/:code`) and series
// (`/series/:slug`) landing pages. `hubType` is "chassis" or "series",
// `hubKey` is the uppercase chassis code (e.g. "G87") or the series slug
// (e.g. "3-series"). Unique per (hubType, hubKey).
export const hubEditorial = pgTable("hub_editorial", {
  id: serial("id").primaryKey(),
  hubType: text("hub_type").notNull(),
  hubKey: text("hub_key").notNull(),
  blurb: text("blurb").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  byKey: index("hub_editorial_key_idx").on(t.hubType, t.hubKey),
}));

export const insertHubEditorialSchema = createInsertSchema(hubEditorial).omit({ id: true, updatedAt: true });
export type HubEditorial = typeof hubEditorial.$inferSelect;
export type InsertHubEditorial = z.infer<typeof insertHubEditorialSchema>;

// ----- Catalog audit (Task #84) -----
// Maps one of our subcategories to a RealOEM diagram URL so the audit
// runner knows what RealOEM page to compare it against. `confidence` is
// 0..1 with 1.0 reserved for admin-confirmed pairings. `source` records
// who created the row ("manual" or "auto-derived" today).
export const subcategoryRealoemMap = pgTable("subcategory_realoem_map", {
  id: serial("id").primaryKey(),
  subcategoryId: integer("subcategory_id").notNull().references(() => subcategories.id, { onDelete: "cascade" }),
  carId: integer("car_id").notNull().references(() => cars.id, { onDelete: "cascade" }),
  realoemDiagramUrl: text("realoem_diagram_url").notNull(),
  realoemDiagramId: text("realoem_diagram_id"),
  confidence: real("confidence").notNull().default(1),
  source: text("source").notNull().default("manual"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  // Each subcategory maps to AT MOST ONE RealOEM diagram. Re-pointing a
  // mapping to a different URL must replace the old row, not create a
  // second one (otherwise audits and backfills double-fire).
  bySubcategory: uniqueIndex("subcategory_realoem_map_subcategory_unique_idx").on(t.subcategoryId),
  byCar: index("subcategory_realoem_map_car_idx").on(t.carId),
}));

export const insertSubcategoryRealoemMapSchema = createInsertSchema(subcategoryRealoemMap).omit({ id: true, createdAt: true, updatedAt: true });
export type SubcategoryRealoemMap = typeof subcategoryRealoemMap.$inferSelect;
export type InsertSubcategoryRealoemMap = z.infer<typeof insertSubcategoryRealoemMapSchema>;

// One row per (audit run, subcategory) pairing. `missingParts` is the
// JSON list of parts the audit found on RealOEM but not in our catalog.
// `extraParts` is the inverse (in ours, not in theirs) — informational.
// `status` lifecycle: open → backfilled | dismissed.
export const realoemAuditFindings = pgTable("realoem_audit_findings", {
  id: serial("id").primaryKey(),
  auditRunId: integer("audit_run_id").notNull(),
  carId: integer("car_id").notNull().references(() => cars.id, { onDelete: "cascade" }),
  subcategoryId: integer("subcategory_id").notNull().references(() => subcategories.id, { onDelete: "cascade" }),
  realoemDiagramUrl: text("realoem_diagram_url").notNull(),
  realoemDiagramId: text("realoem_diagram_id"),
  realoemPartCount: integer("realoem_part_count").notNull().default(0),
  ourPartCount: integer("our_part_count").notNull().default(0),
  missingPartCount: integer("missing_part_count").notNull().default(0),
  // Shape: [{ partNumberClean, partNumber, description, diagramRefNumber, quantity }]
  missingParts: jsonb("missing_parts").notNull().default([]),
  // Shape: [{ partNumberClean, partNumber, description }]
  extraParts: jsonb("extra_parts").notNull().default([]),
  status: text("status").notNull().default("open"),
  backfilledAt: timestamp("backfilled_at"),
  backfilledBy: varchar("backfilled_by"),
  partsBackfilled: integer("parts_backfilled").notNull().default(0),
  dismissedAt: timestamp("dismissed_at"),
  dismissedBy: varchar("dismissed_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byRun: index("realoem_audit_findings_run_idx").on(t.auditRunId),
  byCar: index("realoem_audit_findings_car_idx").on(t.carId),
  byStatus: index("realoem_audit_findings_status_idx").on(t.status),
}));

export const insertRealoemAuditFindingSchema = createInsertSchema(realoemAuditFindings).omit({ id: true, createdAt: true });
export type RealoemAuditFinding = typeof realoemAuditFindings.$inferSelect;
export type InsertRealoemAuditFinding = z.infer<typeof insertRealoemAuditFindingSchema>;

// RealOEM diagram URLs we discovered during chassis crawl that we have
// no local subcategory for. Useful for completeness audits — admin can
// import a previously unknown diagram into our catalog. Unique on
// (carId, realoemDiagramUrl).
export const realoemUnmatchedDiagrams = pgTable("realoem_unmatched_diagrams", {
  id: serial("id").primaryKey(),
  carId: integer("car_id").notNull().references(() => cars.id, { onDelete: "cascade" }),
  realoemDiagramUrl: text("realoem_diagram_url").notNull(),
  realoemDiagramId: text("realoem_diagram_id"),
  realoemDiagramTitle: text("realoem_diagram_title"),
  realoemPartCount: integer("realoem_part_count").notNull().default(0),
  status: text("status").notNull().default("open"),
  discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
}, (t) => ({
  byCar: index("realoem_unmatched_car_idx").on(t.carId),
}));

export type RealoemUnmatchedDiagram = typeof realoemUnmatchedDiagrams.$inferSelect;

// Task #101 — Cross-variant RealOEM diagram dedup.
//
// One row per (chassis, RealOEM diag_id). Stores the parsed parts
// payload + content hash for any diagram we've already fetched once
// for a chassis, so sibling variants (engine/trim siblings of the
// same chassis) can clone the parts list without re-spending the
// daily Oxylabs proxy budget on a byte-identical page.
//
// `diagramClass` is the policy decision the canonical-store made when
// it first wrote the row: "shared" rows are eligible for cloning to
// siblings; "per-car" / "unknown" are stored only for visibility
// (the dedup path never clones from them — see
// `server/realoem-diagram-canonical.ts`).
//
// Idempotent unique key: (chassis, diag_id). The runtime DDL in
// `server/index.ts` mirrors this table so deploys never need a
// separate `drizzle-kit push` step.
export const realoemDiagramCanonical = pgTable("realoem_diagram_canonical", {
  id: serial("id").primaryKey(),
  chassis: text("chassis").notNull(),
  diagId: text("diag_id").notNull(),
  realoemDiagramUrl: text("realoem_diagram_url").notNull(),
  realoemDiagramTitle: text("realoem_diagram_title"),
  partsPayload: jsonb("parts_payload").notNull().default(sql`'[]'::jsonb`),
  partCount: integer("part_count").notNull().default(0),
  contentHash: text("content_hash").notNull(),
  diagramClass: text("diagram_class").notNull().default("unknown"),
  sourceCarId: integer("source_car_id"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  byChassis: index("realoem_diagram_canonical_chassis_idx").on(t.chassis),
}));

export type RealoemDiagramCanonical = typeof realoemDiagramCanonical.$inferSelect;

// =============================================================================
// ISTA+ ECU parts (Task #124)
// =============================================================================
// Maps ECU short-names (BORDNETZTEILNEHMER.NAME) to BMW part numbers
// (LOGISTISCHESTEIL.SACHNR) per chassis programming group (BRV). Sourced
// from psdzdata/kiswb/<BRV>/KIS.script files in the ISTA-BLP and SDP-DELTA
// packages. Idempotent upsert on (ecu_name, part_number, brv_code).
export const istaEcuParts = pgTable("ista_ecu_parts", {
  id: serial("id").primaryKey(),
  ecuName: text("ecu_name").notNull(),
  brvCode: text("brv_code").notNull(),
  partNumber: text("part_number").notNull(),
  partNumberClean: text("part_number_clean"),
  bestellOption: text("bestell_option"),
  ecuDescription: text("ecu_description"),
  diagAddress: text("diag_address"),
  istaVersion: text("ista_version").notNull().default("4.59"),
  importedAt: timestamp("imported_at").defaultNow(),
}, (t) => ({
  uniqueEcuPartBrv: uniqueIndex("ista_ecu_parts_unique_idx").on(t.ecuName, t.partNumber, t.brvCode),
  byEcu: index("ista_ecu_parts_ecu_idx").on(t.ecuName),
  byPart: index("ista_ecu_parts_part_idx").on(t.partNumberClean),
  byBrv: index("ista_ecu_parts_brv_idx").on(t.brvCode),
}));

export const insertIstaEcuPartSchema = createInsertSchema(istaEcuParts).omit({ id: true, importedAt: true });
export type IstaEcuPart = typeof istaEcuParts.$inferSelect;
export type InsertIstaEcuPart = z.infer<typeof insertIstaEcuPartSchema>;

// =============================================================================
// Proxy routing layer (Task #175)
// =============================================================================

export const PROXY_SCRAPER_NAMES = [
  "etk",
  "realoem",
  "bimmerwork",
  "vin_decoders",
  "hash_discovery",
  "bmw_firstparty",
  "vindecoderz",
] as const;
export type ProxyScraperName = typeof PROXY_SCRAPER_NAMES[number];

export const PROXY_PROVIDER_NAMES = [
  "evomi_core",
  "evomi_premium",
  "oxylabs_residential",
  "oxylabs_webscraper",
  "direct",
] as const;
export type ProxyProviderName = typeof PROXY_PROVIDER_NAMES[number];

export const PROXY_ROLES = ["primary", "backup"] as const;
export type ProxyRole = typeof PROXY_ROLES[number];

// Per-request proxy log. url_hash is sha256(url) so we never store raw URLs.
export const proxyUsageLogs = pgTable("proxy_usage_logs", {
  id: serial("id").primaryKey(),
  scraper: text("scraper").notNull(),
  provider: text("provider").notNull(),
  role: text("role").notNull(),
  urlHash: text("url_hash").notNull(),
  bytes: integer("bytes").notNull().default(0),
  success: boolean("success").notNull(),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byScraperCreated: index("proxy_usage_logs_scraper_created_idx").on(t.scraper, t.createdAt),
  byCreated: index("proxy_usage_logs_created_idx").on(t.createdAt),
  byProvider: index("proxy_usage_logs_provider_idx").on(t.provider),
}));

export const insertProxyUsageLogSchema = createInsertSchema(proxyUsageLogs).omit({ id: true, createdAt: true });
export type ProxyUsageLog = typeof proxyUsageLogs.$inferSelect;
export type InsertProxyUsageLog = z.infer<typeof insertProxyUsageLogSchema>;

// Admin-overridable per-scraper primary/backup provider assignment.
// When no row exists for a scraper the proxy-router falls back to
// the hard-coded defaults in server/proxy-router.ts.
export const proxyProviderConfig = pgTable("proxy_provider_config", {
  scraper: text("scraper").primaryKey(),
  primaryProvider: text("primary_provider").notNull(),
  backupProvider: text("backup_provider").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProxyProviderConfigSchema = createInsertSchema(proxyProviderConfig).omit({ updatedAt: true });
export type ProxyProviderConfig = typeof proxyProviderConfig.$inferSelect;
export type InsertProxyProviderConfig = z.infer<typeof insertProxyProviderConfigSchema>;

export const backupRetentionDefaults = {
  hourly: 24,
  daily: 14,
  weekly: 8,
  monthly: 12,
  files: 14,
  preDeploy: 10,
  restore: 50,
  code: 14,
  assetsFull: 8,
};

export const backupScheduleDefaults = {
  hourlyEnabled: false,
  hourlyIntervalMinutes: 60,
  dailyEnabled: true,
  dailyHour: 3,
  weeklyEnabled: true,
  weeklyHour: 4,
  weeklyDayOfWeek: 0,
  monthlyEnabled: true,
  monthlyHour: 5,
  fileBackupOnDaily: true,
  staleAlertHours: 25,
};

export const backupRetentionSchema = z.object({
  hourly: z.number().int().nonnegative(),
  daily: z.number().int().nonnegative(),
  weekly: z.number().int().nonnegative(),
  monthly: z.number().int().nonnegative(),
  files: z.number().int().nonnegative(),
  preDeploy: z.number().int().nonnegative(),
  restore: z.number().int().nonnegative(),
  code: z.number().int().nonnegative(),
  assetsFull: z.number().int().nonnegative(),
});

export const backupScheduleSchema = z.object({
  hourlyEnabled: z.boolean(),
  hourlyIntervalMinutes: z.number().int().min(5).max(1440),
  dailyEnabled: z.boolean(),
  dailyHour: z.number().int().min(0).max(23),
  weeklyEnabled: z.boolean(),
  weeklyHour: z.number().int().min(0).max(23),
  weeklyDayOfWeek: z.number().int().min(0).max(6),
  monthlyEnabled: z.boolean(),
  monthlyHour: z.number().int().min(0).max(23),
  fileBackupOnDaily: z.boolean(),
  staleAlertHours: z.number().int().min(1).max(720),
});

export type BackupRetentionSettings = z.infer<typeof backupRetentionSchema>;
export type BackupScheduleSettings = z.infer<typeof backupScheduleSchema>;

// =============================================================================
// BMV.VIN content tables (Task #96)
// =============================================================================
// Five tables that drive the bmv.vin SSR layer. All fields are JSONB-keyed
// by locale ({ en: "...", "de-DE": "...", ... }) so a single row covers
// every supported language; missing locales fall back to English at read
// time. Created idempotently in server/index.ts on boot — duplicated here
// so drizzle-kit doesn't propose drops.
//
// Each row also stores Schema.org-friendly auxiliary fields (publishedAt,
// updatedAt, taxonomy, related slugs) so the SSR layer can emit Article /
// FAQPage / HowTo / DefinedTerm JSON-LD without a join.

// Decoder home copy (one row per "home" key — typically just "default").
export const bmvVinHomeCopy = pgTable("bmv_vin_home_copy", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique('bmv_vin_home_copy_key_key').default("default"),
  // { en: "...", "de-DE": "...", ... }
  hero: jsonb("hero").notNull().default({}),
  intro: jsonb("intro").notNull().default({}),
  faq: jsonb("faq").notNull().default([]),     // [{ q: { en, ... }, a: { en, ... } }]
  metaTitle: jsonb("meta_title").notNull().default({}),
  metaDescription: jsonb("meta_description").notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Per-brand decoder hub copy.
export const bmvVinBrandDecoderCopy = pgTable("bmv_vin_brand_decoder_copy", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull().unique('bmv_vin_brand_decoder_copy_brand_key'), // bmw|mini|alpina|rolls-royce|motorrad
  hero: jsonb("hero").notNull().default({}),
  intro: jsonb("intro").notNull().default({}),
  body: jsonb("body").notNull().default({}),    // long-form markdown per locale
  faq: jsonb("faq").notNull().default([]),
  metaTitle: jsonb("meta_title").notNull().default({}),
  metaDescription: jsonb("meta_description").notNull().default({}),
  wmis: text("wmis").array().notNull().default([]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Faceted hub blurbs ({chassis|year|plant|market|paint|option}/{value}).
export const bmvVinFacetBlurb = pgTable("bmv_vin_facet_blurb", {
  id: serial("id").primaryKey(),
  facetKind: text("facet_kind").notNull(), // chassis|year|plant|market|paint|option
  facetValue: text("facet_value").notNull(),
  blurb: jsonb("blurb").notNull().default({}),       // { en, ... }
  faq: jsonb("faq").notNull().default([]),
  metaTitle: jsonb("meta_title").notNull().default({}),
  metaDescription: jsonb("meta_description").notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("bmv_vin_facet_blurb_unique_idx").on(t.facetKind, t.facetValue),
}));

// Guide library (Article / HowTo). 12-18 articles to launch.
export const bmvVinGuide = pgTable("bmv_vin_guide", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique('bmv_vin_guide_slug_key'),
  // "article" or "howto" — controls the Schema.org @type emitted.
  schemaType: text("schema_type").notNull().default("Article"),
  category: text("category"),                   // brand|facet|reference
  title: jsonb("title").notNull().default({}),
  summary: jsonb("summary").notNull().default({}),
  body: jsonb("body").notNull().default({}),    // markdown per locale
  faq: jsonb("faq").notNull().default([]),
  metaTitle: jsonb("meta_title").notNull().default({}),
  metaDescription: jsonb("meta_description").notNull().default({}),
  // For HowTo schema: ordered steps. Each step: { name: { en, ... }, text: { en, ... } }
  steps: jsonb("steps").notNull().default([]),
  relatedSlugs: text("related_slugs").array().notNull().default([]),
  // Sitemap/SSR-eligible flag; admin can flip to false to unpublish.
  published: boolean("published").notNull().default(true),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Glossary terms (Schema.org DefinedTerm).
export const bmvVinGlossary = pgTable("bmv_vin_glossary", {
  id: serial("id").primaryKey(),
  term: text("term").notNull().unique('bmv_vin_glossary_term_key'),  // url slug, e.g. "wmi", "check-digit"
  termSet: text("term_set"),              // "vin-anatomy", "sa-codes", "paint", "plant"
  display: jsonb("display").notNull().default({}),     // shown title { en, ... }
  definition: jsonb("definition").notNull().default({}),
  longForm: jsonb("long_form").notNull().default({}),  // optional expanded content
  metaTitle: jsonb("meta_title").notNull().default({}),
  metaDescription: jsonb("meta_description").notNull().default({}),
  relatedTerms: text("related_terms").array().notNull().default([]),
  // See bmv_vin_guide.published.
  published: boolean("published").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =============================================================================
// Quick Servicing Info (Task #106)
// =============================================================================
// Per-(chassis, engine) fluid capacities + per-(chassis, engine, filter)
// part-number pins. Fluids are stored in a single JSONB column keyed by
// `SERVICING_FLUID_KEYS` with per-field status + verifier metadata so the
// public page can render trust badges without a join. Filter pins are
// per-row so admin-pinned part numbers can override the catalog auto-
// derivation. Coverage requests record unsupported chassis+engine combos
// so admins can prioritize what to fill in next.

export const SERVICING_FLUID_KEYS = ["engineOil", "gearbox", "frontDiff", "rearDiff", "transferCase", "cooling"] as const;
export type ServicingFluidKey = typeof SERVICING_FLUID_KEYS[number];

export const SERVICING_FILTER_KEYS = ["engine_oil", "cabin", "air", "fuel", "transmission"] as const;
export type ServicingFilterKey = typeof SERVICING_FILTER_KEYS[number];

export type ServicingTrustStatus = "verified" | "ai_draft" | "empty";

export interface ServicingFluidValue {
  capacityMl: number | null;
  grade: string | null;
  notes: string | null;
  status: ServicingTrustStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

export type ServicingFluidsMap = Partial<Record<ServicingFluidKey, ServicingFluidValue>>;

export const servicingSpecs = pgTable("servicing_specs", {
  id: serial("id").primaryKey(),
  chassis: text("chassis").notNull(),
  engine: text("engine").notNull(),
  fluids: jsonb("fluids").notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("servicing_specs_chassis_engine_unique_idx").on(t.chassis, t.engine),
}));

export const servicingFilterPins = pgTable("servicing_filter_pins", {
  id: serial("id").primaryKey(),
  chassis: text("chassis").notNull(),
  engine: text("engine").notNull(),
  filterKey: text("filter_key").notNull(),
  partNumber: text("part_number").notNull(),
  note: text("note"),
  status: text("status").notNull().default("ai_draft"),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("servicing_filter_pins_unique_idx").on(t.chassis, t.engine, t.filterKey),
}));

export const servicingCoverageRequests = pgTable("servicing_coverage_requests", {
  id: serial("id").primaryKey(),
  chassis: text("chassis").notNull(),
  engine: text("engine").notNull(),
  email: text("email"),
  vin: text("vin"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertServicingSpecSchema = createInsertSchema(servicingSpecs).omit({ id: true, updatedAt: true });
export const insertServicingFilterPinSchema = createInsertSchema(servicingFilterPins).omit({ id: true, updatedAt: true });
export const insertServicingCoverageRequestSchema = createInsertSchema(servicingCoverageRequests).omit({ id: true, createdAt: true });

export type ServicingSpec = typeof servicingSpecs.$inferSelect;
export type ServicingFilterPin = typeof servicingFilterPins.$inferSelect;
export type ServicingCoverageRequest = typeof servicingCoverageRequests.$inferSelect;
export type InsertServicingSpec = z.infer<typeof insertServicingSpecSchema>;
export type InsertServicingFilterPin = z.infer<typeof insertServicingFilterPinSchema>;
export type InsertServicingCoverageRequest = z.infer<typeof insertServicingCoverageRequestSchema>;

// =============================================================================
// ISTA quarterly auto-ingest worker (Task #109)
// =============================================================================
// One row per attempted ingest of an `.istapackage` file from the
// `BMV-Bucket` Object Storage bucket. The worker picks up new files
// (scheduled poll), acquires a per-version lock, calls the SSP/FUB
// extractor (built in the upstream task), and writes a run record with
// row counts + diff against the previous successful version. Status
// transitions: pending -> running -> {succeeded|failed|noop}. `noop`
// means "this version was already ingested and the extractor reported
// no changes" (relies on extractor idempotency).
//
// The diff payload (`diff` jsonb) shape:
//   {
//     ssp: { added: n, changed: n, removed: n, perChassis: { F30: {...}, ... } },
//     fub: { added: n, changed: n, removed: n, perChassis: { ... } },
//   }
// Per-chassis breakdown lets admins see *where* a release added or
// dropped coverage at a glance, mirroring the per-chassis breakdown the
// upstream extractor already emits at run time.
export const ISTA_RUN_STATUSES = ["pending", "running", "succeeded", "failed", "noop"] as const;
export type IstaRunStatus = typeof ISTA_RUN_STATUSES[number];

export const ISTA_RUN_TRIGGERS = ["scheduled", "manual", "smoke"] as const;
export type IstaRunTrigger = typeof ISTA_RUN_TRIGGERS[number];

export interface IstaRunDiffSection {
  added: number;
  changed: number;
  removed: number;
  perChassis: Record<string, { added: number; changed: number; removed: number }>;
}

export interface IstaRunDiff {
  ssp: IstaRunDiffSection;
  fub: IstaRunDiffSection;
}

export const istaIngestRuns = pgTable("ista_ingest_runs", {
  id: serial("id").primaryKey(),
  version: text("version").notNull(),         // e.g. "4.59.10"
  bucketKey: text("bucket_key").notNull(),    // OS key of the .istapackage
  fileSizeBytes: integer("file_size_bytes"),
  status: text("status").notNull().default("pending"),
  trigger: text("trigger").notNull().default("scheduled"),
  triggeredBy: text("triggered_by"),          // user id when trigger=manual
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  durationMs: integer("duration_ms"),
  sspRows: integer("ssp_rows").notNull().default(0),
  fubRows: integer("fub_rows").notNull().default(0),
  diff: jsonb("diff"),                        // IstaRunDiff
  failedStep: text("failed_step"),            // download|unpack|parse|db_write|other
  errorMessage: text("error_message"),
  warnings: jsonb("warnings").notNull().default([]),  // string[]
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byVersion: index("ista_ingest_runs_version_idx").on(t.version),
  byCreatedAt: index("ista_ingest_runs_created_at_idx").on(t.createdAt),
}));

export const insertIstaIngestRunSchema = createInsertSchema(istaIngestRuns).omit({
  id: true, createdAt: true, startedAt: true, finishedAt: true, durationMs: true,
});
export type IstaIngestRun = typeof istaIngestRuns.$inferSelect;
export type InsertIstaIngestRun = z.infer<typeof insertIstaIngestRunSchema>;

// Per-version advisory lock. Two scheduler runs racing on the same file
// MUST collide on the primary key — the worker `INSERT ... ON CONFLICT
// DO NOTHING`s and bails when the insert affects zero rows. Released by
// deleting the row after the run record is finalized.
export const istaIngestLocks = pgTable("ista_ingest_locks", {
  version: text("version").primaryKey(),
  bucketKey: text("bucket_key").notNull(),
  acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
  acquiredBy: text("acquired_by").notNull(),  // process pid + hostname
});

export const insertBmvVinHomeCopySchema          = createInsertSchema(bmvVinHomeCopy).omit({ id: true, updatedAt: true });
export const insertBmvVinBrandDecoderCopySchema  = createInsertSchema(bmvVinBrandDecoderCopy).omit({ id: true, updatedAt: true });
export const insertBmvVinFacetBlurbSchema        = createInsertSchema(bmvVinFacetBlurb).omit({ id: true, updatedAt: true });
export const insertBmvVinGuideSchema             = createInsertSchema(bmvVinGuide).omit({ id: true, publishedAt: true, updatedAt: true });
export const insertBmvVinGlossarySchema          = createInsertSchema(bmvVinGlossary).omit({ id: true, updatedAt: true });

export type BmvVinHomeCopy          = typeof bmvVinHomeCopy.$inferSelect;
export type BmvVinBrandDecoderCopy  = typeof bmvVinBrandDecoderCopy.$inferSelect;
export type BmvVinFacetBlurb        = typeof bmvVinFacetBlurb.$inferSelect;
export type BmvVinGuide             = typeof bmvVinGuide.$inferSelect;
export type BmvVinGlossary          = typeof bmvVinGlossary.$inferSelect;
export type InsertBmvVinHomeCopy          = z.infer<typeof insertBmvVinHomeCopySchema>;
export type InsertBmvVinBrandDecoderCopy  = z.infer<typeof insertBmvVinBrandDecoderCopySchema>;
export type InsertBmvVinFacetBlurb        = z.infer<typeof insertBmvVinFacetBlurbSchema>;
export type InsertBmvVinGuide             = z.infer<typeof insertBmvVinGuideSchema>;
export type InsertBmvVinGlossary          = z.infer<typeof insertBmvVinGlossarySchema>;

// =============================================================================
// ISTA SSP/FUB content tables (Task #151)
// =============================================================================
// Populated by the real SqliteExtractor from DiagDocDb.sqlite (GLOBAL package)
// joined against xmlvalueprimitive_ENUS.sqlite (en-US package) to resolve
// opaque ISTA IDs into readable English text.
//
// SSP = Special Service Procedures / Software Service Packs — step-by-step
// diagnostic and repair procedures keyed by vehicle context + document ID.
//
// FUB = Fahrzeug-Umbau-Beschreibung — vehicle modification / conversion
// procedures (e.g. converting a US-spec car to EU spec, installing a factory
// retrofit kit). Distinguished from SSP by the ISTA document-type code.
//
// Both are keyed on (version, ista_id, chassis) so rows are stable across
// quarterly releases and upserts are idempotent. `version` lets us diff rows
// between consecutive ISTA releases and surface what changed.

export const istaSspRecords = pgTable("ista_ssp_records", {
  id: serial("id").primaryKey(),
  version: text("version").notNull(),           // ISTA release, e.g. "4.59.12"
  istaId: text("ista_id").notNull(),            // stable ISTA document identifier
  chassis: text("chassis").notNull(),           // BMW chassis code, e.g. "G20"
  docTypeCode: text("doc_type_code"),           // ISTA document-type discriminator
  titleEn: text("title_en"),                   // English title resolved from xmlvalueprimitive
  descriptionEn: text("description_en"),       // English description (may be long)
  keywords: text("keywords"),                  // space-separated keyword hints
  rawNodeId: text("raw_node_id"),              // raw ISTA node/content ID (for provenance)
  importedAt: timestamp("imported_at").defaultNow(),
}, (t) => ({
  uniqueVersionIdChassis: uniqueIndex("ista_ssp_records_unique_idx").on(t.version, t.istaId, t.chassis),
  byVersion: index("ista_ssp_records_version_idx").on(t.version),
  byChassis: index("ista_ssp_records_chassis_idx").on(t.chassis),
  byIstaId: index("ista_ssp_records_ista_id_idx").on(t.istaId),
}));

export const insertIstaSspRecordSchema = createInsertSchema(istaSspRecords).omit({ id: true, importedAt: true });
export type IstaSspRecord = typeof istaSspRecords.$inferSelect;
export type InsertIstaSspRecord = z.infer<typeof insertIstaSspRecordSchema>;

export const istaFubRecords = pgTable("ista_fub_records", {
  id: serial("id").primaryKey(),
  version: text("version").notNull(),
  istaId: text("ista_id").notNull(),
  chassis: text("chassis").notNull(),
  docTypeCode: text("doc_type_code"),
  titleEn: text("title_en"),
  descriptionEn: text("description_en"),
  processType: text("process_type"),            // FUB-specific process category
  rawNodeId: text("raw_node_id"),
  importedAt: timestamp("imported_at").defaultNow(),
}, (t) => ({
  uniqueVersionIdChassis: uniqueIndex("ista_fub_records_unique_idx").on(t.version, t.istaId, t.chassis),
  byVersion: index("ista_fub_records_version_idx").on(t.version),
  byChassis: index("ista_fub_records_chassis_idx").on(t.chassis),
  byIstaId: index("ista_fub_records_ista_id_idx").on(t.istaId),
}));

export const insertIstaFubRecordSchema = createInsertSchema(istaFubRecords).omit({ id: true, importedAt: true });
export type IstaFubRecord = typeof istaFubRecords.$inferSelect;
export type InsertIstaFubRecord = z.infer<typeof insertIstaFubRecordSchema>;

// =============================================================================
// AI-generated FAQ cache (Task #228)
// =============================================================================
// Stores GPT-4o-generated FAQ Q&A pairs keyed by (pageType, pageKey, locale).
// Generated lazily on first SSR request per page+locale, then cached permanently
// unless an admin forces a refresh. The client reads from this table via
// GET /api/faq — no generation happens on the client path.
export const aiFaqCache = pgTable("ai_faq_cache", {
  id: serial("id").primaryKey(),
  pageType: text("page_type").notNull(), // 'part' | 'chassis' | 'series' | 'vin' | 'facet'
  pageKey: text("page_key").notNull(),   // partNumber, chassisCode, seriesSlug, vinLast7, 'kind:value'
  locale: text("locale").notNull(),      // BCP-47, e.g. 'en', 'de-DE', 'zh-CN'
  faqItems: jsonb("faq_items").notNull().$type<{ q: string; a: string }[]>(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
}, (t) => ({
  uniquePageLocale: uniqueIndex("ai_faq_cache_unique_idx").on(t.pageType, t.pageKey, t.locale),
  byPageType: index("ai_faq_cache_page_type_idx").on(t.pageType),
  byPageKey: index("ai_faq_cache_page_key_idx").on(t.pageKey),
}));

export const insertAiFaqCacheSchema = createInsertSchema(aiFaqCache).omit({ id: true, generatedAt: true });
export type AiFaqCache = typeof aiFaqCache.$inferSelect;
export type InsertAiFaqCache = z.infer<typeof insertAiFaqCacheSchema>;

// =============================================================================
// SEO Growth Engine (Task #259) — bmv.vin programmatic SEO infrastructure
// =============================================================================
// SEO cluster/hub mapping table (exists in prod — retained to prevent drizzle
// from emitting a DROP TABLE prompt during the publish diff check).
export const seoContentClusters = pgTable("seo_content_clusters", {
  id: serial("id").primaryKey(),
  clusterName: text("cluster_name").notNull(),
  hubUrl: text("hub_url").notNull().unique('seo_content_clusters_hub_url_key'),
  spokeUrls: jsonb("spoke_urls").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// =============================================================================
// Three tables that power the 15-step SEO growth engine:
//   seo_keywords    — VIN-intent keyword inventory (24-hour discovery cron)
//   seo_content_pages — registry of all programmatic pages (tool/model/guide/…)
//   seo_refresh_queue — 90-day content refresh scheduler per page

export const seoKeywords = pgTable("seo_keywords", {
  id: serial("id").primaryKey(),
  project: text("project").notNull().default("bmv.vin"),
  keyword: text("keyword").notNull(),
  intent: text("intent").notNull(),
  estimatedVolume: integer("estimated_volume"),
  difficulty: integer("difficulty"),
  cpc: real("cpc"),
  priority: integer("priority").notNull().default(1),
  pageTargeting: text("page_targeting"),
  clusterId: text("cluster_id"),
  discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  byProject: index("seo_keywords_project_idx").on(t.project),
  byKeyword: uniqueIndex("seo_keywords_keyword_project_unique_idx").on(t.keyword, t.project),
  byIntent: index("seo_keywords_intent_idx").on(t.intent),
  byPriority: index("seo_keywords_priority_idx").on(t.priority),
}));

export const seoContentPages = pgTable("seo_content_pages", {
  id: serial("id").primaryKey(),
  project: text("project").notNull().default("bmv.vin"),
  url: text("url").notNull(),
  pageType: text("page_type").notNull(),
  primaryKeyword: text("primary_keyword"),
  wordCount: integer("word_count"),
  indexed: boolean("indexed").notNull().default(false),
  contentRef: text("content_ref"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  lastRefreshedAt: timestamp("last_refreshed_at"),
}, (t) => ({
  byProject: index("seo_content_pages_project_idx").on(t.project),
  byUrl: uniqueIndex("seo_content_pages_url_unique_idx").on(t.url, t.project),
  byType: index("seo_content_pages_type_idx").on(t.pageType),
}));

export const seoRefreshQueue = pgTable("seo_refresh_queue", {
  id: serial("id").primaryKey(),
  pageId: integer("page_id").notNull().references(() => seoContentPages.id, { onDelete: "cascade" }),
  dueAt: timestamp("due_at").notNull(),
  status: text("status").notNull().default("pending"),
  priority: integer("priority").notNull().default(1),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
}, (t) => ({
  byStatus: index("seo_refresh_queue_status_idx").on(t.status),
  byDue: index("seo_refresh_queue_due_idx").on(t.dueAt),
}));

export const insertSeoKeywordSchema = createInsertSchema(seoKeywords).omit({ id: true, discoveredAt: true, updatedAt: true });
export type SeoKeyword = typeof seoKeywords.$inferSelect;
export type InsertSeoKeyword = z.infer<typeof insertSeoKeywordSchema>;

export const insertSeoContentPageSchema = createInsertSchema(seoContentPages).omit({ id: true, generatedAt: true });
export type SeoContentPage = typeof seoContentPages.$inferSelect;
export type InsertSeoContentPage = z.infer<typeof insertSeoContentPageSchema>;

export const insertSeoRefreshQueueSchema = createInsertSchema(seoRefreshQueue).omit({ id: true });
export type SeoRefreshQueue = typeof seoRefreshQueue.$inferSelect;
export type InsertSeoRefreshQueue = z.infer<typeof insertSeoRefreshQueueSchema>;

// ---------------------------------------------------------------------------
// Bulk VIN Enrichment Queue (Task #289)
// Persistent work queue for the slow-burn bimmer.work backfill worker.
// Each row tracks one VIN through its lifecycle: pending → in_progress →
// done | failed. The worker dequeues one row per tick (90-second interval,
// ~1000/day cap) and writes results to vin_cache + vin_factory_options.
// ---------------------------------------------------------------------------
export const VIN_ENRICHMENT_STATUSES = ["pending", "in_progress", "done", "failed"] as const;
export type VinEnrichmentStatus = typeof VIN_ENRICHMENT_STATUSES[number];

export const vinEnrichmentQueue = pgTable("vin_enrichment_queue", {
  vin: varchar("vin", { length: 17 }).primaryKey(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptedAt: timestamp("last_attempted_at"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byStatus: index("vin_enrichment_queue_status_idx").on(t.status),
  byStatusCreated: index("vin_enrichment_queue_status_created_idx").on(t.status, t.createdAt),
}));

export const insertVinEnrichmentQueueSchema = createInsertSchema(vinEnrichmentQueue).omit({ createdAt: true });
export type VinEnrichmentQueue = typeof vinEnrichmentQueue.$inferSelect;
export type InsertVinEnrichmentQueue = z.infer<typeof insertVinEnrichmentQueueSchema>;

// Daily rate-limit counter keyed by UTC date (YYYY-MM-DD).
// One row per day; count is incremented by the worker for each VIN processed.
export const vinBackfillDailyCounts = pgTable("vin_backfill_daily_counts", {
  utcDate: text("utc_date").primaryKey(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type VinBackfillDailyCount = typeof vinBackfillDailyCounts.$inferSelect;

// ---------------------------------------------------------------------------
// OpenAI Usage Tracking (Task #300)
// One row per OpenAI API call. Written by server/openai-logger.ts wrapper.
// Indexed on created_at and feature for fast aggregation queries.
// ---------------------------------------------------------------------------
export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: serial("id").primaryKey(),
  feature: text("feature").notNull(),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byCreatedAt: index("ai_usage_logs_created_at_idx").on(t.createdAt),
  byFeature: index("ai_usage_logs_feature_idx").on(t.feature),
}));

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogs).omit({ id: true, createdAt: true });
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;
export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;

// =============================================================================
// SEO Publisher API (Roman/Hermes automation)
// Two tables power the external publishing API:
//   seo_publisher_pages — content created by the Roman/Hermes AI agent
//   seo_audit_log       — immutable append-only log of every mutation
// =============================================================================

export const SEO_PUBLISHER_STATUSES = ["draft", "published", "archived"] as const;
export type SeoPublisherStatus = typeof SEO_PUBLISHER_STATUSES[number];

export const SEO_PUBLISHER_CONTENT_TYPES = ["page", "article", "guide", "data"] as const;
export type SeoPublisherContentType = typeof SEO_PUBLISHER_CONTENT_TYPES[number];

export const SEO_PUBLISHER_SOURCES = ["roman-hermes", "admin", "replit-agent", "manual"] as const;
export type SeoPublisherSource = typeof SEO_PUBLISHER_SOURCES[number];

export const seoPublisherPages = pgTable("seo_publisher_pages", {
  id: serial("id").primaryKey(),
  // slug is unique per domain (composite uniqueness — same slug can exist on different properties)
  slug: text("slug").notNull(),
  contentType: text("content_type").notNull().default("page"),
  status: text("status").notNull().default("draft"),
  approved: boolean("approved").notNull().default(false),
  // Core SEO fields
  title: text("title").notNull(),
  metaDescription: text("meta_description"),
  canonicalUrl: text("canonical_url"),
  h1: text("h1"),
  bodyHtml: text("body_html"),
  excerpt: text("excerpt"),
  // Schema / structured data
  schemaJson: jsonb("schema_json"),
  // Internal links: [{ text, href }]
  internalLinks: jsonb("internal_links"),
  // Featured image
  featuredImageUrl: text("featured_image_url"),
  // OG / social
  ogTitle: text("og_title"),
  ogDescription: text("og_description"),
  ogImageUrl: text("og_image_url"),
  // Taxonomy
  category: text("category"),
  tags: text("tags").array(),
  // Provenance
  source: text("source").notNull().default("roman-hermes"),
  author: text("author"),
  // Domain this page belongs to (bmv.parts = catalog host; bmw.vin = VIN tool host)
  // bmv.parts is the brand abbreviation (BMW → BMV) and is the actual deployed hostname.
  domain: text("domain").notNull().default("bmv.parts"),
  // Audit trail
  publishedAt: timestamp("published_at"),
  archivedAt: timestamp("archived_at"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  // Composite unique: same slug can exist on different host properties
  bySlugDomain: uniqueIndex("seo_publisher_pages_slug_domain_unique").on(t.slug, t.domain),
  byStatus: index("seo_publisher_pages_status_idx").on(t.status),
  bySource: index("seo_publisher_pages_source_idx").on(t.source),
  byDomain: index("seo_publisher_pages_domain_idx").on(t.domain),
}));

export const insertSeoPublisherPageSchema = createInsertSchema(seoPublisherPages).omit({ id: true, createdAt: true, updatedAt: true });
export type SeoPublisherPage = typeof seoPublisherPages.$inferSelect;
export type InsertSeoPublisherPage = z.infer<typeof insertSeoPublisherPageSchema>;

export const seoAuditLog = pgTable("seo_audit_log", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  actor: text("actor").notNull(),
  tokenLabel: text("token_label"),
  action: text("action").notNull(),
  contentType: text("content_type"),
  targetId: integer("target_id"),
  targetSlug: text("target_slug"),
  targetUrl: text("target_url"),
  summary: text("summary"),
  status: text("status").notNull().default("ok"),
  error: text("error"),
}, (t) => ({
  byTimestamp: index("seo_audit_log_timestamp_idx").on(t.timestamp),
  byActor: index("seo_audit_log_actor_idx").on(t.actor),
  byTarget: index("seo_audit_log_target_idx").on(t.targetSlug),
}));

export const insertSeoAuditLogSchema = createInsertSchema(seoAuditLog).omit({ id: true, timestamp: true });
export type SeoAuditLog = typeof seoAuditLog.$inferSelect;
export type InsertSeoAuditLog = z.infer<typeof insertSeoAuditLogSchema>;

// ---------------------------------------------------------------------------
// rego_vin_cache — rego plate -> VIN lookups from BMW Australia recall site
// ---------------------------------------------------------------------------
export const regoVinCache = pgTable("rego_vin_cache", {
  id:          serial("id").primaryKey(),
  rego:        text("rego").notNull(),
  state:       text("state").notNull(),
  vin:         text("vin").notNull(),
  model:       text("model"),
  year:        integer("year"),
  colour:      text("colour"),
  lookedUpAt:  timestamp("looked_up_at").defaultNow().notNull(),
  source:      text("source").notNull().default("bmw_recall"),
}, (t) => ({
  regoStateUnique: uniqueIndex("rego_vin_cache_rego_state_unique").on(t.rego, t.state),
  regoIdx:         index("idx_rego_vin_cache_rego").on(t.rego),
  vinIdx:          index("idx_rego_vin_cache_vin").on(t.vin),
}));

export type RegoVinCache = typeof regoVinCache.$inferSelect;
