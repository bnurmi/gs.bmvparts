import { pgTable, serial, text, integer, timestamp, boolean, index, unique, real, foreignKey, uniqueIndex, varchar, jsonb, json } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const cars = pgTable("cars", {
	id: serial().primaryKey().notNull(),
	chassis: text().notNull(),
	generation: text().notNull(),
	bodyType: text("body_type").notNull(),
	modelName: text("model_name").notNull(),
	displayName: text("display_name").notNull(),
	engine: text(),
	yearStart: integer("year_start"),
	yearEnd: integer("year_end"),
	catalogUrl: text("catalog_url").notNull(),
	catalogId: text("catalog_id"),
	imageUrl: text("image_url"),
	scrapeStatus: text("scrape_status").default('idle').notNull(),
	scrapeProgress: integer("scrape_progress").default(0),
	totalCategories: integer("total_categories").default(0),
	totalSubcategories: integer("total_subcategories").default(0),
	totalParts: integer("total_parts").default(0),
	lastScrapedAt: timestamp("last_scraped_at", { mode: 'string' }),
	scrapeError: text("scrape_error"),
	series: text().default('M').notNull(),
	slug: text(),
	typeCode: text("type_code"),
	realoemPartgrpId: text("realoem_partgrp_id"),
	realoemSkip: boolean("realoem_skip").default(false).notNull(),
});

export const partPricing = pgTable("part_pricing", {
	id: serial().primaryKey().notNull(),
	partNumberClean: text("part_number_clean").notNull(),
	source: text(),
	dealPrice: real("deal_price"),
	msrp: real(),
	savings: real(),
	gbpPrice: real("gbp_price"),
	audApprox: real("aud_approx"),
	currency: text(),
	productUrl: text("product_url"),
	found: boolean().default(false).notNull(),
	lastCheckedAt: timestamp("last_checked_at", { mode: 'string' }).defaultNow(),
	eurListPrice: real("eur_list_price"),
	eurNetPrice: real("eur_net_price"),
	eurVatPercent: real("eur_vat_percent"),
	eurTier: text("eur_tier"),
	eurAudApprox: real("eur_aud_approx"),
	eurSourceFile: text("eur_source_file"),
	eurUpdatedAt: timestamp("eur_updated_at", { mode: 'string' }),
}, (table) => [
	index("idx_part_pricing_eur_source_file").using("btree", table.eurSourceFile.asc().nullsLast().op("text_ops")),
	unique("part_pricing_part_number_clean_unique").on(table.partNumberClean),
]);

export const categories = pgTable("categories", {
	id: serial().primaryKey().notNull(),
	carId: integer("car_id").notNull(),
	categoryId: text("category_id").notNull(),
	name: text().notNull(),
	imageUrl: text("image_url"),
	url: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.carId],
			foreignColumns: [cars.id],
			name: "categories_car_id_cars_id_fk"
		}).onDelete("cascade"),
]);

export const subcategories = pgTable("subcategories", {
	id: serial().primaryKey().notNull(),
	categoryId: integer("category_id").notNull(),
	carId: integer("car_id").notNull(),
	subcategoryId: text("subcategory_id").notNull(),
	name: text().notNull(),
	imageUrl: text("image_url"),
	url: text().notNull(),
	diagramImageUrl: text("diagram_image_url"),
}, (table) => [
	index("idx_subcategories_car_id").using("btree", table.carId.asc().nullsLast().op("int4_ops")),
	index("idx_subcategories_category_id").using("btree", table.categoryId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.carId],
			foreignColumns: [cars.id],
			name: "subcategories_car_id_cars_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "subcategories_category_id_categories_id_fk"
		}).onDelete("cascade"),
]);

export const parts = pgTable("parts", {
	id: serial().primaryKey().notNull(),
	subcategoryId: integer("subcategory_id").notNull(),
	carId: integer("car_id").notNull(),
	itemNo: text("item_no"),
	partNumber: text("part_number"),
	partNumberClean: text("part_number_clean"),
	description: text().notNull(),
	additionalInfo: text("additional_info"),
	partDate: text("part_date"),
	quantity: text(),
	weight: real(),
	notes: text(),
}, (table) => [
	index("idx_parts_car_id").using("btree", table.carId.asc().nullsLast().op("int4_ops")),
	index("idx_parts_part_number").using("btree", table.partNumber.asc().nullsLast().op("text_ops")),
	index("idx_parts_part_number_clean").using("btree", table.partNumberClean.asc().nullsLast().op("text_ops")),
	index("idx_parts_subcategory_id").using("btree", table.subcategoryId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.carId],
			foreignColumns: [cars.id],
			name: "parts_car_id_cars_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.subcategoryId],
			foreignColumns: [subcategories.id],
			name: "parts_subcategory_id_subcategories_id_fk"
		}).onDelete("cascade"),
]);

export const users = pgTable("users", {
	id: varchar().primaryKey().notNull(),
	username: text().notNull(),
	password: text().notNull(),
	role: text().default('user').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	email: text(),
}, (table) => [
	uniqueIndex("users_email_unique").using("btree", table.email.asc().nullsLast().op("text_ops")).where(sql`(email IS NOT NULL)`),
	unique("users_username_unique").on(table.username),
]);

export const externalCatalogParts = pgTable("external_catalog_parts", {
	id: serial().primaryKey().notNull(),
	externalId: integer("external_id").notNull(),
	brand: text().default('BMW').notNull(),
	modelSeries: text("model_series"),
	model: text(),
	partGroup: text("part_group"),
	subgroup: text(),
	partNumber: text("part_number").notNull(),
	partNumberClean: text("part_number_clean").notNull(),
	description: text(),
	price: text(),
	currency: text(),
	supersessionPartNumber: text("supersession_part_number"),
	supersessionInfo: text("supersession_info"),
	quantity: integer(),
	diagramImagePath: text("diagram_image_path"),
	diagramRefNumber: text("diagram_ref_number"),
	compatibility: jsonb(),
	hierarchyPath: text("hierarchy_path"),
	sourceUrl: text("source_url"),
	metadata: jsonb(),
	catalogLastScrapedAt: timestamp("catalog_last_scraped_at", { mode: 'string' }),
	importedAt: timestamp("imported_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_ecp_description_lower").using("btree", sql`lower(description)`),
	index("idx_ecp_model").using("btree", table.model.asc().nullsLast().op("text_ops")),
	index("idx_ecp_part_number_clean").using("btree", table.partNumberClean.asc().nullsLast().op("text_ops")),
	unique("external_catalog_parts_external_id_unique").on(table.externalId),
]);

export const apiKeys = pgTable("api_keys", {
	id: serial().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	key: text().notNull(),
	name: text().notNull(),
	tier: text().default('basic').notNull(),
	active: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	lastUsedAt: timestamp("last_used_at", { mode: 'string' }),
	requestCount: integer("request_count").default(0).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "api_keys_user_id_users_id_fk"
		}).onDelete("cascade"),
	unique("api_keys_key_unique").on(table.key),
]);

export const bmwModels = pgTable("bmw_models", {
	id: serial().primaryKey().notNull(),
	chassis: text().notNull(),
	typeCode: text("type_code").notNull(),
	modelName: text("model_name").notNull(),
	developmentCode: text("development_code"),
	market: text(),
	bodyType: text("body_type"),
	engineDisplacement: text("engine_displacement"),
	enginePowerKw: integer("engine_power_kw"),
	engineCode: text("engine_code"),
	imageUrl: text("image_url"),
	sourceUrl: text("source_url"),
}, (table) => [
	unique("bmw_models_chassis_type_code_key").on(table.chassis, table.typeCode),
]);

export const session = pgTable("session", {
	sid: varchar().primaryKey().notNull(),
	sess: json().notNull(),
	expire: timestamp({ precision: 6, mode: 'string' }).notNull(),
}, (table) => [
	index("IDX_session_expire").using("btree", table.expire.asc().nullsLast().op("timestamp_ops")),
]);

export const userCars = pgTable("user_cars", {
	id: serial().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	vin: text().notNull(),
	nickname: text(),
	chassis: text(),
	series: text(),
	modelName: text("model_name"),
	modelYear: integer("model_year"),
	matchedCarId: integer("matched_car_id"),
	vinData: jsonb("vin_data"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.matchedCarId],
			foreignColumns: [cars.id],
			name: "user_cars_matched_car_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_cars_user_id_fkey"
		}).onDelete("cascade"),
]);

export const partCrossReferences = pgTable("part_cross_references", {
	id: serial().primaryKey().notNull(),
	partNumberClean: text("part_number_clean").notNull(),
	seriesCode: text("series_code").notNull(),
	chassisCode: text("chassis_code"),
	source: text().default('realoem').notNull(),
	checkedAt: timestamp("checked_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_pcr_part_number").using("btree", table.partNumberClean.asc().nullsLast().op("text_ops")),
	uniqueIndex("idx_pcr_unique").using("btree", table.partNumberClean.asc().nullsLast().op("text_ops"), table.seriesCode.asc().nullsLast().op("text_ops")),
]);

export const vinCache = pgTable("vin_cache", {
	id: serial().primaryKey().notNull(),
	vin: text().notNull(),
	source: text(),
	enrichedData: jsonb("enriched_data"),
	catalogMatches: jsonb("catalog_matches"),
	decodedData: jsonb("decoded_data"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	enrichmentSource: jsonb("enrichment_source"),
	bimmerworkHash: text("bimmerwork_hash"),
}, (table) => [
	unique("vin_cache_vin_unique").on(table.vin),
]);

export const backgroundJobs = pgTable("background_jobs", {
	id: serial().primaryKey().notNull(),
	jobType: text("job_type").notNull(),
	status: text().default('running').notNull(),
	progress: jsonb().default({}),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	error: text(),
});

export const realoemCheckedParts = pgTable("realoem_checked_parts", {
	partNumberClean: text("part_number_clean").primaryKey().notNull(),
	seriesCodes: text("series_codes").array(),
	checkedAt: timestamp("checked_at", { mode: 'string' }).defaultNow(),
	found: boolean().default(false),
});

export const provisionedAccounts = pgTable("provisioned_accounts", {
	id: serial().primaryKey().notNull(),
	source: text().default('gearswap').notNull(),
	sourceUserId: integer("source_user_id").notNull(),
	accountType: text("account_type").notNull(),
	userId: varchar("user_id").notNull(),
	username: text().notNull(),
	email: text(),
	fullName: text("full_name"),
	company: text(),
	phone: text(),
	country: text(),
	role: text(),
	tier: text(),
	employerSourceId: integer("employer_source_id"),
	storeSlug: text("store_slug"),
	storeName: text("store_name"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("idx_provisioned_source_user").using("btree", table.source.asc().nullsLast().op("int4_ops"), table.sourceUserId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "provisioned_accounts_user_id_fkey"
		}).onDelete("cascade"),
]);

export const backupLogs = pgTable("backup_logs", {
	id: serial().primaryKey().notNull(),
	backupType: text("backup_type").notNull(),
	trigger: text().default('manual').notNull(),
	label: text(),
	status: text().default('pending').notNull(),
	storageKey: text("storage_key"),
	sizeBytes: integer("size_bytes"),
	checksum: text(),
	durationMs: integer("duration_ms"),
	offsiteStatus: text("offsite_status").default('skipped').notNull(),
	offsiteKey: text("offsite_key"),
	offsiteError: text("offsite_error"),
	errorMessage: text("error_message"),
	details: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
}, (table) => [
	index("backup_logs_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("backup_logs_type_status_idx").using("btree", table.backupType.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
]);

export const globalSettings = pgTable("global_settings", {
	key: text().primaryKey().notNull(),
	value: jsonb().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const linkClicks = pgTable("link_clicks", {
	id: serial().primaryKey().notNull(),
	url: text().notNull(),
	destination: text().notNull(),
	label: text(),
	partNumber: text("part_number"),
	source: text(),
	referrer: text(),
	userAgent: text("user_agent"),
	ip: text(),
	clickedAt: timestamp("clicked_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_link_clicks_clicked_at").using("btree", table.clickedAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_link_clicks_destination").using("btree", table.destination.asc().nullsLast().op("text_ops")),
]);

export const realoemVinCache = pgTable("realoem_vin_cache", {
	vinLast7: varchar("vin_last7", { length: 7 }).primaryKey().notNull(),
	fullVin: text("full_vin"),
	status: text().notNull(),
	chassis: text(),
	partType: text("part_type"),
	series: text(),
	modelName: text("model_name"),
	rawHtmlPath: text("raw_html_path"),
	fetchedAt: timestamp("fetched_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_realoem_vin_cache_chassis").using("btree", table.chassis.asc().nullsLast().op("text_ops")),
	index("idx_realoem_vin_cache_fetched_at").using("btree", table.fetchedAt.asc().nullsLast().op("timestamp_ops")),
]);

export const realoemChassisScrapeJobs = pgTable("realoem_chassis_scrape_jobs", {
	id: serial().primaryKey().notNull(),
	chassis: text().notNull(),
	partType: text("part_type"),
	status: text().default('pending').notNull(),
	totalPages: integer("total_pages").default(0),
	completedPages: integer("completed_pages").default(0),
	partsImported: integer("parts_imported").default(0),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow(),
	finishedAt: timestamp("finished_at", { mode: 'string' }),
	error: text(),
}, (table) => [
	index("idx_realoem_jobs_chassis").using("btree", table.chassis.asc().nullsLast().op("text_ops")),
	index("idx_realoem_jobs_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const hubEditorial = pgTable("hub_editorial", {
	id: serial().primaryKey().notNull(),
	hubType: text("hub_type").notNull(),
	hubKey: text("hub_key").notNull(),
	blurb: text().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("hub_editorial_key_idx").using("btree", table.hubType.asc().nullsLast().op("text_ops"), table.hubKey.asc().nullsLast().op("text_ops")),
	uniqueIndex("hub_editorial_unique_idx").using("btree", table.hubType.asc().nullsLast().op("text_ops"), table.hubKey.asc().nullsLast().op("text_ops")),
]);

export const categoryEditorial = pgTable("category_editorial", {
	id: serial().primaryKey().notNull(),
	categoryKey: text("category_key").notNull(),
	subcategoryKey: text("subcategory_key"),
	blurb: text().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	locale: text().default('en').notNull(),
}, (table) => [
	index("category_editorial_key_idx").using("btree", table.categoryKey.asc().nullsLast().op("text_ops"), table.subcategoryKey.asc().nullsLast().op("text_ops")),
	uniqueIndex("category_editorial_locale_unique_idx").using("btree", sql`category_key`, sql`COALESCE(subcategory_key, ''::text)`, sql`locale`),
]);

export const partEditorialNotes = pgTable("part_editorial_notes", {
	id: serial().primaryKey().notNull(),
	partNumberClean: text("part_number_clean").notNull(),
	note: text().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	locale: text().default('en').notNull(),
}, (table) => [
	uniqueIndex("part_editorial_notes_locale_unique_idx").using("btree", table.partNumberClean.asc().nullsLast().op("text_ops"), table.locale.asc().nullsLast().op("text_ops")),
]);

export const languageRequestStats = pgTable("language_request_stats", {
	id: serial().primaryKey().notNull(),
	locale: text().notNull(),
	day: text().notNull(),
	hits: integer().default(0).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("language_request_stats_unique_idx").using("btree", table.locale.asc().nullsLast().op("text_ops"), table.day.asc().nullsLast().op("text_ops")),
]);

export const bootstrapLocks = pgTable("bootstrap_locks", {
	name: text().primaryKey().notNull(),
	acquiredAt: timestamp("acquired_at", { mode: 'string' }).defaultNow().notNull(),
});

export const saCodes = pgTable("sa_codes", {
	code: text().primaryKey().notNull(),
	category: text(),
	names: jsonb().default({}).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const paintCodes = pgTable("paint_codes", {
	code: text().primaryKey().notNull(),
	names: jsonb().default({}).notNull(),
	rgb: text(),
	finish: text(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const upholsteryCodes = pgTable("upholstery_codes", {
	code: text().primaryKey().notNull(),
	names: jsonb().default({}).notNull(),
	material: text(),
	rgb: text(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const vinFactoryOptions = pgTable("vin_factory_options", {
	vin: varchar({ length: 17 }).primaryKey().notNull(),
	saCodes: text("sa_codes").array().default([""]).notNull(),
	paintCode: text("paint_code"),
	upholsteryCode: text("upholstery_code"),
	productionDate: text("production_date"),
	source: text().default('unknown').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const subcategoryRealoemMap = pgTable("subcategory_realoem_map", {
	id: serial().primaryKey().notNull(),
	subcategoryId: integer("subcategory_id").notNull(),
	carId: integer("car_id").notNull(),
	realoemDiagramUrl: text("realoem_diagram_url").notNull(),
	realoemDiagramId: text("realoem_diagram_id"),
	confidence: real().default(1).notNull(),
	source: text().default('manual').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("subcategory_realoem_map_car_idx").using("btree", table.carId.asc().nullsLast().op("int4_ops")),
	uniqueIndex("subcategory_realoem_map_subcategory_unique_idx").using("btree", table.subcategoryId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.carId],
			foreignColumns: [cars.id],
			name: "subcategory_realoem_map_car_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.subcategoryId],
			foreignColumns: [subcategories.id],
			name: "subcategory_realoem_map_subcategory_id_fkey"
		}).onDelete("cascade"),
]);

export const realoemAuditFindings = pgTable("realoem_audit_findings", {
	id: serial().primaryKey().notNull(),
	auditRunId: integer("audit_run_id").notNull(),
	carId: integer("car_id").notNull(),
	subcategoryId: integer("subcategory_id").notNull(),
	realoemDiagramUrl: text("realoem_diagram_url").notNull(),
	realoemDiagramId: text("realoem_diagram_id"),
	realoemPartCount: integer("realoem_part_count").default(0).notNull(),
	ourPartCount: integer("our_part_count").default(0).notNull(),
	missingPartCount: integer("missing_part_count").default(0).notNull(),
	missingParts: jsonb("missing_parts").default([]).notNull(),
	extraParts: jsonb("extra_parts").default([]).notNull(),
	status: text().default('open').notNull(),
	backfilledAt: timestamp("backfilled_at", { mode: 'string' }),
	backfilledBy: varchar("backfilled_by"),
	partsBackfilled: integer("parts_backfilled").default(0).notNull(),
	dismissedAt: timestamp("dismissed_at", { mode: 'string' }),
	dismissedBy: varchar("dismissed_by"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("realoem_audit_findings_car_idx").using("btree", table.carId.asc().nullsLast().op("int4_ops")),
	index("realoem_audit_findings_run_idx").using("btree", table.auditRunId.asc().nullsLast().op("int4_ops")),
	index("realoem_audit_findings_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.carId],
			foreignColumns: [cars.id],
			name: "realoem_audit_findings_car_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.subcategoryId],
			foreignColumns: [subcategories.id],
			name: "realoem_audit_findings_subcategory_id_fkey"
		}).onDelete("cascade"),
]);

export const realoemUnmatchedDiagrams = pgTable("realoem_unmatched_diagrams", {
	id: serial().primaryKey().notNull(),
	carId: integer("car_id").notNull(),
	realoemDiagramUrl: text("realoem_diagram_url").notNull(),
	realoemDiagramId: text("realoem_diagram_id"),
	realoemDiagramTitle: text("realoem_diagram_title"),
	realoemPartCount: integer("realoem_part_count").default(0).notNull(),
	status: text().default('open').notNull(),
	discoveredAt: timestamp("discovered_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("realoem_unmatched_car_idx").using("btree", table.carId.asc().nullsLast().op("int4_ops")),
	uniqueIndex("realoem_unmatched_unique_idx").using("btree", table.carId.asc().nullsLast().op("int4_ops"), table.realoemDiagramUrl.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.carId],
			foreignColumns: [cars.id],
			name: "realoem_unmatched_diagrams_car_id_fkey"
		}).onDelete("cascade"),
]);

export const realoemVehicles = pgTable("realoem_vehicles", {
	partgrpId: text("partgrp_id").primaryKey().notNull(),
	series: text(),
	modelName: text("model_name").notNull(),
	typeCode: text("type_code"),
	body: text(),
	chassis: text().notNull(),
	market: text().notNull(),
	prodMonth: integer("prod_month"),
	prodYear: integer("prod_year"),
	prodRange: text("prod_range"),
	fetchedAt: timestamp("fetched_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_realoem_vehicles_chassis").using("btree", table.chassis.asc().nullsLast().op("text_ops")),
	index("idx_realoem_vehicles_chassis_year").using("btree", table.chassis.asc().nullsLast().op("int4_ops"), table.prodYear.asc().nullsLast().op("int4_ops")),
	index("idx_realoem_vehicles_type_code").using("btree", table.typeCode.asc().nullsLast().op("text_ops")),
]);

export const bmvVinHomeCopy = pgTable("bmv_vin_home_copy", {
	id: serial().primaryKey().notNull(),
	key: text().default('default').notNull(),
	hero: jsonb().default({}).notNull(),
	intro: jsonb().default({}).notNull(),
	faq: jsonb().default([]).notNull(),
	metaTitle: jsonb("meta_title").default({}).notNull(),
	metaDescription: jsonb("meta_description").default({}).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("bmv_vin_home_copy_key_unique").on(table.key),
]);

export const bmvVinBrandDecoderCopy = pgTable("bmv_vin_brand_decoder_copy", {
	id: serial().primaryKey().notNull(),
	brand: text().notNull(),
	hero: jsonb().default({}).notNull(),
	intro: jsonb().default({}).notNull(),
	body: jsonb().default({}).notNull(),
	faq: jsonb().default([]).notNull(),
	metaTitle: jsonb("meta_title").default({}).notNull(),
	metaDescription: jsonb("meta_description").default({}).notNull(),
	wmis: text().array().default(["RAY"]).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("bmv_vin_brand_decoder_copy_brand_unique").on(table.brand),
]);

export const bmvVinFacetBlurb = pgTable("bmv_vin_facet_blurb", {
	id: serial().primaryKey().notNull(),
	facetKind: text("facet_kind").notNull(),
	facetValue: text("facet_value").notNull(),
	blurb: jsonb().default({}).notNull(),
	faq: jsonb().default([]).notNull(),
	metaTitle: jsonb("meta_title").default({}).notNull(),
	metaDescription: jsonb("meta_description").default({}).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("bmv_vin_facet_blurb_unique_idx").using("btree", table.facetKind.asc().nullsLast().op("text_ops"), table.facetValue.asc().nullsLast().op("text_ops")),
]);

export const bmvVinGuide = pgTable("bmv_vin_guide", {
	id: serial().primaryKey().notNull(),
	slug: text().notNull(),
	schemaType: text("schema_type").default('Article').notNull(),
	category: text(),
	title: jsonb().default({}).notNull(),
	summary: jsonb().default({}).notNull(),
	body: jsonb().default({}).notNull(),
	faq: jsonb().default([]).notNull(),
	metaTitle: jsonb("meta_title").default({}).notNull(),
	metaDescription: jsonb("meta_description").default({}).notNull(),
	steps: jsonb().default([]).notNull(),
	relatedSlugs: text("related_slugs").array().default(["RAY"]).notNull(),
	published: boolean().default(true).notNull(),
	publishedAt: timestamp("published_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("bmv_vin_guide_slug_unique").on(table.slug),
]);

export const bmvVinGlossary = pgTable("bmv_vin_glossary", {
	id: serial().primaryKey().notNull(),
	term: text().notNull(),
	termSet: text("term_set"),
	display: jsonb().default({}).notNull(),
	definition: jsonb().default({}).notNull(),
	longForm: jsonb("long_form").default({}).notNull(),
	metaTitle: jsonb("meta_title").default({}).notNull(),
	metaDescription: jsonb("meta_description").default({}).notNull(),
	relatedTerms: text("related_terms").array().default(["RAY"]).notNull(),
	published: boolean().default(true).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("bmv_vin_glossary_term_unique").on(table.term),
]);

export const realoemDiagramCanonical = pgTable("realoem_diagram_canonical", {
	id: serial().primaryKey().notNull(),
	chassis: text().notNull(),
	diagId: text("diag_id").notNull(),
	realoemDiagramUrl: text("realoem_diagram_url").notNull(),
	realoemDiagramTitle: text("realoem_diagram_title"),
	partsPayload: jsonb("parts_payload").default([]).notNull(),
	partCount: integer("part_count").default(0).notNull(),
	contentHash: text("content_hash").notNull(),
	diagramClass: text("diagram_class").default('unknown').notNull(),
	sourceCarId: integer("source_car_id"),
	fetchedAt: timestamp("fetched_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("realoem_diagram_canonical_chassis_idx").using("btree", table.chassis.asc().nullsLast().op("text_ops")),
	uniqueIndex("realoem_diagram_canonical_unique_idx").using("btree", table.chassis.asc().nullsLast().op("text_ops"), table.diagId.asc().nullsLast().op("text_ops")),
]);

export const partChassisAppearances = pgTable("part_chassis_appearances", {
	id: serial().primaryKey().notNull(),
	partNumberClean: text("part_number_clean").notNull(),
	chassis: text().notNull(),
	chassisLabelRaw: text("chassis_label_raw").notNull(),
	productionFrom: text("production_from"),
	productionTo: text("production_to"),
	sourceCarId: text("source_car_id").notNull(),
	sourcePartUrl: text("source_part_url").notNull(),
	harvestedAt: timestamp("harvested_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("part_chassis_appearances_chassis_idx").using("btree", table.chassis.asc().nullsLast().op("text_ops")),
	index("part_chassis_appearances_part_idx").using("btree", table.partNumberClean.asc().nullsLast().op("text_ops")),
	uniqueIndex("part_chassis_appearances_unique_idx").using("btree", table.partNumberClean.asc().nullsLast().op("text_ops"), table.chassis.asc().nullsLast().op("text_ops")),
]);

export const servicingSpecs = pgTable("servicing_specs", {
	id: serial().primaryKey().notNull(),
	chassis: text().notNull(),
	engine: text().notNull(),
	fluids: jsonb().default({}).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("servicing_specs_chassis_engine_unique_idx").using("btree", table.chassis.asc().nullsLast().op("text_ops"), table.engine.asc().nullsLast().op("text_ops")),
]);

export const servicingFilterPins = pgTable("servicing_filter_pins", {
	id: serial().primaryKey().notNull(),
	chassis: text().notNull(),
	engine: text().notNull(),
	filterKey: text("filter_key").notNull(),
	partNumber: text("part_number").notNull(),
	note: text(),
	status: text().default('ai_draft').notNull(),
	verifiedBy: text("verified_by"),
	verifiedAt: timestamp("verified_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("servicing_filter_pins_unique_idx").using("btree", table.chassis.asc().nullsLast().op("text_ops"), table.engine.asc().nullsLast().op("text_ops"), table.filterKey.asc().nullsLast().op("text_ops")),
]);

export const servicingCoverageRequests = pgTable("servicing_coverage_requests", {
	id: serial().primaryKey().notNull(),
	chassis: text().notNull(),
	engine: text().notNull(),
	email: text(),
	vin: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("servicing_coverage_requests_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
]);

export const istaIngestRuns = pgTable("ista_ingest_runs", {
	id: serial().primaryKey().notNull(),
	version: text().notNull(),
	bucketKey: text("bucket_key").notNull(),
	fileSizeBytes: integer("file_size_bytes"),
	status: text().default('pending').notNull(),
	trigger: text().default('scheduled').notNull(),
	triggeredBy: text("triggered_by"),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { mode: 'string' }),
	durationMs: integer("duration_ms"),
	sspRows: integer("ssp_rows").default(0).notNull(),
	fubRows: integer("fub_rows").default(0).notNull(),
	diff: jsonb(),
	failedStep: text("failed_step"),
	errorMessage: text("error_message"),
	warnings: jsonb().default([]).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ista_ingest_runs_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("ista_ingest_runs_version_idx").using("btree", table.version.asc().nullsLast().op("text_ops")),
]);

export const istaIngestLocks = pgTable("ista_ingest_locks", {
	version: text().primaryKey().notNull(),
	bucketKey: text("bucket_key").notNull(),
	acquiredAt: timestamp("acquired_at", { mode: 'string' }).defaultNow().notNull(),
	acquiredBy: text("acquired_by").notNull(),
});

export const istaSspRecords = pgTable("ista_ssp_records", {
	id: serial().primaryKey().notNull(),
	version: text().notNull(),
	istaId: text("ista_id").notNull(),
	chassis: text().notNull(),
	docTypeCode: text("doc_type_code"),
	titleEn: text("title_en"),
	descriptionEn: text("description_en"),
	keywords: text(),
	rawNodeId: text("raw_node_id"),
	importedAt: timestamp("imported_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("ista_ssp_records_chassis_idx").using("btree", table.chassis.asc().nullsLast().op("text_ops")),
	index("ista_ssp_records_ista_id_idx").using("btree", table.istaId.asc().nullsLast().op("text_ops")),
	uniqueIndex("ista_ssp_records_unique_idx").using("btree", table.version.asc().nullsLast().op("text_ops"), table.istaId.asc().nullsLast().op("text_ops"), table.chassis.asc().nullsLast().op("text_ops")),
	index("ista_ssp_records_version_idx").using("btree", table.version.asc().nullsLast().op("text_ops")),
]);

export const istaFubRecords = pgTable("ista_fub_records", {
	id: serial().primaryKey().notNull(),
	version: text().notNull(),
	istaId: text("ista_id").notNull(),
	chassis: text().notNull(),
	docTypeCode: text("doc_type_code"),
	titleEn: text("title_en"),
	descriptionEn: text("description_en"),
	processType: text("process_type"),
	rawNodeId: text("raw_node_id"),
	importedAt: timestamp("imported_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("ista_fub_records_chassis_idx").using("btree", table.chassis.asc().nullsLast().op("text_ops")),
	index("ista_fub_records_ista_id_idx").using("btree", table.istaId.asc().nullsLast().op("text_ops")),
	uniqueIndex("ista_fub_records_unique_idx").using("btree", table.version.asc().nullsLast().op("text_ops"), table.istaId.asc().nullsLast().op("text_ops"), table.chassis.asc().nullsLast().op("text_ops")),
	index("ista_fub_records_version_idx").using("btree", table.version.asc().nullsLast().op("text_ops")),
]);

export const proxyUsageLogs = pgTable("proxy_usage_logs", {
	id: serial().primaryKey().notNull(),
	scraper: text().notNull(),
	provider: text().notNull(),
	role: text().notNull(),
	urlHash: text("url_hash").notNull(),
	bytes: integer().default(0).notNull(),
	success: boolean().notNull(),
	durationMs: integer("duration_ms"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("proxy_usage_logs_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("proxy_usage_logs_provider_idx").using("btree", table.provider.asc().nullsLast().op("text_ops")),
	index("proxy_usage_logs_scraper_created_idx").using("btree", table.scraper.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
]);

export const proxyProviderConfig = pgTable("proxy_provider_config", {
	scraper: text().primaryKey().notNull(),
	primaryProvider: text("primary_provider").notNull(),
	backupProvider: text("backup_provider").notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const seoKeywords = pgTable("seo_keywords", {
	id: serial().primaryKey().notNull(),
	project: text().default('bmv.vin').notNull(),
	keyword: text().notNull(),
	intent: text().notNull(),
	estimatedVolume: integer("estimated_volume"),
	difficulty: integer(),
	cpc: real(),
	priority: integer().default(1).notNull(),
	pageTargeting: text("page_targeting"),
	clusterId: text("cluster_id"),
	discoveredAt: timestamp("discovered_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("seo_keywords_intent_idx").using("btree", table.intent.asc().nullsLast().op("text_ops")),
	uniqueIndex("seo_keywords_keyword_project_unique_idx").using("btree", table.keyword.asc().nullsLast().op("text_ops"), table.project.asc().nullsLast().op("text_ops")),
	index("seo_keywords_priority_idx").using("btree", table.priority.asc().nullsLast().op("int4_ops")),
	index("seo_keywords_project_idx").using("btree", table.project.asc().nullsLast().op("text_ops")),
]);

export const vinEnrichmentQueue = pgTable("vin_enrichment_queue", {
	vin: varchar({ length: 17 }).primaryKey().notNull(),
	status: text().default('pending').notNull(),
	attempts: integer().default(0).notNull(),
	lastAttemptedAt: timestamp("last_attempted_at", { mode: 'string' }),
	error: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("vin_enrichment_queue_status_created_idx").using("btree", table.status.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	index("vin_enrichment_queue_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const seoContentPages = pgTable("seo_content_pages", {
	id: serial().primaryKey().notNull(),
	project: text().default('bmv.vin').notNull(),
	url: text().notNull(),
	pageType: text("page_type").notNull(),
	primaryKeyword: text("primary_keyword"),
	wordCount: integer("word_count"),
	indexed: boolean().default(false).notNull(),
	contentRef: text("content_ref"),
	generatedAt: timestamp("generated_at", { mode: 'string' }).defaultNow().notNull(),
	lastRefreshedAt: timestamp("last_refreshed_at", { mode: 'string' }),
}, (table) => [
	index("seo_content_pages_generated_idx").using("btree", table.generatedAt.asc().nullsLast().op("timestamp_ops")),
	index("seo_content_pages_project_idx").using("btree", table.project.asc().nullsLast().op("text_ops")),
	index("seo_content_pages_type_idx").using("btree", table.pageType.asc().nullsLast().op("text_ops")),
	uniqueIndex("seo_content_pages_url_unique_idx").using("btree", table.url.asc().nullsLast().op("text_ops"), table.project.asc().nullsLast().op("text_ops")),
]);

export const seoRefreshQueue = pgTable("seo_refresh_queue", {
	id: serial().primaryKey().notNull(),
	pageId: integer("page_id").notNull(),
	dueAt: timestamp("due_at", { mode: 'string' }).notNull(),
	status: text().default('pending').notNull(),
	priority: integer().default(1).notNull(),
	attempts: integer().default(0).notNull(),
	lastAttemptAt: timestamp("last_attempt_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	notes: text(),
}, (table) => [
	index("seo_refresh_queue_due_idx").using("btree", table.dueAt.asc().nullsLast().op("timestamp_ops")),
	index("seo_refresh_queue_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.pageId],
			foreignColumns: [seoContentPages.id],
			name: "seo_refresh_queue_page_id_fkey"
		}).onDelete("cascade"),
]);

export const vinBackfillDailyCounts = pgTable("vin_backfill_daily_counts", {
	utcDate: text("utc_date").primaryKey().notNull(),
	count: integer().default(0).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const aiUsageLogs = pgTable("ai_usage_logs", {
	id: serial().primaryKey().notNull(),
	feature: text().notNull(),
	model: text().notNull(),
	promptTokens: integer("prompt_tokens").default(0).notNull(),
	completionTokens: integer("completion_tokens").default(0).notNull(),
	costUsd: real("cost_usd").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_usage_logs_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("ai_usage_logs_feature_idx").using("btree", table.feature.asc().nullsLast().op("text_ops")),
]);

export const aiFaqCache = pgTable("ai_faq_cache", {
	id: serial().primaryKey().notNull(),
	pageType: text("page_type").notNull(),
	pageKey: text("page_key").notNull(),
	locale: text().notNull(),
	faqItems: jsonb("faq_items").notNull(),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ai_faq_cache_page_key_idx").using("btree", table.pageKey.asc().nullsLast().op("text_ops")),
	index("ai_faq_cache_page_type_idx").using("btree", table.pageType.asc().nullsLast().op("text_ops")),
	uniqueIndex("ai_faq_cache_unique_idx").using("btree", table.pageType.asc().nullsLast().op("text_ops"), table.pageKey.asc().nullsLast().op("text_ops"), table.locale.asc().nullsLast().op("text_ops")),
]);

export const istaEcuParts = pgTable("ista_ecu_parts", {
	id: serial().primaryKey().notNull(),
	ecuName: text("ecu_name").notNull(),
	brvCode: text("brv_code").notNull(),
	partNumber: text("part_number").notNull(),
	partNumberClean: text("part_number_clean"),
	bestellOption: text("bestell_option"),
	ecuDescription: text("ecu_description"),
	diagAddress: text("diag_address"),
	istaVersion: text("ista_version").default('4.59').notNull(),
	importedAt: timestamp("imported_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("ista_ecu_parts_brv_idx").using("btree", table.brvCode.asc().nullsLast().op("text_ops")),
	index("ista_ecu_parts_ecu_idx").using("btree", table.ecuName.asc().nullsLast().op("text_ops")),
	index("ista_ecu_parts_part_idx").using("btree", table.partNumberClean.asc().nullsLast().op("text_ops")),
	uniqueIndex("ista_ecu_parts_unique_idx").using("btree", table.ecuName.asc().nullsLast().op("text_ops"), table.partNumber.asc().nullsLast().op("text_ops"), table.brvCode.asc().nullsLast().op("text_ops")),
]);
