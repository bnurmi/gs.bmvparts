import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import { mountSeoPublisherRoutes } from "./seo/seo-publisher-routes";
import passport from "passport";
import { storage } from "./storage";
import * as appCache from "./cache";
import { startScrapeJob, isJobRunning, seedInitialCars, scrapeFromBmwPartsDeal, startEnrichment, getEnrichmentStatus, cancelEnrichment, rescrapePartsOnly, setUseProxy, getUseProxy } from "./scraper";
import { db, healthDb } from "./storage";
import { cars as carsTable, categories as categoriesTable, subcategories as subcategoriesTable, parts as partsTable, vinCache, linkClicks, partPricing as partPricingTable, partCrossReferences as partCrossRefsTable, bmwModels as bmwModelsTable, externalCatalogParts as externalCatalogPartsTable, vinFactoryOptions } from "@shared/schema";
import { eq, gt, lt, and } from "drizzle-orm";
import { readFile, writeFile, mkdir, readdir, unlink, stat } from "fs/promises";
import path from "path";
import { downloadAllImages } from "./download-images";
import { sql } from "drizzle-orm";
import { requireAuth, requireAdmin, requireAdminOrProvisionKey, requireApiKey, requireApiTier } from "./auth";
import { randomBytes } from "crypto";
import OpenAI from "openai";
import { decodeVin, lciVariants, fetchNhtsaData } from "./vin-decoder";
import { hasValidVinCheckDigit } from "./seo/vin-landing";
import { getCatalogAliases } from "./catalog-aliases";
import { resolveChassisViaRealoem, refreshRealoemVin, getRealoemBudgetStatus, getRealoemCachePage, createScrapeJob, getLatestScrapeJob, listScrapeJobs, checkFallbackRateLimit } from "./realoem-fallback";
import { spawn } from "child_process";
import { fetchBimmerWorkData, fetchMdecoderData, fetchVindecoderzData, queueVinForBatch, getVinQueueStatus, type BimmerWorkData } from "./bimmer-work-scraper";
import { enrichVin, getEnrichmentSourceStats, computeCoverageForVin, shouldSanitizeStaleCache } from "./vin-enrichment-service";
import { importDictionaries, countDictionaries } from "./dictionaries-import";
import { CARVERTICAL_SETTING_KEY, carverticalSettingsSchema, CARVERTICAL_DEFAULTS, type CarverticalSettings, type EnrichmentSourceMap, ECS_AFFILIATE_SETTING_KEY, TURNER_AFFILIATE_SETTING_KEY, affiliateShopLinkSchema, ECS_AFFILIATE_DEFAULTS, TURNER_AFFILIATE_DEFAULTS, type AffiliateShopLinkSettings, EBAY_AFFILIATE_SETTING_KEY, ebayAffiliateSchema, EBAY_AFFILIATE_DEFAULTS, type EbayAffiliateSettings, AMAZON_AFFILIATE_SETTING_KEY, amazonAffiliateSchema, AMAZON_AFFILIATE_DEFAULTS, type AmazonAffiliateSettings } from "@shared/schema";
import { startModelScrape, getModelScrapeProgress, cancelModelScrape } from "./model-scraper";
import { importLegacyBmwModels } from "./legacy-bmw-models";
// Shared idempotent bulk-insert for the bmw_models reference table.
// Used here (sync-from-dev, scrape pipelines, legacy import endpoint)
// and by the startup seed loader in server/bmw-models-seed.ts.
import { importBmwModels } from "./bmw-models-importer";
import { discoverVariants, discoverVariantsForChassisList, insertDiscoveredVariants } from "./variant-discovery";
import { startCrossRefEnrichment, getCrossRefStatus, cancelCrossRef, checkSinglePart, getCrossRefsForPart, getCrossRefStats } from "./realoem-crossref";
import * as realoemBackfill from "./realoem-backfill";
import { lookupPart as catalogLookupPart, searchByModel as catalogSearchByModel, type CatalogPart } from "./parts-catalog-client";
import { sendTestEmail, sendPasswordResetEmail } from "./email";
import { createHash } from "crypto";
import { downloadVinImages, migrateExistingVinImages, migrateModelImages, ensureLocalImagesExist } from "./vin-images";
import { runTypeCodeBackfill } from "./type-code-backfill";
import { checkRegoCache, lookupRegoWithToken, AUS_STATES, type AusState } from "./bmw-rego-lookup";
import { createDbBackup, createPreDeployBackup, restoreFromKey } from "./backup/db-backup";
import { createFileBackup } from "./backup/file-backup";
import { createCodeBackup } from "./backup/code-backup";
import { createAssetBytesBackup } from "./backup/asset-backup";
import { offsiteTestConnection, isOffsiteConfigured, getOffsiteConfig } from "./backup/offsite";
import {
  getBackupRetentionSettings, setBackupRetentionSettings,
  getBackupScheduleSettings, setBackupScheduleSettings,
} from "./backup/settings";
import { rescheduleJobs, getNextRuns, isSchedulerActive } from "./backup/scheduler";
import { totalSize as objectStorageTotalSize } from "./backup/object-storage";
import { backupRetentionDefaults, backupScheduleDefaults } from "@shared/schema";

function escSql(v: any): string {
  if (v === null || v === undefined) return "NULL";
  const s = String(v).replace(/'/g, "''").replace(/\\/g, "\\\\");
  return `'${s}'`;
}

async function bulkImportV2(data: any, force = false) {
  const { cars: exportCars, categories: exportCats, subcategories: exportSubs, parts: exportParts } = data;
  if (!exportCars?.length) return { status: "ok", carsImported: 0, totalParts: 0, skippedParts: 0, newParts: 0, message: "No data" };

  console.log(`Bulk import: ${exportCars.length} cars, ${exportCats.length} cats, ${exportSubs.length} subs, ${exportParts.length} parts${force ? " (FORCE)" : ""}`);
  const startTime = Date.now();

  const existingCars = await storage.getCars();

  const catalogIdToLocal = new Map<string, typeof existingCars[0]>();
  for (const car of existingCars) {
    if (car.catalogId) catalogIdToLocal.set(car.catalogId, car);
  }

  const oldCarIdToNewId = new Map<number, number>();
  const carsAlreadySynced = new Set<number>();
  let carsCreated = 0;

  for (const car of exportCars) {
    const cid = car.catalog_id || car.catalogId;
    const localCar = cid ? catalogIdToLocal.get(String(cid)) : undefined;

    if (localCar) {
      oldCarIdToNewId.set(car.id, localCar.id);
      const slug = car.slug;
      if (slug) await storage.updateCar(localCar.id, { slug });

      if (!force && localCar.scrapeStatus === "complete" && (localCar.totalParts ?? 0) > 0) {
        carsAlreadySynced.add(car.id);
      }
    } else if (cid) {
      const newCar = await storage.createCar({
        chassis: car.chassis || "",
        generation: car.generation || "",
        series: car.series || "M",
        bodyType: car.bodyType || car.body_type || "",
        modelName: car.modelName || car.model_name || "",
        displayName: car.displayName || car.display_name || "",
        engine: car.engine || null,
        yearStart: car.yearStart ?? car.year_start ?? null,
        yearEnd: car.yearEnd ?? car.year_end ?? null,
        catalogUrl: car.catalogUrl || car.catalog_url || "",
        catalogId: String(cid),
        imageUrl: car.imageUrl || car.image_url || null,
        slug: car.slug || null,
      });
      oldCarIdToNewId.set(car.id, newCar.id);
      carsCreated++;
    }
  }

  console.log(`  Matched ${oldCarIdToNewId.size - carsCreated}/${exportCars.length} existing cars, created ${carsCreated} new cars, ${carsAlreadySynced.size} already synced`);

  if (oldCarIdToNewId.size === 0) return { status: "ok", carsImported: 0, totalParts: 0, skippedParts: 0, newParts: 0, message: "No cars to import" };

  const carsToImport = exportCars.filter((c: any) => oldCarIdToNewId.has(c.id) && !carsAlreadySynced.has(c.id));

  if (carsToImport.length === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  All ${oldCarIdToNewId.size} cars already synced, nothing to import (${elapsed}s)`);
    return { status: "ok", carsImported: 0, totalParts: 0, skippedParts: exportParts.length, newParts: 0, elapsed: `${elapsed}s`, message: "All cars already synced" };
  }

  const newCarIds = new Set(carsToImport.map((c: any) => c.id));
  const newLocalCarIds = [...new Set(carsToImport.map((c: any) => oldCarIdToNewId.get(c.id)!))];

  await db.execute(sql.raw(`DELETE FROM parts WHERE car_id IN (${newLocalCarIds.join(",")})`));
  await db.execute(sql.raw(`DELETE FROM subcategories WHERE car_id IN (${newLocalCarIds.join(",")})`));
  await db.execute(sql.raw(`DELETE FROM categories WHERE car_id IN (${newLocalCarIds.join(",")})`));

  const relevantCats = exportCats.filter((c: any) => newCarIds.has(c.car_id ?? c.carId));
  const oldCatIds = new Set(relevantCats.map((c: any) => c.id));
  const relevantSubs = exportSubs.filter((s: any) => oldCatIds.has(s.category_id ?? s.categoryId));
  const oldSubIds = new Set(relevantSubs.map((s: any) => s.id));
  const relevantParts = exportParts.filter((p: any) => oldSubIds.has(p.subcategory_id ?? p.subcategoryId));

  console.log(`  Importing ${carsToImport.length} new cars: ${relevantCats.length} cats, ${relevantSubs.length} subs, ${relevantParts.length} parts`);

  const BATCH = 2000;

  const oldCatIdToNewId = new Map<number, number>();
  for (let i = 0; i < relevantCats.length; i += BATCH) {
    const batch = relevantCats.slice(i, i + BATCH);
    const values = batch.map((c: any) =>
      `(${oldCarIdToNewId.get(c.car_id ?? c.carId)}, ${escSql(c.category_id ?? c.categoryId)}, ${escSql(c.name)}, ${escSql(c.image_url ?? c.imageUrl)}, ${escSql(c.url)})`
    ).join(",");
    const result = await db.execute(sql.raw(
      `INSERT INTO categories (car_id, category_id, name, image_url, url) VALUES ${values} RETURNING id`
    ));
    const rows = (result as any).rows || result;
    batch.forEach((c: any, idx: number) => {
      oldCatIdToNewId.set(c.id, rows[idx].id);
    });
  }
  console.log(`  Inserted ${relevantCats.length} categories`);

  const oldSubIdToNewId = new Map<number, number>();
  for (let i = 0; i < relevantSubs.length; i += BATCH) {
    const batch = relevantSubs.slice(i, i + BATCH);
    const values = batch.map((s: any) =>
      `(${oldCatIdToNewId.get(s.category_id ?? s.categoryId)}, ${oldCarIdToNewId.get(s.car_id ?? s.carId)}, ${escSql(s.subcategory_id ?? s.subcategoryId)}, ${escSql(s.name)}, ${escSql(s.image_url ?? s.imageUrl)}, ${escSql(s.url)}, ${escSql(s.diagram_image_url ?? s.diagramImageUrl)})`
    ).join(",");
    const result = await db.execute(sql.raw(
      `INSERT INTO subcategories (category_id, car_id, subcategory_id, name, image_url, url, diagram_image_url) VALUES ${values} RETURNING id`
    ));
    const rows = (result as any).rows || result;
    batch.forEach((s: any, idx: number) => {
      oldSubIdToNewId.set(s.id, rows[idx].id);
    });
  }
  console.log(`  Inserted ${relevantSubs.length} subcategories`);

  for (let i = 0; i < relevantParts.length; i += BATCH) {
    const batch = relevantParts.slice(i, i + BATCH);
    const values = batch.map((p: any) =>
      `(${oldSubIdToNewId.get(p.subcategory_id ?? p.subcategoryId)}, ${oldCarIdToNewId.get(p.car_id ?? p.carId)}, ${escSql(p.item_no ?? p.itemNo)}, ${escSql(p.part_number ?? p.partNumber)}, ${escSql(p.part_number_clean ?? p.partNumberClean)}, ${escSql(p.description)}, ${escSql(p.additional_info ?? p.additionalInfo)}, ${escSql(p.part_date ?? p.partDate)}, ${escSql(p.quantity)}, ${(p.weight != null) ? p.weight : "NULL"}, ${escSql(p.notes)})`
    ).join(",");
    await db.execute(sql.raw(
      `INSERT INTO parts (subcategory_id, car_id, item_no, part_number, part_number_clean, description, additional_info, part_date, quantity, weight, notes) VALUES ${values}`
    ));
    if ((i + BATCH) % 10000 === 0 || i + BATCH >= relevantParts.length) {
      console.log(`  Parts: ${Math.min(i + BATCH, relevantParts.length)}/${relevantParts.length}`);
    }
  }

  for (const car of carsToImport) {
    const localId = oldCarIdToNewId.get(car.id);
    if (!localId) continue;
    await storage.updateCar(localId, {
      scrapeStatus: car.scrape_status || car.scrapeStatus || "complete",
      scrapeProgress: car.scrape_progress ?? car.scrapeProgress ?? 100,
      totalCategories: car.total_categories ?? car.totalCategories ?? 0,
      totalSubcategories: car.total_subcategories ?? car.totalSubcategories ?? 0,
      totalParts: car.total_parts ?? car.totalParts ?? 0,
      lastScrapedAt: car.last_scraped_at || car.lastScrapedAt ? new Date(car.last_scraped_at || car.lastScrapedAt) : new Date(),
      imageUrl: car.image_url || car.imageUrl || null,
    });
  }

  const skipped = exportParts.length - relevantParts.length;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Bulk import complete: ${relevantParts.length} new parts, ${skipped} skipped in ${elapsed}s`);
  return { status: "ok", carsImported: carsToImport.length, totalParts: relevantParts.length, skippedParts: skipped, newParts: relevantParts.length, elapsed: `${elapsed}s` };
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function importPartPricing(pricingRecords: any[], force = false) {
  if (!pricingRecords || pricingRecords.length === 0) return;

  const existingResult = await db.execute(sql.raw(`SELECT part_number_clean FROM part_pricing`));
  const existingParts = new Set(((existingResult as any).rows || existingResult).map((r: any) => r.part_number_clean));

  const newRecords = pricingRecords.filter((p: any) => {
    const pnc = p.part_number_clean || p.partNumberClean;
    return pnc && !existingParts.has(pnc);
  });

  const updateRecords = force ? pricingRecords.filter((p: any) => {
    const pnc = p.part_number_clean || p.partNumberClean;
    return pnc && existingParts.has(pnc);
  }) : [];

  if (newRecords.length === 0 && updateRecords.length === 0) {
    console.log(`  Part pricing: all ${pricingRecords.length} already exist, skipping`);
    return;
  }

  const BATCH = 500;
  for (let i = 0; i < newRecords.length; i += BATCH) {
    const batch = newRecords.slice(i, i + BATCH).map((p: any) => ({
      partNumberClean: p.part_number_clean || p.partNumberClean,
      source: p.source ?? null,
      dealPrice: toNumOrNull(p.deal_price ?? p.dealPrice),
      msrp: toNumOrNull(p.msrp),
      savings: toNumOrNull(p.savings),
      gbpPrice: toNumOrNull(p.gbp_price ?? p.gbpPrice),
      audApprox: toNumOrNull(p.aud_approx ?? p.audApprox),
      currency: p.currency ?? null,
      productUrl: p.product_url || p.productUrl || null,
      found: !!(p.found ?? false),
      lastCheckedAt: (p.last_checked_at || p.lastCheckedAt) ? new Date(p.last_checked_at || p.lastCheckedAt) : new Date(),
    }));
    try {
      await db.insert(partPricingTable).values(batch).onConflictDoNothing();
    } catch (e: any) {
      console.error(`  Pricing batch starting at ${i} failed: ${e.message}`);
      throw e;
    }
  }

  if (updateRecords.length > 0) {
    for (let i = 0; i < updateRecords.length; i += BATCH) {
      const batch = updateRecords.slice(i, i + BATCH);
      for (const p of batch) {
        const pnc = p.part_number_clean || p.partNumberClean;
        await db.execute(sql.raw(
          `UPDATE part_pricing SET source = ${escSql(p.source)}, deal_price = ${p.deal_price ?? p.dealPrice ?? "NULL"}, msrp = ${p.msrp ?? "NULL"}, savings = ${p.savings ?? "NULL"}, gbp_price = ${p.gbp_price ?? p.gbpPrice ?? "NULL"}, aud_approx = ${p.aud_approx ?? p.audApprox ?? "NULL"}, currency = ${escSql(p.currency)}, product_url = ${escSql(p.product_url || p.productUrl)}, found = ${p.found ?? false}, last_checked_at = ${p.last_checked_at || p.lastCheckedAt ? escSql(p.last_checked_at || p.lastCheckedAt) : "NOW()"} WHERE part_number_clean = ${escSql(pnc)}`
        ));
      }
    }
    console.log(`  Part pricing: updated ${updateRecords.length} existing records`);
  }
  console.log(`  Part pricing: imported ${newRecords.length} new (${pricingRecords.length - newRecords.length - updateRecords.length} unchanged)`);
}

async function importUsers(usersArr: any[]) {
  if (!usersArr || usersArr.length === 0) return;

  interface ExistingUserRow { id: string | number; username: string; password: string; role: string; }
  const existingResult = await db.execute(sql.raw(`SELECT id, username, password, role FROM users`));
  const existingRows: ExistingUserRow[] = ((existingResult as any).rows || existingResult) as ExistingUserRow[];
  const existingById = new Map<string | number, ExistingUserRow>(existingRows.map((r) => [r.id, r]));
  const existingByUsername = new Map<string, ExistingUserRow>(existingRows.map((r) => [r.username, r]));

  let inserted = 0;
  let updated = 0;

  for (const u of usersArr) {
    const existing = existingById.get(u.id) || existingByUsername.get(u.username);
    if (existing) {
      const needsUpdate = existing.password !== u.password || existing.role !== (u.role || 'user');
      if (needsUpdate) {
        await db.execute(sql.raw(
          `UPDATE users SET password = ${escSql(u.password)}, role = ${escSql(u.role || 'user')} WHERE id = ${escSql(existing.id)}`
        ));
        updated++;
      }
    } else {
      const createdAt = u.created_at || u.createdAt ? escSql(u.created_at || u.createdAt) : "NOW()";
      await db.execute(sql.raw(
        `INSERT INTO users (id, username, password, role, created_at) VALUES (${escSql(u.id)}, ${escSql(u.username)}, ${escSql(u.password)}, ${escSql(u.role || 'user')}, ${createdAt})`
      ));
      inserted++;
    }
  }
  console.log(`  Users: ${inserted} new, ${updated} updated (${usersArr.length - inserted - updated} unchanged)`);
}

async function importPartCrossReferences(crossRefs: any[]) {
  if (!crossRefs || crossRefs.length === 0) return;

  const existingResult = await db.execute(sql.raw(`SELECT part_number_clean, series_code FROM part_cross_references`));
  const existingKeys = new Set(((existingResult as any).rows || existingResult).map((r: any) => `${r.part_number_clean}:${r.series_code}`));

  const seen = new Set<string>();
  const newRefs = crossRefs.filter((r: any) => {
    const pnc = r.part_number_clean || r.partNumberClean;
    const sc = r.series_code || r.seriesCode;
    const key = `${pnc}:${sc}`;
    if (!pnc || !sc || existingKeys.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (newRefs.length === 0) {
    console.log(`  Cross-references: all ${crossRefs.length} already exist, skipping`);
    return;
  }

  const BATCH = 500;
  for (let i = 0; i < newRefs.length; i += BATCH) {
    const batch = newRefs.slice(i, i + BATCH).map((r: any) => ({
      partNumberClean: r.part_number_clean || r.partNumberClean,
      seriesCode: r.series_code || r.seriesCode,
      chassisCode: r.chassis_code || r.chassisCode || null,
      source: r.source || "realoem",
      checkedAt: (r.checked_at || r.checkedAt) ? new Date(r.checked_at || r.checkedAt) : new Date(),
    }));
    try {
      await db.insert(partCrossRefsTable).values(batch).onConflictDoNothing();
    } catch (e: any) {
      console.error(`  Cross-ref batch starting at ${i} failed: ${e.message}`);
      throw e;
    }
  }
  console.log(`  Cross-references: imported ${newRefs.length} new (${crossRefs.length - newRefs.length} already existed)`);
}

async function importRealoemCheckedParts(checkedParts: any[]) {
  if (!checkedParts || checkedParts.length === 0) return;

  const existingResult = await db.execute(sql.raw(`SELECT part_number_clean FROM realoem_checked_parts`));
  const existingParts = new Set(((existingResult as any).rows || existingResult).map((r: any) => r.part_number_clean));

  const seen = new Set<string>();
  const newParts = checkedParts.filter((p: any) => {
    const pnc = p.part_number_clean || p.partNumberClean;
    if (!pnc || existingParts.has(pnc) || seen.has(pnc)) return false;
    seen.add(pnc);
    return true;
  });

  if (newParts.length === 0) {
    console.log(`  RealOEM checked parts: all ${checkedParts.length} already exist, skipping`);
    return;
  }

  for (const p of newParts) {
    const pnc = p.part_number_clean || p.partNumberClean;
    const seriesCodes = p.series_codes || p.seriesCodes;
    const codesArray = Array.isArray(seriesCodes) ? seriesCodes : [];
    const foundVal = p.found === true || p.found === "true";
    const checkedAt = p.checked_at || p.checkedAt || null;

    await db.execute(sql`
      INSERT INTO realoem_checked_parts (part_number_clean, series_codes, found, checked_at)
      VALUES (${pnc}, ${codesArray}::text[], ${foundVal}, ${checkedAt ? new Date(checkedAt) : sql`NOW()`})
      ON CONFLICT (part_number_clean) DO NOTHING
    `);
  }
  console.log(`  RealOEM checked parts: imported ${newParts.length} new (${checkedParts.length - newParts.length} already existed)`);
}

async function importApiKeys(keysArr: any[]) {
  if (!keysArr || keysArr.length === 0) return;

  const existingResult = await db.execute(sql.raw(`SELECT key FROM api_keys`));
  const existingKeys = new Set(((existingResult as any).rows || existingResult).map((r: any) => r.key));

  const existingUsers = await db.execute(sql.raw(`SELECT id FROM users`));
  const validUserIds = new Set(((existingUsers as any).rows || existingUsers).map((r: any) => r.id));

  const newKeys = keysArr.filter((k: any) => {
    const key = k.key;
    const userId = k.user_id || k.userId;
    return key && !existingKeys.has(key) && validUserIds.has(userId);
  });

  if (newKeys.length === 0) {
    console.log(`  API keys: all ${keysArr.length} already exist or no matching users, skipping`);
    return;
  }

  for (const k of newKeys) {
    const userId = k.user_id || k.userId;
    const createdAt = k.created_at || k.createdAt ? escSql(k.created_at || k.createdAt) : "NOW()";
    const lastUsedAt = k.last_used_at || k.lastUsedAt ? escSql(k.last_used_at || k.lastUsedAt) : "NULL";
    await db.execute(sql.raw(
      `INSERT INTO api_keys (user_id, key, name, tier, active, created_at, last_used_at, request_count) VALUES (${escSql(userId)}, ${escSql(k.key)}, ${escSql(k.name)}, ${escSql(k.tier || 'basic')}, ${k.active ?? true}, ${createdAt}, ${lastUsedAt}, ${k.request_count ?? k.requestCount ?? 0})`
    ));
  }
  console.log(`  API keys: imported ${newKeys.length} new (${keysArr.length - newKeys.length} already existed)`);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed initial cars on startup unless explicitly disabled for VPS first boot.
  if (process.env.BMW_MODELS_SEED_DISABLED === "1" || process.env.BMV_DISABLE_STARTUP_SEED === "1") {
    console.log("[startup] Initial car seed disabled by environment");
  } else {
    await seedInitialCars();
  }

  mountSeoPublisherRoutes(app);

  // ---------------------------------------------------------------------------
  // GET /health — unauthenticated liveness + readiness probe.
  // Always returns HTTP 200. Degraded state is reported in the JSON body
  // ({ status: "degraded", db, redis }) so Replit's healthchecker never
  // force-restarts a running server due to a momentary Redis or DB hiccup.
  // Also updates the Prometheus dependency-health gauges so /metrics reflects
  // current DB and Redis state without a separate polling loop.
  // ---------------------------------------------------------------------------
  app.get("/health", async (_req, res) => {
    const { databaseUp, cacheUp } = await import("./metrics");

    let dbStatus: "ok" | "error" = "error";
    try {
      await healthDb.execute(sql`SELECT 1`);
      dbStatus = "ok";
      databaseUp.set(1);
    } catch {
      databaseUp.set(0);
    }

    let redisStatus: "ok" | "error" = "error";
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
      const host = redisUrl.replace(/^redis:\/\//, "").split(":")[0] || "127.0.0.1";
      const port = redisUrl.match(/:(\d+)(\/|$)/)?.[1] || "6379";
      const { stdout } = await execAsync(`redis-cli -h ${host} -p ${port} ping`, { timeout: 3000 });
      if (stdout.trim() === "PONG") { redisStatus = "ok"; cacheUp.set(1); }
      else cacheUp.set(0);
    } catch {
      // Redis is a cache — its absence is observable but not a reason to
      // restart the process. Always degrade gracefully.
      cacheUp.set(0);
    }

    const overallStatus = dbStatus === "ok" && redisStatus === "ok" ? "ok" : "degraded";
    // Always return HTTP 200 so Replit's healthchecker never force-restarts a
    // running server due to a momentary Redis or DB hiccup. Degraded state is
    // surfaced in the JSON body only.
    res.status(200).json({
      status: overallStatus,
      service: "bmv.parts",
      db: dbStatus,
      redis: redisStatus,
    });
  });

  // ---------------------------------------------------------------------------
  // bmv.parts → bmv.vin VIN redirect.
  // Registered early so no SSR middleware or catch-all can shadow it.
  // Users landing on https://www.bmv.parts/vin/:vin are 301-redirected to
  // https://www.bmv.vin/:vin so the canonical per-VIN landing page on the
  // vanity host receives all link equity. Short-circuits on bmv.vin (those
  // requests carry req.bmvVinHost = true and are handled by the SSR layer).
  // Non-VIN paths fall through so the SPA can still serve /vin as a page.
  // ---------------------------------------------------------------------------
  app.get("/vin/:vin", (req, res, next) => {
    if (req.bmvVinHost === true) return next();
    const vin = String(req.params.vin || "").toUpperCase().replace(/\s+/g, "");
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return next();
    return res.redirect(301, `https://www.bmv.vin/${vin}`);
  });

  // ---------------------------------------------------------------------------
  // GET /metrics — Prometheus text-format metrics scrape endpoint.
  //
  // Access control (defence-in-depth, two independent layers):
  //   1. IP allow-list: loopback + RFC-1918 ranges are always allowed.
  //      On a VM behind Nginx the real client IP is 127.0.0.1, so this is
  //      sufficient for a same-host Prometheus agent.
  //      When Prometheus scrapes from a remote host (monitor.hiddenservers.net),
  //      either restrict port 5000 via firewall to that host's IP only, OR
  //      set METRICS_TOKEN and use bearer authentication (see below).
  //   2. Bearer token: if METRICS_TOKEN env var is set, every request must
  //      carry `Authorization: Bearer <token>`. This is additive — a private-IP
  //      request without a token is still allowed when METRICS_TOKEN is unset.
  //
  // To set a token on the VM:  echo "METRICS_TOKEN=<secret>" >> /opt/bmv.parts/.env
  // Prometheus scrape_config:  authorization: { type: Bearer, credentials: <secret> }
  // ---------------------------------------------------------------------------
  app.get("/metrics", async (req, res) => {
    const { register, isPrivateIp } = await import("./metrics");

    const metricsToken = process.env.METRICS_TOKEN;
    const clientIp = (
      (req.headers["x-real-ip"] as string) ||
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      ""
    );

    // Layer 1: token check (when configured)
    if (metricsToken) {
      const authHeader = req.headers.authorization || "";
      const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (provided !== metricsToken) {
        res.setHeader("WWW-Authenticate", 'Bearer realm="bmv.parts metrics"');
        return res.status(401).json({ error: "Unauthorized" });
      }
    } else {
      // Layer 2: IP allow-list (when no token is configured)
      if (!isPrivateIp(clientIp)) {
        return res.status(403).json({ error: "Forbidden: /metrics is restricted to private network access. Set METRICS_TOKEN to enable remote scraping." });
      }
    }

    try {
      const output = await register.metrics();
      res.setHeader("Content-Type", register.contentType);
      res.send(output);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  ensureIndexes().catch((e: any) => console.log("Background index creation:", e.message));

  // /images/* is always served from Object Storage (in both dev and prod).
  // Local public/images/ has been removed from the workspace to keep deploy
  // uploads small. Single source of truth: OS keys images/<sub>/<file>.
  const { mountImageProxy } = await import("./static");
  mountImageProxy(app);

  // GET /api/catalog/status — public catalog freshness chip. Returns
  // {lastFullSyncAt, hoursSinceLastSync, healthy} derived from the most
  // recent successful car scrape. Cached in-process for 60s.
  let _catalogStatusCache: { at: number; payload: any } | null = null;
  app.get("/api/catalog/status", async (_req, res) => {
    try {
      if (_catalogStatusCache && Date.now() - _catalogStatusCache.at < 60_000) {
        return res.json(_catalogStatusCache.payload);
      }
      const cars = await storage.getCars();
      let latest: Date | null = null;
      let completeCount = 0;
      let totalScrapable = 0;
      for (const c of cars) {
        if (c.scrapeStatus === "unavailable") continue;
        totalScrapable++;
        if (c.scrapeStatus === "complete") completeCount++;
        if (c.lastScrapedAt) {
          const d = new Date(c.lastScrapedAt as any);
          if (!latest || d > latest) latest = d;
        }
      }
      const hoursSince = latest ? Math.floor((Date.now() - latest.getTime()) / (1000 * 60 * 60)) : null;
      const healthy = hoursSince !== null && hoursSince < 24 * 7;
      const payload = {
        lastFullSyncAt: latest ? latest.toISOString() : null,
        hoursSinceLastSync: hoursSince,
        healthy,
        completeCount,
        totalScrapable,
      };
      _catalogStatusCache = { at: Date.now(), payload };
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Per-VIN SSR for /vin/:VIN — must run before serveStatic/setupVite so
  // the SPA fallback doesn't intercept the route.
  const { mountVinSeoSsr } = await import("./seo/vin-ssr-middleware");
  mountVinSeoSsr(app);

  // BMV.VIN content surface (Task #96): decoder home, per-brand decoder
  // hubs, faceted hubs, guide library, glossary. Only fires when the
  // host-rewrite middleware has tagged the request as bmvVinHost so
  // bmv.parts traffic is unaffected. Mounted before serveStatic so the
  // SPA fallback doesn't intercept these routes.
  // bmv.vin sitemap subtree + robots.txt (Task #96, T007). Each handler
  // short-circuits unless `req.bmvVinHost === true`, so the canonical
  // bmv.parts /robots.txt and /sitemap.xml routes (defined later in this
  // file) keep working unchanged. Must mount BEFORE the bmv-vin SSR
  // middleware (which is an `app.use(...)` catch-all) so XML routes win.
  const { mountBmvVinSitemaps } = await import("./seo/bmv-vin-sitemaps");
  mountBmvVinSitemaps(app);

  // ---------------------------------------------------------------------------
  // No-JS decoder form fallback (Task #96 review fix).
  // ---------------------------------------------------------------------------
  // The decoder form rendered by bmv-vin-pages.ts (`vinInputForm`) submits
  // GET /decode?vin=ABC. This endpoint does the trivial server-side bounce
  // so that crawlers and JS-disabled browsers still land on the per-VIN
  // landing. On bmv.vin we 302 to /<VIN> (the host-rewrite middleware in
  // server/index.ts will then internally hit /vin/<VIN>); on bmv.parts we
  // 302 to /vin/<VIN> directly. Anything else (missing/invalid VIN) bounces
  // back to the decoder home with the input preserved as a query string so
  // the SPA can show a validation error.
  app.get("/decode", (req, res) => {
    const raw = String(req.query.vin || "").toUpperCase().replace(/\s+/g, "");
    const isVinShape = /^[A-HJ-NPR-Z0-9]{17}$/.test(raw);
    const isVinHost = req.bmvVinHost === true;
    if (!isVinShape) {
      // Bounce back to decoder home with input preserved.
      const back = isVinHost ? "/" : "/vin";
      const qs = raw ? `?vin=${encodeURIComponent(raw)}&error=invalid` : "?error=invalid";
      return res.redirect(302, `${back}${qs}`);
    }
    return res.redirect(302, isVinHost ? `/${raw}` : `/vin/${raw}`);
  });

  const { mountBmvVinSeoSsr } = await import("./seo/bmv-vin-ssr-middleware");
  mountBmvVinSeoSsr(app);

  // Catalog SSR (Task #133): /chassis/:code, /series/:slug, /car/:slug,
  // /part/:partNumber and locale-prefixed variants. Injects head+body
  // fragments so Googlebot sees real HTML without executing JavaScript.
  // Short-circuits on bmv.vin; must run before serveStatic/setupVite.
  const { mountCatalogSsr } = await import("./seo/catalog-ssr-middleware");
  mountCatalogSsr(app);

  // ---------------------------------------------------------------------------
  // bmv.vin admin + public read endpoints (Task #96, T010 + client hydration).
  // ---------------------------------------------------------------------------
  // Public reads (used by the SPA pages to hydrate from the SSR markup).
  app.get("/api/bmv-vin/guides", async (_req, res) => {
    try {
      const { bmvVinStorage } = await import("./storage");
      const guides = await bmvVinStorage.listGuides();
      res.json({ guides });
    } catch (err: any) { res.status(500).json({ error: err?.message || "list-guides failed" }); }
  });
  app.get("/api/bmv-vin/guides/:slug", async (req, res) => {
    try {
      const { bmvVinStorage } = await import("./storage");
      const guide = await bmvVinStorage.getGuide((req.params["slug"] as string));
      res.json({ guide: guide ?? null });
    } catch (err: any) { res.status(500).json({ error: err?.message || "get-guide failed" }); }
  });
  app.get("/api/bmv-vin/glossary", async (_req, res) => {
    try {
      const { bmvVinStorage } = await import("./storage");
      const terms = await bmvVinStorage.listGlossary();
      res.json({ terms });
    } catch (err: any) { res.status(500).json({ error: err?.message || "list-glossary failed" }); }
  });
  app.get("/api/bmv-vin/glossary/:term", async (req, res) => {
    try {
      const { bmvVinStorage } = await import("./storage");
      const term = await bmvVinStorage.getGlossary((req.params["term"] as string));
      res.json({ term: term ?? null });
    } catch (err: any) { res.status(500).json({ error: err?.message || "get-term failed" }); }
  });

  // Admin CRUD — gated by requireAdmin (defined elsewhere in this file).
  // Each table mounts: GET /…  → { rows: [...] }, POST /…  → upsert one row,
  // DELETE /…/:id → delete by primary key.
  const adminBmvVin = (
    cfg: {
      basePath: string;
      list: () => Promise<any[]>;
      upsert: (row: any) => Promise<any>;
      del?: (id: number) => Promise<void>;
      schema?: { parse: (v: any) => any };
    },
  ) => {
    app.get(cfg.basePath, requireAdmin, async (_req, res) => {
      try { res.json({ rows: await cfg.list() }); }
      catch (err: any) { res.status(500).json({ error: err?.message }); }
    });
    app.post(cfg.basePath, requireAdmin, async (req, res) => {
      try {
        const data = cfg.schema ? cfg.schema.parse(req.body) : req.body;
        const row = await cfg.upsert(data);
        res.json({ row });
      } catch (err: any) { res.status(400).json({ error: err?.message }); }
    });
    if (cfg.del) {
      app.delete(`${cfg.basePath}/:id`, requireAdmin, async (req, res) => {
        try { await cfg.del!(Number((req.params["id"] as string))); res.json({ ok: true }); }
        catch (err: any) { res.status(500).json({ error: err?.message }); }
      });
    }
  };

  {
    const { bmvVinStorage } = await import("./storage");
    const {
      insertBmvVinHomeCopySchema, insertBmvVinBrandDecoderCopySchema,
      insertBmvVinFacetBlurbSchema, insertBmvVinGuideSchema, insertBmvVinGlossarySchema,
    } = await import("@shared/schema");

    adminBmvVin({
      basePath: "/api/admin/bmv-vin/home",
      list: () => bmvVinStorage.listHomeCopy(),
      upsert: (r: any) => bmvVinStorage.upsertHomeCopy(r),
      schema: insertBmvVinHomeCopySchema,
    });
    adminBmvVin({
      basePath: "/api/admin/bmv-vin/brand",
      list: () => bmvVinStorage.listBrandDecoderCopy(),
      upsert: (r: any) => bmvVinStorage.upsertBrandDecoderCopy(r),
      schema: insertBmvVinBrandDecoderCopySchema,
    });
    adminBmvVin({
      basePath: "/api/admin/bmv-vin/facet",
      list: () => bmvVinStorage.listFacetBlurbs(),
      upsert: (r: any) => bmvVinStorage.upsertFacetBlurb(r),
      del:    (id: number) => bmvVinStorage.deleteFacetBlurb(id),
      schema: insertBmvVinFacetBlurbSchema,
    });
    adminBmvVin({
      basePath: "/api/admin/bmv-vin/guides",
      // Admin needs to see drafts so they can flip `published` true/false.
      list: () => bmvVinStorage.listGuides({ includeDrafts: true }),
      upsert: (r: any) => bmvVinStorage.upsertGuide(r),
      del:    (id: number) => bmvVinStorage.deleteGuide(id),
      schema: insertBmvVinGuideSchema,
    });
    adminBmvVin({
      basePath: "/api/admin/bmv-vin/glossary",
      list: () => bmvVinStorage.listGlossary(undefined, { includeDrafts: true }),
      upsert: (r: any) => bmvVinStorage.upsertGlossary(r),
      del:    (id: number) => bmvVinStorage.deleteGlossary(id),
      schema: insertBmvVinGlossarySchema,
    });

    // Coverage tile: facet cohort counts (vin_cache) + the set of authored
    // facet blurbs so the UI can compute coverage = blurbs / cohorts per kind.
    app.get("/api/admin/bmv-vin/coverage", requireAdmin, async (_req, res) => {
      try {
        const [coverage, contentCoverage, blurbRows] = await Promise.all([
          bmvVinStorage.getFacetCoverage(),
          bmvVinStorage.getContentCoverage(),
          bmvVinStorage.listFacetBlurbs(),
        ]);
        const blurbs = blurbRows.map(b => ({
          facetKind: b.facetKind, facetValue: b.facetValue,
        }));
        res.json({ ...coverage, blurbs, content: contentCoverage });
      } catch (err: any) { res.status(500).json({ error: err?.message }); }
    });

    // Seed runner — admin-triggered idempotent bulk upsert from the
    // hand-authored seed file.
    app.post("/api/admin/bmv-vin/seed", requireAdmin, async (_req, res) => {
      try {
        const { seedBmvVinContent } = await import("./seo/bmv-vin-seed");
        const report = await seedBmvVinContent();
        res.json({ ok: true, report });
      } catch (err: any) { res.status(500).json({ error: err?.message }); }
    });

    // SSR preview — renders any bmv.vin SSR page using the same builders the
    // live host uses, so editors can preview the exact crawler-visible HTML
    // (head + body + JSON-LD) of a row right after they save it. Embedded in
    // an iframe in the BMV.VIN admin panel. Authenticated/admin-only.
    //
    // Query params:
    //   type=home|brand|facet-index|facet|guide-index|guide|glossary-index|glossary
    //   kind=<brand or facet kind>
    //   value=<facet value | guide slug | glossary term>
    //   locale=<bcp47 locale>          (defaults to "en")
    //   page=<n>                       (facet hubs only)
    app.get("/api/admin/bmv-vin/ssr-preview", requireAdmin, async (req, res) => {
      try {
        const { renderBmvVinAdminPreview } = await import("./seo/bmv-vin-ssr-middleware");
        const type = String(req.query.type ?? "home") as any;
        const kind = req.query.kind ? String(req.query.kind) : undefined;
        const value = req.query.value ? String(req.query.value) : undefined;
        const locale = req.query.locale ? String(req.query.locale) : undefined;
        const page = req.query.page ? Math.max(1, parseInt(String(req.query.page), 10)) : undefined;
        const result = await renderBmvVinAdminPreview(req, { type, kind, value, locale, page });
        res.status(result.status).type("html").send(result.html);
      } catch (err: any) {
        res.status(500).type("html")
           .send(`<pre style="color:#b00;font:12px monospace">SSR preview failed: ${String(err?.message ?? err)}</pre>`);
      }
    });
  }

  app.get("/go", async (req, res) => {
    const url = req.query.url as string;
    const label = req.query.label as string | undefined;
    const partNumber = req.query.pn as string | undefined;
    const source = req.query.src as string | undefined;

    if (!url) {
      return res.status(400).send("Missing url parameter");
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return res.status(400).send("Only http and https URLs are allowed");
      }
    } catch {
      return res.status(400).send("Invalid url");
    }

    try {
      await db.insert(linkClicks).values({
        url: req.originalUrl,
        destination: url,
        label: label || null,
        partNumber: partNumber || null,
        source: source || null,
        referrer: (req.headers.referer || req.headers.referrer || null) as string | null,
        userAgent: req.headers["user-agent"] || null,
        ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null,
      });
    } catch (err) {
      console.error("[LinkTracker] Failed to log click:", err);
    }

    res.redirect(302, url);
  });

  app.get("/api/admin/link-clicks/stats", requireAdmin, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const cutoff = new Date(Date.now() - days * 86400000);

      const totalClicks = await db.select({ count: sql<number>`count(*)` })
        .from(linkClicks)
        .where(gt(linkClicks.clickedAt, cutoff));

      const byDestination = await db.execute(sql`
        SELECT
          CASE
            WHEN destination LIKE '%linksynergy%' AND destination LIKE '%turnermotorsport%' THEN 'Turner Motorsport'
            WHEN destination LIKE '%linksynergy%' AND destination LIKE '%ecstuning%' THEN 'ECS Tuning'
            WHEN destination LIKE '%ecstuning%' THEN 'ECS Tuning'
            WHEN destination LIKE '%ebay.com%' THEN 'eBay'
            WHEN destination LIKE '%amazon.com%' THEN 'Amazon'
            WHEN destination LIKE '%mperformance.parts%' THEN 'MPerformance.parts'
            WHEN destination LIKE '%bmwpartsdeal%' THEN 'BMWPartsDeal'
            WHEN destination LIKE '%lllparts%' THEN 'LLLParts'
            WHEN destination LIKE '%gearswap%' THEN 'GearSwap'
            WHEN destination LIKE '%bmbolts%' THEN 'BMBolts'
            WHEN destination LIKE '%8hp.shop%' THEN '8HP.shop'
            ELSE destination
          END as site,
          count(*) as clicks,
          count(DISTINCT part_number) FILTER (WHERE part_number IS NOT NULL) as unique_parts
        FROM link_clicks
        WHERE clicked_at > ${cutoff}
        GROUP BY site
        ORDER BY clicks DESC
      `);

      const byDay = await db.execute(sql`
        SELECT
          to_char(clicked_at, 'YYYY-MM-DD') as day,
          count(*) as clicks
        FROM link_clicks
        WHERE clicked_at > ${cutoff}
        GROUP BY day
        ORDER BY day DESC
        LIMIT ${days}
      `);

      const uniquePartsResult = await db.execute(sql`
        SELECT count(DISTINCT part_number) as count
        FROM link_clicks
        WHERE clicked_at > ${cutoff} AND part_number IS NOT NULL
      `);

      const topParts = await db.execute(sql`
        SELECT part_number, count(*) as clicks
        FROM link_clicks
        WHERE clicked_at > ${cutoff} AND part_number IS NOT NULL
        GROUP BY part_number
        ORDER BY clicks DESC
        LIMIT 20
      `);

      res.json({
        totalClicks: Number(totalClicks[0]?.count || 0),
        uniqueParts: Number(uniquePartsResult.rows[0]?.count || 0),
        days,
        byDestination: byDestination.rows,
        byDay: byDay.rows,
        topParts: topParts.rows,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/download-images", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Image download disabled in production" });
    }
    try {
      const result = await downloadAllImages();
      res.json({ status: "ok", ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/cars - list all cars
  app.get("/api/cars", async (req, res) => {
    try {
      const cars = await storage.getCars();
      res.json(cars);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/cars/homepage — slim per-card payload for the homepage
  // grid (Task #162). Drops the bulky text columns the homepage card
  // never reads (catalogUrl, scrapeError, image_url, etc.). Redis-cached
  // for 60 s so the DB is bypassed entirely when scrapers are running.
  app.get("/api/cars/homepage", async (_req, res) => {
    const cached = await appCache.getHomepageCars();
    if (cached !== undefined) {
      res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=60");
      return res.json(cached);
    }
    try {
      const cars = await storage.getCarsForHomepage();
      await appCache.setHomepageCars(cars);
      res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=60");
      res.json(cars);
    } catch (err: any) {
      // DB is under pressure or timed out — serve the stale backup key (up to
      // 10 min old, separate TTL from the live key) so the page doesn't blank.
      const stale = await appCache.getHomepageCarsStale();
      if (stale !== undefined) {
        console.warn(`[cache] stale-hit: /api/cars/homepage (db error: ${err.message})`);
        res.set("Cache-Control", "no-store");
        return res.json(stale);
      }
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/cars/seo/:slug?locale=… — Localized meta title/description for
  // the /car/:slug landing page (Task #36). Registered BEFORE the generic
  // /api/cars/:idOrSlug route below so Express matches it first.
  app.get("/api/cars/seo/:slug", async (req, res) => {
    try {
      const slug = ((req.params["slug"] as string) || "").trim();
      if (!slug) return res.status(400).json({ error: "slug required" });
      const car = await storage.getCarBySlug(slug);
      if (!car) return res.status(404).json({ error: "Car not found" });

      const { SUPPORTED_LOCALES, getPack } = await import("../shared/i18n");
      const reqLocale = typeof req.query.locale === "string" ? req.query.locale : "";
      const locale = (SUPPORTED_LOCALES as readonly string[]).includes(reqLocale) ? reqLocale : "en";
      const pack = getPack(locale);

      const totalParts = car.totalParts ?? 0;
      const buildIn = {
        displayName: car.displayName,
        chassis: car.chassis || "",
        modelName: car.modelName || car.displayName,
        engine: car.engine || "",
        totalParts,
        totalPartsFmt: totalParts.toLocaleString(),
      };

      res.set("Cache-Control", "public, max-age=300, s-maxage=3600");
      res.json({
        slug,
        locale,
        content: {
          metaTitle: pack.buildCarMetaTitle(buildIn),
          metaDescription: pack.buildCarMetaDescription(buildIn),
          inLanguage: pack.meta.bcp47,
        },
      });
    } catch (err: any) {
      console.error("[seo/car] failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/cars/:idOrSlug - get single car by id or slug
  app.get("/api/cars/:idOrSlug", async (req, res) => {
    try {
      const param = (req.params["idOrSlug"] as string);
      const car = /^\d+$/.test(param)
        ? await storage.getCar(parseInt(param))
        : await storage.getCarBySlug(param);
      if (!car) return res.status(404).json({ error: "Car not found" });
      res.json(car);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/cars/:id/scrape - start scraping a car
  app.post("/api/cars/:id/scrape", async (req, res) => {
    try {
      const carId = parseInt((req.params["id"] as string));
      const car = await storage.getCar(carId);
      if (!car) return res.status(404).json({ error: "Car not found" });
      if (!car.catalogUrl) return res.status(400).json({ error: "No catalog URL for this car" });
      if (isJobRunning(carId)) return res.status(409).json({ error: "Scrape already running" });

      if (car.catalogUrl.includes('bmwpartsdeal.com')) {
        scrapeFromBmwPartsDeal(carId, car.catalogUrl).catch(err => {
          console.error(`BPD scrape error for car ${carId}:`, err);
        });
      } else {
        await startScrapeJob(carId);
      }
      res.json({ status: "started" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/cars/:id/scrape - cancel scrape
  app.delete("/api/cars/:id/scrape", async (req, res) => {
    try {
      const carId = parseInt((req.params["id"] as string));
      // The activeJobs map is checked, we can clear by updating status
      await storage.updateCar(carId, { scrapeStatus: "cancelled" });
      res.json({ status: "cancelled" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discover-variants", async (req, res) => {
    try {
      const { discovered, newVariants, existingCatalogIds } = await discoverVariants();
      res.json({
        totalDiscovered: discovered.length,
        alreadyInDb: existingCatalogIds.size,
        newVariants: newVariants.length,
        variants: newVariants.map(v => ({
          chassis: v.chassis,
          bodyType: v.bodyType,
          modelName: v.modelName,
          catalogId: v.catalogId,
          series: v.series,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/discover-variants/insert", async (req, res) => {
    try {
      const { newVariants } = await discoverVariants();
      if (newVariants.length === 0) {
        return res.json({ status: "ok", inserted: 0, message: "All variants already in database" });
      }
      const created = await insertDiscoveredVariants(newVariants);
      res.json({ status: "ok", inserted: created.length, cars: created.map(c => ({ id: c.id, displayName: c.displayName, catalogId: c.catalogId })) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/discover-variants/by-chassis", async (req, res) => {
    try {
      const { chassisCodes, autoInsert } = req.body || {};
      if (!chassisCodes || !Array.isArray(chassisCodes) || chassisCodes.length === 0) {
        return res.status(400).json({ error: "chassisCodes must be a non-empty array of strings" });
      }
      const { newVariants } = await discoverVariantsForChassisList(chassisCodes);
      if (autoInsert && newVariants.length > 0) {
        const created = await insertDiscoveredVariants(newVariants);
        return res.json({ status: "ok", discovered: newVariants.length, inserted: created.length, cars: created.map(c => ({ id: c.id, displayName: c.displayName, catalogId: c.catalogId, chassis: c.chassis })) });
      }
      res.json({
        discovered: newVariants.length,
        variants: newVariants.map(v => ({
          chassis: v.chassis,
          bodyType: v.bodyType,
          modelName: v.modelName,
          catalogId: v.catalogId,
          series: v.series,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========================================
  // BACKUP SYSTEM ROUTES
  // ========================================
  function requireBackupHealthToken(req: any, res: any, next: any) {
    const expected = process.env.BACKUP_HEALTH_TOKEN;
    const provided = req.query.token || req.headers["x-backup-token"];
    if (req.isAuthenticated?.() && req.user?.role === "admin") return next();
    if (expected && provided && expected === provided) return next();
    return res.status(401).json({ error: "admin or backup token required" });
  }

  async function buildHealthSummary() {
    const [lastDb, lastFiles, lastDbSuccess] = await Promise.all([
      storage.getLatestBackupLog("database"),
      storage.getLatestBackupLog("files"),
      storage.getLatestBackupLog("database", "verified"),
    ]);
    const since = new Date(Date.now() - 30 * 86400_000);
    const [dbCount30d, dbSuccess30d, fileCount30d] = await Promise.all([
      storage.countBackupLogsSince(since, "database"),
      storage.countBackupLogsSince(since, "database", "verified"),
      storage.countBackupLogsSince(since, "files"),
    ]);
    let onsiteUsage: { count: number; bytes: number } | null = null;
    try {
      onsiteUsage = await objectStorageTotalSize("backups/");
    } catch (err) {
      console.warn("[Backup/Health] totalSize failed:", err);
    }
    const offsiteCfg = getOffsiteConfig();
    return {
      schedulerActive: isSchedulerActive(),
      offsiteConfigured: isOffsiteConfigured(),
      offsite: offsiteCfg ? { endpoint: offsiteCfg.endpoint, bucket: offsiteCfg.bucket, prefix: offsiteCfg.prefix } : null,
      lastDb,
      lastDbSuccess,
      lastFiles,
      lastDbAt: lastDb?.createdAt || null,
      lastDbSuccessAt: lastDbSuccess?.completedAt || lastDbSuccess?.createdAt || null,
      hoursSinceLastDbSuccess: lastDbSuccess
        ? (Date.now() - new Date(lastDbSuccess.completedAt || lastDbSuccess.createdAt).getTime()) / 3600000
        : null,
      onsiteUsage,
      counts30d: {
        dbAttempts: dbCount30d,
        dbSuccesses: dbSuccess30d,
        fileAttempts: fileCount30d,
      },
      nextRuns: getNextRuns(),
    };
  }

  app.get("/api/admin/backups", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
      const offset = parseInt(req.query.offset as string) || 0;
      const type = (req.query.type as string) || undefined;
      const [logs, total, health] = await Promise.all([
        storage.listBackupLogs(limit, offset, type),
        storage.countBackupLogs(type),
        buildHealthSummary(),
      ]);
      res.json({ logs, total, limit, offset, health });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/backups/run-db", requireAdmin, async (req, res) => {
    try {
      const label = (req.body?.label as string) || undefined;
      const result = await createDbBackup({ trigger: "manual", label });
      res.json({ ok: result.ok, log: result.log, error: result.error });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/backups/run-files", requireAdmin, async (req, res) => {
    try {
      const result = await createFileBackup("manual");
      res.json({ ok: result.ok, log: result.log, error: result.error });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/backups/run-code", requireAdmin, async (req, res) => {
    try {
      const result = await createCodeBackup("manual");
      res.json({ ok: result.ok, log: result.log, error: result.error });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/backups/run-assets-full", requireAdmin, async (req, res) => {
    try {
      const result = await createAssetBytesBackup("manual");
      res.json({ ok: result.ok, log: result.log, error: result.error });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/backups/settings", requireAdmin, async (req, res) => {
    try {
      const [retention, schedule] = await Promise.all([
        getBackupRetentionSettings(),
        getBackupScheduleSettings(),
      ]);
      res.json({
        retention,
        schedule,
        defaults: { retention: backupRetentionDefaults, schedule: backupScheduleDefaults },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/backups/retention", requireAdmin, async (req, res) => {
    try {
      const updated = await setBackupRetentionSettings(req.body || {});
      res.json({ ok: true, retention: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/backups/schedule", requireAdmin, async (req, res) => {
    try {
      const updated = await setBackupScheduleSettings(req.body || {});
      await rescheduleJobs();
      res.json({ ok: true, schedule: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/backups/test-offsite", requireAdmin, async (req, res) => {
    try {
      const result = await offsiteTestConnection();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/backups/restore/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt((req.params["id"] as string), 10);
      const log = await storage.getBackupLog(id);
      if (!log) return res.status(404).json({ error: "Backup not found" });
      res.json({ log, offsiteAvailable: log.offsiteStatus === "uploaded" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/backups/restore/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt((req.params["id"] as string), 10);
      const log = await storage.getBackupLog(id);
      if (!log) return res.status(404).json({ error: "Backup not found" });
      if (log.backupType !== "database") return res.status(400).json({ error: "Only database backups can be restored" });
      if (!log.storageKey) return res.status(400).json({ error: "Backup has no stored artifact" });
      if (log.status !== "verified") return res.status(400).json({ error: "Only verified backups can be restored" });
      const source = (req.body?.source === "offsite" ? "offsite" : "onsite") as "onsite" | "offsite";
      console.log(`[Backup/Restore] Admin ${req.user?.username} restoring backup #${id} from ${source}`);
      const result = await restoreFromKey(log.storageKey, source);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/backup/pre-deploy", requireBackupHealthToken, async (req, res) => {
    try {
      const result = await createPreDeployBackup();
      res.json({ ok: result.ok, log: result.log, error: result.error });
    } catch (err: any) {
      // Always 200 so deploys aren't blocked
      res.json({ ok: false, error: err.message });
    }
  });

  app.get("/api/admin/backup/health", requireBackupHealthToken, async (req, res) => {
    try {
      const summary = await buildHealthSummary();
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/test-email", requireAdmin, async (req, res) => {
    try {
      const { to } = req.body || {};
      if (!to || typeof to !== "string") {
        return res.status(400).json({ error: "Email address (to) is required" });
      }
      const result = await sendTestEmail(to);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/scrape-proxy", requireAdmin, async (req, res) => {
    const hasCredentials = !!(process.env.OXYLABS_USERNAME && process.env.OXYLABS_PASSWORD);
    res.json({ useProxy: getUseProxy(), hasCredentials });
  });

  app.post("/api/scrape-proxy", requireAdmin, async (req, res) => {
    const { useProxy } = req.body || {};
    if (typeof useProxy !== "boolean") {
      return res.status(400).json({ error: "useProxy must be a boolean" });
    }
    const hasCredentials = !!(process.env.OXYLABS_USERNAME && process.env.OXYLABS_PASSWORD);
    if (useProxy && !hasCredentials) {
      return res.status(400).json({ error: "Cannot enable proxy: OXYLABS_USERNAME and OXYLABS_PASSWORD environment variables are not set" });
    }
    setUseProxy(useProxy);
    res.json({ useProxy: getUseProxy(), hasCredentials });
  });

  app.get("/api/scrape-status", requireAdmin, async (req, res) => {
    try {
      const allCars = await storage.getCars();
      const running = allCars.filter(c => isJobRunning(c.id));
      const idle = allCars.filter(c => (c.scrapeStatus === "idle" || c.scrapeStatus === "queued") && c.totalParts === 0);
      const errored = allCars.filter(c => c.scrapeStatus === "error");
      const erroredNoParts = errored.filter(c => c.totalParts === 0);
      const complete = allCars.filter(c => c.scrapeStatus === "complete");
      const withParts = allCars.filter(c => (c.totalParts ?? 0) > 0);
      const totalParts = allCars.reduce((s, c) => s + (c.totalParts || 0), 0);

      res.json({
        total: allCars.length,
        running: running.length,
        idle: idle.length,
        complete: complete.length,
        error: errored.length,
        errorNoParts: erroredNoParts.length,
        withParts: withParts.length,
        totalParts,
        runningCars: running.map(c => ({
          id: c.id, displayName: c.displayName, chassis: c.chassis,
          scrapeProgress: c.scrapeProgress, totalParts: c.totalParts,
          totalSubcategories: c.totalSubcategories,
        })),
        erroredCars: errored.slice(0, 30).map(c => ({
          id: c.id, displayName: c.displayName, chassis: c.chassis,
          scrapeError: c.scrapeError, totalParts: c.totalParts,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/batch-scrape", requireAdmin, async (req, res) => {
    try {
      const { status = "idle", limit = 10 } = req.body || {};
      const allCars = await storage.getCars();
      const toScrape = allCars.filter(c =>
        c.catalogUrl.includes("bmw-etk.info") && (
          (c.scrapeStatus === status && c.totalParts === 0) ||
          (c.scrapeStatus === "error") ||
          (c.scrapeStatus === "complete" && c.totalParts === 0)
        )
      ).slice(0, limit);

      if (toScrape.length === 0) {
        return res.json({ status: "ok", started: 0, message: "No cars to scrape" });
      }

      const started: { id: number; displayName: string }[] = [];
      for (const car of toScrape) {
        if (!isJobRunning(car.id)) {
          await startScrapeJob(car.id);
          started.push({ id: car.id, displayName: car.displayName });
        }
      }

      res.json({ status: "ok", started: started.length, cars: started });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // Queue-all-idle bulk scrape job — runs idle cars sequentially to avoid
  // flooding the scraper with hundreds of concurrent requests.
  // ---------------------------------------------------------------------------
  const queueIdleState = {
    running: false,
    stopRequested: false,
    totalCars: 0,
    completedCars: 0,
    startedAt: 0 as number,
    results: [] as { id: number; displayName: string; chassis: string; parts: number; status: string }[],
    currentCarId: null as number | null,
  };

  // Selector shared by /status and /start to ensure count and queue set match.
  function getEtkIdleCars(allCars: Awaited<ReturnType<typeof storage.getCars>>) {
    return allCars.filter(c =>
      (c.scrapeStatus === "idle" || c.scrapeStatus === "queued") &&
      c.catalogUrl.includes("bmw-etk.info")
    );
  }

  async function runQueueIdleJob(carIds: number[]) {
    queueIdleState.running = true;
    queueIdleState.stopRequested = false;
    queueIdleState.totalCars = carIds.length;
    queueIdleState.completedCars = 0;
    queueIdleState.startedAt = Date.now();
    queueIdleState.results = [];
    queueIdleState.currentCarId = null;

    for (const carId of carIds) {
      // Stop BEFORE starting the next car (current car continues until done).
      if (queueIdleState.stopRequested) break;

      const car = await storage.getCar(carId);
      if (!car) continue;
      // Skip if already picked up by another path (e.g. manual scrape started
      // while the queue was building). Both idle and queued are valid here.
      if (car.scrapeStatus !== "queued" && car.scrapeStatus !== "idle") continue;

      queueIdleState.currentCarId = carId;
      try {
        if (!isJobRunning(carId)) {
          await startScrapeJob(carId);
        }
        // Poll until the car truly finishes — no hard time cap, so we never
        // start the next car while the previous is still running (one-at-a-time
        // guarantee). We do NOT check stopRequested here so the current scrape
        // always runs to completion before the queue halts.
        const pollStart = Date.now();
        while (isJobRunning(carId)) {
          await new Promise(r => setTimeout(r, 5000));
          const elapsedMin = Math.round((Date.now() - pollStart) / 60000);
          if (elapsedMin > 0 && elapsedMin % 10 === 0) {
            console.log(`[QueueIdle] car ${carId} still running after ${elapsedMin}min`);
          }
        }
        const done = await storage.getCar(carId);
        queueIdleState.results.push({
          id: carId,
          displayName: car.displayName,
          chassis: car.chassis,
          parts: done?.totalParts ?? 0,
          status: done?.scrapeStatus ?? "unknown",
        });
      } catch (err: any) {
        console.error(`[QueueIdle] car ${carId} error:`, err.message);
        queueIdleState.results.push({
          id: carId, displayName: car.displayName, chassis: car.chassis,
          parts: 0, status: "error",
        });
      }
      queueIdleState.completedCars++;
    }

    queueIdleState.running = false;
    queueIdleState.currentCarId = null;
  }

  app.get("/api/admin/queue-idle-cars/status", requireAdmin, async (req, res) => {
    try {
      const allCars = await storage.getCars();
      // Count uses same ETK filter as /start so the UI number is accurate.
      const eligibleCars = getEtkIdleCars(allCars);

      let currentCarLive: any = null;
      if (queueIdleState.running && queueIdleState.currentCarId) {
        const cur = await storage.getCar(queueIdleState.currentCarId);
        if (cur) {
          currentCarLive = {
            id: cur.id, displayName: cur.displayName, chassis: cur.chassis,
            scrapeProgress: cur.scrapeProgress, totalParts: cur.totalParts,
            scrapeStatus: cur.scrapeStatus,
          };
        }
      }

      res.json({
        idleCount: eligibleCars.length,
        job: { ...queueIdleState, currentCarLive },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/queue-idle-cars/start", requireAdmin, async (req, res) => {
    if (queueIdleState.running) {
      return res.status(409).json({ error: "Queue-idle job already running" });
    }
    try {
      const allCars = await storage.getCars();
      // Use the same filter as /status so the count shown and the cars queued
      // always match — includes leftover `queued` cars from interrupted runs.
      const eligibleCars = getEtkIdleCars(allCars);
      if (eligibleCars.length === 0) {
        return res.json({ status: "nothing_to_do", queued: 0, message: "No idle models to queue" });
      }

      // Atomically mark strictly `idle` cars as `queued` so the UI reflects the
      // enqueued state immediately — cars already in `queued` stay as-is.
      const strictlyIdle = eligibleCars.filter(c => c.scrapeStatus === "idle");
      if (strictlyIdle.length > 0) {
        const carIdList = strictlyIdle.map(c => c.id).join(",");
        await db.execute(sql.raw(
          `UPDATE cars SET scrape_status = 'queued' WHERE id IN (${carIdList})`
        ));
      }

      res.json({ status: "started", queued: eligibleCars.length });
      runQueueIdleJob(eligibleCars.map(c => c.id)).catch(err => {
        console.error("[QueueIdle] Unhandled error:", err);
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/queue-idle-cars/stop", requireAdmin, async (req, res) => {
    if (!queueIdleState.running) {
      return res.status(400).json({ error: "No queue-idle job running" });
    }
    queueIdleState.stopRequested = true;
    res.json({ status: "stopping" });
  });

  // GET /api/cars/:id/categories - get categories for a car
  app.get("/api/cars/:id/categories", async (req, res) => {
    try {
      const cats = await storage.getCategoriesByCarId(parseInt((req.params["id"] as string)));
      res.json(cats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/categories/:id/subcategories - get subcategories with part counts
  app.get("/api/categories/:id/subcategories", async (req, res) => {
    try {
      const categoryId = parseInt((req.params["id"] as string));
      const subs = await storage.getSubcategoriesByCategoryId(categoryId);
      if (subs.length === 0) return res.json([]);

      const subIds = subs.map(s => s.id);
      const countResult = await db.execute(sql.raw(
        `SELECT subcategory_id, COUNT(*)::int AS part_count FROM parts WHERE subcategory_id IN (${subIds.join(",")}) GROUP BY subcategory_id`
      ));
      const countRows = (countResult as any).rows || countResult;
      const countMap = new Map<number, number>();
      for (const row of countRows) {
        countMap.set(row.subcategory_id, row.part_count);
      }

      const subsWithCounts = subs.map(s => ({
        ...s,
        partCount: countMap.get(s.id) || 0,
      }));
      res.json(subsWithCounts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/subcategories/:id/parts - get parts for subcategory
  app.get("/api/subcategories/:id/parts", async (req, res) => {
    try {
      const parts = await storage.getPartsBySubcategoryId(parseInt((req.params["id"] as string)));
      res.json(parts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/cars/:id/parts - get all parts for a car with optional search
  app.get("/api/cars/:id/parts", async (req, res) => {
    try {
      const carId = parseInt((req.params["id"] as string));
      const search = req.query.q as string | undefined;
      const limit = parseInt(req.query.limit as string || "50");
      const offset = parseInt(req.query.offset as string || "0");

      const [parts, total] = await Promise.all([
        storage.getPartsByCarId(carId, search, limit, offset),
        storage.countPartsByCarId(carId, search),
      ]);

      res.json({ parts, total, limit, offset });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/search - global parts search
  app.get("/api/search", async (req, res) => {
    try {
      const q = req.query.q as string;
      const carIds = req.query.cars ? String(req.query.cars).split(",").map(Number) : undefined;

      if (!q || q.length < 2) {
        return res.status(400).json({ error: "Search query must be at least 2 characters" });
      }

      const results = await storage.searchParts(q, carIds);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/export - export data as chunked per-car files (v3 format)
  app.get("/api/export", requireAdmin, async (req, res) => {
    try {
      const allCars = await db.select().from(carsTable);
      const scrapedCars = allCars.filter(c => (c.totalParts ?? 0) > 0);

      const exportedAt = new Date().toISOString();
      const saveToFile = process.env.NODE_ENV !== "production";
      const dataDir = path.resolve(process.cwd(), "data");
      const chunksDir = path.join(dataDir, "export-chunks");

      if (saveToFile) {
        await unlink(path.join(dataDir, "export-manifest.json")).catch(() => {});
        await mkdir(chunksDir, { recursive: true });
        const existingFiles = await readdir(chunksDir).catch(() => []);
        for (const f of existingFiles) {
          await unlink(path.join(chunksDir, f)).catch(() => {});
        }
      }

      let totalParts = 0;
      let chunkIndex = 0;
      const CARS_PER_CHUNK = 10;
      const chunkCatalogIds: string[][] = [];

      for (let ci = 0; ci < scrapedCars.length; ci += CARS_PER_CHUNK) {
        const carBatch = scrapedCars.slice(ci, ci + CARS_PER_CHUNK);
        const carIds = carBatch.map(c => c.id);

        const catsResult = await db.execute(sql.raw(`SELECT * FROM categories WHERE car_id IN (${carIds.join(",")})`));
        const cats = (catsResult as any).rows || catsResult;
        const catIds = cats.map((c: any) => c.id);

        let subs: any[] = [];
        if (catIds.length > 0) {
          for (let i = 0; i < catIds.length; i += 5000) {
            const chunk = catIds.slice(i, i + 5000);
            const r = await db.execute(sql.raw(`SELECT * FROM subcategories WHERE category_id IN (${chunk.join(",")})`));
            subs = subs.concat((r as any).rows || r);
          }
        }

        const subIds = subs.map((s: any) => s.id);
        let chunkParts: any[] = [];
        if (subIds.length > 0) {
          for (let i = 0; i < subIds.length; i += 5000) {
            const chunk = subIds.slice(i, i + 5000);
            const r = await db.execute(sql.raw(`SELECT * FROM parts WHERE subcategory_id IN (${chunk.join(",")})`));
            chunkParts = chunkParts.concat((r as any).rows || r);
          }
        }

        totalParts += chunkParts.length;

        const chunkData = {
          cars: carBatch,
          categories: cats,
          subcategories: subs,
          parts: chunkParts,
        };

        if (saveToFile) {
          await writeFile(path.join(chunksDir, `chunk_${String(chunkIndex).padStart(3, "0")}.json`), JSON.stringify(chunkData));
        }

        chunkCatalogIds.push(carBatch.map(c => c.catalogId).filter((x): x is string => x !== null && x !== undefined));
        chunkIndex++;
        console.log(`Export chunk ${chunkIndex}: ${carBatch.length} cars, ${chunkParts.length} parts`);
      }

      const bmwModelsResult = await db.execute(sql.raw(`SELECT * FROM bmw_models`));
      const bmwModelsData = (bmwModelsResult as any).rows || bmwModelsResult;
      const pricingResult = await db.execute(sql.raw(`SELECT * FROM part_pricing`));
      const pricingData = (pricingResult as any).rows || pricingResult;
      const usersResult = await db.execute(sql.raw(`SELECT * FROM users`));
      const usersData = (usersResult as any).rows || usersResult;
      const apiKeysResult = await db.execute(sql.raw(`SELECT * FROM api_keys`));
      const apiKeysData = (apiKeysResult as any).rows || apiKeysResult;
      const crossRefsResult = await db.execute(sql.raw(`SELECT * FROM part_cross_references`));
      const crossRefsData = (crossRefsResult as any).rows || crossRefsResult;
      const realoemCheckedResult = await db.execute(sql.raw(`SELECT * FROM realoem_checked_parts`));
      const realoemCheckedData = (realoemCheckedResult as any).rows || realoemCheckedResult;

      const extraData: Record<string, any> = {};
      if (bmwModelsData.length > 0) extraData.bmwModels = bmwModelsData;
      if (pricingData.length > 0) extraData.partPricing = pricingData;
      if (usersData.length > 0) extraData.users = usersData;
      if (apiKeysData.length > 0) extraData.apiKeys = apiKeysData;
      if (crossRefsData.length > 0) extraData.partCrossReferences = crossRefsData;
      if (realoemCheckedData.length > 0) extraData.realoemCheckedParts = realoemCheckedData;

      if (Object.keys(extraData).length > 0 && saveToFile) {
        await writeFile(path.join(chunksDir, `chunk_${String(chunkIndex).padStart(3, "0")}.json`), JSON.stringify(extraData));
        chunkIndex++;
        console.log(`Export chunk ${chunkIndex}: ${bmwModelsData.length} BMW models, ${pricingData.length} pricing, ${usersData.length} users, ${apiKeysData.length} API keys, ${crossRefsData.length} cross-refs, ${realoemCheckedData.length} realoem checked`);
      }

      const manifest = {
        version: 3,
        exportedAt,
        totalCars: scrapedCars.length,
        totalParts,
        totalBmwModels: bmwModelsData.length,
        totalPricing: pricingData.length,
        totalUsers: usersData.length,
        totalApiKeys: apiKeysData.length,
        totalCrossRefs: crossRefsData.length,
        totalRealoemChecked: realoemCheckedData.length,
        chunks: chunkIndex,
        chunkCatalogIds,
      };

      if (saveToFile) {
        await writeFile(path.join(dataDir, "export-manifest.json"), JSON.stringify(manifest, null, 2));
        console.log(`Export complete: ${scrapedCars.length} cars, ${totalParts} parts, ${bmwModelsData.length} BMW models, ${pricingData.length} pricing, ${usersData.length} users, ${crossRefsData.length} cross-refs, ${realoemCheckedData.length} realoem checked in ${chunkIndex} chunks`);
      }

      res.json(manifest);
    } catch (err: any) {
      console.error("Export error:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      } else {
        res.end();
      }
    }
  });

  // POST /api/import - import data from JSON export (v2 flat format with bulk SQL)
  app.post("/api/import", requireAdmin, express.json({ limit: "500mb" }), async (req, res) => {
    try {
      const data = req.body;
      if (data.version === 2) {
        const result = await bulkImportV2(data);
        return res.json(result);
      }
      return res.status(400).json({ error: "Unsupported export format. Re-export from dev with latest build." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  let dataSyncState: {
    running: boolean;
    totalChunks: number;
    completedChunks: number;
    totalCars: number;
    totalParts: number;
    carsImported: number;
    partsImported: number;
    carsSkipped: number;
    partsSkipped: number;
    currentChunkCars: number;
    currentChunkParts: number;
    startedAt: number;
    chunkErrors: string[];
    finished: boolean;
    error: string | null;
  } = {
    running: false, totalChunks: 0, completedChunks: 0, totalCars: 0, totalParts: 0,
    carsImported: 0, partsImported: 0, carsSkipped: 0, partsSkipped: 0,
    currentChunkCars: 0, currentChunkParts: 0,
    startedAt: 0, chunkErrors: [], finished: false, error: null,
  };

  let dataSyncCancelled = false;

  app.delete("/api/sync-from-dev", (req, res) => {
    if (!dataSyncState.running) {
      dataSyncState = {
        running: false, totalChunks: 0, completedChunks: 0, totalCars: 0, totalParts: 0,
        carsImported: 0, partsImported: 0, carsSkipped: 0, partsSkipped: 0,
        currentChunkCars: 0, currentChunkParts: 0, startedAt: 0, chunkErrors: [], finished: false, error: null,
      };
      return res.json({ status: "reset" });
    }
    dataSyncCancelled = true;
    res.json({ status: "cancelling" });
  });

  app.get("/api/sync-from-dev/status", (req, res) => {
    const elapsed = dataSyncState.running ? (Date.now() - dataSyncState.startedAt) / 1000 : 0;
    const percentage = dataSyncState.totalChunks > 0
      ? Math.round((dataSyncState.completedChunks / dataSyncState.totalChunks) * 100)
      : 0;
    let etaSeconds: number | null = null;
    if (dataSyncState.running && dataSyncState.completedChunks > 0 && elapsed > 0) {
      const secsPerChunk = elapsed / dataSyncState.completedChunks;
      const remaining = dataSyncState.totalChunks - dataSyncState.completedChunks;
      etaSeconds = Math.round(secsPerChunk * remaining);
    }
    res.json({
      ...dataSyncState,
      percentage,
      elapsedSeconds: Math.round(elapsed),
      etaSeconds,
    });
  });

  async function deduplicateCategories() {
    console.log("Dedup: checking for duplicate categories...");
    const countResult = await db.execute(sql.raw(
      `SELECT COUNT(*) as cnt FROM (SELECT car_id, category_id FROM categories GROUP BY car_id, category_id HAVING COUNT(*) > 1) t`
    ));
    const dupCount = parseInt(((countResult as any).rows || countResult)[0]?.cnt || "0", 10);
    if (dupCount === 0) {
      console.log("Dedup: no duplicate categories found");
      const subDedupResult = await deduplicateSubcategories();
      return { duplicateCats: 0, duplicateSubs: subDedupResult.duplicateSubs, duplicateParts: subDedupResult.duplicateParts };
    }
    console.log(`Dedup: found ${dupCount} duplicate category groups, cleaning up...`);

    const dupsResult = await db.execute(sql.raw(
      `SELECT id FROM categories WHERE id NOT IN (SELECT MIN(id) FROM categories GROUP BY car_id, category_id)`
    ));
    const dupCatIds = ((dupsResult as any).rows || dupsResult).map((r: any) => r.id);
    if (dupCatIds.length === 0) return { duplicateCats: 0, duplicateSubs: 0, duplicateParts: 0 };

    const BATCH = 500;
    let totalParts = 0, totalSubs = 0;
    for (let i = 0; i < dupCatIds.length; i += BATCH) {
      const batch = dupCatIds.slice(i, i + BATCH).join(",");
      const subResult = await db.execute(sql.raw(`SELECT id FROM subcategories WHERE category_id IN (${batch})`));
      const subIds = ((subResult as any).rows || subResult).map((r: any) => r.id);
      if (subIds.length > 0) {
        for (let j = 0; j < subIds.length; j += BATCH) {
          const subBatch = subIds.slice(j, j + BATCH).join(",");
          const pr = await db.execute(sql.raw(`DELETE FROM parts WHERE subcategory_id IN (${subBatch})`));
          totalParts += (pr as any).rowCount || 0;
        }
        const sr = await db.execute(sql.raw(`DELETE FROM subcategories WHERE category_id IN (${batch})`));
        totalSubs += (sr as any).rowCount || 0;
      }
      await db.execute(sql.raw(`DELETE FROM categories WHERE id IN (${batch})`));
    }

    console.log(`Dedup: removed ${dupCatIds.length} duplicate categories, ${totalSubs} subcategories, ${totalParts} parts`);

    const subDedupResult = await deduplicateSubcategories();
    return { 
      duplicateCats: dupCatIds.length, 
      duplicateSubs: totalSubs + subDedupResult.duplicateSubs, 
      duplicateParts: totalParts + subDedupResult.duplicateParts 
    };
  }

  async function ensureIndexes() {
    try {
      await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_parts_subcategory_id ON parts(subcategory_id)`));
      console.log("Index idx_parts_subcategory_id ensured");
    } catch (e: any) {
      console.log("Index creation note:", e.message);
    }
    try {
      await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_parts_car_id ON parts(car_id)`));
      console.log("Index idx_parts_car_id ensured");
    } catch (e: any) {
      console.log("Index creation note:", e.message);
    }
    try {
      await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_subcategories_car_id ON subcategories(car_id)`));
      console.log("Index idx_subcategories_car_id ensured");
    } catch (e: any) {
      console.log("Index creation note:", e.message);
    }
    try {
      await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_subcategories_category_id ON subcategories(category_id)`));
      console.log("Index idx_subcategories_category_id ensured");
    } catch (e: any) {
      console.log("Index creation note:", e.message);
    }
  }

  async function deduplicateSubcategories() {
    console.log("Dedup: checking for duplicate subcategories...");
    const countResult = await db.execute(sql.raw(
      `SELECT COUNT(*) as cnt FROM (SELECT car_id, name, category_id FROM subcategories GROUP BY car_id, name, category_id HAVING COUNT(*) > 1) t`
    ));
    const dupCount = parseInt(((countResult as any).rows || countResult)[0]?.cnt || "0", 10);
    if (dupCount === 0) {
      console.log("Dedup subcategories: no duplicates found");
      return { duplicateSubs: 0, duplicateParts: 0 };
    }
    console.log(`Dedup: found ${dupCount} duplicate subcategory groups, cleaning up...`);

    console.log("Dedup: ensuring indexes exist for efficient FK checks...");
    await ensureIndexes();

    let totalParts = 0;
    let totalSubs = 0;

    const carIdsResult = await db.execute(sql.raw(
      `SELECT DISTINCT s.car_id FROM subcategories s, subcategories s2
       WHERE s.car_id = s2.car_id AND s.name = s2.name AND s.category_id = s2.category_id
       AND s.id > s2.id ORDER BY s.car_id`
    ));
    const carIds = ((carIdsResult as any).rows).map((r: any) => parseInt(r.car_id));
    console.log(`Dedup: processing ${carIds.length} cars with duplicate subcategories...`);

    for (let i = 0; i < carIds.length; i += 10) {
      const batch = carIds.slice(i, i + 10);
      const inClause = batch.join(",");

      const pr = await db.execute(sql.raw(
        `DELETE FROM parts p USING subcategories s, subcategories s2
         WHERE p.subcategory_id = s.id
         AND s.car_id = s2.car_id AND s.name = s2.name AND s.category_id = s2.category_id
         AND s.id > s2.id AND s.car_id IN (${inClause})`
      ));
      totalParts += (pr as any).rowCount || 0;

      const sr = await db.execute(sql.raw(
        `DELETE FROM subcategories s USING subcategories s2
         WHERE s.car_id = s2.car_id AND s.name = s2.name AND s.category_id = s2.category_id
         AND s.id > s2.id AND s.car_id IN (${inClause})`
      ));
      totalSubs += (sr as any).rowCount || 0;

      if (i % 50 === 0) {
        console.log(`Dedup progress: ${i}/${carIds.length} cars, ${totalSubs} subs, ${totalParts} parts deleted`);
      }
    }

    console.log(`Dedup subcategories: removed ${totalSubs} duplicate subcategories, ${totalParts} orphaned parts`);
    return { duplicateSubs: totalSubs, duplicateParts: totalParts };
  }

  async function recalculateCarCounts() {
    console.log("Recalculating car part/category/subcategory counts...");
    const result = await db.execute(sql.raw(
      `SELECT c.id AS car_id,
              COALESCE(cat_count.cnt, 0) AS total_categories,
              COALESCE(sub_count.cnt, 0) AS total_subcategories,
              COALESCE(part_count.cnt, 0) AS total_parts
       FROM cars c
       LEFT JOIN (SELECT car_id, COUNT(*)::int AS cnt FROM categories GROUP BY car_id) cat_count ON cat_count.car_id = c.id
       LEFT JOIN (SELECT car_id, COUNT(*)::int AS cnt FROM subcategories GROUP BY car_id) sub_count ON sub_count.car_id = c.id
       LEFT JOIN (SELECT car_id, COUNT(*)::int AS cnt FROM parts GROUP BY car_id) part_count ON part_count.car_id = c.id`
    ));
    const rows = (result as any).rows || result;
    let updated = 0;
    for (const row of rows) {
      await db.execute(sql.raw(
        `UPDATE cars SET total_categories = ${row.total_categories}, total_subcategories = ${row.total_subcategories}, total_parts = ${row.total_parts} WHERE id = ${row.car_id}`
      ));
      updated++;
    }
    console.log(`Recalculated counts for ${updated} cars`);
    return updated;
  }

  // Targeted backfill: only recalculates cars where total_categories = 0
  // but total_parts > 0 (stale from direct-to-parts-table imports). Much
  // faster than the full recalculate when only a subset of cars is affected.
  async function recalculateMismatchedCars() {
    console.log("Backfilling stale category/subcategory counts for mismatched cars...");
    const mismatchResult = await db.execute(sql.raw(
      `SELECT id FROM cars WHERE total_categories = 0 AND total_parts > 0`
    ));
    const mismatchedIds: number[] = ((mismatchResult as any).rows || mismatchResult).map((r: any) => r.id);

    if (mismatchedIds.length === 0) {
      console.log("No mismatched cars found — nothing to backfill");
      return { fixed: 0, scanned: 0 };
    }

    console.log(`Found ${mismatchedIds.length} cars with stale counts, recalculating...`);
    const inClause = mismatchedIds.join(",");
    const result = await db.execute(sql.raw(
      `SELECT c.id AS car_id,
              COALESCE(cat_count.cnt, 0) AS total_categories,
              COALESCE(sub_count.cnt, 0) AS total_subcategories,
              COALESCE(part_count.cnt, 0) AS total_parts
       FROM cars c
       LEFT JOIN (SELECT car_id, COUNT(*)::int AS cnt FROM categories WHERE car_id IN (${inClause}) GROUP BY car_id) cat_count ON cat_count.car_id = c.id
       LEFT JOIN (SELECT car_id, COUNT(*)::int AS cnt FROM subcategories WHERE car_id IN (${inClause}) GROUP BY car_id) sub_count ON sub_count.car_id = c.id
       LEFT JOIN (SELECT car_id, COUNT(*)::int AS cnt FROM parts WHERE car_id IN (${inClause}) GROUP BY car_id) part_count ON part_count.car_id = c.id
       WHERE c.id IN (${inClause})`
    ));
    const rows = (result as any).rows || result;
    let fixed = 0;
    for (const row of rows) {
      await db.execute(sql.raw(
        `UPDATE cars SET total_categories = ${row.total_categories}, total_subcategories = ${row.total_subcategories}, total_parts = ${row.total_parts} WHERE id = ${row.car_id}`
      ));
      fixed++;
    }
    console.log(`Backfill complete: fixed ${fixed}/${mismatchedIds.length} mismatched cars`);
    return { fixed, scanned: mismatchedIds.length };
  }

  app.post("/api/dedup-categories", requireAdmin, async (req, res) => {
    try {
      const result = await deduplicateCategories();
      if (result.duplicateCats > 0 || result.duplicateSubs > 0) {
        await recalculateCarCounts();
      }
      res.json({ status: "ok", ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/count-mismatch", requireAdmin, async (_req, res) => {
    try {
      const result = await db.execute(sql.raw(
        `SELECT COUNT(*)::int AS count FROM cars WHERE total_categories = 0 AND total_parts > 0`
      ));
      const rows = (result as any).rows || result;
      const count = rows[0]?.count ?? 0;
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/recalculate-counts
  //   { all: true }  — recalculate every car (full pass)
  //   {}             — default: targeted backfill, only cars where
  //                    total_categories = 0 AND total_parts > 0
  app.post("/api/recalculate-counts", requireAdmin, async (req, res) => {
    try {
      const all = req.body?.all === true;
      if (all) {
        const updated = await recalculateCarCounts();
        res.json({ status: "ok", mode: "all", carsUpdated: updated });
      } else {
        const { fixed, scanned } = await recalculateMismatchedCars();
        res.json({ status: "ok", mode: "mismatch", carsUpdated: fixed, mismatchScanned: scanned });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/rescrape-parts", requireAdmin, async (req, res) => {
    const { carIds } = req.body;
    if (!carIds || !Array.isArray(carIds) || carIds.length === 0) {
      return res.status(400).json({ error: "carIds array required" });
    }
    res.json({ status: "started", carIds });
    rescrapePartsOnly(carIds).then(results => {
      console.log("[Rescrape] Complete:", JSON.stringify(results.map(r => ({ carId: r.carId, parts: r.parts, errors: r.errors.length }))));
    }).catch(err => {
      console.error("[Rescrape] Failed:", err.message);
    });
  });

  let resumeIncompleteScrapeState: {
    running: boolean;
    totalCars: number;
    completedCars: number;
    currentCar: string | null;
    currentCarId: number | null;
    results: { carId: number; displayName: string; status: string; parts: number; partsBefore: number; chassis: string }[];
    startedAt: number | null;
    remainingCarIds: number[];
    jobId: number | null;
  } = { running: false, totalCars: 0, completedCars: 0, currentCar: null, currentCarId: null, results: [], startedAt: null, remainingCarIds: [], jobId: null };

  function sortIncompleteCars<T extends { chassis?: string | null; scrapeProgress?: number | null }>(cars: T[]): T[] {
    return cars.sort((a, b) => {
      const aGen = (a.chassis || "").charAt(0);
      const bGen = (b.chassis || "").charAt(0);
      if (aGen !== bGen) {
        const order = ["G", "F", "E"];
        return order.indexOf(aGen) - order.indexOf(bGen);
      }
      return (a.scrapeProgress || 0) - (b.scrapeProgress || 0);
    });
  }

  async function getIncompleteCars() {
    return db.select({
      id: carsTable.id,
      displayName: carsTable.displayName,
      chassis: carsTable.chassis,
      scrapeProgress: carsTable.scrapeProgress,
      totalParts: carsTable.totalParts,
      totalCategories: carsTable.totalCategories,
      totalSubcategories: carsTable.totalSubcategories,
      scrapeStatus: carsTable.scrapeStatus,
    }).from(carsTable).where(
      and(
        eq(carsTable.scrapeStatus, "complete"),
        lt(carsTable.scrapeProgress, 100)
      )
    );
  }

  async function runResumeIncompleteJob(carIds: number[], isRestart = false) {
    const { createJob, updateJobProgress, completeJob, failJob: failBgJob, startPeriodicCheckpoint } = await import("./job-manager");

    const allCars = await db.select().from(carsTable).where(
      and(
        eq(carsTable.scrapeStatus, "complete"),
        lt(carsTable.scrapeProgress, 100)
      )
    );
    const carMap = new Map(allCars.map(c => [c.id, c]));
    const carsToProcess = carIds.map(id => carMap.get(id)).filter(Boolean) as typeof allCars;

    if (carsToProcess.length === 0) {
      console.log("[ResumeIncomplete] No incomplete cars remaining to process.");
      resumeIncompleteScrapeState = { running: false, totalCars: 0, completedCars: 0, currentCar: null, currentCarId: null, results: [], startedAt: null, remainingCarIds: [], jobId: null };
      return;
    }

    const bgJob = await createJob("resume_incomplete", {
      totalCars: carsToProcess.length,
      completedCars: isRestart ? resumeIncompleteScrapeState.completedCars : 0,
      remainingCarIds: carsToProcess.map(c => c.id),
      results: isRestart ? resumeIncompleteScrapeState.results : [],
    });

    resumeIncompleteScrapeState = {
      running: true,
      totalCars: isRestart ? resumeIncompleteScrapeState.totalCars : carsToProcess.length,
      completedCars: isRestart ? resumeIncompleteScrapeState.completedCars : 0,
      currentCar: null,
      currentCarId: null,
      results: isRestart ? [...resumeIncompleteScrapeState.results] : [],
      startedAt: isRestart ? resumeIncompleteScrapeState.startedAt : Date.now(),
      remainingCarIds: carsToProcess.map(c => c.id),
      jobId: bgJob.id,
    };

    startPeriodicCheckpoint(bgJob.id, () => ({
      totalCars: resumeIncompleteScrapeState.totalCars,
      completedCars: resumeIncompleteScrapeState.completedCars,
      currentCar: resumeIncompleteScrapeState.currentCar,
      currentCarId: resumeIncompleteScrapeState.currentCarId,
      remainingCarIds: resumeIncompleteScrapeState.remainingCarIds,
      results: resumeIncompleteScrapeState.results,
    }));

    console.log(`[ResumeIncomplete] ${isRestart ? "Restarting" : "Starting"} job for ${carsToProcess.length} cars (job #${bgJob.id})`);

    try {
      for (const car of carsToProcess) {
        if (!resumeIncompleteScrapeState.running) {
          console.log("[ResumeIncomplete] Cancelled by user");
          break;
        }

        const partsBefore = car.totalParts || 0;
        resumeIncompleteScrapeState.currentCar = car.displayName || `Car #${car.id}`;
        resumeIncompleteScrapeState.currentCarId = car.id;
        console.log(`[ResumeIncomplete] Starting ${car.displayName} (was ${car.scrapeProgress}%, ${car.totalParts} parts)`);

        try {
          await startScrapeJob(car.id);

          await new Promise<void>((resolve) => {
            const check = setInterval(async () => {
              if (!isJobRunning(car.id)) {
                clearInterval(check);
                resolve();
              }
            }, 5000);
          });

          const updated = await storage.getCar(car.id);
          resumeIncompleteScrapeState.results.push({
            carId: car.id,
            displayName: car.displayName || `Car #${car.id}`,
            status: updated?.scrapeStatus === "complete" ? "complete" : (updated?.scrapeStatus || "unknown"),
            parts: updated?.totalParts || 0,
            partsBefore,
            chassis: car.chassis || "",
          });
          console.log(`[ResumeIncomplete] Finished ${car.displayName}: ${updated?.scrapeStatus} (${partsBefore} → ${updated?.totalParts} parts)`);
        } catch (err: any) {
          console.error(`[ResumeIncomplete] Error on ${car.displayName}: ${err.message}`);
          resumeIncompleteScrapeState.results.push({
            carId: car.id,
            displayName: car.displayName || `Car #${car.id}`,
            status: "error",
            parts: car.totalParts || 0,
            partsBefore,
            chassis: car.chassis || "",
          });
        }

        resumeIncompleteScrapeState.completedCars++;
        resumeIncompleteScrapeState.remainingCarIds = resumeIncompleteScrapeState.remainingCarIds.filter(id => id !== car.id);
      }

      resumeIncompleteScrapeState.running = false;
      resumeIncompleteScrapeState.currentCar = null;
      resumeIncompleteScrapeState.currentCarId = null;

      await completeJob(bgJob.id, {
        totalCars: resumeIncompleteScrapeState.totalCars,
        completedCars: resumeIncompleteScrapeState.completedCars,
        results: resumeIncompleteScrapeState.results,
        remainingCarIds: resumeIncompleteScrapeState.remainingCarIds,
      });

      console.log(`[ResumeIncomplete] Job complete. ${resumeIncompleteScrapeState.completedCars}/${resumeIncompleteScrapeState.totalCars} cars processed.`);
    } catch (err: any) {
      resumeIncompleteScrapeState.running = false;
      await failBgJob(bgJob.id, err.message);
    }
  }

  app.get("/api/admin/resume-incomplete/status", requireAdmin, async (req, res) => {
    try {
      const incompleteCars = sortIncompleteCars(await getIncompleteCars());

      let currentCarLive: any = null;
      if (resumeIncompleteScrapeState.running && resumeIncompleteScrapeState.currentCarId) {
        const cur = await storage.getCar(resumeIncompleteScrapeState.currentCarId);
        if (cur) {
          currentCarLive = {
            id: cur.id,
            displayName: cur.displayName,
            chassis: cur.chassis,
            scrapeProgress: cur.scrapeProgress,
            totalParts: cur.totalParts,
            totalCategories: cur.totalCategories,
            totalSubcategories: cur.totalSubcategories,
            scrapeStatus: cur.scrapeStatus,
          };
        }
      }

      res.json({
        incompleteCars,
        totalIncomplete: incompleteCars.length,
        job: {
          ...resumeIncompleteScrapeState,
          currentCarLive,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/resume-incomplete/start", requireAdmin, async (req, res) => {
    if (resumeIncompleteScrapeState.running) {
      return res.status(409).json({ error: "Resume job already running" });
    }

    try {
      const incompleteCars = sortIncompleteCars(await getIncompleteCars());

      if (incompleteCars.length === 0) {
        return res.json({ status: "nothing_to_do", message: "All cars are fully scraped" });
      }

      res.json({ status: "started", totalCars: incompleteCars.length });

      runResumeIncompleteJob(incompleteCars.map(c => c.id)).catch(err => {
        console.error("[ResumeIncomplete] Unhandled error:", err);
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/resume-incomplete/auto-restart", async (req, res) => {
    if (req.headers["x-internal-restart"] !== "true") {
      return res.status(403).json({ error: "Internal only" });
    }
    if (resumeIncompleteScrapeState.running) {
      return res.status(409).json({ error: "Already running" });
    }
    const { carIds, previousProgress } = req.body;
    if (!carIds || !Array.isArray(carIds) || carIds.length === 0) {
      return res.json({ status: "nothing_to_do" });
    }
    if (previousProgress) {
      resumeIncompleteScrapeState.completedCars = previousProgress.completedCars || 0;
      resumeIncompleteScrapeState.results = previousProgress.results || [];
      resumeIncompleteScrapeState.startedAt = previousProgress.startedAt || Date.now();
      resumeIncompleteScrapeState.totalCars = (previousProgress.completedCars || 0) + carIds.length;
    }
    res.json({ status: "restarting", totalCars: carIds.length });
    runResumeIncompleteJob(carIds, !!previousProgress).catch(err => {
      console.error("[ResumeIncomplete] Auto-restart error:", err);
    });
  });

  app.post("/api/admin/resume-incomplete/stop", requireAdmin, async (req, res) => {
    if (!resumeIncompleteScrapeState.running) {
      return res.status(400).json({ error: "No resume job running" });
    }
    resumeIncompleteScrapeState.running = false;
    res.json({ status: "stopping" });
  });

  app.post("/api/enrich-empty", requireAdmin, async (req, res) => {
    try {
      await startEnrichment();
      res.json({ status: "started" });
    } catch (err: any) {
      res.status(409).json({ error: err.message });
    }
  });

  app.get("/api/enrich-empty/status", requireAdmin, (req, res) => {
    res.json(getEnrichmentStatus());
  });

  app.post("/api/enrich-empty/cancel", requireAdmin, (req, res) => {
    cancelEnrichment();
    res.json({ status: "cancelled" });
  });

  // POST /api/sync-from-dev - import bundled export data (v3 chunked or v2 legacy)
  app.post("/api/sync-from-dev", async (req, res) => {
    if (dataSyncState.running) {
      return res.status(409).json({ error: "Sync already in progress" });
    }

    const forceResync = req.body?.force === true;

    const distDir = path.resolve(process.cwd(), "dist");
    const dataDirLocal = path.resolve(process.cwd(), "data");
    const legacyPath = path.join(distDir, "export-data.json");

    // Manifest + chunks live in Object Storage in production. In dev, use the
    // local copies under data/ if present; otherwise download from OS too.
    const { Client: OSClient } = await import("@replit/object-storage");
    const osClient = new OSClient();

    async function loadManifest(): Promise<string | null> {
      const candidates = [
        path.join(distDir, "export-manifest.json"),
        path.join(dataDirLocal, "export-manifest.json"),
      ];
      for (const p of candidates) {
        try { return await readFile(p, "utf-8"); } catch {}
      }
      const r = await osClient.downloadAsBytes("export/export-manifest.json");
      if (!r.ok) return null;
      return Buffer.isBuffer(r.value[0]) ? r.value[0].toString("utf-8") : Buffer.from(r.value[0]).toString("utf-8");
    }

    async function loadChunk(i: number): Promise<string> {
      const name = `chunk_${String(i).padStart(3, "0")}.json`;
      const candidates = [
        path.join(distDir, "export-chunks", name),
        path.join(dataDirLocal, "export-chunks", name),
      ];
      for (const p of candidates) {
        try { return await readFile(p, "utf-8"); } catch {}
      }
      const r = await osClient.downloadAsBytes(`export/chunks/${name}`);
      if (!r.ok) throw new Error(`chunk ${name} not found in OS: ${JSON.stringify(r.error)}`);
      return Buffer.isBuffer(r.value[0]) ? r.value[0].toString("utf-8") : Buffer.from(r.value[0]).toString("utf-8");
    }

    const manifestRaw: string | null = await loadManifest();

    if (manifestRaw) {
      const manifest = JSON.parse(manifestRaw);

      dataSyncState = {
        running: true, totalChunks: manifest.chunks, completedChunks: 0,
        totalCars: manifest.totalCars, totalParts: manifest.totalParts,
        carsImported: 0, partsImported: 0, carsSkipped: 0, partsSkipped: 0,
        currentChunkCars: 0, currentChunkParts: 0,
        startedAt: Date.now(), chunkErrors: [], finished: false, error: null,
      };

      res.json({ status: "started", totalChunks: manifest.chunks, totalCars: manifest.totalCars, totalParts: manifest.totalParts, force: forceResync });

      (async () => {
        try {
          const existingCars = await storage.getCars();
          const syncedCatalogIds = new Set(
            existingCars.filter(c => c.catalogId && (
              (c.scrapeStatus === "complete" && (c.totalParts ?? 0) > 0) ||
              c.scrapeStatus === "error" ||
              c.scrapeStatus === "unavailable"
            )).map(c => c.catalogId!)
          );

          for (let i = 0; i < manifest.chunks; i++) {
            if (dataSyncCancelled) {
              console.log("Sync: cancelled by user");
              dataSyncState.error = "Cancelled by user";
              break;
            }
            if (!forceResync && manifest.chunkCatalogIds?.[i]) {
              const chunkCids = manifest.chunkCatalogIds[i] as string[];
              const allSynced = chunkCids.length > 0 && chunkCids.every((cid: string) => syncedCatalogIds.has(cid));
              if (allSynced) {
                console.log(`Sync: skipping chunk ${i + 1}/${manifest.chunks} (all ${chunkCids.length} cars already synced)`);
                dataSyncState.carsSkipped += chunkCids.length;
                dataSyncState.completedChunks = i + 1;
                continue;
              }
            }

            const chunkRaw = await loadChunk(i);
            const chunkData = JSON.parse(chunkRaw);

            dataSyncState.currentChunkCars = chunkData.cars?.length || 0;
            dataSyncState.currentChunkParts = chunkData.parts?.length || 0;

            if (chunkData.bmwModels?.length || chunkData.partPricing?.length || chunkData.users?.length || chunkData.apiKeys?.length || chunkData.partCrossReferences?.length || chunkData.realoemCheckedParts?.length) {
              const extras = [];
              if (chunkData.bmwModels?.length) extras.push(`${chunkData.bmwModels.length} BMW models`);
              if (chunkData.partPricing?.length) extras.push(`${chunkData.partPricing.length} pricing records`);
              if (chunkData.users?.length) extras.push(`${chunkData.users.length} users`);
              if (chunkData.apiKeys?.length) extras.push(`${chunkData.apiKeys.length} API keys`);
              if (chunkData.partCrossReferences?.length) extras.push(`${chunkData.partCrossReferences.length} cross-references`);
              if (chunkData.realoemCheckedParts?.length) extras.push(`${chunkData.realoemCheckedParts.length} realoem checked parts`);
              console.log(`Sync: importing chunk ${i + 1}/${manifest.chunks} (${extras.join(", ")})`);
              const runImporter = async (label: string, fn: () => Promise<unknown>) => {
                try { await fn(); } catch (e: any) {
                  console.error(`Sync chunk ${i} ${label} error:`, e.message);
                  dataSyncState.chunkErrors.push(`Chunk ${i} (${label}): ${e.message}`);
                }
              };
              if (chunkData.bmwModels?.length) await runImporter("bmwModels", () => importBmwModels(chunkData.bmwModels));
              if (chunkData.partPricing?.length) await runImporter("partPricing", () => importPartPricing(chunkData.partPricing, forceResync));
              if (chunkData.users?.length) await runImporter("users", () => importUsers(chunkData.users));
              if (chunkData.apiKeys?.length) await runImporter("apiKeys", () => importApiKeys(chunkData.apiKeys));
              if (chunkData.partCrossReferences?.length) await runImporter("partCrossReferences", () => importPartCrossReferences(chunkData.partCrossReferences));
              if (chunkData.realoemCheckedParts?.length) await runImporter("realoemCheckedParts", () => importRealoemCheckedParts(chunkData.realoemCheckedParts));
            } else {
              console.log(`Sync: importing chunk ${i + 1}/${manifest.chunks} (${chunkData.cars?.length} cars, ${chunkData.parts?.length} parts)`);
              try {
                const result = await bulkImportV2({
                  version: 2, cars: chunkData.cars, categories: chunkData.categories,
                  subcategories: chunkData.subcategories, parts: chunkData.parts,
                }, forceResync);
                dataSyncState.carsImported += result.carsImported || 0;
                dataSyncState.partsImported += result.newParts || 0;
                dataSyncState.partsSkipped += result.skippedParts || 0;
                dataSyncState.carsSkipped += (chunkData.cars?.length || 0) - (result.carsImported || 0);
              } catch (chunkErr: any) {
                console.error(`Sync chunk ${i} error:`, chunkErr.message);
                dataSyncState.chunkErrors.push(`Chunk ${i}: ${chunkErr.message}`);
              }
            }

            dataSyncState.completedChunks = i + 1;
          }
        } catch (err: any) {
          console.error("Sync fatal error:", err.message);
          dataSyncState.error = err.message;
        } finally {
          dataSyncState.running = false;
          dataSyncState.finished = true;
          dataSyncCancelled = false;
          console.log(`Sync complete: ${dataSyncState.carsImported} new cars, ${dataSyncState.partsImported} new parts, ${dataSyncState.carsSkipped} cars skipped, ${dataSyncState.partsSkipped} parts skipped, ${dataSyncState.chunkErrors.length} errors`);
        }
      })();
      return;
    }

    try {
      dataSyncState = {
        running: true, totalChunks: 1, completedChunks: 0,
        totalCars: 0, totalParts: 0, carsImported: 0, partsImported: 0,
        carsSkipped: 0, partsSkipped: 0,
        currentChunkCars: 0, currentChunkParts: 0, startedAt: Date.now(),
        chunkErrors: [], finished: false, error: null,
      };
      const raw = await readFile(legacyPath, "utf-8");
      const exportData = JSON.parse(raw);
      if (exportData.version === 2) {
        res.json({ status: "started", totalChunks: 1, totalCars: exportData.cars?.length || 0, totalParts: exportData.parts?.length || 0 });
        dataSyncState.totalCars = exportData.cars?.length || 0;
        dataSyncState.totalParts = exportData.parts?.length || 0;
        try {
          const result = await bulkImportV2(exportData);
          dataSyncState.carsImported = result.carsImported || 0;
          dataSyncState.partsImported = result.newParts || 0;
          dataSyncState.partsSkipped = result.skippedParts || 0;
          dataSyncState.carsSkipped = (exportData.cars?.length || 0) - (result.carsImported || 0);
          dataSyncState.completedChunks = 1;
        } catch (err: any) {
          dataSyncState.error = err.message;
        } finally {
          dataSyncState.running = false;
          dataSyncState.finished = true;
        }
        return;
      }
    } catch (e: any) {
      dataSyncState.running = false;
      dataSyncState.finished = true;
      dataSyncState.error = e.message;
    }

    return res.status(400).json({ error: "No bundled export data found. Re-deploy from dev to generate it." });
  });

  // POST /api/backfill-diagram-images - derive diagram images from existing thumbnail URLs
  app.post("/api/backfill-diagram-images", async (req, res) => {
    try {
      const allSubs = await db.select().from(subcategoriesTable);
      let updated = 0;

      for (const sub of allSubs) {
        if (!sub.diagramImageUrl && sub.imageUrl && sub.imageUrl.includes('/img/small/')) {
          const diagramUrl = sub.imageUrl.replace('/img/small/', '/img/big/');
          await db.update(subcategoriesTable)
            .set({ diagramImageUrl: diagramUrl })
            .where(eq(subcategoriesTable.id, sub.id));
          updated++;
        }
      }

      res.json({ status: "ok", totalSubcategories: allSubs.length, updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/parts/cross-reference/:partNumberClean - cross-reference a part across cars
  app.get("/api/parts/cross-reference/:partNumberClean", async (req, res) => {
    try {
      const result = await storage.crossReferencePart((req.params["partNumberClean"] as string));
      if (!result) return res.status(404).json({ error: "Part not found" });

      const externalRefs = await getCrossRefsForPart((req.params["partNumberClean"] as string));
      res.json({ ...result, externalChassis: externalRefs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/parts/seo/:partNumberClean - server-rendered SEO content payload
  // (intro, fitment groups, FAQ, specs, JSON-LD inputs). Built deterministically
  // from catalog data + admin editorial overrides. Cached upstream by Cloudflare
  // via Cache-Control headers below.
  app.get("/api/parts/seo/:partNumberClean", async (req, res) => {
    try {
      const pn = (req.params["partNumberClean"] as string);

      // Locale resolution priority: explicit ?locale= query param, then the
      // Accept-Language header. Falls back to "en". Note we record an
      // analytics hit for whichever locale is actually rendered so admins can
      // see real-world demand (Task #32 language analytics requirement).
      const { resolveLocale } = await import("../shared/i18n");
      const locale = resolveLocale(
        typeof req.query.locale === "string" ? req.query.locale : undefined,
        req.headers["accept-language"] ?? null,
      );

      // Fire-and-forget language stat: must run for BOTH cache hits and misses
      // so per-locale demand data is accurate regardless of cache state.
      storage.bumpLanguageRequestStat(locale).catch(() => {});

      // In-process cache: keyed by part number + locale so each language gets
      // its own entry. Cache hits skip all DB + content-generation work.
      const { getSeo, setSeo } = await import("./cache");
      const seoCacheKey = `seo:${pn}:${locale}`;

      interface SeoPayload {
        partNumber: string;
        partNumberClean: string;
        description: string;
        weight: number | null;
        vehicles: unknown[];
        externalChassis: string[];
        locale: string;
        content: { inLanguage: string; [key: string]: unknown };
        [key: string]: unknown;
      }

      const seoCached = await getSeo<SeoPayload>(seoCacheKey);
      if (seoCached) {
        res.set("Cache-Control", "public, max-age=300, s-maxage=3600");
        res.set("Vary", "Accept-Language");
        res.set("Content-Language", seoCached.content?.inLanguage ?? locale);
        return res.json(seoCached);
      }

      const xref = await storage.crossReferencePart(pn);
      if (!xref) return res.status(404).json({ error: "Part not found" });

      const [externalRefs, related, editorial, categoryBlurb] = await Promise.all([
        getCrossRefsForPart(pn).catch(() => [] as string[]),
        storage.getRelatedPartsInDiagram(pn, 8).catch(() => []),
        storage.getPartEditorialNote(pn, locale).catch(() => undefined),
        // Use first vehicle's category/subcategory to look up a guide blurb.
        (async () => {
          const v = xref.vehicles[0];
          if (!v?.categoryName) return null;
          const row = await storage.getCategoryEditorial(v.categoryName, v.subcategoryName || null, locale).catch(() => undefined);
          if (row) return row.blurb;
          // Fall back to the category-level blurb if no subcategory match.
          const parent = await storage.getCategoryEditorial(v.categoryName, null, locale).catch(() => undefined);
          return parent?.blurb ?? null;
        })(),
      ]);

      const { generateSeoContent } = await import("./seo/content");
      const content = generateSeoContent({
        locale,
        partNumber: xref.partNumber,
        partNumberClean: xref.partNumberClean,
        description: xref.description,
        additionalInfo: xref.additionalInfo,
        weight: xref.weight,
        vehicles: xref.vehicles.map(v => ({
          carId: v.carId,
          carName: v.carName,
          carSlug: v.carSlug,
          chassis: v.chassis,
          engine: v.engine,
          bodyType: v.bodyType,
          yearStart: v.yearStart,
          yearEnd: v.yearEnd,
          categoryName: v.categoryName,
          subcategoryName: v.subcategoryName,
          quantity: v.quantity,
        })),
        externalChassis: externalRefs,
        related,
        categoryBlurb,
        editorNote: editorial?.note ?? null,
      });

      const seoPayload: SeoPayload = {
        partNumber: xref.partNumber,
        partNumberClean: xref.partNumberClean,
        description: xref.description,
        weight: xref.weight,
        vehicles: xref.vehicles,
        externalChassis: externalRefs,
        locale,
        content: content as unknown as { inLanguage: string; [key: string]: unknown },
      };
      await setSeo(seoCacheKey, seoPayload);

      // Vary on locale so the upstream cache stores one entry per language
      // even though the URL is identical. Content-Language helps SEO crawlers
      // and human inspection tools.
      res.set("Cache-Control", "public, max-age=300, s-maxage=3600");
      res.set("Vary", "Accept-Language");
      res.set("Content-Language", content.inLanguage);
      res.json(seoPayload);
    } catch (err: any) {
      console.error("[seo] Failed to build payload:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ----- Admin: SEO editorial CRUD -----
  app.get("/api/admin/seo/category-editorial", requireAdmin, async (_req, res) => {
    try {
      const rows = await storage.listCategoryEditorial();
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/seo/category-editorial", requireAdmin, async (req, res) => {
    try {
      const { categoryKey, subcategoryKey, blurb, locale } = req.body || {};
      if (!categoryKey || typeof categoryKey !== "string") return res.status(400).json({ error: "categoryKey required" });
      if (!blurb || typeof blurb !== "string") return res.status(400).json({ error: "blurb required" });
      const { SUPPORTED_LOCALES } = await import("../shared/i18n");
      const loc = (typeof locale === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(locale)) ? locale : "en";
      const row = await storage.upsertCategoryEditorial({
        categoryKey: categoryKey.trim(),
        subcategoryKey: subcategoryKey?.trim() || null,
        blurb: blurb.trim(),
        locale: loc,
      });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/seo/category-editorial/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt((req.params["id"] as string), 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
      await storage.deleteCategoryEditorial(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/seo/part-notes", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit || "200"), 10) || 200, 1000);
      const rows = await storage.listPartEditorialNotes(limit);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/seo/part-notes", requireAdmin, async (req, res) => {
    try {
      const { partNumberClean, note, locale } = req.body || {};
      if (!partNumberClean || typeof partNumberClean !== "string") return res.status(400).json({ error: "partNumberClean required" });
      if (!note || typeof note !== "string") return res.status(400).json({ error: "note required" });
      const { SUPPORTED_LOCALES } = await import("../shared/i18n");
      const loc = (typeof locale === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(locale)) ? locale : "en";
      const row = await storage.upsertPartEditorialNote({
        partNumberClean: partNumberClean.replace(/[\s\-]+/g, ""),
        note: note.trim(),
        locale: loc,
      });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/seo/part-notes/:partNumberClean", requireAdmin, async (req, res) => {
    try {
      const locale = typeof req.query.locale === "string" ? req.query.locale : undefined;
      await storage.deletePartEditorialNote((req.params["partNumberClean"] as string), locale);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Hub editorial CRUD (chassis + series landing-page blurbs).
  app.get("/api/admin/seo/hub-editorial", requireAdmin, async (_req, res) => {
    try {
      const rows = await storage.listHubEditorial();
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/seo/hub-editorial", requireAdmin, async (req, res) => {
    try {
      const { hubType, hubKey, blurb } = req.body || {};
      if (hubType !== "chassis" && hubType !== "series") {
        return res.status(400).json({ error: "hubType must be 'chassis' or 'series'" });
      }
      if (!hubKey || typeof hubKey !== "string") return res.status(400).json({ error: "hubKey required" });
      if (!blurb || typeof blurb !== "string") return res.status(400).json({ error: "blurb required" });
      const normalisedKey = hubType === "chassis"
        ? hubKey.trim().toUpperCase()
        : hubKey.trim().toLowerCase();
      const trimmedBlurb = blurb.trim();
      if (!normalisedKey) return res.status(400).json({ error: "hubKey cannot be empty" });
      if (!trimmedBlurb) return res.status(400).json({ error: "blurb cannot be empty" });
      const row = await storage.upsertHubEditorial({
        hubType,
        hubKey: normalisedKey,
        blurb: trimmedBlurb,
      });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/seo/hub-editorial/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt((req.params["id"] as string), 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
      await storage.deleteHubEditorial(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/seo/language-stats — request totals per locale over the
  // last 30 days. Used by the admin SEO panel to highlight which translations
  // get the most traffic and which can wait.
  app.get("/api/admin/seo/language-stats", requireAdmin, async (req, res) => {
    try {
      const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || "30"), 10) || 30));
      const stats = await storage.getLanguageRequestStats(days);
      const { LOCALE_LIST } = await import("../shared/i18n");
      // Always return one row per supported locale (zero-fill for visibility).
      const byLocale = new Map(stats.map(s => [s.locale, s.hits]));
      const rows = LOCALE_LIST.map(l => ({
        locale: l.code,
        nativeLabel: l.nativeLabel,
        prefix: l.prefix,
        hits: byLocale.get(l.code) ?? 0,
      })).sort((a, b) => b.hits - a.hits);
      res.json({ days, rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/seo/health — quick aggregate health snapshot for content
  // coverage. Counts editorial entries + thin pages (parts with <=1 fitment),
  // and a thin/standard/enriched richness bucket breakdown computed from
  // distinct fitment counts + presence of an editorial note.
  app.get("/api/admin/seo/health", requireAdmin, async (_req, res) => {
    type CountRow = { n: number };
    type ThinRow = { partNumberClean: string; fitmentCount: number; description: string };
    type BucketRow = { bucket: "thin" | "standard" | "enriched"; n: number };
    try {
      const [
        notesCountRow,
        catRow,
        thinRow,
        totalRow,
        bucketRow,
        recent,
      ] = await Promise.all([
        db.execute(sql`SELECT COUNT(*)::int AS n FROM part_editorial_notes`),
        db.execute(sql`SELECT COUNT(*)::int AS n FROM category_editorial`),
        db.execute(sql`
          SELECT part_number_clean AS "partNumberClean",
                 COUNT(DISTINCT car_id)::int AS "fitmentCount",
                 MIN(description) AS "description"
          FROM parts
          WHERE part_number_clean IS NOT NULL AND part_number_clean <> ''
          GROUP BY part_number_clean
          HAVING COUNT(DISTINCT car_id) <= 1
          ORDER BY part_number_clean
          LIMIT 50
        `),
        db.execute(sql`SELECT COUNT(DISTINCT part_number_clean)::int AS n FROM parts WHERE part_number_clean IS NOT NULL AND part_number_clean <> ''`),
        db.execute(sql`
          WITH per_part AS (
            SELECT p.part_number_clean,
                   COUNT(DISTINCT p.car_id)::int AS fitments,
                   (n.part_number_clean IS NOT NULL) AS has_note
            FROM parts p
            LEFT JOIN part_editorial_notes n ON n.part_number_clean = p.part_number_clean
            WHERE p.part_number_clean IS NOT NULL AND p.part_number_clean <> ''
            GROUP BY p.part_number_clean, n.part_number_clean
          )
          SELECT bucket, COUNT(*)::int AS n FROM (
            SELECT CASE
              WHEN has_note OR fitments >= 5 THEN 'enriched'
              WHEN fitments >= 2 THEN 'standard'
              ELSE 'thin'
            END AS bucket
            FROM per_part
          ) t
          GROUP BY bucket
        `),
        storage.listPartEditorialNotes(10),
      ]);
      const buckets = (bucketRow.rows as BucketRow[]).reduce(
        (acc, r) => ({ ...acc, [r.bucket]: r.n }),
        { thin: 0, standard: 0, enriched: 0 } as Record<"thin" | "standard" | "enriched", number>
      );
      res.json({
        partNotes: (notesCountRow.rows[0] as CountRow | undefined)?.n ?? 0,
        categoryBlurbs: (catRow.rows[0] as CountRow | undefined)?.n ?? 0,
        totalDistinctParts: (totalRow.rows[0] as CountRow | undefined)?.n ?? 0,
        thinSamples: (thinRow.rows as ThinRow[]) ?? [],
        buckets,
        recentNotes: recent,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/seo/preview/:partNumberClean — admin-only generated-copy
  // preview. Returns the same payload as /api/parts/seo but skips caching so
  // editors immediately see the effect of editorial changes.
  app.get("/api/admin/seo/preview/:partNumberClean", requireAdmin, async (req, res) => {
    try {
      const pn = (req.params["partNumberClean"] as string).replace(/[\s\-]+/g, "");
      const { SUPPORTED_LOCALES } = await import("../shared/i18n");
      // Admin can preview the generated copy in any supported locale via
      // ?locale=de-DE etc. Defaults to English when omitted/unknown so the
      // panel keeps working for the legacy English-only flow.
      const reqLocale = typeof req.query.locale === "string" ? req.query.locale : "en";
      const locale = (SUPPORTED_LOCALES as readonly string[]).includes(reqLocale) ? reqLocale : "en";
      const xref = await storage.crossReferencePart(pn);
      if (!xref) return res.status(404).json({ error: "Part not found" });
      const [externalRefs, related, editorial, categoryBlurb] = await Promise.all([
        getCrossRefsForPart(pn).catch(() => [] as string[]),
        storage.getRelatedPartsInDiagram(pn, 8).catch(() => []),
        storage.getPartEditorialNote(pn, locale).catch(() => undefined),
        (async () => {
          const v = xref.vehicles[0];
          if (!v?.categoryName) return null;
          const row = await storage.getCategoryEditorial(v.categoryName, v.subcategoryName || null, locale).catch(() => undefined);
          if (row) return row.blurb;
          const parent = await storage.getCategoryEditorial(v.categoryName, null, locale).catch(() => undefined);
          return parent?.blurb ?? null;
        })(),
      ]);
      const { generateSeoContent, classifyHealth } = await import("./seo/content");
      const inputPayload = {
        partNumber: xref.partNumber,
        partNumberClean: xref.partNumberClean,
        description: xref.description,
        additionalInfo: xref.additionalInfo,
        weight: xref.weight,
        vehicles: xref.vehicles.map(v => ({
          carId: v.carId, carName: v.carName, carSlug: v.carSlug,
          chassis: v.chassis, engine: v.engine, bodyType: v.bodyType,
          yearStart: v.yearStart, yearEnd: v.yearEnd,
          categoryName: v.categoryName, subcategoryName: v.subcategoryName,
          quantity: v.quantity,
        })),
        externalChassis: externalRefs,
        related,
        categoryBlurb,
        editorNote: editorial?.note ?? null,
        locale,
      };
      const content = generateSeoContent(inputPayload);
      const richness = classifyHealth(inputPayload);
      res.set("Cache-Control", "no-store");
      res.json({ partNumber: xref.partNumber, partNumberClean: xref.partNumberClean, richness, locale, content });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/parts/external/:partNumberClean — query the engineroom (PartsLink24)
  // catalog for this exact part number. Returns null if not found upstream.
  // Public-facing; never throws (returns null on transport errors so the UI
  // can degrade gracefully).
  app.get("/api/parts/external/:partNumberClean", async (req, res) => {
    // Normalize input: strip whitespace and dashes (callers send "11 42 7 826 799"
    // or "11427826-799" interchangeably). Local cache stores the cleaned form.
    const rawPn = ((req.params["partNumberClean"] as string) || "").trim();
    const pn = rawPn.replace(/[\s\-]+/g, "");
    if (!pn) return res.json({ found: false, part: null });
    // 1) Try local cache (sub-millisecond, populated by import-external-catalog).
    try {
      const cached = await storage.getExternalCatalogPartByPartNumberClean(pn);
      if (cached) {
        return res.json({ found: true, part: cached, source: "local" });
      }
    } catch (err: any) {
      console.warn(`[external-catalog] local lookup failed for ${pn}: ${err?.message}`);
    }
    // 2) Fallback to live engineroom for parts not yet imported.
    try {
      const part = await catalogLookupPart(pn);
      if (!part) return res.json({ found: false, part: null });
      res.json({ found: true, part, source: "engineroom" });
    } catch (err: any) {
      console.warn(`[external-catalog] live lookup failed for ${pn}: ${err?.message}`);
      res.json({ found: false, part: null, error: "external_catalog_unavailable" });
    }
  });

  // GET /api/parts/external-search?model=G20&description=brake&limit=24
  // Search the engineroom catalog. At least one of `model` or `description`
  // must be provided. Returns up to 24 parts by default. Reads from the
  // local cache first; only hits engineroom if the cache returns nothing.
  app.get("/api/parts/external-search", async (req, res) => {
    // Engineroom stores chassis codes uppercase (G20, F30, etc.); normalize so
    // callers can pass lowercase / mixed case without missing local OR live hits.
    const model = String(req.query.model || "").trim().toUpperCase();
    const description = String(req.query.description || req.query.q || "").trim();
    const limit = Math.min(parseInt(String(req.query.limit || "24"), 10) || 24, 100);
    if (!model && !description) {
      return res.json({ found: false, parts: [] });
    }
    // 1) Local cache first. Only short-circuit when the cache fully satisfies
    //    the request (i.e. returned >= limit rows). If the cache returns fewer
    //    than `limit`, we top up from engineroom so callers don't get partial
    //    results during the import window.
    let local: any[] = [];
    try {
      local = await storage.searchExternalCatalogParts({
        ...(model ? { model } : {}),
        ...(description ? { description } : {}),
        limit,
      });
      if (local.length >= limit) {
        return res.json({ found: true, total: local.length, parts: local, source: "local" });
      }
    } catch (err: any) {
      console.warn(`[external-catalog] local search failed model=${model} desc=${description}: ${err?.message}`);
    }
    // 2) Live engineroom — either no local hits or fewer than `limit`.
    try {
      const remaining = Math.max(limit - local.length, 1);
      let liveParts: CatalogPart[];
      if (model && !description) {
        liveParts = await catalogSearchByModel(model, { limit: remaining, maxResults: remaining });
      } else {
        const { listParts } = await import("./parts-catalog-client");
        liveParts = await listParts({
          brand: "BMW",
          ...(model ? { model } : {}),
          ...(description ? { description } : {}),
          limit: remaining,
          maxResults: remaining,
        });
      }
      // De-dupe by part_number_clean so a top-up doesn't repeat what's already local.
      const seen = new Set(local.map((p: any) => (p.partNumberClean || p.partNumber || "").replace(/\s+/g, "")));
      const merged = [...local];
      for (const p of liveParts) {
        const key = (p.partNumber || "").replace(/\s+/g, "");
        if (!seen.has(key)) { merged.push(p); seen.add(key); }
        if (merged.length >= limit) break;
      }
      const source = local.length === 0 ? "engineroom" : "mixed";
      res.json({ found: merged.length > 0, total: merged.length, parts: merged, source });
    } catch (err: any) {
      console.warn(`[external-catalog] live search failed model=${model} desc=${description}: ${err?.message}`);
      // If local had something, still return it so the user gets *some* result.
      if (local.length > 0) {
        return res.json({ found: true, total: local.length, parts: local, source: "local", warning: "engineroom_unavailable" });
      }
      res.json({ found: false, parts: [], error: "external_catalog_unavailable" });
    }
  });

  // GET /api/parts/external-catalog/stats — admin-friendly counts of the local
  // cache so the user can see how full it is. Public, read-only.
  app.get("/api/parts/external-catalog/stats", async (_req, res) => {
    try {
      const count = await storage.countExternalCatalogParts();
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/parts/realoem-check/:partNumberClean", requireAdmin, async (req, res) => {
    try {
      const result = await checkSinglePart((req.params["partNumberClean"] as string));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/realoem-crossref/start", requireAdmin, async (_req, res) => {
    const status = getCrossRefStatus();
    if (status.running) {
      return res.status(409).json({ error: "Cross-reference enrichment is already running" });
    }
    startCrossRefEnrichment().catch(err => console.error("[RealOEM] Background error:", err.message));
    res.json({ status: "started" });
  });

  app.get("/api/realoem-crossref/status", requireAdmin, (_req, res) => {
    res.json(getCrossRefStatus());
  });

  app.post("/api/realoem-crossref/cancel", requireAdmin, (_req, res) => {
    cancelCrossRef();
    res.json({ status: "cancelled" });
  });

  app.get("/api/realoem-crossref/stats", requireAdmin, async (_req, res) => {
    try {
      const stats = await getCrossRefStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  async function fetchPageWithRedirects(fetchUrl: string, redirects = 0): Promise<string> {
    const https = await import("https");
    return new Promise((resolve, reject) => {
      if (redirects > 3) return reject(new Error("Too many redirects"));
      https.get(fetchUrl, { rejectUnauthorized: false, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0" }, timeout: 10000 }, (resp) => {
        if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
          const loc = resp.headers.location.startsWith("http") ? resp.headers.location : new URL(resp.headers.location, fetchUrl).href;
          resp.resume();
          return resolve(fetchPageWithRedirects(loc, redirects + 1));
        }
        if (resp.statusCode !== 200) {
          resp.resume();
          return reject(new Error(`HTTP ${resp.statusCode}`));
        }
        let d = "";
        resp.on("data", (c: Buffer) => d += c);
        resp.on("end", () => resolve(d));
      }).on("error", reject).on("timeout", function(this: any) { this.destroy(); reject(new Error("Timeout")); });
    });
  }

  async function fetchBmwPartsDealPricing(partNum: string) {
    try {
      const url = `https://www.bmwpartsdeal.com/parts/bmw-${partNum}.html`;
      const html = await fetchPageWithRedirects(url);

      const jsonLdMatch = html.match(/"@type"\s*:\s*"Product"[\s\S]*?"price"\s*:\s*"([\d.]+)"/);
      const jsonLdPrice = jsonLdMatch ? parseFloat(jsonLdMatch[1]) : null;
      const allPrices = [...html.matchAll(/"priceInfo":\{"partId":(\d+),"brand":[^,]*,"price":"([\d.]+)"[^}]*"retail":"([\d.]+)"[^}]*"save":"([\d.]+)"/g)];

      let priceMatch = null;
      if (jsonLdPrice && allPrices.length > 0) {
        priceMatch = allPrices.find(m => Math.abs(parseFloat(m[2]) - jsonLdPrice) < 0.01);
      }
      if (!priceMatch && allPrices.length > 0) {
        priceMatch = allPrices[allPrices.length - 1];
      }
      if (!priceMatch) return null;

      const dealPrice = parseFloat(priceMatch[2]);
      const msrp = parseFloat(priceMatch[3]);
      const savings = parseFloat(priceMatch[4]);
      const audApprox = Math.round(msrp * 1.5 * 100) / 100;

      const slugMatch = html.match(/"url":\s*"(https:\/\/www\.bmwpartsdeal\.com\/parts\/[^"]+)"/);
      const productUrl = slugMatch ? slugMatch[1] : `https://www.bmwpartsdeal.com/parts/bmw-${partNum}.html`;

      return {
        found: true as const,
        source: "bmwpartsdeal" as const,
        partNumber: partNum,
        dealPrice,
        msrp,
        savings,
        audApprox,
        productUrl,
        currency: "USD" as const,
      };
    } catch {
      return null;
    }
  }

  async function fetchLllPartsPricing(partNum: string) {
    try {
      const url = `https://www.lllparts.co.uk/product/${partNum}`;
      const html = await fetchPageWithRedirects(url);

      const priceMatch = html.match(/dynamic_product_price[^>]*>[^£]*£([\d,.]+)/);
      if (!priceMatch) return null;

      const gbpPrice = parseFloat(priceMatch[1].replace(/,/g, ""));
      if (isNaN(gbpPrice) || gbpPrice <= 0) return null;

      const audApprox = Math.round(gbpPrice * 2.5 * 100) / 100;

      return {
        found: true as const,
        source: "lllparts" as const,
        partNumber: partNum,
        gbpPrice,
        audApprox,
        productUrl: url,
        currency: "GBP" as const,
      };
    } catch {
      return null;
    }
  }

  async function checkMPerformanceStock(partNumberClean: string): Promise<{
    inStock: boolean;
    productUrl: string | null;
    productTitle: string | null;
    price: number | null;
    searchUrl: string;
  }> {
    const cleaned = partNumberClean.replace(/[\s\-]/g, "");
    const searchUrl = `https://www.mperformance.parts/search?q=${encodeURIComponent(cleaned)}&type=product`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(searchUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BMWPartsCatalog/1.0)",
          "Accept": "text/html",
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return { inStock: false, productUrl: null, productTitle: null, price: null, searchUrl };
      }

      const html = await response.text();

      const countMatch = html.match(/(\d+) results? found for/);
      const resultCount = countMatch ? parseInt(countMatch[1]) : 0;

      if (resultCount === 0) {
        return { inStock: false, productUrl: null, productTitle: null, price: null, searchUrl };
      }

      const productPaths: string[] = [];
      const seen = new Set<string>();
      const urlRegex = /href="(\/products\/[^"?]+)/g;
      let urlMatch;
      while ((urlMatch = urlRegex.exec(html)) !== null) {
        const path = urlMatch[1];
        if (!path.match(/\.(jpg|png|webp|gif)/i) && !seen.has(path)) {
          seen.add(path);
          productPaths.push(path);
        }
      }

      if (productPaths.length === 0) {
        return { inStock: false, productUrl: null, productTitle: null, price: null, searchUrl };
      }

      const inStockBadge = html.match(/In [Ss]tock\s*\((\d+)\)/);
      const inStockCount = inStockBadge ? parseInt(inStockBadge[1]) : 0;
      const hasInStockText = /In [Ss]tock/.test(html);
      const soldOutCount = html.match(/[Ss]old [Oo]ut\s*\((\d+)\)/);
      const allSoldOut = soldOutCount && parseInt(soldOutCount[1]) === resultCount;
      const pageHasStock = hasInStockText && !allSoldOut && inStockCount > 0;

      if (!pageHasStock) {
        return { inStock: false, productUrl: null, productTitle: null, price: null, searchUrl };
      }

      const partNumVariants = [cleaned.toLowerCase()];
      if (cleaned.length >= 7) {
        const core = cleaned.replace(/^0+/, "");
        if (core !== cleaned) partNumVariants.push(core.toLowerCase());
      }
      if (cleaned.length >= 9 && /\d{2}$/.test(cleaned)) {
        const withoutSuffix = cleaned.slice(0, -2);
        partNumVariants.push(withoutSuffix.toLowerCase());
      }

      for (const productPath of productPaths) {
        const handle = productPath.split("/products/")[1] || "";
        try {
          const jsonController = new AbortController();
          const jsonTimeout = setTimeout(() => jsonController.abort(), 5000);
          const jsonRes = await fetch(`https://www.mperformance.parts/products/${handle}.json`, {
            signal: jsonController.signal,
            headers: { "User-Agent": "Mozilla/5.0 (compatible; BMWPartsCatalog/1.0)", "Accept": "application/json" },
          });
          clearTimeout(jsonTimeout);

          if (!jsonRes.ok) continue;

          const jsonData = await jsonRes.json();
          const product = jsonData.product;
          if (!product) continue;

          const textToSearch = [
            product.title || "",
            product.tags || "",
            product.body_html || "",
            handle,
            ...(product.variants || []).map((v: any) => v.sku || ""),
          ].join(" ").toLowerCase().replace(/[\s\-]/g, "");

          const matchesPartNum = partNumVariants.some(pn => textToSearch.includes(pn));
          if (!matchesPartNum) continue;

          const productTitle = product.title || null;
          const price = product.variants?.[0]?.price ? parseFloat(product.variants[0].price) : null;
          const productUrl = `https://www.mperformance.parts${productPath}`;

          return { inStock: true, productUrl, productTitle, price, searchUrl };
        } catch {}
      }

      return { inStock: false, productUrl: null, productTitle: null, price: null, searchUrl };
    } catch (err: any) {
      console.error("MPerformance stock check failed:", err.message);
      return { inStock: false, productUrl: null, productTitle: null, price: null, searchUrl };
    }
  }

  app.get("/api/parts/mperformance/:partNumberClean", async (req, res) => {
    const partNum = (req.params["partNumberClean"] as string).replace(/[\s\-]/g, "");
    try {
      const result = await checkMPerformanceStock(partNum);
      res.json(result);
    } catch (err: any) {
      res.json({ inStock: false, productUrl: null, productTitle: null, price: null, searchUrl: `https://www.mperformance.parts/search?q=${encodeURIComponent(partNum)}&type=product` });
    }
  });

  // POST /api/partner/mp-quote — proxy to MPerformance.parts Partner Quote API.
  // The API key is never exposed to the browser; it is read only here.
  app.post("/api/partner/mp-quote", async (req, res) => {
    const { z } = await import("zod");
    const bodySchema = z.object({
      fullName: z.string().min(1, "Full name is required"),
      email: z.string().email("Valid email is required"),
      phone: z.string().min(1, "Phone is required"),
      shippingPostcode: z.string().optional(),
      notes: z.string().optional(),
      partNumber: z.string().min(1, "Part number is required"),
      partDescription: z.string().optional(),
      vehicleMake: z.string().optional(),
      vehicleModel: z.string().optional(),
      vehicleSeries: z.string().optional(),
      vehicleYear: z.number().int().optional(),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
    }

    const data = parsed.data;
    const apiKey = process.env.MPERF_PARTNER_API_KEY || process.env.QUOTE_PARTS_API_KEY;
    if (!apiKey) {
      console.error("MPERF_PARTNER_API_KEY (or QUOTE_PARTS_API_KEY) is not set");
      return res.status(503).json({ error: "Quote service is not configured" });
    }

    const partDescriptionStr = [data.partDescription, data.partNumber].filter(Boolean).join(" — ");

    const payload: Record<string, unknown> = {
      category: "single-bmw-part",
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      ...(data.shippingPostcode ? { shippingPostcode: data.shippingPostcode } : {}),
      ...(data.notes ? { notes: data.notes } : {}),
      ...(data.vehicleMake ? { make: data.vehicleMake } : {}),
      ...(data.vehicleModel ? { model: data.vehicleModel } : {}),
      ...(data.vehicleYear ? { year: data.vehicleYear } : {}),
      answers: {
        partDescription: partDescriptionStr,
        ...(data.vehicleSeries ? { series: data.vehicleSeries } : {}),
      },
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const upstream = await fetch("https://mperformance.parts/api/partner/leads", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
          "User-Agent": "BMVPartsCatalog/1.0",
        },
        body: JSON.stringify(payload),
      });
      clearTimeout(timeout);

      const responseText = await upstream.text();
      let responseJson: any = {};
      try { responseJson = JSON.parse(responseText); } catch {}

      if (!upstream.ok) {
        console.error(`MPerformance quote API error ${upstream.status}:`, responseText);
        return res.status(upstream.status >= 500 ? 502 : 400).json({
          error: responseJson?.message || responseJson?.error || "Quote submission failed",
        });
      }

      // Return the reference number from the upstream response.
      // Accept either referenceNumber or id as the reference.
      const referenceNumber: string =
        responseJson.referenceNumber ||
        responseJson.reference_number ||
        responseJson.id ||
        `MPPQ-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000) + 1000}`;

      return res.json({ success: true, referenceNumber });
    } catch (err: any) {
      console.error("MPerformance quote proxy error:", err.message);
      return res.status(502).json({ error: "Could not reach MPerformance.parts — please try again later." });
    }
  });

  app.get("/api/parts/pricing/:partNumberClean", requireAuth, async (req, res) => {
    const partNum = (req.params["partNumberClean"] as string);
    // Always pluck the EU dealer pricing if we have it (independent of
    // bmwpartsdeal/lllparts availability)
    const eu = (cached: any) => cached?.eurNetPrice != null ? {
      eurListPrice: cached.eurListPrice,
      eurNetPrice: cached.eurNetPrice,
      eurVatPercent: cached.eurVatPercent,
      eurAudApprox: cached.eurAudApprox,
      eurSourceFile: cached.eurSourceFile,
      eurUpdatedAt: cached.eurUpdatedAt,
    } : {};
    try {
      const cached = await storage.getPartPricing(partNum);
      if (cached && cached.found) {
        return res.json({
          found: true,
          source: cached.source,
          dealPrice: cached.dealPrice,
          msrp: cached.msrp,
          savings: cached.savings,
          gbpPrice: cached.gbpPrice,
          audApprox: cached.audApprox,
          currency: cached.currency,
          productUrl: cached.productUrl,
          cached: true,
          ...eu(cached),
        });
      }
      if (cached && !cached.found) {
        // EU dealer pricing alone is enough to surface the pricing card
        if (cached.eurNetPrice != null) {
          return res.json({ found: true, source: "etk_europe", cached: true, ...eu(cached) });
        }
        const hoursSinceCheck = cached.lastCheckedAt ? (Date.now() - new Date(cached.lastCheckedAt).getTime()) / 3600000 : Infinity;
        if (hoursSinceCheck < 24) {
          return res.json({ found: false, cached: true });
        }
      }

      const bpdResult = await fetchBmwPartsDealPricing(partNum);
      if (bpdResult) {
        await storage.upsertPartPricing({
          partNumberClean: partNum, source: "bmwpartsdeal",
          dealPrice: bpdResult.dealPrice, msrp: bpdResult.msrp, savings: bpdResult.savings,
          gbpPrice: null, audApprox: bpdResult.audApprox, currency: "USD",
          productUrl: bpdResult.productUrl, found: true,
        });
        return res.json(bpdResult);
      }

      const lllResult = await fetchLllPartsPricing(partNum);
      if (lllResult) {
        await storage.upsertPartPricing({
          partNumberClean: partNum, source: "lllparts",
          dealPrice: null, msrp: null, savings: null,
          gbpPrice: lllResult.gbpPrice, audApprox: lllResult.audApprox, currency: "GBP",
          productUrl: lllResult.productUrl, found: true,
        });
        return res.json(lllResult);
      }

      await storage.upsertPartPricing({
        partNumberClean: partNum, source: null,
        dealPrice: null, msrp: null, savings: null,
        gbpPrice: null, audApprox: null, currency: null,
        productUrl: null, found: false,
      });
      res.json({ found: false });
    } catch (err: any) {
      console.error(`Pricing fetch error for ${partNum}:`, err.message);
      res.json({ found: false, error: err.message });
    }
  });

  // ============ Auth Routes ============

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!user) return res.status(401).json({ error: info?.message || "Invalid credentials" });
      req.logIn(user, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: user.id, username: user.username, role: user.role });
      });
    })(req, res, next);
  });

  app.get("/api/auth/gearswap", async (req, res) => {
    const gearswapUrl = process.env.GEARSWAP_URL || "https://gearswap.ai";
    const callbackUrl = `${req.protocol}://${req.get("host")}/api/auth/gearswap/callback`;
    const { randomBytes } = await import("crypto");
    const state = randomBytes(16).toString("hex");
    (req.session as any).oauthState = state;
    const params = new URLSearchParams({
      client_id: "bmv_parts",
      redirect_uri: callbackUrl,
      state,
      response_type: "code",
    });
    res.redirect(`${gearswapUrl}/oauth/authorize?${params.toString()}`);
  });

  app.get("/api/auth/gearswap/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query as Record<string, string>;

      if (error) {
        console.error("[GearSwap SSO] Auth error:", error);
        return res.redirect("/login?error=gearswap_denied");
      }

      if (!code) {
        return res.redirect("/login?error=no_code");
      }

      const savedState = (req.session as any).oauthState;
      if (!state || state !== savedState) {
        console.error("[GearSwap SSO] State mismatch");
        return res.redirect("/login?error=state_mismatch");
      }
      delete (req.session as any).oauthState;

      const gearswapUrl = process.env.GEARSWAP_URL || "https://gearswap.ai";
      const ssoSecret = process.env.BMV_SSO_SECRET;
      if (!ssoSecret) {
        console.error("[GearSwap SSO] BMV_SSO_SECRET not configured");
        return res.redirect("/login?error=config_error");
      }

      const callbackUrl = `${req.protocol}://${req.get("host")}/api/auth/gearswap/callback`;
      const tokenRes = await fetch(`${gearswapUrl}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ssoSecret}`,
        },
        body: JSON.stringify({ code, redirect_uri: callbackUrl, client_id: "bmv_parts" }),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        console.error("[GearSwap SSO] Token exchange failed:", tokenRes.status, errBody);
        return res.redirect("/login?error=token_exchange_failed");
      }

      const tokenData = await tokenRes.json();
      const gsUser = tokenData.user || tokenData;

      if (!gsUser.id && !gsUser.source_user_id) {
        console.error("[GearSwap SSO] No user ID in token response:", tokenData);
        return res.redirect("/login?error=no_user_data");
      }

      const sourceUserId = gsUser.source_user_id || gsUser.id;
      const gsUsername = gsUser.username || `gs_${sourceUserId}`;

      let provAccount = await storage.getProvisionedAccountBySourceUser("gearswap", sourceUserId);
      let user;

      if (provAccount) {
        user = await storage.getUser(provAccount.userId);
        if (!user) {
          console.error(`[GearSwap SSO] Provisioned account exists but user ${provAccount.userId} not found`);
          return res.redirect("/login?error=user_not_found");
        }
      } else {
        const existingUser = await storage.getUserByUsername(gsUsername);
        if (existingUser) {
          user = existingUser;
        } else {
          const { randomBytes: rb } = await import("crypto");
          const tempPassword = rb(12).toString("base64url");
          user = await storage.createUser({ username: gsUsername, password: tempPassword, role: "user" });
        }

        await storage.createProvisionedAccount({
          source: "gearswap",
          sourceUserId: sourceUserId,
          accountType: gsUser.account_type || gsUser.role || "user",
          userId: user.id,
          username: gsUsername,
          email: gsUser.email || null,
          fullName: gsUser.full_name || gsUser.name || null,
          company: gsUser.company || null,
          phone: gsUser.phone || null,
          country: gsUser.country || null,
          role: gsUser.role || null,
          tier: gsUser.tier || null,
          employerSourceId: gsUser.employer_source_id || null,
          storeSlug: gsUser.store_slug || null,
          storeName: gsUser.store_name || null,
          metadata: gsUser.metadata || null,
        });

        console.log(`[GearSwap SSO] Created account for GS user ${sourceUserId} -> ${user.id} (${gsUsername})`);
      }

      req.logIn({ id: user.id, username: user.username, role: user.role }, (err) => {
        if (err) {
          console.error("[GearSwap SSO] Login error:", err);
          return res.redirect("/login?error=login_failed");
        }
        console.log(`[GearSwap SSO] User ${user!.username} logged in via GearSwap`);
        res.redirect("/");
      });
    } catch (err: any) {
      console.error("[GearSwap SSO] Callback error:", err);
      res.redirect("/login?error=server_error");
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated()) {
      res.json({ id: req.user!.id, username: req.user!.username, role: req.user!.role });
    } else {
      res.json(null);
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body || {};
      if (typeof email !== "string" || email.trim().length === 0) {
        return res.status(400).json({ error: "Email is required" });
      }
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: "Invalid email address" });
      }

      const user = await storage.getUserByEmail(normalizedEmail);
      if (user) {
        await storage.deletePasswordResetTokensForUser(user.id);
        const rawToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await storage.createPasswordResetToken(user.id, tokenHash, expiresAt);

        const configuredBase = (process.env.APP_URL || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
        const baseUrl = configuredBase
          || (process.env.NODE_ENV === "production" ? "https://bmv.parts" : `${req.protocol}://${req.get("host")}`);
        const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
        const emailResult = await sendPasswordResetEmail(normalizedEmail, resetUrl, user.username);
        if (!emailResult.success) {
          console.error("[ForgotPassword] Failed to send reset email:", emailResult.error);
        }
      }

      res.json({ ok: true, message: "If an account exists for that email, a reset link has been sent." });
    } catch (err: any) {
      console.error("[ForgotPassword] Error:", err);
      res.status(500).json({ error: "Failed to process request" });
    }
  });

  app.get("/api/auth/reset-password/validate", async (req, res) => {
    try {
      const token = String(req.query.token || "");
      if (!token) return res.status(400).json({ valid: false, error: "Missing token" });
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const valid = await storage.isPasswordResetTokenValid(tokenHash);
      res.json({ valid });
    } catch (err: any) {
      res.status(500).json({ valid: false, error: err.message });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body || {};
      if (typeof token !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "Token and password are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const consumed = await storage.consumePasswordResetToken(tokenHash);
      if (!consumed) {
        return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
      }
      await storage.updateUser(consumed.userId, { password });
      await storage.deletePasswordResetTokensForUser(consumed.userId);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[ResetPassword] Error:", err);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: "Email and password required" });
      if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: "Invalid email address" });
      }
      const existingByEmail = await storage.getUserByEmail(normalizedEmail);
      if (existingByEmail) return res.status(409).json({ error: "An account with that email already exists" });
      // username column is NOT NULL — store email as the username for new accounts
      const existingByUsername = await storage.getUserByUsername(normalizedEmail);
      if (existingByUsername) return res.status(409).json({ error: "An account with that email already exists" });
      const user = await storage.createUser({ username: normalizedEmail, password, role: "user", email: normalizedEmail });
      req.logIn({ id: user.id, username: user.username, role: user.role }, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: user.id, username: user.username, role: user.role });
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============ Admin Routes ============

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users.map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role, createdAt: u.createdAt })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const { username, password, role, email } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
      const existing = await storage.getUserByUsername(username);
      if (existing) return res.status(409).json({ error: "Username already taken" });
      const normalizedEmail = typeof email === "string" && email.trim().length > 0 ? email.trim().toLowerCase() : null;
      if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: "Invalid email address" });
      }
      const user = await storage.createUser({ username, password, role: role || "user", email: normalizedEmail });
      res.json({ id: user.id, username: user.username, email: user.email, role: user.role, createdAt: user.createdAt });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const { role, password, email } = req.body;
      const updates: any = {};
      if (role) updates.role = role;
      if (password) updates.password = password;
      if (email !== undefined) {
        if (email === null || (typeof email === "string" && email.trim().length === 0)) {
          updates.email = null;
        } else if (typeof email === "string") {
          const normalized = email.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
            return res.status(400).json({ error: "Invalid email address" });
          }
          updates.email = normalized;
        }
      }
      const user = await storage.updateUser((req.params["id"] as string), updates);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ id: user.id, username: user.username, email: user.email, role: user.role, createdAt: user.createdAt });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      if ((req.params["id"] as string) === req.user?.id) return res.status(400).json({ error: "Cannot delete your own account" });
      await storage.deleteUser((req.params["id"] as string));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/api-keys", requireAdmin, async (req, res) => {
    try {
      const keys = await storage.getAllApiKeys();
      res.json(keys);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/api-keys", requireAdmin, async (req, res) => {
    try {
      const { userId, name, tier } = req.body;
      if (!userId || !name) return res.status(400).json({ error: "userId and name required" });
      const validTiers = ["basic", "paid", "admin"];
      if (tier && !validTiers.includes(tier)) return res.status(400).json({ error: `Invalid tier. Must be: ${validTiers.join(", ")}` });
      const key = `bmw_${tier || "basic"}_${randomBytes(24).toString("hex")}`;
      const apiKey = await storage.createApiKey({ userId, name, tier: tier || "basic", key, active: true });
      res.json(apiKey);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/api-keys/:id", requireAdmin, async (req, res) => {
    try {
      const { active, tier, name } = req.body;
      const updates: any = {};
      if (typeof active === "boolean") updates.active = active;
      if (tier) updates.tier = tier;
      if (name) updates.name = name;
      const key = await storage.updateApiKey(parseInt((req.params["id"] as string)), updates);
      if (!key) return res.status(404).json({ error: "API key not found" });
      res.json(key);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/api-keys/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteApiKey(parseInt((req.params["id"] as string)));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============ User Garage (My Cars) ============

  app.get("/api/my-cars", requireAuth, async (req, res) => {
    try {
      const userCars = await storage.getUserCars(req.user!.id);
      res.json(userCars);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/my-cars", requireAuth, async (req, res) => {
    try {
      const { vin, nickname } = req.body;
      if (!vin || vin.length < 7) return res.status(400).json({ error: "Valid VIN required (at least 7 characters)" });

      const vinInput = vin.trim().toUpperCase();
      const decoded = await decodeVin(vinInput);

      const allCars = await storage.getCars();
      let matchedCarId: number | null = null;

      if (decoded.chassis) {
        const chassisMatch = allCars.filter(c =>
          c.chassis.toLowerCase() === decoded.chassis!.toLowerCase()
        );
        if (chassisMatch.length > 0) {
          if (decoded.engine) {
            const engineMatch = chassisMatch.find(c =>
              c.engine?.toLowerCase() === decoded.engine!.toLowerCase()
            );
            matchedCarId = engineMatch?.id || chassisMatch[0].id;
          } else {
            matchedCarId = chassisMatch[0].id;
          }
        }
      }

      const userCar = await storage.addUserCar({
        userId: req.user!.id,
        vin: vinInput,
        nickname: nickname || null,
        chassis: decoded.chassis || null,
        series: decoded.series || null,
        modelName: decoded.modelName || decoded.chassis || null,
        modelYear: decoded.modelYear || null,
        matchedCarId,
        vinData: decoded as any,
      });

      const result = await storage.getUserCars(req.user!.id);
      const added = result.find(c => c.id === userCar.id);
      res.json(added || userCar);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/my-cars/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt((req.params["id"] as string));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid car ID" });
      const { nickname } = req.body;
      const updated = await storage.updateUserCar(id, req.user!.id, { nickname });
      if (!updated) return res.status(404).json({ error: "Car not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/my-cars/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt((req.params["id"] as string));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid car ID" });
      await storage.removeUserCar(id, req.user!.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============ Admin Pricing Sync ============

  const pricingSyncState = {
    isRunning: false,
    shouldStop: false,
    totalParts: 0,
    completed: 0,
    found: 0,
    notFound: 0,
    errors: 0,
    skipped: 0,
    currentPartNumber: "",
    startedAt: null as Date | null,
    mode: "resume" as "resume" | "full",
  };

  async function runPricingSync(forceRefresh: boolean = false) {
    if (pricingSyncState.isRunning) return;
    pricingSyncState.isRunning = true;
    pricingSyncState.shouldStop = false;
    pricingSyncState.completed = 0;
    pricingSyncState.found = 0;
    pricingSyncState.notFound = 0;
    pricingSyncState.errors = 0;
    pricingSyncState.skipped = 0;
    pricingSyncState.currentPartNumber = "";
    pricingSyncState.startedAt = new Date();
    pricingSyncState.mode = forceRefresh ? "full" : "resume";

    try {
      const partNumbers = forceRefresh
        ? await storage.getDistinctPartNumbers()
        : await storage.getUnpricedPartNumbers();
      pricingSyncState.totalParts = partNumbers.length;
      console.log(`[Pricing Sync] Starting ${forceRefresh ? 'full' : 'resume'} sync for ${partNumbers.length} parts`);

      if (partNumbers.length === 0) {
        console.log(`[Pricing Sync] Nothing to sync — all parts already have pricing data`);
        pricingSyncState.isRunning = false;
        return;
      }

      const CONCURRENCY = 2;

      for (let i = 0; i < partNumbers.length; i += CONCURRENCY) {
        if (pricingSyncState.shouldStop) {
          console.log(`[Pricing Sync] Stopped by admin at ${pricingSyncState.completed}/${pricingSyncState.totalParts}`);
          break;
        }

        const batch = partNumbers.slice(i, i + CONCURRENCY);
        const promises = batch.map(async (pn) => {
          pricingSyncState.currentPartNumber = pn;
          try {
            const bpdResult = await fetchBmwPartsDealPricing(pn);
            if (bpdResult) {
              await storage.upsertPartPricing({
                partNumberClean: pn,
                source: "bmwpartsdeal",
                dealPrice: bpdResult.dealPrice,
                msrp: bpdResult.msrp,
                savings: bpdResult.savings,
                gbpPrice: null,
                audApprox: bpdResult.audApprox,
                currency: "USD",
                productUrl: bpdResult.productUrl,
                found: true,
              });
              pricingSyncState.found++;
              pricingSyncState.completed++;
              return;
            }

            const lllResult = await fetchLllPartsPricing(pn);
            if (lllResult) {
              await storage.upsertPartPricing({
                partNumberClean: pn,
                source: "lllparts",
                dealPrice: null,
                msrp: null,
                savings: null,
                gbpPrice: lllResult.gbpPrice,
                audApprox: lllResult.audApprox,
                currency: "GBP",
                productUrl: lllResult.productUrl,
                found: true,
              });
              pricingSyncState.found++;
              pricingSyncState.completed++;
              return;
            }

            await storage.upsertPartPricing({
              partNumberClean: pn,
              source: null,
              dealPrice: null,
              msrp: null,
              savings: null,
              gbpPrice: null,
              audApprox: null,
              currency: null,
              productUrl: null,
              found: false,
            });
            pricingSyncState.notFound++;
            pricingSyncState.completed++;
          } catch (err: any) {
            console.error(`[Pricing Sync] Error for ${pn}:`, err.message);
            pricingSyncState.errors++;
            pricingSyncState.completed++;
          }
        });

        await Promise.all(promises);

        if (pricingSyncState.completed % 50 === 0) {
          console.log(`[Pricing Sync] Progress: ${pricingSyncState.completed}/${pricingSyncState.totalParts} (found: ${pricingSyncState.found}, notFound: ${pricingSyncState.notFound}, errors: ${pricingSyncState.errors})`);
        }
      }
    } catch (err: any) {
      console.error("[Pricing Sync] Fatal error:", err.message);
    } finally {
      pricingSyncState.isRunning = false;
      pricingSyncState.currentPartNumber = "";
      console.log(`[Pricing Sync] Complete. Found: ${pricingSyncState.found}, Not Found: ${pricingSyncState.notFound}, Errors: ${pricingSyncState.errors}`);
    }
  }

  app.post("/api/admin/pricing-sync/start", requireAdmin, async (req, res) => {
    if (pricingSyncState.isRunning) {
      return res.json({ message: "Sync already running", status: pricingSyncState });
    }
    const forceRefresh = req.body?.forceRefresh === true;
    runPricingSync(forceRefresh).catch(e => console.error("Pricing sync error:", e));
    res.json({ message: "Pricing sync started", status: pricingSyncState });
  });

  app.get("/api/admin/pricing-sync/status", requireAdmin, async (_req, res) => {
    const cached = await storage.countPartPricing();
    res.json({ ...pricingSyncState, cachedPrices: cached });
  });

  app.post("/api/admin/pricing-sync/stop", requireAdmin, async (_req, res) => {
    pricingSyncState.shouldStop = true;
    res.json({ message: "Stop signal sent", status: pricingSyncState });
  });

  // ============ External API (API Key authenticated) ============

  app.get("/api/v1/cars", requireApiKey, async (req, res) => {
    try {
      const cars = await storage.getCars();
      res.json({ data: cars.map(c => ({ id: c.id, chassis: c.chassis, displayName: c.displayName, series: c.series, engine: c.engine, bodyType: c.bodyType, yearStart: c.yearStart, yearEnd: c.yearEnd, slug: c.slug, totalParts: c.totalParts })) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/v1/cars/:idOrSlug", requireApiKey, async (req, res) => {
    try {
      const param = (req.params["idOrSlug"] as string);
      const car = /^\d+$/.test(param) ? await storage.getCar(parseInt(param)) : await storage.getCarBySlug(param);
      if (!car) return res.status(404).json({ error: "Car not found" });
      res.json({ data: car });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/v1/cars/:id/categories", requireApiKey, async (req, res) => {
    try {
      const cats = await storage.getCategoriesByCarId(parseInt((req.params["id"] as string)));
      res.json({ data: cats });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/v1/categories/:id/subcategories", requireApiKey, async (req, res) => {
    try {
      const subs = await storage.getSubcategoriesByCategoryId(parseInt((req.params["id"] as string)));
      res.json({ data: subs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/v1/subcategories/:id/parts", requireApiKey, requireApiTier("paid", "admin"), async (req, res) => {
    try {
      const parts = await storage.getPartsBySubcategoryId(parseInt((req.params["id"] as string)));
      res.json({ data: parts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/v1/search", requireApiKey, requireApiTier("paid", "admin"), async (req, res) => {
    try {
      const q = req.query.q as string;
      if (!q || q.length < 2) return res.status(400).json({ error: "Search query must be at least 2 characters" });
      const results = await storage.searchParts(q);
      res.json({ data: results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/v1/parts/cross-reference/:partNumberClean", requireApiKey, requireApiTier("paid", "admin"), async (req, res) => {
    try {
      const result = await storage.crossReferencePart((req.params["partNumberClean"] as string));
      if (!result) return res.status(404).json({ error: "Part not found" });
      const externalRefs = await getCrossRefsForPart((req.params["partNumberClean"] as string));
      res.json({ data: { ...result, externalChassis: externalRefs } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/v1/parts/pricing/:partNumberClean", requireApiKey, requireApiTier("admin"), async (req, res) => {
    try {
      const partNum = (req.params["partNumberClean"] as string);

      const cached = await storage.getPartPricing(partNum);
      if (cached && cached.found) {
        return res.json({ data: {
          found: true, source: cached.source,
          dealPrice: cached.dealPrice, msrp: cached.msrp, savings: cached.savings,
          gbpPrice: cached.gbpPrice, audApprox: cached.audApprox, currency: cached.currency,
          productUrl: cached.productUrl, cached: true,
        }});
      }
      if (cached && !cached.found) {
        const hoursSinceCheck = cached.lastCheckedAt ? (Date.now() - new Date(cached.lastCheckedAt).getTime()) / 3600000 : Infinity;
        if (hoursSinceCheck < 24) {
          return res.json({ data: { found: false, cached: true } });
        }
      }

      const bpdResult = await fetchBmwPartsDealPricing(partNum);
      if (bpdResult) {
        await storage.upsertPartPricing({
          partNumberClean: partNum, source: "bmwpartsdeal",
          dealPrice: bpdResult.dealPrice, msrp: bpdResult.msrp, savings: bpdResult.savings,
          gbpPrice: null, audApprox: bpdResult.audApprox, currency: "USD",
          productUrl: bpdResult.productUrl, found: true,
        });
        return res.json({ data: bpdResult });
      }

      const lllResult = await fetchLllPartsPricing(partNum);
      if (lllResult) {
        await storage.upsertPartPricing({
          partNumberClean: partNum, source: "lllparts",
          dealPrice: null, msrp: null, savings: null,
          gbpPrice: lllResult.gbpPrice, audApprox: lllResult.audApprox, currency: "GBP",
          productUrl: lllResult.productUrl, found: true,
        });
        return res.json({ data: lllResult });
      }

      await storage.upsertPartPricing({
        partNumberClean: partNum, source: null,
        dealPrice: null, msrp: null, savings: null,
        gbpPrice: null, audApprox: null, currency: null,
        productUrl: null, found: false,
      });
      res.json({ data: { found: false } });
    } catch (err: any) {
      res.json({ data: { found: false, error: err.message } });
    }
  });

  function requireProvisionKey(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }
    const token = authHeader.slice(7);
    const expectedKey = process.env.BMV_ACCOUNT_PROVISION_KEY;
    if (!expectedKey || token !== expectedKey) {
      return res.status(401).json({ error: "Invalid Bearer token" });
    }
    next();
  }

  async function provisionSingleAccount(body: any): Promise<{ status: number; data: any }> {
    const { source, source_user_id, account_type, username, email, full_name, company, phone, country, role, tier, employer_source_id, store_slug, store_name, metadata } = body;

    if (!source || source_user_id == null || !account_type || !username) {
      return { status: 422, data: { error: "Missing required fields: source, source_user_id, account_type, username" } };
    }

    const existing = await storage.getProvisionedAccountBySourceUser(source, source_user_id);
    if (existing) {
      const user = await storage.getUser(existing.userId);
      return {
        status: 200,
        data: {
          status: "exists",
          bmv_user_id: existing.userId,
          username: user?.username || existing.username,
          source_user_id,
        },
      };
    }

    const existingByUsername = await storage.getProvisionedAccountByUsername(username);
    if (existingByUsername && existingByUsername.sourceUserId !== source_user_id) {
      return { status: 409, data: { error: "Username conflict: different source_user_id already uses this username" } };
    }

    const existingUser = await storage.getUserByUsername(username);
    if (existingUser) {
      const existingProvision = await storage.getProvisionedAccountBySourceUser(source, source_user_id);
      if (!existingProvision) {
        return { status: 409, data: { error: "Username already exists on bmv.parts with a different account" } };
      }
    }

    const crypto = await import("crypto");
    const temporaryPassword = crypto.randomBytes(12).toString("base64url");

    const userRole = account_type === "staff" ? "user" : account_type === "vendor" ? "user" : "user";
    const newUser = await storage.createUser({ username, password: temporaryPassword, role: userRole });

    await storage.createProvisionedAccount({
      source,
      sourceUserId: source_user_id,
      accountType: account_type,
      userId: newUser.id,
      username,
      email: email || null,
      fullName: full_name || null,
      company: company || null,
      phone: phone || null,
      country: country || null,
      role: role || null,
      tier: tier || null,
      employerSourceId: employer_source_id || null,
      storeSlug: store_slug || null,
      storeName: store_name || null,
      metadata: metadata || null,
    });

    console.log(`[Provision] Created account for ${source}:${source_user_id} -> user ${newUser.id} (${username})`);

    return {
      status: 201,
      data: {
        status: "created",
        bmv_user_id: newUser.id,
        username,
        temporary_password: temporaryPassword,
      },
    };
  }

  app.post("/api/v1/accounts/provision", requireProvisionKey, async (req, res) => {
    try {
      const result = await provisionSingleAccount(req.body);
      res.status(result.status).json(result.data);
    } catch (err: any) {
      console.error("[Provision] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/v1/accounts/provision/batch", requireProvisionKey, async (req, res) => {
    try {
      const { accounts } = req.body;
      if (!Array.isArray(accounts)) {
        return res.status(422).json({ error: "Request body must contain an 'accounts' array" });
      }

      const results = [];
      for (const account of accounts) {
        try {
          const result = await provisionSingleAccount(account);
          results.push({ source_user_id: account.source_user_id, ...result.data });
        } catch (err: any) {
          results.push({ source_user_id: account.source_user_id, status: "error", error: err.message });
        }
      }

      res.status(200).json({ results });
    } catch (err: any) {
      console.error("[Provision] Batch error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/v1/accounts/status", requireProvisionKey, async (req, res) => {
    try {
      const sourceUserId = parseInt(req.query.source_user_id as string);
      if (isNaN(sourceUserId)) {
        return res.status(422).json({ error: "source_user_id query parameter is required and must be a number" });
      }

      const existing = await storage.getProvisionedAccountBySourceUser("gearswap", sourceUserId);
      if (existing) {
        res.json({ exists: true, bmv_user_id: existing.userId });
      } else {
        res.json({ exists: false });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/v1/stats", requireApiKey, async (req, res) => {
    try {
      const summary = await storage.getStatsSummary();
      res.json({ data: summary });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/stats - overall stats. One round-trip with three SQL
  // aggregates against the small `cars` table; no longer scans the
  // 5.97M-row `parts` table on the homepage critical path. Total
  // parts is `SUM(cars.total_parts)` which the scraper writes per
  // car at sync time. See storage.getStatsSummary for the rationale.
  app.get("/api/stats", async (req, res) => {
    try {
      res.set("Cache-Control", "public, max-age=30, s-maxage=60");
      const summary = await storage.getStatsSummary();
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/series", async (req, res) => {
    try {
      const allCars = await storage.getCars();
      const seriesMap = new Map<string, { slug: string; name: string; count: number; totalParts: number; chassisCodes: Set<string> }>();

      for (const car of allCars) {
        const seriesName = car.series || "Other";
        const slug = seriesName.toLowerCase().replace(/\s+/g, "-");
        if (!seriesMap.has(slug)) {
          seriesMap.set(slug, { slug, name: seriesName, count: 0, totalParts: 0, chassisCodes: new Set() });
        }
        const entry = seriesMap.get(slug)!;
        entry.count++;
        entry.totalParts += car.totalParts ?? 0;
        if (car.chassis) entry.chassisCodes.add(car.chassis);
      }

      const result = Array.from(seriesMap.values())
        .map(s => ({ slug: s.slug, name: s.name, count: s.count, totalParts: s.totalParts, chassisCount: s.chassisCodes.size }))
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/series/:slug", async (req, res) => {
    try {
      const slug = (req.params["slug"] as string).toLowerCase();
      const allCars = await storage.getCars();

      const matchingCars = allCars.filter(car => {
        const carSlug = (car.series || "Other").toLowerCase().replace(/\s+/g, "-");
        return carSlug === slug;
      });

      if (matchingCars.length === 0) {
        return res.status(404).json({ error: "Series not found" });
      }

      const seriesName = matchingCars[0].series || "Other";
      const chassisCodes = Array.from(new Set(matchingCars.map(c => c.chassis).filter(Boolean))).sort();
      const totalParts = matchingCars.reduce((sum, c) => sum + (c.totalParts ?? 0), 0);

      const yearStart = Math.min(...matchingCars.map(c => c.yearStart ?? 9999).filter(y => y !== 9999));
      const yearEnd = Math.max(...matchingCars.map(c => c.yearEnd ?? 0).filter(y => y !== 0));

      res.json({
        slug,
        name: seriesName,
        totalCars: matchingCars.length,
        totalParts,
        chassisCodes,
        yearStart: yearStart === 9999 ? null : yearStart,
        yearEnd: yearEnd === 0 ? null : yearEnd,
        cars: matchingCars.sort((a, b) => {
          const ca = a.chassis || "";
          const cb = b.chassis || "";
          if (ca !== cb) return ca.localeCompare(cb);
          return (a.displayName || "").localeCompare(b.displayName || "");
        }),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const aiClient = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  app.post("/api/parts/identify", requireAuth, express.json({ limit: "50mb" }), async (req, res) => {
    try {
      const { image, images, make, model } = req.body;
      const imageList: string[] = images && Array.isArray(images) ? images : image ? [image] : [];
      if (imageList.length === 0) {
        return res.status(400).json({ error: "At least one image is required" });
      }
      if (imageList.length > 5) {
        return res.status(400).json({ error: "Maximum 5 images allowed" });
      }

      const imageContent = imageList.map((img: string) => ({
        type: "image_url" as const,
        image_url: { url: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}` },
      }));

      let prompt = `You are a BMW automotive parts identification expert. Analyze ${imageList.length > 1 ? "these images" : "this image"} and identify any BMW car parts visible.

For each part you can identify, provide:
1. The likely part name/description (use BMW's official part naming conventions)
2. Any part numbers visible in the image
3. Search keywords that would help find this part in a BMW parts catalog

Return your response as JSON with this exact structure:
{
  "parts": [
    {
      "name": "description of the part",
      "partNumbers": ["any visible part numbers"],
      "searchTerms": ["keyword1", "keyword2", "keyword3"],
      "confidence": "high" | "medium" | "low"
    }
  ],
  "vehicleGuess": "if you can identify the BMW model from the image, state it here, otherwise null"
}

Be specific with BMW terminology. For example use "kidney grille" not just "grille", "angel eyes" not just "headlights", etc.${imageList.length > 1 ? "\n\nMultiple images have been provided. They may show the same part from different angles, or different parts. Identify all unique parts across all images." : ""}`;

      if (make || model) {
        prompt += `\n\nThe user has specified this is for a ${make || "BMW"} ${model || ""}. Use this context to be more specific with part identification and narrow down generation-specific part names.`;
      }

      const completion = await aiClient.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...imageContent,
            ],
          },
        ],
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
      });

      const aiResponse = completion.choices[0]?.message?.content || "{}";
      let parsed: any;
      try {
        parsed = JSON.parse(aiResponse);
      } catch {
        parsed = { parts: [], vehicleGuess: null };
      }

      const identifiedParts = parsed.parts || [];
      const vehicleGuess = parsed.vehicleGuess || null;

      const allResults: any[] = [];
      const seenIds = new Set<number>();
      const searchedTerms: string[] = [];

      for (const part of identifiedParts) {
        let partHasResults = false;

        if (part.partNumbers?.length) {
          for (const pn of part.partNumbers) {
            const clean = pn.replace(/[\s\-]/g, "");
            if (clean.length >= 5) {
              searchedTerms.push(pn);
              const results = await storage.searchParts(clean);
              for (const r of results) {
                if (!seenIds.has(r.id)) {
                  seenIds.add(r.id);
                  allResults.push({ ...r, matchedBy: "partNumber", aiPartName: part.name, confidence: part.confidence });
                  partHasResults = true;
                }
              }
            }
          }
        }

        if (!partHasResults && part.searchTerms?.length) {
          for (const term of part.searchTerms.slice(0, 3)) {
            if (term.length >= 2) {
              searchedTerms.push(term);
              const results = await storage.searchParts(term);
              for (const r of results) {
                if (!seenIds.has(r.id)) {
                  seenIds.add(r.id);
                  allResults.push({ ...r, matchedBy: "description", aiPartName: part.name, confidence: part.confidence });
                }
              }
            }
          }
        }
      }

      res.json({
        identified: identifiedParts,
        vehicleGuess,
        results: allResults.slice(0, 50),
        searchedTerms,
        totalFound: allResults.length,
        needsMoreContext: allResults.length === 0 && identifiedParts.length > 0,
      });
    } catch (err: any) {
      console.error("Part identification error:", err);
      res.status(500).json({ error: err.message || "Failed to identify parts" });
    }
  });

  type VinDecodeStatus =
    | "matched"
    | "enriching"
    | "no_chassis_carried"
    | "valid_but_unknown"
    | "invalid_vin"
    | "not_bmw"
    | "chassis_resolved_no_local_parts";  // RealOEM resolved chassis but we still don't carry parts for it

  interface MatchTrace {
    stages: { stage: string; key: string | null; candidates: number }[];
    selectedStage: string | null;
  }

  function buildEmptyTrace(): MatchTrace {
    return { stages: [], selectedStage: null };
  }

  // Tier 2 fallback: synthesize a "matched car" from external_catalog_parts
  // when the decoder produced a chassis but the local cars table has zero
  // rows for it. Returns null if no external parts exist for the chassis.
  async function findExternalCatalogMatch(chassis: string, modelYear: number | null): Promise<any | null> {
    if (!chassis) return null;
    const candidates = lciVariants(chassis, modelYear);
    for (const cand of candidates) {
      const rows = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(externalCatalogPartsTable)
        .where(eq(externalCatalogPartsTable.modelSeries, cand));
      const count = Number(rows[0]?.count || 0);
      if (count > 0) {
        const negativeId = -Math.abs(
          cand.split("").reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 17),
        );
        return {
          id: negativeId,
          chassis: cand,
          generation: cand,
          modelName: `${cand} (RealOEM fallback catalog)`,
          engine: null,
          bodyType: null,
          slug: `external-${cand.toLowerCase()}`,
          typeCode: null,
          totalParts: count,
          categories: [{ id: -1, name: "RealOEM Fallback Catalog" }],
          isExternalCatalog: true,
          source: "realoem_fallback",
        };
      }
    }
    return null;
  }

  function carToMatchedShape(car: any, categories: any[] = []) {
    return {
      id: car.id,
      chassis: car.chassis,
      generation: car.generation,
      modelName: car.displayName,
      engine: car.engine,
      bodyType: car.bodyType,
      slug: car.slug,
      typeCode: car.typeCode || null,
      totalParts: car.totalParts || 0,
      categories: categories.map(c => ({ id: c.id, name: c.name })),
    };
  }

  function cleanKey(s: string | null | undefined): string {
    return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  async function attachCategoriesToMatches(matches: any[]): Promise<any[]> {
    const out: any[] = [];
    for (const m of matches) {
      const cats = await storage.getCategoriesByCarId(m.id);
      out.push({ ...m, categories: cats.map(c => ({ id: c.id, name: c.name })) });
    }
    return out;
  }

  async function runMatchPipeline(
    allCars: any[],
    keys: { enrichmentCodeType: string | null; decodedTypeCode: string | null; chassis: string | null; generation: string | null; engine: string | null; modelYear?: number | null },
    trace: MatchTrace,
  ): Promise<any[]> {
    const tcEnrich = cleanKey(keys.enrichmentCodeType);
    const tcDecoded = cleanKey(keys.decodedTypeCode);
    const chassisKey = cleanKey(keys.chassis);
    const genKey = cleanKey(keys.generation);
    const engineKey = cleanKey(keys.engine);
    const modelYear = keys.modelYear ?? null;

    if (tcEnrich) {
      const m = allCars.filter(c => cleanKey(c.typeCode) === tcEnrich);
      trace.stages.push({ stage: "enrichment_typecode", key: tcEnrich, candidates: m.length });
      if (m.length > 0) {
        trace.selectedStage = "enrichment_typecode";
        return await attachCategoriesToMatches(m.map(c => carToMatchedShape(c)));
      }
    }

    if (tcDecoded && tcDecoded !== tcEnrich) {
      const m = allCars.filter(c => cleanKey(c.typeCode) === tcDecoded);
      trace.stages.push({ stage: "decoded_typecode", key: tcDecoded, candidates: m.length });
      if (m.length > 0) {
        trace.selectedStage = "decoded_typecode";
        return await attachCategoriesToMatches(m.map(c => carToMatchedShape(c)));
      }
    }

    if (chassisKey) {
      // LCI-aware chassis matching: try the year-correct catalog identifier
      // first (E60N for 2008+, E60 for 2003-2007), then fall back to the
      // sibling. Catalog identifiers without an LCI split are returned as-is.
      // After LCI variants, append any catalog-side aliases registered for
      // this chassis (rename / legacy-identifier cases).
      const lci = lciVariants(chassisKey, modelYear);
      const aliases = getCatalogAliases(chassisKey).filter(a => !lci.includes(a));
      const candidates = [...lci, ...aliases];
      for (const cand of candidates) {
        const m = allCars.filter(c => cleanKey(c.chassis) === cand);
        const stageName = cand === chassisKey ? "chassis" : "chassis_lci_fallback";
        trace.stages.push({ stage: stageName, key: cand, candidates: m.length });
        if (m.length > 0) {
          trace.selectedStage = stageName;
          const ranked = rankBySpecificity(m, engineKey);
          return await attachCategoriesToMatches(ranked.map(c => carToMatchedShape(c)));
        }
      }
    }

    if (genKey && genKey !== chassisKey) {
      const candidates = lciVariants(genKey, modelYear);
      for (const cand of candidates) {
        const m = allCars.filter(c => cleanKey(c.generation) === cand);
        const stageName = cand === genKey ? "generation" : "generation_lci_fallback";
        trace.stages.push({ stage: stageName, key: cand, candidates: m.length });
        if (m.length > 0) {
          trace.selectedStage = stageName;
          const ranked = rankBySpecificity(m, engineKey);
          return await attachCategoriesToMatches(ranked.map(c => carToMatchedShape(c)));
        }
      }
    }

    // Engine-only matching is intentionally NOT a fallback for matchedCars:
    // an F45 218d (UKL FWD platform) shares its B47 engine with F22/F30/G20
    // RWD cars but no body, chassis, suspension, electrical, or interior
    // parts. Returning those as "matches" misled users. If chassis/typecode/
    // generation all miss we return [] so the outer logic can flag the VIN
    // as no_chassis_carried and surface chassis-prefix siblings instead.
    if (engineKey) {
      const m = allCars.filter(c => cleanKey(c.engine) === engineKey);
      trace.stages.push({ stage: "engine_skipped", key: engineKey, candidates: m.length });
    }

    return [];
  }

  function rankBySpecificity(cars: any[], engineKey: string): any[] {
    if (!engineKey) return cars;
    return [...cars].sort((a, b) => {
      const aMatch = cleanKey(a.engine) === engineKey ? 1 : 0;
      const bMatch = cleanKey(b.engine) === engineKey ? 1 : 0;
      return bMatch - aMatch;
    });
  }

  async function findSiblingCars(allCars: any[], chassis: string): Promise<any[]> {
    if (!chassis) return [];
    const prefix = chassis.charAt(0).toUpperCase();
    const numMatch = chassis.match(/\d+/);
    const num = numMatch ? parseInt(numMatch[0], 10) : null;

    const candidates = allCars
      .filter(c => c.chassis && c.chassis.charAt(0).toUpperCase() === prefix)
      .map(c => {
        const cnumMatch = (c.chassis || "").match(/\d+/);
        const cnum = cnumMatch ? parseInt(cnumMatch[0], 10) : null;
        const distance = num !== null && cnum !== null ? Math.abs(num - cnum) : 999;
        return { car: c, distance };
      })
      .sort((a, b) => a.distance - b.distance);

    const seenChassis = new Set<string>();
    const top: any[] = [];
    for (const { car } of candidates) {
      if (seenChassis.has(car.chassis)) continue;
      seenChassis.add(car.chassis);
      top.push(carToMatchedShape(car));
      if (top.length >= 6) break;
    }
    return top;
  }

  async function handleVinDecode(vinInput: string, callerId: string = "anon") {
    const decoded = await decodeVin(vinInput);

    const allCars = await storage.getCars();
    const trace = buildEmptyTrace();

    let matchedCars = await runMatchPipeline(allCars, {
      enrichmentCodeType: null,
      decodedTypeCode: decoded.typeCode,
      chassis: decoded.chassis,
      generation: decoded.generation,
      engine: decoded.engine,
      modelYear: decoded.modelYear ?? null,
    }, trace);

    let enriched: any = { available: false };
    let cacheSource: string | null = null;

    if (decoded.isValid && decoded.isBmw && decoded.vin.length === 17) {
      const cached = await storage.getVinCache(decoded.vin);
      if (cached && cached.enrichedData) {
        let cachedData = await ensureLocalImagesExist(decoded.vin, cached.enrichedData);
        if (cachedData.vehicle && !cachedData.available) {
          const v = cachedData.vehicle;
          cachedData = {
            available: true,
            modelName: v.modelName,
            code: v.codeType || null,
            chassis: v.chassis,
            market: v.market,
            engine: v.engine,
            drivetrain: v.drivetrain,
            transmission: v.transmission,
            color: v.color,
            colorCode: v.colorCode || null,
            upholstery: v.upholstery,
            upholsteryCode: v.upholsteryCode || null,
            productionDate: v.startOfProduction,
            options: (cachedData.options || []).map((o: any) => ({
              code: o.code,
              name: o.nameEn || o.name,
              nameDE: o.nameDe || o.nameDE,
              imageUrl: o.imageUrl,
            })),
            images: cachedData.images ? {
              exterior: cachedData.images.exteriorUrl ? [cachedData.images.exteriorUrl] : (cachedData.images.exterior || []),
              interior: cachedData.images.interiorUrl ? [cachedData.images.interiorUrl] : (cachedData.images.interior || []),
              "360": cachedData.images.exterior360Urls || cachedData.images["360"] || [],
            } : null,
          };
        }
        enriched = cachedData;
        cacheSource = "cache";
        console.log(`[VIN Cache] Hit for ${decoded.vin}`);
      }
      // No live external enrichment on the decode path. The frontend's
      // GET /api/vin/bimmerwork/:vin handles bimmer.work / mdecoder /
      // vindecoderz asynchronously, with its own cache + queue.
    }

    const prodDateStr = enriched.productionDate
      || enriched.vehicle?.startOfProduction
      || null;
    if (prodDateStr) {
      const prodYearMatch = prodDateStr.match(/(\d{4})/);
      if (prodYearMatch) {
        const prodYear = parseInt(prodYearMatch[1], 10);
        const currentYear = new Date().getFullYear();
        if (prodYear >= 1980 && prodYear <= currentYear + 2) {
          // Sanity guard: a prodYear before 2005 combined with an F- or G-series
          // chassis is physically impossible. This pattern means a stale cache row
          // with a NHTSA-corrupted year (e.g. "0"→2000) is being re-applied on
          // top of a freshly-correct decode. Skip the override so the corrected
          // year from the fixed chassis-range table wins.
          const chassisStr = decoded.chassis ?? "";
          const isStaleEuYear =
            prodYear < 2005 &&
            (chassisStr.startsWith("F") || chassisStr.startsWith("G"));
          if (!isStaleEuYear && (!decoded.modelYear || prodYear !== decoded.modelYear)) {
            const previousModelYear = decoded.modelYear;
            decoded.modelYear = prodYear;
            // Persist the corrected year back to the vin_cache row so future
            // requests load the correct value without re-running enrichment.
            // Fire-and-forget — do not block the response.
            if (!isStaleEuYear && decoded.isValid && decoded.vin && previousModelYear !== prodYear) {
              db.execute(sql`
                UPDATE vin_cache
                SET
                  decoded_data = jsonb_set(
                    COALESCE(decoded_data, '{}'::jsonb),
                    '{modelYear}',
                    ${prodYear}::int::text::jsonb
                  ),
                  updated_at = NOW()
                WHERE vin = ${decoded.vin}
                  AND (
                    decoded_data IS NULL
                    OR (decoded_data->>'modelYear')::int IS DISTINCT FROM ${prodYear}
                  )
              `).catch((err: any) =>
                console.warn(`[VIN Cache] Failed to persist corrected modelYear for ${decoded.vin}:`, err.message)
              );
            }
          }
        }
      }
    }

    const enrichmentCodeType = enriched?.code || enriched?.vehicle?.codeType || null;
    const enrichmentChassis = enriched?.chassis || enriched?.vehicle?.chassis || null;

    if (enriched.available && (enrichmentCodeType || enrichmentChassis)) {
      const rematched = await runMatchPipeline(allCars, {
        enrichmentCodeType,
        decodedTypeCode: decoded.typeCode,
        chassis: enrichmentChassis || decoded.chassis,
        generation: decoded.generation,
        engine: decoded.engine,
        modelYear: decoded.modelYear ?? null,
      }, trace);
      if (rematched.length > 0) {
        matchedCars = rematched;
      }
    }

    let decodeStatus: VinDecodeStatus;
    let siblings: any[] = [];
    let knownChassis: string | null = decoded.chassis || enrichmentChassis;
    let realoemFallback: { attempted: boolean; status: string; chassis: string | null; fromCache: boolean } | null = null;

    // Tier 1 RealOEM fallback: if local pipeline + cached enrichment couldn't
    // produce parts AND the VIN is a real-shape BMW, ask realoem for the
    // chassis. Cached forever per last-7, so this fires at most ONCE per VIN
    // family. Then re-run the match pipeline with the realoem-resolved chassis.
    const localExhausted = matchedCars.length === 0;
    const isRealLookingBmwVin = decoded.vin && decoded.vin.length === 17 && decoded.isBmw;
    if (localExhausted && isRealLookingBmwVin) {
      // Per-IP rate limit on the network fallback to prevent budget drain
      // from anonymous traffic. callerId is threaded in by the route handler.
      const rl = checkFallbackRateLimit(callerId);
      if (!rl.allowed) {
        realoemFallback = { attempted: false, status: "rate_limited", chassis: null, fromCache: false };
      } else {
      const resolution = await resolveChassisViaRealoem(decoded.vin);
      realoemFallback = {
        attempted: true,
        status: resolution.status,
        chassis: resolution.chassis,
        fromCache: resolution.fromCache,
      };
      if (resolution.status === "confirmed" && resolution.chassis && resolution.chassis !== knownChassis) {
        const realoemMatched = await runMatchPipeline(allCars, {
          enrichmentCodeType: enrichmentCodeType,
          decodedTypeCode: decoded.typeCode,
          chassis: resolution.chassis,
          generation: decoded.generation,
          engine: decoded.engine,
          modelYear: decoded.modelYear ?? null,
        }, trace);
        if (realoemMatched.length > 0) {
          matchedCars = realoemMatched;
          // Tag the most recent stage so the UI/trace shows realoem assisted.
          const last = trace.stages[trace.stages.length - 1];
          if (last) last.stage = `${last.stage}_via_realoem`;
          trace.selectedStage = `chassis_realoem_fallback`;
        }
        // Update knownChassis so downstream branches surface the better answer.
        knownChassis = resolution.chassis;
      }
      } // end rate-limit allowed branch
    }

    // Tier 2 fallback: chassis is known (from decoder OR RealOEM) but local
    // cars table has zero rows. Check external_catalog_parts populated by
    // realoem-chassis-scraper. If we have parts there, surface them as a
    // synthetic matched car so /api/vin/decode reports a real success.
    if (matchedCars.length === 0 && knownChassis) {
      const ext = await findExternalCatalogMatch(knownChassis, decoded.modelYear ?? null);
      if (ext) {
        matchedCars = [ext];
        trace.stages.push({ stage: "external_catalog_fallback", key: ext.chassis, candidates: ext.totalParts });
        trace.selectedStage = "external_catalog_fallback";
      }
    }

    if (matchedCars.length > 0) {
      decodeStatus = "matched";
    } else if (decoded.vin && decoded.vin.length === 17 && !decoded.isBmw) {
      decodeStatus = "not_bmw";
    } else if (decoded.vin && decoded.vin.length === 17 && !decoded.isValid && !enriched.available && !realoemFallback?.chassis) {
      decodeStatus = "invalid_vin";
    } else if (realoemFallback?.status === "confirmed" && realoemFallback.chassis) {
      // RealOEM gave us a chassis but our catalog still has 0 parts for it.
      // This is the "true upstream gap" case (G70, G09, etc.) — Tier 2 backfill needed.
      decodeStatus = "chassis_resolved_no_local_parts";
      siblings = await findSiblingCars(allCars, realoemFallback.chassis);
    } else if (knownChassis) {
      decodeStatus = "no_chassis_carried";
      siblings = await findSiblingCars(allCars, knownChassis);
    } else if (decoded.isBmw && !enriched.available && decoded.vin && decoded.vin.length === 17) {
      const queueState = getVinQueueStatus(decoded.vin);
      if (queueState.status !== "not_found") {
        queueVinForBatch(decoded.vin);
        decodeStatus = "enriching";
      } else {
        decodeStatus = "valid_but_unknown";
      }
    } else {
      decodeStatus = "valid_but_unknown";
    }

    // Persist a structural-decode-only row for any successful BMW VIN with a
    // known chassis whose enrichment hasn't landed yet. This makes the public
    // /api/vin/decode endpoints organically grow vin_cache (and therefore the
    // sitemap-vins-N.xml shards) instead of only writing when third-party
    // enrichment succeeds. We use an atomic raw INSERT ... ON CONFLICT (vin)
    // DO NOTHING — never an UPDATE — so a concurrent enricher writing a
    // richer row between our existence check and our write can never get
    // stomped by this thin decode-only payload.
    if (
      decoded.vin &&
      decoded.vin.length === 17 &&
      decoded.isBmw &&
      (knownChassis || decoded.chassis) &&
      !enriched.available
    ) {
      try {
        const cleanVin = decoded.vin.toUpperCase();
        const decodedPayload = {
          chassis: knownChassis ?? decoded.chassis ?? null,
          series: decoded.series ?? null,
          modelYear: decoded.modelYear ?? null,
          modelName: decoded.modelName ?? null,
          engine: decoded.engine ?? null,
          isBmw: true,
          plant: decoded.plant
            ? { city: decoded.plant.city ?? null, country: decoded.plant.country ?? null }
            : null,
          source: "decode_endpoint",
          decodedAt: new Date().toISOString(),
          typeCode: decoded.typeCode ?? null,
          typeCodeSource: decoded.typeCodeSource ?? null,
        };
        const catalogPayload = matchedCars.length > 0 ? matchedCars : null;
        await db.execute(sql`
          INSERT INTO vin_cache (vin, source, enriched_data, catalog_matches, decoded_data, enrichment_source, created_at, updated_at)
          VALUES (
            ${cleanVin},
            'decode_endpoint',
            NULL,
            ${catalogPayload ? JSON.stringify(catalogPayload) : null}::jsonb,
            ${JSON.stringify(decodedPayload)}::jsonb,
            NULL,
            NOW(),
            NOW()
          )
          ON CONFLICT (vin) DO UPDATE
            SET decoded_data = EXCLUDED.decoded_data,
                updated_at   = EXCLUDED.updated_at
        `);
      } catch (err: any) {
        console.error(`[VIN Cache] decode-endpoint insert failed for ${decoded.vin}: ${err?.message ?? err}`);
      }
    }

    return {
      decoded,
      matchedCars,
      totalCatalogMatches: matchedCars.length,
      enriched,
      decodeStatus,
      siblings,
      knownChassis,
      matchTrace: trace,
      realoemFallback,
    };
  }

  // Admin: RealOEM cache visibility + manual controls
  app.get("/api/admin/realoem/budget", requireAdmin, (_req, res) => {
    res.json(getRealoemBudgetStatus());
  });

  app.get("/api/admin/realoem/cache", requireAdmin, async (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
    const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
    const rows = await getRealoemCachePage(limit, offset);
    res.json({ rows, limit, offset });
  });

  app.post("/api/admin/realoem/refresh-vin/:vin", requireAdmin, async (req, res) => {
    try {
      const result = await refreshRealoemVin((req.params["vin"] as string));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----- Tier 2: chassis-level scrape (admin-triggered, child process) -----
  app.post("/api/admin/realoem/scrape-chassis/:chassis", requireAdmin, async (req, res) => {
    try {
      const chassis = String((req.params["chassis"] as string) || "").trim().toUpperCase();
      if (!/^[EFGI]\d{2,3}N?$/.test(chassis)) {
        return res.status(400).json({ error: `Invalid chassis code: ${chassis}` });
      }
      const partType = typeof req.body?.partType === "string" ? req.body.partType : null;
      const maxPages = Math.min(parseInt(String(req.body?.maxPages ?? "50"), 10) || 50, 200);

      // Preflight: refuse if Oxylabs creds are missing — otherwise the spawned
      // child exits early and the job row sits in `pending` forever.
      if (!process.env.OXYLABS_USERNAME || !process.env.OXYLABS_PASSWORD) {
        return res.status(503).json({ error: "Oxylabs credentials not configured; cannot scrape." });
      }
      // Refuse if a job for this chassis is already running/pending.
      const existing = await getLatestScrapeJob(chassis);
      if (existing && (existing.status === "pending" || existing.status === "running")) {
        return res.status(409).json({ error: `A scrape job for ${chassis} is already ${existing.status}`, job: existing });
      }

      const job = await createScrapeJob(chassis, partType);
      const child = spawn("node", [
        "scripts/realoem-chassis-scraper.mjs",
        "--job-id", String(job.id),
        "--chassis", chassis,
        ...(partType ? ["--part-type", partType] : []),
        "--max-pages", String(maxPages),
      ], { detached: true, stdio: "ignore", env: process.env });
      child.unref();

      res.status(202).json({ job, maxPages });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/realoem/scrape-status/:chassis", requireAdmin, async (req, res) => {
    const job = await getLatestScrapeJob((req.params["chassis"] as string));
    if (!job) return res.status(404).json({ error: "No scrape job for this chassis" });
    res.json(job);
  });

  app.get("/api/admin/realoem/scrape-jobs", requireAdmin, async (_req, res) => {
    res.json(await listScrapeJobs(50));
  });

  app.get("/api/admin/cars/type-code-report", requireAdmin, async (_req, res) => {
    try {
      const report = await runTypeCodeBackfill({ apply: false, onlyNull: true });
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/cars/type-code-backfill", requireAdmin, async (_req, res) => {
    try {
      const report = await runTypeCodeBackfill({ apply: true, onlyNull: true });
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/bmw-models", async (req, res) => {
    try {
      const chassis = req.query.chassis as string | undefined;
      const search = req.query.q as string | undefined;
      if (search) {
        const models = await storage.searchBmwModels(search);
        return res.json(models);
      }
      const models = await storage.getBmwModels(chassis);
      res.json(models);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/bmw-models/stats", async (_req, res) => {
    try {
      const count = await storage.countBmwModels();
      const progress = getModelScrapeProgress();
      const chassisCodes = await storage.getBmwModelChassisCodes();
      res.json({ totalModels: count, scrapeProgress: progress, chassisCodes });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/bmw-models/:chassis/:typeCode", async (req, res) => {
    try {
      const model = await storage.getBmwModelByTypeCode((req.params["chassis"] as string), (req.params["typeCode"] as string));
      if (!model) return res.status(404).json({ error: "Model not found" });
      res.json(model);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/bmw-models/scrape", requireAdmin, async (_req, res) => {
    try {
      const progress = getModelScrapeProgress();
      if (progress.status === "scraping") {
        return res.json({ message: "Scrape already in progress", progress });
      }
      startModelScrape().catch(e => console.error("Model scrape background error:", e));
      res.json({ message: "Model scrape started", progress: getModelScrapeProgress() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/bmw-models/scrape", requireAdmin, async (_req, res) => {
    cancelModelScrape();
    res.json({ message: "Scrape cancelled" });
  });

  app.post("/api/bmw-models/import-legacy", requireAdmin, async (req, res) => {
    try {
      const overwriteExisting = req.body?.overwriteExisting === true;
      const result = await importLegacyBmwModels({ overwriteExisting });
      res.json({ message: "Legacy BMW models imported", ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // NOTE: /api/admin/bmw-models/import-bulk was removed after the
  // one-time prod sync (see CHANGELOG.md). The bmw_models table is now
  // seeded automatically on startup from data/bmw-models-seed.json via
  // server/bmw-models-seed.ts (idempotent, fire-and-forget). To re-sync
  // a fresh database, regenerate the seed file from the canonical source
  // and redeploy — no live HTTP endpoint is required.

  // Upload + import a BMW European ETK pricing zip (etkpr*.zip).
  // Body: JSON { filename: string, contentBase64: string, eurAudRate?: number }
  app.post(
    "/api/admin/etk-pricing/upload",
    requireAdmin,
    express.json({ limit: "100mb" }),
    async (req, res) => {
      try {
        const { filename, contentBase64, eurAudRate } = req.body || {};
        if (!filename || typeof filename !== "string") {
          return res.status(400).json({ error: "filename required" });
        }
        if (!contentBase64 || typeof contentBase64 !== "string") {
          return res.status(400).json({ error: "contentBase64 required" });
        }
        if (!/\.zip$/i.test(filename)) {
          return res.status(400).json({ error: "filename must end with .zip" });
        }
        const buf = Buffer.from(contentBase64, "base64");
        if (buf.length === 0) {
          return res.status(400).json({ error: "Empty zip content" });
        }
        const { importEtkPriceZip } = await import("./etk-pricing-import");
        const result = await importEtkPriceZip(buf, filename, {
          eurAudRate: typeof eurAudRate === "number" && eurAudRate > 0 ? eurAudRate : undefined,
        });
        res.json({ message: "ETK pricing import complete", ...result });
      } catch (err: any) {
        console.error("[ETK Pricing] Upload failed:", err);
        res.status(500).json({ error: err.message || "Import failed" });
      }
    }
  );

  async function matchCarsFromEnrichment(enrichData: any): Promise<any[]> {
    if (!enrichData?.vehicle) return [];
    const v = enrichData.vehicle;
    const allCars = await storage.getCars();

    const trace = buildEmptyTrace();
    const matched = await runMatchPipeline(allCars, {
      enrichmentCodeType: v.codeType || null,
      decodedTypeCode: null,
      chassis: v.chassis || v.modelCode || null,
      generation: null,
      engine: v.engine || null,
    }, trace);

    if (matched.length > 0) return matched;

    const modelName = v.modelName || v.model || null;
    if (modelName) {
      // Tightened fuzzy fallback: require the BMW model token (e.g. "m3",
      // "335i", "x5") to match exactly. Loose substring matching caused
      // cross-series jumps like M3 → M340i (because the literal "m3" is a
      // substring of "m340i" once whitespace is collapsed).
      const sourceToken = extractBmwModelToken(modelName);
      const sourceSeries = v.series ? String(v.series).toLowerCase().trim() : null;
      if (sourceToken) {
        const fuzzy: any[] = [];
        for (const car of allCars) {
          const carName = car.displayName || car.modelName || "";
          const carToken = extractBmwModelToken(carName);
          if (!carToken || carToken !== sourceToken) continue;
          // Optional series guardrail: when both sides know their series,
          // it must agree (prevents 325i sedan → 325Ci coupe across cats).
          if (sourceSeries && car.series) {
            const carSeries = String(car.series).toLowerCase().trim();
            if (carSeries && carSeries !== sourceSeries) continue;
          }
          fuzzy.push(car);
        }
        trace.stages.push({ stage: "fuzzy_model_token", key: sourceToken, candidates: fuzzy.length });
        if (fuzzy.length > 0) {
          return await attachCategoriesToMatches(fuzzy.map(c => carToMatchedShape(c)));
        }
      } else {
        trace.stages.push({ stage: "fuzzy_model_token", key: modelName, candidates: 0 });
      }
    }

    return [];
  }

  // Extract the leading BMW model token from a free-form model name.
  // Examples: "M3 Competition Sedan" → "m3", "335i xDrive" → "335i",
  // "X5 M50i" → "x5", "i4 M50" → "i4". Returns null if no recognizable
  // token is present (avoids matching arbitrary descriptive words).
  function extractBmwModelToken(name: string): string | null {
    if (!name) return null;
    const trimmed = name.trim();
    // Patterns: M3/M5/M340i/M850i, 335i/535d/750Li, X5/X7/X3M, i4/i7/iX,
    // Z4, 218d, 228iX. Allow optional drive suffix (i, d, e, iX, Li, Ci, etc.).
    const m = trimmed.match(/^(M\d+[A-Za-z]*|X\d+[A-Za-z]*|Z\d+[A-Za-z]*|i[A-Z0-9]+|\d{3,4}[A-Za-z]{0,3})/);
    return m ? m[1].toLowerCase() : null;
  }

  app.get("/api/vin/debug/:vin", requireAdmin, async (req, res) => {
    try {
      const vin = (req.params["vin"] as string).toUpperCase().replace(/[\s\-]/g, "");
      if (vin.length !== 17 && vin.length !== 7) {
        return res.status(400).json({ error: "VIN must be 17 chars or 7 chars" });
      }

      const decoded = await decodeVin(vin);
      const allCars = await storage.getCars();
      const trace = buildEmptyTrace();

      let cached: any = null;
      let enrichedRaw: any = null;
      let enrichmentSource: any = null;
      let coverage: any = null;
      if (vin.length === 17) {
        cached = await storage.getVinCache(vin);
        enrichedRaw = cached?.enrichedData || null;
        enrichmentSource = (cached as any)?.enrichmentSource || null;
        // Fresh first-party-only run so admins see the live coverage
        // block (whether ETK-covered, what FA pieces are missing, and
        // which import paths can close those gaps).
        try {
          const fresh = await enrichVin(vin, { allowThirdParty: false });
          coverage = fresh?.coverage || null;
        } catch { /* coverage is best-effort */ }
      }

      const enrichmentCodeType = enrichedRaw?.code || enrichedRaw?.vehicle?.codeType || null;
      const enrichmentChassis = enrichedRaw?.chassis || enrichedRaw?.vehicle?.chassis || null;

      const matchedCars = await runMatchPipeline(allCars, {
        enrichmentCodeType,
        decodedTypeCode: decoded.typeCode,
        chassis: enrichmentChassis || decoded.chassis,
        generation: decoded.generation,
        engine: decoded.engine,
        modelYear: decoded.modelYear ?? null,
      }, trace);

      const knownChassis = decoded.chassis || enrichmentChassis;
      const siblings = knownChassis ? await findSiblingCars(allCars, knownChassis) : [];

      const queueState = vin.length === 17 ? getVinQueueStatus(vin) : null;

      res.json({
        vin,
        decoded,
        enrichmentRaw: enrichedRaw,
        enrichmentSource,
        coverage,
        cacheSource: cached?.source || null,
        cacheCatalogMatches: cached?.catalogMatches || null,
        matchKeys: {
          enrichmentCodeType,
          decodedTypeCode: decoded.typeCode,
          chassis: enrichmentChassis || decoded.chassis,
          generation: decoded.generation,
          engine: decoded.engine,
        },
        matchTrace: trace,
        matchedCars,
        siblings,
        queueState,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin-only on-demand NHTSA lookup. NHTSA is no longer in the hot decode
  // path; this endpoint lets ops query it manually for any VIN for debugging.
  app.get("/api/vin/nhtsa/:vin", requireAdmin, async (req, res) => {
    try {
      const vin = (req.params["vin"] as string).toUpperCase().replace(/[\s\-]/g, "");
      if (vin.length !== 17) {
        return res.status(400).json({ error: "VIN must be 17 characters" });
      }
      const data = await fetchNhtsaData(vin);
      if (!data) {
        return res.status(502).json({ error: "NHTSA returned no data or request timed out" });
      }
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/vin/bimmerwork/:vin", async (req, res) => {
    try {
      const vin = req.params["vin"] as string;
      const hash = req.query.hash as string | undefined;
      if (!vin) {
        return res.status(400).json({ error: "VIN parameter required" });
      }
      const cleaned = vin.toUpperCase().replace(/[\s\-]/g, "");
      if (cleaned.length !== 17) {
        return res.status(400).json({ error: "Full 17-character VIN required for bimmer.work lookup" });
      }

      // Admin-only escape hatch — evaluated FIRST so a `?force=thirdparty`
      // call truly bypasses cache and reaches the orchestrator (Task #83
      // review v2). Silently ignored for non-admin sessions so the public
      // UI can never trigger a third-party call for an ETK VIN.
      const forceThirdParty = req.query.force === "thirdparty"
        && (req.session as any)?.user?.role === "admin";

      // Task #166: read stored bimmerwork_hash so cache-miss / stale-refresh
      // flows can skip the search-engine discovery phase entirely.
      let storedHash: string | null = null;

      if (!hash && !forceThirdParty) {
        const cached = await storage.getVinCache(cleaned);
        // Capture the stored hash for use below regardless of cache-hit outcome.
        // `bimmerworkHash` is part of the VinCache schema (Task #166) so no cast needed.
        storedHash = cached?.bimmerworkHash ?? null;
        if (cached && cached.enrichedData) {
          // Recompute coverage on cache-hit. Cached rows pre-Task-#83
          // were saved without the coverage block; the UI's OptionsTab
          // depends on it to render the honest "not in our dataset"
          // state for ETK-covered VINs with missing FA.
          const coverage = await computeCoverageForVin(cleaned);
          const cachedSource = (cached as any).enrichmentSource as EnrichmentSourceMap | null | undefined;
          // Sanitize stale third-party-populated options for VINs that
          // are now ETK-covered (Task #83 review v2). A VIN cached
          // before the gate landed could have options/vehicle sourced
          // from bimmerwork/mdecoder/vindecoderz; if the VIN is now
          // ETK-covered we must not serve that legacy third-party
          // payload. Drop the cache and re-enrich first-party-only.
          const sanitizeAndReEnrich = shouldSanitizeStaleCache(coverage, cachedSource);
          if (!sanitizeAndReEnrich) {
            const validatedData = await ensureLocalImagesExist(cleaned, cached.enrichedData);
            console.log(`[VIN Cache] Bimmerwork hit for ${cleaned}`);
            return res.json({
              found: true,
              data: validatedData,
              source: "cache",
              // Per-VIN per-tab provenance (Task #59). The frontend
              // VehicleTab/OptionsTab/ImagesTab/ManualsTab read this to
              // render a small "Source" badge so users (and admins via
              // /api/vin/debug) can see exactly which data source filled
              // each tab — first-party ETK, BMW configurator, BMW manuals
              // portal, or the bimmer.work fallback.
              enrichmentSource: cachedSource || null,
              coverage,
              catalogMatches: cached.catalogMatches || [],
            });
          }
          console.log(`[VIN Cache] Sanitizing stale third-party cache for ETK-covered VIN ${cleaned} — re-enriching first-party only`);
        }
      }

      // VinEnrichmentService (Task #59) — first-party sources first
      // (ETK + BMW configurator + BMW manuals), bimmer.work and other
      // third-party scrapers are now fallbacks only. The returned
      // `data` shape is byte-compatible with `BimmerWorkData` so the
      // existing UI tabs render unchanged. `enrichmentSource` carries
      // per-tab provenance and is persisted in `vin_cache.enrichment_source`.
      const enriched = await enrichVin(cleaned, {
        // Use explicitly-provided hash first, then the hash stored by the
        // bulk-discover job — avoids re-running search-engine discovery on
        // cache-miss / stale-refresh paths (Task #166).
        providedHash: hash || storedHash || undefined,
        allowThirdParty: true,
        _forceBypassEtkGate: forceThirdParty,
      });
      if (enriched) {
        const rewrittenData: BimmerWorkData = { ...enriched.data };
        try {
          const { images: dlImages, optionImageMap } = await downloadVinImages(
            cleaned,
            rewrittenData.images,
            rewrittenData.options?.map(o => ({ code: o.code, imageUrl: o.imageUrl }))
          );
          if (dlImages) rewrittenData.images = dlImages;
          if (rewrittenData.options && Object.keys(optionImageMap).length > 0) {
            rewrittenData.options = rewrittenData.options.map((o: any) => ({
              ...o,
              imageUrl: optionImageMap[o.code] || o.imageUrl,
            }));
          }
        } catch (imgErr: any) {
          console.error(`[VIN Images] Download failed for ${cleaned}: ${imgErr.message}`);
        }
        const catalogMatches = await matchCarsFromEnrichment(rewrittenData);

        // Pick the dominant tab source for the legacy `source` column —
        // we still persist full per-tab provenance in `enrichmentSource`.
        const dominant = enriched.enrichmentSource.vehicle?.source
          || enriched.enrichmentSource.options?.source
          || "bimmerwork";

        try {
          // Persist the resolved bimmer.work hash (if any) so future cache-miss
          // or stale-refresh paths skip search-engine discovery (Task #166).
          const resolvedHash = rewrittenData.hash || hash || storedHash || undefined;
          await storage.upsertVinCache({
            vin: cleaned,
            source: dominant,
            enrichedData: rewrittenData as any,
            catalogMatches: catalogMatches as any,
            decodedData: null,
            enrichmentSource: enriched.enrichmentSource as any,
            ...(resolvedHash ? { bimmerworkHash: resolvedHash } : {}),
          });
          console.log(`[VIN Cache] Saved enrichment for ${cleaned} (sources: ${JSON.stringify(enriched.enrichmentSource)})`);
        } catch (cacheErr: any) {
          console.error(`[VIN Cache] Failed to save ${cleaned}: ${cacheErr.message}`);
        }

        return res.json({
          found: true,
          data: rewrittenData,
          source: dominant,
          enrichmentSource: enriched.enrichmentSource,
          coverage: enriched.coverage,
          catalogMatches,
        });
      }

      // Final fallback — orchestrator returned null (no first-party OR
      // third-party source had anything). For ETK-covered VINs the
      // orchestrator never returns null; this branch only fires for
      // truly-unknown VINs, so queueing for the bimmer.work batch is
      // still appropriate.
      queueVinForBatch(cleaned);
      const queueStatus = getVinQueueStatus(cleaned);
      return res.json({ found: false, message: "Could not find enrichment data for this VIN", queued: true, nextBatchIn: queueStatus.nextBatchIn });
    } catch (err: any) {
      console.error("BimmerWork fetch error:", err);
      res.status(500).json({ error: err.message || "Failed to fetch bimmer.work data" });
    }
  });

  // First-party-only VIN enrichment endpoint (Task #59). Same shape
  // as /api/vin/bimmerwork but flips `allowThirdParty: false` on the
  // orchestrator. Used by the batch processor and admins who need to
  // verify a VIN can be served without bimmer.work / mdecoder /
  // vindecoderz. ETK-covered VINs return data; modern (post-cutoff)
  // VINs that need third-party enrichment return `{found:false}`.
  app.get("/api/vin/enrich/:vin", async (req, res) => {
    try {
      const vin = req.params["vin"] as string;
      const cleaned = vin.toUpperCase().replace(/[\s\-]/g, "");
      if (cleaned.length !== 17) {
        return res.status(400).json({ error: "Full 17-character VIN required" });
      }

      const enriched = await enrichVin(cleaned, { allowThirdParty: false });
      if (!enriched) {
        return res.json({
          found: false,
          message: "First-party sources have no data for this VIN",
          firstPartyOnly: true,
        });
      }

      // Tag the cache row as first-party so observers can tell this
      // refresh skipped third-party scrapers entirely.
      const dominant = enriched.enrichmentSource.vehicle?.source || "etk";
      try {
        await storage.upsertVinCache({
          vin: cleaned,
          source: dominant,
          enrichedData: enriched.data as any,
          catalogMatches: (await matchCarsFromEnrichment(enriched.data)) as any,
          decodedData: null,
          enrichmentSource: enriched.enrichmentSource as any,
        });
      } catch (cacheErr: any) {
        console.error(`[VIN Cache] enrich/${cleaned} save failed: ${cacheErr.message}`);
      }

      res.json({
        found: true,
        firstPartyOnly: true,
        data: enriched.data,
        source: dominant,
        enrichmentSource: enriched.enrichmentSource,
        coverage: enriched.coverage,
      });
    } catch (err: any) {
      console.error("VIN enrich error:", err);
      res.status(500).json({ error: err.message || "Failed to enrich VIN" });
    }
  });

  // Public read of carvertical affiliate parameters — used by the
  // VIN decoder UI to build the mileage-check link in VehicleTab. We
  // intentionally expose this without auth because the values are
  // already shipped to the browser whenever the link renders. Returns
  // CARVERTICAL_DEFAULTS when no override is configured.
  app.get("/api/settings/carvertical", async (_req, res) => {
    try {
      const stored = await storage.getGlobalSetting(CARVERTICAL_SETTING_KEY);
      const merged: CarverticalSettings = stored
        ? { ...CARVERTICAL_DEFAULTS, ...stored }
        : { ...CARVERTICAL_DEFAULTS };
      // Validate so a corrupt row never breaks the frontend.
      const parsed = carverticalSettingsSchema.safeParse(merged);
      res.json(parsed.success ? parsed.data : CARVERTICAL_DEFAULTS);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin update of carvertical affiliate params (a, b, chan, enabled).
  app.post("/api/admin/settings/carvertical", requireAdmin, async (req, res) => {
    try {
      const parsed = carverticalSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid carvertical settings", issues: parsed.error.issues });
      }
      await storage.setGlobalSetting(CARVERTICAL_SETTING_KEY, parsed.data);
      res.json({ ok: true, settings: parsed.data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public read of ECS Tuning affiliate parameters — used by PartDetail
  // to build the LinkSynergy deep-link. Returns ECS_AFFILIATE_DEFAULTS when
  // no override is configured.
  app.get("/api/settings/affiliate/ecs", async (_req, res) => {
    try {
      const stored = await storage.getGlobalSetting(ECS_AFFILIATE_SETTING_KEY);
      const merged: AffiliateShopLinkSettings = stored
        ? { ...ECS_AFFILIATE_DEFAULTS, ...stored }
        : { ...ECS_AFFILIATE_DEFAULTS };
      const parsed = affiliateShopLinkSchema.safeParse(merged);
      res.json(parsed.success ? parsed.data : ECS_AFFILIATE_DEFAULTS);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin update of ECS Tuning affiliate params.
  app.post("/api/admin/settings/affiliate/ecs", requireAdmin, async (req, res) => {
    try {
      const parsed = affiliateShopLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid ECS affiliate settings", issues: parsed.error.issues });
      }
      await storage.setGlobalSetting(ECS_AFFILIATE_SETTING_KEY, parsed.data);
      res.json({ ok: true, settings: parsed.data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public read of Turner Motorsport affiliate parameters.
  app.get("/api/settings/affiliate/turner", async (_req, res) => {
    try {
      const stored = await storage.getGlobalSetting(TURNER_AFFILIATE_SETTING_KEY);
      const merged: AffiliateShopLinkSettings = stored
        ? { ...TURNER_AFFILIATE_DEFAULTS, ...stored }
        : { ...TURNER_AFFILIATE_DEFAULTS };
      const parsed = affiliateShopLinkSchema.safeParse(merged);
      res.json(parsed.success ? parsed.data : TURNER_AFFILIATE_DEFAULTS);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin update of Turner Motorsport affiliate params.
  app.post("/api/admin/settings/affiliate/turner", requireAdmin, async (req, res) => {
    try {
      const parsed = affiliateShopLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid Turner affiliate settings", issues: parsed.error.issues });
      }
      await storage.setGlobalSetting(TURNER_AFFILIATE_SETTING_KEY, parsed.data);
      res.json({ ok: true, settings: parsed.data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public read of eBay affiliate parameters — used by PartDetail to build
  // the affiliate search URL. Returns EBAY_AFFILIATE_DEFAULTS when no override
  // is configured.
  app.get("/api/settings/affiliate/ebay", async (_req, res) => {
    try {
      const stored = await storage.getGlobalSetting(EBAY_AFFILIATE_SETTING_KEY);
      const merged: EbayAffiliateSettings = stored
        ? { ...EBAY_AFFILIATE_DEFAULTS, ...stored }
        : { ...EBAY_AFFILIATE_DEFAULTS };
      const parsed = ebayAffiliateSchema.safeParse(merged);
      res.json(parsed.success ? parsed.data : EBAY_AFFILIATE_DEFAULTS);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin update of eBay affiliate params.
  app.post("/api/admin/settings/affiliate/ebay", requireAdmin, async (req, res) => {
    try {
      const parsed = ebayAffiliateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid eBay affiliate settings", issues: parsed.error.issues });
      }
      await storage.setGlobalSetting(EBAY_AFFILIATE_SETTING_KEY, parsed.data);
      res.json({ ok: true, settings: parsed.data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public read of Amazon affiliate parameters — used by PartDetail to build
  // the affiliate search URL. Returns AMAZON_AFFILIATE_DEFAULTS when no
  // override is configured.
  app.get("/api/settings/affiliate/amazon", async (_req, res) => {
    try {
      const stored = await storage.getGlobalSetting(AMAZON_AFFILIATE_SETTING_KEY);
      const merged: AmazonAffiliateSettings = stored
        ? { ...AMAZON_AFFILIATE_DEFAULTS, ...stored }
        : { ...AMAZON_AFFILIATE_DEFAULTS };
      const parsed = amazonAffiliateSchema.safeParse(merged);
      res.json(parsed.success ? parsed.data : AMAZON_AFFILIATE_DEFAULTS);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin update of Amazon affiliate params.
  app.post("/api/admin/settings/affiliate/amazon", requireAdmin, async (req, res) => {
    try {
      const parsed = amazonAffiliateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid Amazon affiliate settings", issues: parsed.error.issues });
      }
      await storage.setGlobalSetting(AMAZON_AFFILIATE_SETTING_KEY, parsed.data);
      res.json({ ok: true, settings: parsed.data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Re-import the dictionary tables (sa_codes / paint_codes /
  // upholstery_codes) from `data/dictionaries/*.json`. Idempotent —
  // safe to call after editing any of the JSON files.
  app.post("/api/admin/dictionaries/import", requireAdmin, async (_req, res) => {
    try {
      const result = await importDictionaries();
      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[Dictionaries] Import failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/dictionaries/stats", requireAdmin, async (_req, res) => {
    try {
      const counts = await countDictionaries();
      res.json(counts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Bulk-import per-VIN factory option (FA / SA / paint / upholstery)
  // rows. Accepts a pipe-delimited PSV body (one row per line) in the
  // format:
  //   VIN|SA1,SA2,SA3|paintCode|upholsteryCode|YYYY-MM
  // Fields after the VIN may be empty; lines starting with `#` are
  // treated as comments. The SA list is itself comma- or whitespace-
  // separated. Idempotent — existing rows are upserted with
  // `source: "etk_fa_import"`. Used by ops to seed
  // `vin_factory_options` from a PartsLink24 dump (which is what
  // makes ETK-covered VINs serve Options/paint/upholstery without
  // touching bimmer.work). Either {content:string} (PSV) or
  // {rows:[{vin,saCodes,paintCode,upholsteryCode,productionDate}]}
  // (already-parsed JSON) is accepted. The PSV `content` branch
  // shares its parser with the startup file-based loader
  // (`server/etk-vin-fa.ts`) so admin uploads and on-disk dumps stay
  // format-compatible.
  app.post("/api/admin/vin-factory-options/import", requireAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      type Row = { vin: string; saCodes: string[]; paintCode: string | null; upholsteryCode: string | null; productionDate: string | null };
      const parsed: Row[] = [];

      if (Array.isArray(body.rows)) {
        for (const r of body.rows) {
          const vin = String(r.vin || "").toUpperCase().replace(/[\s-]/g, "");
          if (vin.length !== 17) continue;
          parsed.push({
            vin,
            saCodes: Array.isArray(r.saCodes) ? r.saCodes.map(String).filter(Boolean) : [],
            paintCode: r.paintCode ? String(r.paintCode) : null,
            upholsteryCode: r.upholsteryCode ? String(r.upholsteryCode) : null,
            productionDate: r.productionDate ? String(r.productionDate) : null,
          });
        }
      } else if (typeof body.content === "string") {
        const { parseVinFaPsv } = await import("./etk-vin-fa");
        for (const r of parseVinFaPsv(body.content)) parsed.push(r);
      } else {
        return res.status(400).json({ error: "Provide either `rows: [...]` or `content: 'VIN|SAs|paint|uph|date\\n...'`" });
      }

      let upserted = 0;
      for (const r of parsed) {
        try {
          await db.insert(vinFactoryOptions).values({
            vin: r.vin,
            saCodes: r.saCodes,
            paintCode: r.paintCode,
            upholsteryCode: r.upholsteryCode,
            productionDate: r.productionDate,
            source: "etk_fa_import",
          }).onConflictDoUpdate({
            target: vinFactoryOptions.vin,
            set: {
              saCodes: r.saCodes,
              paintCode: r.paintCode,
              upholsteryCode: r.upholsteryCode,
              productionDate: r.productionDate,
              source: "etk_fa_import",
              updatedAt: new Date(),
            },
          });
          upserted++;
        } catch (err: any) {
          console.error(`[FA Import] ${r.vin} failed: ${err.message}`);
        }
      }
      res.json({ ok: true, parsed: parsed.length, upserted });
    } catch (err: any) {
      console.error("[FA Import] fatal", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Aggregated per-source counters across all cached VINs — drives the
  // "How often did we still hit bimmer.work this week?" admin widget.
  app.get("/api/admin/vin-enrichment-stats", requireAdmin, async (_req, res) => {
    try {
      const stats = await getEnrichmentSourceStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin gap surface (Task #83). Lists ETK-covered VINs in vin_cache
  // that are missing per-VIN factory-order data (paint / upholstery /
  // SA list / production date). Operators use this to decide which
  // VINs to push through the PartsLink24 admin import path. The
  // returned `importPaths` field mirrors what the orchestrator
  // emits in its per-response `coverage.importPaths` block, so the
  // admin UI shows the same actionable paths in both places.
  app.get("/api/admin/vin-coverage-gaps", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit || "100"), 10) || 100, 500);
      // ETK-covered VINs whose vin_cache row is missing per-VIN FA in
      // vin_factory_options. We join on the VIN; LEFT JOIN + IS NULL
      // surfaces the gaps; the WHERE on vehicle.source filters to ETK.
      const rows = await db.execute(sql`
        SELECT vc.vin,
               vc.enrichment_source -> 'vehicle' ->> 'source' AS vehicle_source,
               (vfo.vin IS NULL) AS missing_fa,
               vfo.paint_code,
               vfo.upholstery_code,
               vfo.production_date,
               COALESCE(array_length(vfo.sa_codes, 1), 0) AS sa_count
        FROM vin_cache vc
        LEFT JOIN vin_factory_options vfo ON vfo.vin = vc.vin
        WHERE vc.enrichment_source -> 'vehicle' ->> 'source' = 'etk'
          AND (vfo.vin IS NULL
               OR vfo.paint_code IS NULL
               OR vfo.upholstery_code IS NULL
               OR vfo.production_date IS NULL
               OR COALESCE(array_length(vfo.sa_codes, 1), 0) = 0)
        ORDER BY vc.updated_at DESC NULLS LAST
        LIMIT ${limit}
      `);
      const gaps = (rows.rows || []).map((r: any) => {
        const missing: string[] = [];
        if (r.missing_fa || r.sa_count === 0) missing.push("options");
        if (!r.paint_code) missing.push("paint");
        if (!r.upholstery_code) missing.push("upholstery");
        if (!r.production_date) missing.push("productionDate");
        return {
          vin: r.vin,
          vehicleSource: r.vehicle_source,
          missing,
          saCount: Number(r.sa_count) || 0,
        };
      });
      res.json({
        count: gaps.length,
        gaps,
        importPaths: [
          "POST /api/admin/vin-factory-options/import (PartsLink24 FA dump)",
          "data/etk/exports/vin_fa.psv (on-disk loader)",
          "scripts/promote-cache-to-factory-options.ts (cache promotion)",
        ],
      });
    } catch (err: any) {
      console.error("[VIN Coverage Gaps] failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/vin/queue-status/:vin", (req, res) => {
    const cleaned = (req.params["vin"] as string).toUpperCase().replace(/[\s\-]/g, "");
    if (cleaned.length !== 17) {
      return res.status(400).json({ error: "Full 17-character VIN required" });
    }
    const status = getVinQueueStatus(cleaned);
    res.json(status);
  });

  app.get("/api/vin/proxy-image", async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) {
        return res.status(400).json({ error: "URL parameter required" });
      }
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL" });
      }
      // Centralized first-party + legacy fallback host policy. Mirrors
      // server/vin-images.ts ALLOWED_HOSTS so the proxy accepts every
      // host the local-cache downloader does. This is required for
      // Task #59: configurator (cdn.bmwgroup.com) and manuals
      // (owners-manuals.bmw.com) URLs that haven't been localized yet
      // — common for 360 frames and transient cache misses — must
      // proxy through here so the UI keeps rendering.
      const allowedHosts = new Set([
        "bimmer.work", "www.bimmer.work",
        "bmw-etk.info", "www.bmw-etk.info",
        "cdn.bmwgroup.com", "cdn.bimmer-tech.net", "www.bmwgroup.com",
        "configure.bmw.com", "media.bmwgroup.com",
        "owners-manuals.bmw.com", "owner.i.bmw.com",
      ]);
      const cfgHost = process.env.BMW_CONFIGURATOR_HOST?.trim();
      if (cfgHost) allowedHosts.add(cfgHost);
      if (parsed.protocol !== "https:" || !allowedHosts.has(parsed.hostname)) {
        return res.status(400).json({ error: `Host not allowed: ${parsed.hostname}` });
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let imgRes: Response;
      try {
        imgRes = await fetch(url, {
          signal: controller.signal,
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        });
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        console.error(`Proxy image fetch error for ${url}: ${fetchErr.message}`);
        return res.status(502).json({ error: "Image fetch failed" });
      }
      clearTimeout(timeout);
      if (!imgRes.ok) {
        return res.status(imgRes.status).json({ error: "Image fetch failed" });
      }
      const finalUrl = imgRes.url;
      if (finalUrl) {
        try {
          const finalParsed = new URL(finalUrl);
          if (finalParsed.protocol !== "https:") {
            return res.status(400).json({ error: "Redirect to non-HTTPS URL" });
          }
        } catch {}
      }
      const contentType = imgRes.headers.get("content-type") || "image/png";
      const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
      if (!allowedTypes.some(t => contentType.startsWith(t))) {
        return res.status(400).json({ error: "Non-image content type" });
      }
      const contentLength = parseInt(imgRes.headers.get("content-length") || "0");
      if (contentLength > 10 * 1024 * 1024) {
        return res.status(413).json({ error: "Image too large" });
      }
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      if (buffer.length > 10 * 1024 * 1024) {
        return res.status(413).json({ error: "Image too large" });
      }
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: "Proxy error" });
    }
  });

  app.get("/api/admin/vin-cache-stats", requireAdmin, async (_req, res) => {
    try {
      const count = await storage.countVinCache();
      const allCars = await storage.getAllUserCarsRaw();
      res.json({ cachedVins: count, savedCars: allCars.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  let vinImageMigrationRunning = false;
  app.post("/api/admin/migrate-vin-images", requireAdmin, async (_req, res) => {
    if (vinImageMigrationRunning) {
      return res.status(409).json({ error: "Migration already in progress" });
    }
    vinImageMigrationRunning = true;
    try {
      const allCars = await storage.getAllUserCarsRaw();
      console.log(`[VIN Images] Starting migration for ${allCars.length} user cars...`);
      const result = await migrateExistingVinImages(
        allCars,
        async (id, vinData) => {
          await storage.updateUserCarVinData(id, vinData);
        },
        (done, total, vin) => {
          if (done % 5 === 0 || done === total) {
            console.log(`[VIN Images] Migration progress: ${done}/${total} (current: ${vin})`);
          }
        }
      );
      console.log(`[VIN Images] Migration complete:`, result);
      res.json(result);
    } catch (err: any) {
      console.error("[VIN Images] Migration error:", err);
      res.status(500).json({ error: err.message });
    } finally {
      vinImageMigrationRunning = false;
    }
  });

  app.get("/api/admin/model-image-stats", requireAdmin, async (_req, res) => {
    try {
      const allModels = await storage.getBmwModels();
      const total = allModels.length;
      const withImage = allModels.filter(m => m.imageUrl).length;
      const local = allModels.filter(m => m.imageUrl?.startsWith("/images/")).length;
      const remote = withImage - local;
      res.json({ total, withImage, local, remote });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  let modelImageMigrationRunning = false;
  app.post("/api/admin/migrate-model-images", requireAdmin, async (_req, res) => {
    if (modelImageMigrationRunning) {
      return res.status(409).json({ error: "Migration already in progress" });
    }
    modelImageMigrationRunning = true;
    try {
      const allModels = await storage.getBmwModels();
      const modelsWithRemoteImages = allModels
        .filter(m => m.imageUrl && !m.imageUrl.startsWith("/images/"))
        .map(m => ({ id: m.id, imageUrl: m.imageUrl }));

      console.log(`[Model Images] Starting migration for ${modelsWithRemoteImages.length} models with remote images...`);
      const result = await migrateModelImages(
        modelsWithRemoteImages,
        async (id, localUrl) => {
          await storage.updateBmwModelImageUrl(id, localUrl);
        },
        async (id) => {
          await storage.updateBmwModelImageUrl(id, null);
        },
        (done, total) => {
          if (done % 50 === 0 || done === total) {
            console.log(`[Model Images] Migration progress: ${done}/${total}`);
          }
        }
      );
      console.log(`[Model Images] Migration complete:`, result);
      res.json(result);
    } catch (err: any) {
      console.error("[Model Images] Migration error:", err);
      res.status(500).json({ error: err.message });
    } finally {
      modelImageMigrationRunning = false;
    }
  });

  app.get("/api/admin/background-jobs", requireAdmin, async (req, res) => {
    try {
      const { getAllJobs, getActiveJob } = await import("./job-manager");
      const limit = parseInt(req.query.limit as string) || 20;
      const jobs = await getAllJobs(limit);
      const activeTypes = ["enrichment", "crossref", "model_scrape"] as const;
      const active: Record<string, any> = {};
      for (const t of activeTypes) {
        const job = await getActiveJob(t);
        if (job) active[t] = job;
      }
      res.json({ jobs, active });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/reset-stuck-scrapes", requireAdmin, async (_req, res) => {
    try {
      const allCars = await storage.getCars();
      const stuck = allCars.filter(c => c.scrapeStatus === "running" && !isJobRunning(c.id));
      let fixed = 0;
      for (const car of stuck) {
        const newStatus = (car.totalParts ?? 0) > 0 ? "complete" : "idle";
        await db.update(carsTable)
          .set({ scrapeStatus: newStatus })
          .where(eq(carsTable.id, car.id));
        fixed++;
      }
      console.log(`[Admin] Reset ${fixed} stuck scrapes`);
      res.json({ total: stuck.length, fixed, details: stuck.map(c => ({ id: c.id, name: c.displayName, parts: c.totalParts })) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/fix-vin-years", requireAdmin, async (_req, res) => {
    try {
      const allCached = await db.select().from(vinCache);
      let fixed = 0;
      let skipped = 0;
      const details: { vin: string; oldYear: number | null; newYear: number; source: string }[] = [];

      for (const entry of allCached) {
        const enriched = entry.enrichedData as any;
        const decoded = entry.decodedData as any;
        if (!decoded) { skipped++; continue; }

        const prodDateStr = enriched?.productionDate
          || enriched?.vehicle?.startOfProduction
          || null;
        if (!prodDateStr) { skipped++; continue; }

        const match = prodDateStr.match(/(\d{4})/);
        if (!match) { skipped++; continue; }

        const prodYear = parseInt(match[1], 10);
        const currentYear = new Date().getFullYear();
        if (prodYear < 1980 || prodYear > currentYear + 2) { skipped++; continue; }

        const oldYear = decoded.modelYear;
        if (!oldYear || Math.abs(prodYear - oldYear) > 2) {
          decoded.modelYear = prodYear;
          await db.update(vinCache)
            .set({ decodedData: decoded, updatedAt: new Date() })
            .where(eq(vinCache.vin, entry.vin));
          details.push({ vin: entry.vin, oldYear, newYear: prodYear, source: prodDateStr });
          fixed++;
        } else {
          skipped++;
        }
      }

      console.log(`[VIN Year Fix] Fixed ${fixed} VINs, skipped ${skipped}`);
      res.json({ total: allCached.length, fixed, skipped, details });
    } catch (err: any) {
      console.error("[VIN Year Fix] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/vin/decode", express.json(), async (req, res) => {
    try {
      const { vin, last7 } = req.body;
      const input = vin || last7;
      if (!input || typeof input !== "string") {
        return res.status(400).json({ error: "Provide a VIN (17 chars) or last7 (7 chars)" });
      }
      const cleaned = input.toUpperCase().replace(/[\s\-]/g, "");
      if (cleaned.length !== 17 && cleaned.length !== 7) {
        return res.status(400).json({ error: `Input must be 17 characters (full VIN) or 7 characters (last 7). Got ${cleaned.length}` });
      }
      const result = await handleVinDecode(cleaned, String(req.ip || req.headers["x-forwarded-for"] || "anon"));
      res.json(result);
    } catch (err: any) {
      console.error("VIN decode error:", err);
      res.status(500).json({ error: err.message || "Failed to decode VIN" });
    }
  });

  app.get("/api/vin/decode/:vin", async (req, res) => {
    try {
      const vin = req.params["vin"] as string;
      if (!vin) {
        return res.status(400).json({ error: "VIN parameter required" });
      }
      const cleaned = vin.toUpperCase().replace(/[\s\-]/g, "");
      if (cleaned.length !== 17 && cleaned.length !== 7) {
        return res.status(400).json({ error: `Input must be 17 characters (full VIN) or 7 characters (last 7). Got ${cleaned.length}` });
      }
      const result = await handleVinDecode(cleaned, String(req.ip || req.headers["x-forwarded-for"] || "anon"));
      res.json(result);
    } catch (err: any) {
      console.error("VIN decode error:", err);
      res.status(500).json({ error: err.message || "Failed to decode VIN" });
    }
  });

  app.get("/api/v1/vin/decode/:vin", requireApiKey, async (req, res) => {
    try {
      const vin = req.params["vin"] as string;
      if (!vin) {
        return res.status(400).json({ error: "VIN parameter required" });
      }
      const cleaned = vin.toUpperCase().replace(/[\s\-]/g, "");
      if (cleaned.length !== 17 && cleaned.length !== 7) {
        return res.status(400).json({ error: `Input must be 17 characters (full VIN) or 7 characters (last 7). Got ${cleaned.length}` });
      }
      const result = await handleVinDecode(cleaned, String(req.ip || req.headers["x-forwarded-for"] || "anon"));
      res.json({ data: result });
    } catch (err: any) {
      console.error("VIN decode error:", err);
      res.status(500).json({ error: err.message || "Failed to decode VIN" });
    }
  });

  app.get("/robots.txt", (req, res, next) => {
    if (req.bmvVinHost) return next();
    res.type("text/plain").send(
      `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /login\nDisallow: /my-cars\nDisallow: /reset-password\n\nSitemap: https://bmv.parts/sitemap.xml\n`
    );
  });

  const SITEMAP_MAX_URLS = 45000;

  app.get("/sitemap.xml", async (req, res, next) => {
    if (req.bmvVinHost) return next();
    try {
      const partCount = await db.execute(sql`SELECT COUNT(DISTINCT "part_number_clean")::int AS cnt FROM parts`);
      const totalParts = (partCount.rows?.[0] as any)?.cnt || 0;
      const partSitemapCount = Math.ceil(totalParts / SITEMAP_MAX_URLS);

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      xml += `  <sitemap><loc>https://bmv.parts/sitemap-pages.xml</loc></sitemap>\n`;
      xml += `  <sitemap><loc>https://bmv.parts/sitemap-cars.xml</loc></sitemap>\n`;
      xml += `  <sitemap><loc>https://bmv.parts/sitemap-chassis.xml</loc></sitemap>\n`;
      xml += `  <sitemap><loc>https://bmv.parts/sitemap-content.xml</loc></sitemap>\n`;
      for (let i = 1; i <= partSitemapCount; i++) {
        xml += `  <sitemap><loc>https://bmv.parts/sitemap-parts-${i}.xml</loc></sitemap>\n`;
      }
      xml += `</sitemapindex>`;
      res.type("application/xml").send(xml);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/sitemap-pages.xml", async (req, res, next) => {
    if (req.bmvVinHost) return next();
    try {
      const allCars = await storage.getCars();
      const staticPages = [
        { url: "/", priority: "1.0", changefreq: "daily" },
        { url: "/search", priority: "0.9", changefreq: "daily" },
        { url: "/vin", priority: "0.8", changefreq: "monthly" },
        { url: "/part-finder", priority: "0.8", changefreq: "monthly" },
        { url: "/models", priority: "0.7", changefreq: "weekly" },
        { url: "/about", priority: "0.5", changefreq: "monthly" },
        { url: "/friends", priority: "0.5", changefreq: "monthly" },
      ];

      const seriesSet = new Set<string>();
      for (const car of allCars) {
        if (car.series) seriesSet.add(car.series.toLowerCase().replace(/\s+/g, "-"));
      }

      const { LOCALE_LIST: LOCALE_LIST_PAGES } = await import("../shared/i18n");
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;
      for (const page of staticPages) {
        const englishLoc = `https://bmv.parts${page.url}`;
        // Emit per-locale alternates for /models so it joins the multilingual
        // sitemap (Task #44). Other static pages stay single-URL for now.
        if (page.url === "/models") {
          xml += `  <url><loc>${englishLoc}</loc><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority>\n`;
          for (const l of LOCALE_LIST_PAGES) {
            const href = l.prefix
              ? `https://bmv.parts/${l.prefix}/models`
              : englishLoc;
            xml += `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${href}"/>\n`;
          }
          xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${englishLoc}"/>\n`;
          xml += `  </url>\n`;
        } else {
          xml += `  <url><loc>${englishLoc}</loc><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>\n`;
        }
      }
      // Per-locale xhtml:link alternates for each series hub (Task #44).
      for (const slug of seriesSet) {
        const englishLoc = `https://bmv.parts/series/${slug}`;
        xml += `  <url><loc>${englishLoc}</loc><changefreq>weekly</changefreq><priority>0.8</priority>\n`;
        for (const l of LOCALE_LIST_PAGES) {
          const href = l.prefix
            ? `https://bmv.parts/${l.prefix}/series/${slug}`
            : englishLoc;
          xml += `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${href}"/>\n`;
        }
        xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${englishLoc}"/>\n`;
        xml += `  </url>\n`;
      }
      // Chassis URLs moved to /sitemap-chassis.xml (Task #36) so each can
      // emit its own per-locale xhtml:link alternates.
      xml += `</urlset>`;
      res.type("application/xml").send(xml);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Multilingual sitemap for /car/:slug landing pages (Task #36). Each car
  // URL emits xhtml:link alternates pointing at the locale-prefixed variant
  // and a x-default tag pointing at the canonical English URL.
  app.get("/sitemap-cars.xml", async (req, res, next) => {
    if (req.bmvVinHost) return next();
    try {
      const allCars = await storage.getCars();
      const carsWithParts = allCars.filter(c => (c.totalParts ?? 0) > 0 && c.slug);
      const { LOCALE_LIST } = await import("../shared/i18n");
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;
      for (const car of carsWithParts) {
        const lastmod = car.lastScrapedAt ? new Date(car.lastScrapedAt).toISOString().split("T")[0] : "";
        const englishLoc = `https://bmv.parts/car/${car.slug}`;
        xml += `  <url><loc>${englishLoc}</loc><changefreq>weekly</changefreq><priority>0.7</priority>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}\n`;
        for (const l of LOCALE_LIST) {
          const href = l.prefix
            ? `https://bmv.parts/${l.prefix}/car/${car.slug}`
            : englishLoc;
          xml += `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${href}"/>\n`;
        }
        xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${englishLoc}"/>\n`;
        xml += `  </url>\n`;
      }
      xml += `</urlset>`;
      res.type("application/xml").send(xml);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Multilingual sitemap for /chassis/:code hub pages (Task #36). Split out
  // of sitemap-pages.xml so each chassis hub can carry its own xhtml:link
  // alternates for the 11 supported locales.
  app.get("/sitemap-chassis.xml", async (req, res, next) => {
    if (req.bmvVinHost) return next();
    try {
      const allCars = await storage.getCars();
      const chassisSet = new Set<string>();
      for (const car of allCars) {
        if (car.chassis) chassisSet.add(car.chassis.toLowerCase());
      }
      const { LOCALE_LIST } = await import("../shared/i18n");
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;
      for (const ch of chassisSet) {
        const englishLoc = `https://bmv.parts/chassis/${ch}`;
        xml += `  <url><loc>${englishLoc}</loc><changefreq>weekly</changefreq><priority>0.8</priority>\n`;
        for (const l of LOCALE_LIST) {
          const href = l.prefix
            ? `https://bmv.parts/${l.prefix}/chassis/${ch}`
            : englishLoc;
          xml += `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${href}"/>\n`;
        }
        xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${englishLoc}"/>\n`;
        xml += `  </url>\n`;
      }
      xml += `</urlset>`;
      res.type("application/xml").send(xml);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/sitemap-parts-:page.xml", async (req, res, next) => {
    if (req.bmvVinHost) return next();
    try {
      const page = parseInt((req.params["page"] as string));
      if (isNaN(page) || page < 1) return res.status(400).send("Invalid page");
      const offset = (page - 1) * SITEMAP_MAX_URLS;

      const distinctParts = await db.execute(
        sql`SELECT DISTINCT "part_number_clean" FROM parts ORDER BY "part_number_clean" LIMIT ${SITEMAP_MAX_URLS} OFFSET ${offset}`
      );

      // Multilingual sitemap (Task #32). Each part URL emits xhtml:link
      // alternates pointing at the localized variant under the locale's
      // path prefix. The English (default) URL is also tagged as x-default.
      // Reference: https://developers.google.com/search/docs/specialty/international/localized-versions#sitemap
      const { LOCALE_LIST } = await import("../shared/i18n");
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;
      if (distinctParts.rows) {
        for (const row of distinctParts.rows) {
          const pn = (row as any).part_number_clean;
          if (!pn) continue;
          const englishLoc = `https://bmv.parts/part/${pn}`;
          xml += `  <url><loc>${englishLoc}</loc><changefreq>monthly</changefreq><priority>0.5</priority>\n`;
          for (const l of LOCALE_LIST) {
            const href = l.prefix
              ? `https://bmv.parts/${l.prefix}/part/${pn}`
              : englishLoc;
            xml += `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${href}"/>\n`;
          }
          xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${englishLoc}"/>\n`;
          xml += `  </url>\n`;
        }
      }
      xml += `</urlset>`;
      res.type("application/xml").send(xml);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Per-VIN sitemap shards. vin_cache only — user_cars is never read.
  app.get("/sitemap-vins-:page.xml", async (req, res) => {
    try {
      const page = parseInt((req.params["page"] as string));
      if (isNaN(page) || page < 1) return res.status(400).send("Invalid page");
      const offset = (page - 1) * SITEMAP_MAX_URLS;

      const rows = await db.execute(
        sql`SELECT vin, updated_at, created_at FROM vin_cache ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST, vin ASC LIMIT ${SITEMAP_MAX_URLS} OFFSET ${offset}`
      );
      const { LOCALE_LIST } = await import("../shared/i18n");

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;
      if (rows.rows) {
        for (const row of rows.rows) {
          const vinRaw = (row as any).vin as string | undefined;
          if (!vinRaw) continue;
          const vin = vinRaw.toUpperCase();
          // Defense in depth: even if a transcription-error VIN slipped past
          // ingest filters, never publish it in the public sitemap. The
          // /vin/:vin SSR layer also rejects these (404+noindex), so any
          // crawler hit would be a dead end anyway.
          if (!hasValidVinCheckDigit(vin)) continue;
          const updatedAt = (row as any).updated_at as Date | string | null;
          const createdAt = (row as any).created_at as Date | string | null;
          const lastmodSource = updatedAt ?? createdAt;
          const lastmod = lastmodSource
            ? new Date(lastmodSource).toISOString().slice(0, 10)
            : null;
          // Per-VIN landing pages now live on the bmv.vin vanity host as
          // their canonical home (bmv.parts/vin/* 301-redirects to it).
          // The vanity host is single-locale (one canonical per VIN), so
          // every alternate link points at the same URL — we keep the
          // hreflang block for crawler clarity.
          const canonicalLoc = `https://www.bmv.vin/${vin}`;
          xml += `  <url><loc>${canonicalLoc}</loc>`;
          if (lastmod) xml += `<lastmod>${lastmod}</lastmod>`;
          xml += `<changefreq>monthly</changefreq><priority>0.6</priority>\n`;
          for (const l of LOCALE_LIST) {
            xml += `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${canonicalLoc}"/>\n`;
          }
          xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${canonicalLoc}"/>\n`;
          xml += `  </url>\n`;
        }
      }
      xml += `</urlset>`;
      res.type("application/xml").send(xml);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Slim chassis rollup for the homepage Popular Chassis grid. Pushes
  // GROUP BY chassis into SQL and stops shipping the entire per-car
  // list per chassis (the homepage only needs counts + year range).
  // Pages that need the full member list per chassis use
  // /api/chassis/:chassisCode instead.
  app.get("/api/chassis", async (req, res) => {
    const cached = await appCache.getHomepageChassis();
    if (cached !== undefined) {
      res.set("Cache-Control", "public, max-age=30, s-maxage=60");
      return res.json(cached);
    }
    try {
      const result = await storage.getChassisAggregates();
      await appCache.setHomepageChassis(result);
      res.set("Cache-Control", "public, max-age=30, s-maxage=60");
      res.json(result);
    } catch (err: any) {
      // DB is under pressure or timed out — serve the stale backup key (up to
      // 10 min old, separate TTL) so Popular Chassis never shows "Couldn't load."
      const stale = await appCache.getHomepageChassisStale();
      if (stale !== undefined) {
        console.warn(`[cache] stale-hit: /api/chassis (db error: ${err.message})`);
        res.set("Cache-Control", "no-store");
        return res.json(stale);
      }
      res.status(500).json({ error: err.message });
    }
  });

  // Helper: aggregate top categories (by indexed part count) for a list of carIds.
  async function getTopCategoriesForCars(carIds: number[], limit = 8): Promise<{ name: string; partCount: number }[]> {
    if (carIds.length === 0) return [];
    const idList = carIds.filter(n => Number.isFinite(n)).join(",");
    if (!idList) return [];
    const rows = await db.execute(sql.raw(`
      SELECT c.name AS "name", COUNT(p.id)::int AS "partCount"
      FROM categories c
      JOIN subcategories s ON s.category_id = c.id
      JOIN parts p ON p.subcategory_id = s.id
      WHERE c.car_id IN (${idList})
      GROUP BY c.name
      ORDER BY "partCount" DESC
      LIMIT ${Math.max(1, Math.min(50, limit))}
    `));
    return rows.rows as { name: string; partCount: number }[];
  }

  // GET /api/chassis/seo/:code — SEO payload (intro, top categories,
  // related chassis, FAQ, JSON-LD CollectionPage) for a chassis hub page.
  app.get("/api/chassis/seo/:code", async (req, res) => {
    try {
      const code = ((req.params["code"] as string) || "").trim();
      if (!code) return res.status(400).json({ error: "code required" });
      const codeUpper = code.toUpperCase();
      const allCars = await storage.getCars();
      const matching = allCars.filter(c => (c.chassis || "").toUpperCase() === codeUpper);
      if (matching.length === 0) return res.status(404).json({ error: "Chassis not found" });

      const totalParts = matching.reduce((sum, c) => sum + (c.totalParts || 0), 0);
      const years = matching.map(c => c.yearStart).filter(Boolean) as number[];
      const yearsEnd = matching.map(c => c.yearEnd).filter(Boolean) as number[];
      const yearStart = years.length ? Math.min(...years) : null;
      const yearEnd = yearsEnd.length ? Math.max(...yearsEnd) : (years.length ? Math.max(...years) : null);
      const series = matching[0]?.series ?? null;

      // Related chassis: same series, exclude self.
      const sibling = allCars.filter(c => c.series === series && (c.chassis || "").toUpperCase() !== codeUpper);
      const relMap = new Map<string, { chassis: string; series: string | null; carCount: number; totalParts: number; yearStart: number | null; yearEnd: number | null }>();
      for (const c of sibling) {
        const ch = (c.chassis || "").toUpperCase();
        if (!ch) continue;
        let g = relMap.get(ch);
        if (!g) {
          g = { chassis: ch, series: c.series ?? null, carCount: 0, totalParts: 0, yearStart: null, yearEnd: null };
          relMap.set(ch, g);
        }
        g.carCount += 1;
        g.totalParts += c.totalParts ?? 0;
        if (c.yearStart && (g.yearStart === null || c.yearStart < g.yearStart)) g.yearStart = c.yearStart;
        if (c.yearEnd && (g.yearEnd === null || c.yearEnd > g.yearEnd)) g.yearEnd = c.yearEnd;
      }
      const relatedChassis = Array.from(relMap.values())
        .sort((a, b) => b.totalParts - a.totalParts)
        .slice(0, 8);

      const topCategories = await getTopCategoriesForCars(matching.map(c => c.id), 8).catch(() => []);
      const editorial = await storage.getHubEditorial("chassis", codeUpper).catch(() => undefined);

      const { SUPPORTED_LOCALES } = await import("../shared/i18n");
      const reqLocale = typeof req.query.locale === "string" ? req.query.locale : "";
      const locale = (SUPPORTED_LOCALES as readonly string[]).includes(reqLocale) ? reqLocale : "en";

      const { generateHubSeoContent } = await import("./seo/content");
      const content = generateHubSeoContent({
        hubType: "chassis",
        hubLabel: codeUpper,
        hubKey: codeUpper,
        path: `/chassis/${code.toLowerCase()}`,
        carCount: matching.length,
        totalParts,
        yearStart,
        yearEnd,
        series,
        topCategories,
        relatedChassis,
        editorialBlurb: editorial?.blurb ?? null,
        locale,
      });

      res.set("Cache-Control", "public, max-age=300, s-maxage=3600");
      res.json({ chassis: codeUpper, series, content, locale });
    } catch (err: any) {
      console.error("[seo/hub] chassis failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/series/seo/:slug — SEO payload for a series hub page.
  app.get("/api/series/seo/:slug", async (req, res) => {
    try {
      const slug = ((req.params["slug"] as string) || "").trim().toLowerCase();
      if (!slug) return res.status(400).json({ error: "slug required" });
      const allCars = await storage.getCars();
      const matching = allCars.filter(c => (c.series || "Other").toLowerCase().replace(/\s+/g, "-") === slug);
      if (matching.length === 0) return res.status(404).json({ error: "Series not found" });

      const seriesName = matching[0].series || "Other";
      const totalParts = matching.reduce((sum, c) => sum + (c.totalParts || 0), 0);
      const years = matching.map(c => c.yearStart).filter(Boolean) as number[];
      const yearsEnd = matching.map(c => c.yearEnd).filter(Boolean) as number[];
      const yearStart = years.length ? Math.min(...years) : null;
      const yearEnd = yearsEnd.length ? Math.max(...yearsEnd) : (years.length ? Math.max(...years) : null);
      const chassisCodes = Array.from(new Set(matching.map(c => c.chassis).filter(Boolean))).sort();

      // For series hubs, "related chassis" surfaces this series' own chassis
      // generations (with their stats) so authors get an internal-link block.
      const chMap = new Map<string, { chassis: string; series: string | null; carCount: number; totalParts: number; yearStart: number | null; yearEnd: number | null }>();
      for (const c of matching) {
        const ch = (c.chassis || "").toUpperCase();
        if (!ch) continue;
        let g = chMap.get(ch);
        if (!g) {
          g = { chassis: ch, series: c.series ?? null, carCount: 0, totalParts: 0, yearStart: null, yearEnd: null };
          chMap.set(ch, g);
        }
        g.carCount += 1;
        g.totalParts += c.totalParts ?? 0;
        if (c.yearStart && (g.yearStart === null || c.yearStart < g.yearStart)) g.yearStart = c.yearStart;
        if (c.yearEnd && (g.yearEnd === null || c.yearEnd > g.yearEnd)) g.yearEnd = c.yearEnd;
      }
      const relatedChassis = Array.from(chMap.values()).sort((a, b) => a.chassis.localeCompare(b.chassis));

      const topCategories = await getTopCategoriesForCars(matching.map(c => c.id), 8).catch(() => []);
      const editorial = await storage.getHubEditorial("series", slug).catch(() => undefined);

      const { SUPPORTED_LOCALES: SUPPORTED_LOCALES_SERIES } = await import("../shared/i18n");
      const reqLocaleSeries = typeof req.query.locale === "string" ? req.query.locale : "";
      const localeSeries = (SUPPORTED_LOCALES_SERIES as readonly string[]).includes(reqLocaleSeries) ? reqLocaleSeries : "en";

      const { generateHubSeoContent } = await import("./seo/content");
      const content = generateHubSeoContent({
        hubType: "series",
        hubLabel: seriesName,
        hubKey: slug,
        path: `/series/${slug}`,
        carCount: matching.length,
        totalParts,
        yearStart,
        yearEnd,
        chassisCodes,
        topCategories,
        relatedChassis,
        editorialBlurb: editorial?.blurb ?? null,
        locale: localeSeries,
      });

      res.set("Cache-Control", "public, max-age=300, s-maxage=3600");
      res.json({ slug, name: seriesName, chassisCodes, content, locale: localeSeries });
    } catch (err: any) {
      console.error("[seo/hub] series failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/models/seo — locale-aware meta + intro for the /models hub.
  app.get("/api/models/seo", async (req, res) => {
    try {
      const { SUPPORTED_LOCALES, getPack } = await import("../shared/i18n");
      const reqLocale = typeof req.query.locale === "string" ? req.query.locale : "";
      const locale = (SUPPORTED_LOCALES as readonly string[]).includes(reqLocale) ? reqLocale : "en";
      const totalModels = await storage.countBmwModels().catch(() => 0);
      const buildIn = {
        totalModels,
        totalModelsFmt: totalModels.toLocaleString(),
      };
      const pack = getPack(locale);
      res.set("Cache-Control", "public, max-age=300, s-maxage=3600");
      res.json({
        locale,
        totalModels,
        content: {
          metaTitle: pack.buildModelsMetaTitle(buildIn),
          metaDescription: pack.buildModelsMetaDescription(buildIn),
          intro: pack.buildModelsIntro(buildIn),
        },
      });
    } catch (err: any) {
      console.error("[seo/hub] models failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/chassis/:chassisCode", async (req, res) => {
    try {
      const chassisCode = (req.params["chassisCode"] as string).toLowerCase();
      const allCars = await storage.getCars();
      const matchingCars = allCars.filter(c => c.chassis?.toLowerCase() === chassisCode);

      if (matchingCars.length === 0) {
        return res.status(404).json({ error: "No cars found for this chassis code" });
      }

      const totalParts = matchingCars.reduce((sum, c) => sum + (c.totalParts || 0), 0);
      const years = matchingCars.map(c => c.yearStart).filter(Boolean) as number[];
      const yearsEnd = matchingCars.map(c => c.yearEnd).filter(Boolean) as number[];
      const minYear = years.length > 0 ? Math.min(...years) : null;
      const maxYear = yearsEnd.length > 0 ? Math.max(...yearsEnd) : (years.length > 0 ? Math.max(...years) : null);

      res.json({
        chassis: matchingCars[0].chassis,
        carCount: matchingCars.length,
        totalParts,
        yearStart: minYear,
        yearEnd: maxYear,
        cars: matchingCars.map(c => ({
          id: c.id,
          displayName: c.displayName,
          slug: c.slug,
          engine: c.engine,
          bodyType: c.bodyType,
          yearStart: c.yearStart,
          yearEnd: c.yearEnd,
          totalParts: c.totalParts,
          series: c.series,
          imageUrl: c.imageUrl,
          totalCategories: c.totalCategories,
          totalSubcategories: c.totalSubcategories,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------- RealOEM Backfill (Task #87) ----------------
  // Single-button "fill in everything we're missing from RealOEM" flow.
  // Replaces the previous audit→approve workflow. All endpoints are
  // admin-only; the runner uses the shared daily Oxylabs budget.

  app.get("/api/admin/realoem-backfill/status", requireAdminOrProvisionKey, async (_req, res) => {
    res.json(realoemBackfill.getBackfillState());
  });

  // Build typed BackfillRunOptions from a raw request body, enforcing
  // strict scope-enum validation at the API boundary so a malformed
  // `scope` can never silently fall through to the "all" branch and
  // burn the entire daily proxy budget.
  function parseBackfillOpts(
    body: unknown,
    extras: { fixtureOnly?: boolean; forceRefetch?: boolean; freshnessHours?: number } = {},
  ): realoemBackfill.BackfillRunOptions {
    const b: Record<string, unknown> = (body && typeof body === "object") ? body as Record<string, unknown> : {};
    const rawScope = b.scope;
    if (!realoemBackfill.isBackfillScope(rawScope)) {
      throw new Error(`scope must be one of ${realoemBackfill.BACKFILL_SCOPES.join("|")}`);
    }
    const carId = b.carId != null ? parseInt(String(b.carId), 10) : undefined;
    const chassis = typeof b.chassis === "string" && b.chassis.trim() ? b.chassis.trim().toUpperCase() : undefined;
    return { scope: rawScope, carId, chassis, ...extras };
  }

  app.post("/api/admin/realoem-backfill/estimate", requireAdminOrProvisionKey, async (req, res) => {
    try {
      const opts = parseBackfillOpts(req.body);
      const estimate = await realoemBackfill.estimateBackfill(opts);
      res.json({ ok: true, ...estimate });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/admin/realoem-backfill/run", requireAdminOrProvisionKey, async (req, res) => {
    try {
      const b: Record<string, unknown> = (req.body && typeof req.body === "object") ? req.body : {};
      const opts = parseBackfillOpts(req.body, {
        fixtureOnly: !!b.fixtureOnly,
        forceRefetch: !!b.forceRefetch,
        freshnessHours: b.freshnessHours != null ? parseInt(String(b.freshnessHours), 10) : undefined,
      });
      // Pre-validate so the UI gets a proper 4xx instead of started:true
      // on a run that would reject immediately (already running, empty
      // chassis, missing carId).
      try {
        await realoemBackfill.preflightBackfill(opts);
      } catch (preflightErr) {
        return res.status(400).json({ error: preflightErr instanceof Error ? preflightErr.message : String(preflightErr) });
      }
      const promise = realoemBackfill.runBackfill(opts);
      if (req.query.wait === "1") {
        const summary = await promise;
        return res.json({ ok: true, summary });
      }
      promise.catch((err) => {
        console.error("[RealoemBackfill] background run failed:", err);
        try { realoemBackfill.recordBackgroundFailure(err instanceof Error ? err.message : String(err)); } catch {}
      });
      res.json({ ok: true, started: true, status: realoemBackfill.getBackfillState() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/admin/realoem-backfill/cancel", requireAdminOrProvisionKey, async (_req, res) => {
    const cancelled = realoemBackfill.cancelBackfill();
    res.json({ ok: true, cancelled });
  });

  app.get("/api/admin/realoem-backfill/runs", requireAdminOrProvisionKey, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const runs = await realoemBackfill.listBackfillRuns(limit);
      res.json({ runs });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/admin/realoem-backfill/runs/:id/inserts.csv", requireAdminOrProvisionKey, async (req, res) => {
    try {
      const runId = parseInt(String((req.params["id"] as string)), 10);
      if (!Number.isFinite(runId)) return res.status(400).json({ error: "invalid run id" });
      const csv = await realoemBackfill.exportRunCsv(runId);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="realoem-backfill-run-${runId}.csv"`);
      res.send(csv);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---------------- RealOEM Backfill — Cross-variant dedup (Task #101) ----------------
  // Read-only dry-run report: takes a chassis code and returns the
  // projected proxy-budget cut from the (chassis, diag_id) canonical
  // store. Operators use this BEFORE kicking off a backfill to confirm
  // the safe-list is sane for their chassis. Pure read — never spends
  // an Oxylabs request.
  //
  // Optional `?seedFromCache=1` first walks the local HTML cache and
  // upserts canonical rows for any diagrams already on disk so the
  // preview reflects "what we already have for free", not just what
  // prior backfill runs happened to populate.
  app.get("/api/admin/realoem-backfill/dedup-preview", requireAdminOrProvisionKey, async (req, res) => {
    try {
      const chassis = typeof req.query.chassis === "string" ? req.query.chassis.trim() : "";
      if (!chassis) return res.status(400).json({ error: "chassis is required (e.g. ?chassis=F34)" });
      // `freshHours` lets the operator preview savings under the same
      // freshness window the upcoming backfill will use, so stale
      // canonical rows aren't double-counted as free clones.
      const freshHoursRaw = req.query.freshHours;
      const freshHours = typeof freshHoursRaw === "string" && freshHoursRaw.trim() !== ""
        ? parseInt(freshHoursRaw, 10)
        : undefined;
      const { buildDedupPreview, seedCanonicalFromCache } = await import("./realoem-diagram-canonical");
      let seedReport: Awaited<ReturnType<typeof seedCanonicalFromCache>> | null = null;
      if (req.query.seedFromCache === "1") {
        seedReport = await seedCanonicalFromCache();
      }
      const preview = await buildDedupPreview(chassis, { freshHours });
      res.json({ ok: true, preview, seedFromCache: seedReport });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // List the chassis universe so the UI can render a chassis picker
  // for the dry-run endpoint without enumerating every car row.
  app.get("/api/admin/realoem-backfill/dedup-chassis", requireAdminOrProvisionKey, async (_req, res) => {
    try {
      const { listChassisWithObservations } = await import("./realoem-diagram-canonical");
      const chassis = await listChassisWithObservations();
      res.json({ ok: true, chassis });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Task #165 — Catalog coverage summary (powers the chain watcher and
  // the admin dashboard card). Returns per-chassis breakdown of covered /
  // pending / skipped chassis plus total parts count.
  app.get("/api/admin/catalog-coverage", requireAdminOrProvisionKey, async (_req, res) => {
    try {
      // Chassis-level aggregation: a chassis is "covered" if at least one
      // of its cars has total_parts > 0, "skipped" if ALL cars are
      // realoem_skip = true, otherwise "pending".
      type ChassisRow = { chassis: string; car_count: number; skip_count: number; parts_total: number };
      const chassisResult = await db.execute(sql`
        SELECT
          chassis,
          COUNT(*)::int                                         AS car_count,
          SUM(CASE WHEN realoem_skip THEN 1 ELSE 0 END)::int   AS skip_count,
          COALESCE(SUM(total_parts), 0)::int                    AS parts_total
        FROM cars
        WHERE chassis IS NOT NULL AND chassis <> ''
        GROUP BY chassis
      `);

      const totalPartsResult = await db.execute(sql`SELECT COALESCE(SUM(total_parts),0)::int AS n FROM cars`);
      const totalParts = Number((totalPartsResult.rows[0] as { n: number } | undefined)?.n ?? 0);

      const chassis = chassisResult.rows as ChassisRow[];

      let covered = 0;
      let skipped = 0;
      let pending = 0;
      const breakdown: { chassis: string; status: string; parts: number; carCount: number }[] = [];

      for (const r of chassis) {
        const hasParts = r.parts_total > 0;
        const allSkipped = r.skip_count >= r.car_count;
        let status: string;
        if (hasParts) { status = "covered"; covered++; }
        else if (allSkipped) { status = "skipped"; skipped++; }
        else { status = "pending"; pending++; }
        breakdown.push({ chassis: r.chassis, status, parts: r.parts_total, carCount: r.car_count });
      }

      const total = chassis.length;
      const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
      const complete = pending === 0;

      // Throughput-based ETA: look at the last 10 completed chassis-scoped
      // backfill runs to compute average parts-per-minute, then estimate
      // how long the remaining pending chassis will take.
      let etaMinutes: number | null = null;
      let completedAt: string | null = null;
      if (complete) {
        // Find the most recent time all chassis were covered.
        const latestRow = await db.execute(sql`
          SELECT MAX(completed_at)::text AS at FROM background_jobs
          WHERE job_type = 'realoem_backfill' AND status = 'completed'
        `);
        completedAt = ((latestRow.rows[0] as { at: string } | undefined)?.at) ?? null;
      } else if (pending > 0) {
        // Average parts-per-second from last 10 completed chassis-scoped runs.
        type RunRow = { duration_ms: number; parts: number };
        const recentRunsResult = await db.execute(sql`
          SELECT
            EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 AS duration_ms,
            COALESCE((progress->>'partsInserted')::int, 0) AS parts
          FROM background_jobs
          WHERE job_type = 'realoem_backfill'
            AND status = 'completed'
            AND (progress->>'scope') = 'chassis'
            AND completed_at IS NOT NULL
            AND started_at IS NOT NULL
          ORDER BY completed_at DESC
          LIMIT 10
        `);
        const runs = recentRunsResult.rows as RunRow[];
        if (runs.length > 0) {
          const avgPartsPerMs = runs.reduce((sum, r) => {
            const ms = Number(r.duration_ms);
            const p = Number(r.parts);
            return sum + (ms > 0 && p > 0 ? p / ms : 0);
          }, 0) / runs.length;
          if (avgPartsPerMs > 0) {
            // Rough estimate: remaining chassis × avg parts per chassis / throughput
            const avgPartsPerChassis = totalParts / Math.max(covered, 1);
            const estimatedMs = pending * avgPartsPerChassis / avgPartsPerMs;
            etaMinutes = Math.round(estimatedMs / 60_000);
          }
        }
      }

      // Determine if a backfill is currently in-progress on any chassis.
      const liveState = realoemBackfill.getBackfillState();
      const inProgress = liveState.running ? 1 : 0;

      res.json({
        ok: true,
        total,
        covered,
        pending,
        skipped,
        inProgress,
        totalParts,
        pct,
        breakdown,
        complete,
        completedAt,
        etaMinutes,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ETK uncovered chassis backfill — scrape the ~57 BMW car chassis that have
  // total_parts = 0 and a valid catalog_url but were never reached by the
  // RealOEM chain backfill. Uses the existing ETK scraper via Evomi Core/Premium.
  // Motorcycle (K*, R1*, R2*, R5*, R6*, RR*) and Motorrad-series cars are excluded.

  app.get("/api/admin/etk-uncovered-backfill/status", requireAdmin, async (_req, res) => {
    try {
      const { getState, getUncoveredCars } = await import("./etk-uncovered-backfill");
      const state = getState();
      const uncovered = await getUncoveredCars();
      res.json({ ok: true, ...state, uncoveredCount: uncovered.length });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/admin/etk-uncovered-backfill/start", requireAdmin, async (_req, res) => {
    try {
      const { startEtkUncoveredBackfill } = await import("./etk-uncovered-backfill");
      const result = await startEtkUncoveredBackfill();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/admin/etk-uncovered-backfill/cancel", requireAdmin, async (_req, res) => {
    try {
      const { cancelEtkUncoveredBackfill } = await import("./etk-uncovered-backfill");
      const result = cancelEtkUncoveredBackfill();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Task #165 — Mark all cars for a given chassis as realoem_skip = true.
  // Called by the chain script when the backfill server aborts a chassis
  // due to EMPTY_LANDING_ABORT_THRESHOLD (5 consecutive empty cars).
  app.post("/api/admin/realoem-backfill/mark-skip", requireAdminOrProvisionKey, async (req, res) => {
    try {
      const { chassis } = req.body || {};
      if (!chassis || typeof chassis !== "string") {
        return res.status(400).json({ error: "chassis is required" });
      }
      const upper = chassis.trim().toUpperCase();
      const result = await db.execute(sql`
        WITH u AS (
          UPDATE cars SET realoem_skip = true
          WHERE chassis = ${upper} AND realoem_skip = false
          RETURNING 1
        )
        SELECT COUNT(*)::int AS n FROM u
      `);
      const updated = Number((result.rows[0] as { n: number } | undefined)?.n ?? 0);
      console.log(`[catalog-coverage] mark-skip: chassis=${upper} updated=${updated} cars`);
      res.json({ ok: true, chassis: upper, updated });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Task #105 — Per-part-page chassis appearance harvest: status,
  // start, and coverage analysis. The harvest reads the rich
  // "Part X was found on the following vehicles:" block from
  // `/bmw/enUS/part?id=…&q=…` and populates `part_chassis_appearances`.
  app.get("/api/admin/part-appearances/status", requireAdminOrProvisionKey, async (_req, res) => {
    try {
      const { getHarvestStatus, getAppearanceStats } = await import("./realoem-part-appearance-harvester");
      const status = getHarvestStatus();
      const stats = await getAppearanceStats();
      res.json({ ok: true, status, stats });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/admin/part-appearances/start", requireAdminOrProvisionKey, async (req, res) => {
    try {
      const freshHoursRaw = req.body?.freshHours ?? req.query.freshHours;
      const freshHours = typeof freshHoursRaw === "number"
        ? freshHoursRaw
        : (typeof freshHoursRaw === "string" && freshHoursRaw.trim() !== "" ? parseInt(freshHoursRaw, 10) : undefined);
      const { startPartAppearanceHarvest, getHarvestStatus } = await import("./realoem-part-appearance-harvester");
      // Fire-and-forget — the job loop checkpoints to background_jobs
      // and the /status endpoint exposes live progress. We never block
      // the HTTP request on the harvest itself.
      void startPartAppearanceHarvest({ freshHours }).catch((e) => {
        console.error(`[part-appearance] background harvest failed: ${e instanceof Error ? e.message : String(e)}`);
      });
      res.json({ ok: true, started: true, status: getHarvestStatus() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/admin/part-appearances/cancel", requireAdminOrProvisionKey, async (_req, res) => {
    try {
      const { cancelHarvest, getHarvestStatus } = await import("./realoem-part-appearance-harvester");
      cancelHarvest();
      res.json({ ok: true, status: getHarvestStatus() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ===========================================================================
  // Quick Servicing Info (Task #106)
  // ===========================================================================
  // Public:  GET  /api/servicing/:vin            — fluids+filters payload
  //          POST /api/servicing/coverage-request — record unsupported combos
  // Admin:   GET  /api/admin/servicing            — coverage dashboard
  //          GET  /api/admin/servicing/:chassis/:engine
  //          PUT  /api/admin/servicing/:chassis/:engine/fluid/:fluidKey
  //          PUT  /api/admin/servicing/:chassis/:engine/filter/:filterKey
  //          DEL  /api/admin/servicing/:chassis/:engine/filter/:filterKey
  //          POST /api/admin/servicing/:chassis/:engine/ai-draft
  //          GET  /api/admin/servicing/coverage-requests
  {
    const { decodeVin } = await import("./vin-decoder");
    const svc = await import("./servicing-service");
    const {
      SERVICING_FLUID_KEYS, SERVICING_FILTER_KEYS,
      insertServicingCoverageRequestSchema,
    } = await import("@shared/schema");

    const fluidKeySet = new Set<string>(SERVICING_FLUID_KEYS as readonly string[]);
    const filterKeySet = new Set<string>(SERVICING_FILTER_KEYS as readonly string[]);

    app.get("/api/servicing/:vin", async (req, res) => {
      try {
        const vin = String((req.params["vin"] as string) || "").trim().toUpperCase();
        if (vin.length !== 17) return res.status(400).json({ error: "VIN must be 17 characters" });
        const decoded = await decodeVin(vin);
        if (!decoded.chassis || !decoded.engine) {
          return res.json({
            vin, chassis: decoded.chassis, engine: decoded.engine,
            modelName: decoded.modelName,
            fluids: [], filters: [],
            hasAnyAiDraft: false, hasAnyData: false,
            decodeError: !decoded.isBmw
              ? "VIN does not appear to be a BMW."
              : "Could not determine chassis + engine for this VIN.",
          });
        }
        const payload = await svc.resolveServicingForCarKey({
          vin, chassis: decoded.chassis, engine: decoded.engine,
          modelName: decoded.modelName,
          modelYear: decoded.modelYear ?? null,
        });
        res.json(payload);
      } catch (err: any) {
        console.error("[servicing] /api/servicing/:vin error:", err);
        res.status(500).json({ error: err?.message || "Internal error" });
      }
    });

    app.post("/api/servicing/coverage-request", async (req, res) => {
      try {
        const parsed = insertServicingCoverageRequestSchema.parse(req.body || {});
        await svc.recordCoverageRequest({
          chassis: parsed.chassis, engine: parsed.engine,
          vin: parsed.vin ?? null, email: parsed.email ?? null,
        });
        res.json({ ok: true });
      } catch (err: any) {
        res.status(400).json({ error: err?.message || "Invalid request" });
      }
    });

    app.get("/api/admin/servicing", requireAdmin, async (_req, res) => {
      try {
        const coverage = await svc.listAdminCoverage(200);
        res.json({ coverage });
      } catch (err: any) {
        res.status(500).json({ error: err?.message || "Internal error" });
      }
    });

    app.get("/api/admin/servicing/coverage-requests", requireAdmin, async (_req, res) => {
      try {
        const requests = await svc.listCoverageRequests(500);
        res.json({ requests });
      } catch (err: any) {
        res.status(500).json({ error: err?.message || "Internal error" });
      }
    });

    app.get("/api/admin/servicing/:chassis/:engine", requireAdmin, async (req, res) => {
      try {
        const chassis = String((req.params["chassis"] as string)).toUpperCase();
        const engine = String((req.params["engine"] as string)).toUpperCase();
        const payload = await svc.resolveServicingForCarKey({ vin: null, chassis, engine });
        res.json(payload);
      } catch (err: any) {
        res.status(500).json({ error: err?.message || "Internal error" });
      }
    });

    type FluidUpdateBody = {
      status?: "verified" | "ai_draft" | "empty";
      capacityMl?: number | string | null;
      grade?: string | null;
      notes?: string | null;
      verifiedBy?: string | null;
      verifiedAt?: string | null;
    };
    type FilterUpdateBody = {
      status?: "verified" | "ai_draft";
      partNumber?: string;
      note?: string | null;
    };
    // Persist verifier as the user **id** for audit fidelity (column is text).
    const adminUserIdOf = (req: { user?: { id?: string } }): string | null => {
      return req.user?.id ?? null;
    };
    type LocalFilterKey = "engine_oil" | "cabin" | "air" | "fuel" | "transmission";
    type LocalFluidsMap = Record<string, unknown>;

    app.put("/api/admin/servicing/:chassis/:engine/fluid/:fluidKey", requireAdmin, async (req, res) => {
      try {
        const chassis = String((req.params["chassis"] as string)).toUpperCase();
        const engine = String((req.params["engine"] as string)).toUpperCase();
        const fluidKey = String((req.params["fluidKey"] as string));
        if (!fluidKeySet.has(fluidKey)) return res.status(400).json({ error: "Unknown fluid key" });
        const body = (req.body || {}) as FluidUpdateBody;
        const status = body.status === "verified" ? "verified" : body.status === "ai_draft" ? "ai_draft" : "empty";
        const adminUserId = adminUserIdOf(req);
        const current = await svc.loadSpecsRow(chassis, engine);
        const next: Record<string, unknown> = { ...current };
        if (status === "empty") {
          delete next[fluidKey];
        } else {
          next[fluidKey] = {
            capacityMl: body.capacityMl == null || body.capacityMl === "" ? null : Number(body.capacityMl),
            grade: body.grade ? String(body.grade) : null,
            notes: body.notes ? String(body.notes) : null,
            status,
            verifiedBy: status === "verified" ? adminUserId : (body.verifiedBy ?? null),
            verifiedAt: status === "verified" ? new Date().toISOString() : (body.verifiedAt ?? null),
          };
        }
        await svc.upsertSpecsRow(chassis, engine, next as LocalFluidsMap as Parameters<typeof svc.upsertSpecsRow>[2]);
        res.json({ ok: true, fluids: next });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invalid request" });
      }
    });

    app.put("/api/admin/servicing/:chassis/:engine/filter/:filterKey", requireAdmin, async (req, res) => {
      try {
        const chassis = String((req.params["chassis"] as string)).toUpperCase();
        const engine = String((req.params["engine"] as string)).toUpperCase();
        const filterKeyRaw = String((req.params["filterKey"] as string));
        if (!filterKeySet.has(filterKeyRaw)) return res.status(400).json({ error: "Unknown filter key" });
        const filterKey = filterKeyRaw as LocalFilterKey as Parameters<typeof svc.upsertFilterPin>[0]["filterKey"];
        const body = (req.body || {}) as FilterUpdateBody;
        const partNumber = String(body.partNumber || "").trim();
        if (!partNumber) return res.status(400).json({ error: "partNumber is required" });
        const status = body.status === "verified" ? "verified" : "ai_draft";
        const adminUserId = adminUserIdOf(req);
        await svc.upsertFilterPin({
          chassis, engine, filterKey, partNumber,
          note: body.note ? String(body.note) : null,
          status, verifiedBy: status === "verified" ? adminUserId : null,
        });
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invalid request" });
      }
    });

    app.delete("/api/admin/servicing/:chassis/:engine/filter/:filterKey", requireAdmin, async (req, res) => {
      try {
        const chassis = String((req.params["chassis"] as string)).toUpperCase();
        const engine = String((req.params["engine"] as string)).toUpperCase();
        const filterKeyRaw = String((req.params["filterKey"] as string));
        if (!filterKeySet.has(filterKeyRaw)) return res.status(400).json({ error: "Unknown filter key" });
        await svc.deleteFilterPin(chassis, engine, filterKeyRaw as Parameters<typeof svc.deleteFilterPin>[2]);
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invalid request" });
      }
    });

    app.post("/api/admin/servicing/:chassis/:engine/ai-draft", requireAdmin, async (req, res) => {
      try {
        const chassis = String((req.params["chassis"] as string)).toUpperCase();
        const engine = String((req.params["engine"] as string)).toUpperCase();
        const modelName = req.body?.modelName ? String(req.body.modelName) : null;
        const draft = await svc.generateAiDraft(chassis, engine, modelName);
        const current = await svc.loadSpecsRow(chassis, engine);
        const currentMap = current as Record<string, { status?: string }>;
        const nextFluids: Record<string, unknown> = { ...current };
        if (draft.fluids) {
          for (const k of SERVICING_FLUID_KEYS) {
            const f = draft.fluids[k];
            if (!f) continue;
            // Only overwrite empty / existing ai_draft slots — never clobber a verified entry.
            const existing = currentMap[k];
            if (existing?.status === "verified") continue;
            nextFluids[k] = {
              capacityMl: typeof f.capacityMl === "number" ? f.capacityMl : null,
              grade: f.grade ?? null,
              notes: f.notes ?? null,
              status: "ai_draft",
              verifiedBy: null,
              verifiedAt: null,
            };
          }
          await svc.upsertSpecsRow(chassis, engine, nextFluids as Parameters<typeof svc.upsertSpecsRow>[2]);
        }
        if (draft.filters) {
          const pins = await svc.loadFilterPins(chassis, engine);
          const verifiedKeys = new Set(pins.filter(p => p.status === "verified").map(p => p.filterKey));
          for (const fk of SERVICING_FILTER_KEYS) {
            const fdraft = draft.filters[fk];
            if (!fdraft?.partNumber) continue;
            if (verifiedKeys.has(fk)) continue;
            await svc.upsertFilterPin({
              chassis, engine, filterKey: fk,
              partNumber: String(fdraft.partNumber),
              note: fdraft.note ?? null,
              status: "ai_draft",
              verifiedBy: null,
            });
          }
        }
        const payload = await svc.resolveServicingForCarKey({ vin: null, chassis, engine });
        res.json({ ok: true, draft, payload });
      } catch (err) {
        console.error("[servicing] ai-draft error:", err);
        res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
      }
    });
  }

  // ---- ISTA+ 4.59.x import endpoints (Task #124) ---------------------------
  async function getIstaRowCounts() {
    const tableNames = ["ista_ecu_parts", "sa_codes", "paint_codes", "upholstery_codes"] as const;
    const counts: Record<string, number> = {};
    for (const tbl of tableNames) {
      try {
        const r = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM ${tbl}`));
        counts[tbl] = Number((r.rows?.[0] as any)?.c ?? 0);
      } catch {
        counts[tbl] = 0;
      }
    }
    return counts;
  }

  app.get("/api/admin/ista/status", requireAdmin, async (_req, res) => {
    try {
      const { getLatestJob } = await import("./job-manager");
      const job = await getLatestJob("ista_import");
      const progress = (job?.progress ?? {}) as any;

      // Global DB totals (shared tables — not ISTA-exclusive counts)
      const dbTotals = await getIstaRowCounts();

      // ISTA-contributed counts come from the structured summary embedded in
      // job progress at import time (not live COUNT(*) which includes rows from
      // other sources).  Falls back to zero when no import has completed.
      const istaContributed: Record<string, number> = progress.tableCounts ?? {};

      // Per-package telemetry recorded by the import script
      const packageTelemetry: any[] = progress.packageTelemetry ?? [];

      // Static package inventory enriched with any per-package telemetry
      const staticPackages = [
        { name: "BMW_ISPI_ISTA-BLP_4.59.10.istapackage",         type: "BLP (KIS.script)",      category: "kis",    description: "21 BRV chassis groups, ECU×part mapping" },
        { name: "BMW_ISPI_ISTA_DELTA-SDP_4.59.11.istapackage",   type: "SDP-DELTA (KIS.script)", category: "kis",    description: "SDP 4.59.11 delta KIS.script updates" },
        { name: "BMW_ISPI_ISTA-DATA_GLOBAL_4.59.12.istapackage", type: "DATA GLOBAL (SQLite)",   category: "sqlite", description: "DiagDocDb, streamdataprimitive_OTHER, ConWoyDb" },
        { name: "BMW_ISPI_ISTA-DATA_en-US_4.59.12.istapackage",  type: "DATA en-US (SQLite)",    category: "sqlite", description: "streamdataprimitive_ENUS, xmlvalueprimitive_ENUS" },
        { name: "BMW_ISPI_ISTA-META_4.59.14.xml",                 type: "META",                   category: "meta",   description: "Package manifest — reference only" },
        { name: "BMW_ISPI_ISTA-META_SDP_4.59.10.xml",             type: "META SDP 4.59.10",       category: "meta",   description: "SDP manifest — reference only" },
        { name: "BMW_ISPI_ISTA-META_SDP_4.59.11.xml",             type: "META SDP 4.59.11",       category: "meta",   description: "SDP manifest — reference only" },
      ];
      const telemetryByName = Object.fromEntries(packageTelemetry.map((p: any) => [p.name, p]));
      const packages = staticPackages.map(pkg => ({
        ...pkg,
        ...(telemetryByName[pkg.name] ?? {}),
      }));

      res.json({
        version: "4.59.12",
        lastRunAt: job?.completedAt ?? null,
        lastRunStatus: job?.status ?? null,
        jobId: job?.id ?? null,
        progress,
        // ISTA-contributed counts (rows written by the most recent ISTA import)
        istaContributed,
        // Global DB totals for context (include rows from all sources)
        dbTotals,
        brvCoverage: progress.brvCoverage ?? {},
        packages,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/ista/import", requireAdmin, async (_req, res) => {
    try {
      const { createJob, completeJob, failJob: failBgJob, getActiveJob } = await import("./job-manager");

      const active = await getActiveJob("ista_import");
      if (active) {
        return res.status(409).json({ error: "An ISTA import is already running", jobId: active.id });
      }

      const job = await createJob("ista_import", {
        phase: "starting",
        kisFilesParsed: 0,
        sqliteExtracted: 0,
        upserted: 0,
        startedAt: new Date().toISOString(),
      });

      res.json({ ok: true, jobId: job.id, message: "ISTA import started in background" });

      // Fire-and-forget background import
      (async () => {
        try {
          const { mergeJobProgress } = await import("./job-manager");
          const { spawn } = await import("child_process");
          const scriptPath = path.join(process.cwd(), "scripts", "import_ista.mjs");
          const child = spawn("node", [scriptPath], {
            env: { ...process.env },
            stdio: ["ignore", "pipe", "pipe"],
          });

          let stdout = "";
          let stderr = "";
          child.stdout?.on("data", (d: Buffer) => {
            const chunk = d.toString();
            stdout += chunk;
            // Merge phase transitions without clobbering other progress keys
            const phases = [
              { pattern: /Listing packages/, phase: "listing packages" },
              { pattern: /Processing SQLite package/, phase: "extracting SQLite files" },
              { pattern: /Processing KIS package/, phase: "extracting KIS scripts" },
              { pattern: /Parsing .* KIS\.script/, phase: "parsing KIS scripts" },
              { pattern: /Profiling extracted/, phase: "profiling SQLite tables" },
              { pattern: /Importing SA\/paint/, phase: "importing SA/paint/upholstery codes" },
              { pattern: /=== Import summary ===/, phase: "finalising" },
            ];
            for (const { pattern, phase } of phases) {
              if (pattern.test(chunk)) {
                mergeJobProgress(job.id, { phase }).catch(() => {});
                break;
              }
            }
            // Match "KIS.script files parsed: N"
            const kisMatch = chunk.match(/KIS\.script files parsed: (\d+)/);
            if (kisMatch) {
              mergeJobProgress(job.id, { kisFilesParsed: parseInt(kisMatch[1]) }).catch(() => {});
            }
            // Match "Total upserted: N"
            const upsertMatch = chunk.match(/Total upserted: (\d+)/);
            if (upsertMatch) {
              mergeJobProgress(job.id, { upserted: parseInt(upsertMatch[1]) }).catch(() => {});
            }
          });
          child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

          await new Promise<void>((resolve, reject) => {
            child.on("close", (code) => {
              if (code === 0) resolve();
              else reject(new Error(`Import process exited with code ${code}. stderr: ${stderr.slice(-500)}`));
            });
            child.on("error", reject);
          });

          // Extract the structured summary JSON line emitted by the import script.
          // Format: [ISTA-SUMMARY-JSON] {...}
          // This carries ISTA-contributed row counts, per-BRV chassis coverage,
          // and per-package telemetry — not global DB totals.
          const summaryLineMatch = stdout.match(/\[ISTA-SUMMARY-JSON\] ({.+})/);
          const summaryJson = summaryLineMatch ? (() => { try { return JSON.parse(summaryLineMatch[1]); } catch { return {}; } })() : {};

          const finalProgress: any = {
            phase: "complete",
            completedAt: new Date().toISOString(),
            stdout: stdout.slice(-3000),
            // ISTA-contributed row counts per destination table
            tableCounts: summaryJson.tableCounts ?? {},
            // Per-BRV chassis coverage (ECU-part rows per BRV code)
            brvCoverage: summaryJson.brvCoverage ?? {},
            // Per-package import telemetry
            packageTelemetry: summaryJson.packageTelemetry ?? [],
          };
          if (summaryJson.totalUpserted !== undefined) finalProgress.upserted = summaryJson.totalUpserted;

          await completeJob(job.id, finalProgress);
          console.log(`[ISTA Import] Job #${job.id} completed`);
        } catch (e: any) {
          console.error(`[ISTA Import] Job #${job.id} failed:`, e.message);
          await failBgJob(job.id, e.message, {
            phase: "failed",
            completedAt: new Date().toISOString(),
          }).catch(() => {});
        }
      })();
    } catch (err: any) {
      console.error("[ISTA Import] Failed to start:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/ista/import/dry-run", requireAdmin, async (_req, res) => {
    try {
      const { getActiveJob } = await import("./job-manager");
      const active = await getActiveJob("ista_import");
      if (active) {
        return res.status(409).json({ error: "An ISTA import is already running", jobId: active.id });
      }

      const { createJob, completeJob, failJob: failBgJob } = await import("./job-manager");
      const job = await createJob("ista_import", { phase: "dry-run starting" });
      res.json({ ok: true, jobId: job.id, message: "Dry-run started" });

      (async () => {
        try {
          const { spawn } = await import("child_process");
          const scriptPath = path.join(process.cwd(), "scripts", "import_ista.mjs");
          const child = spawn("node", [scriptPath, "--dry-run"], {
            env: { ...process.env },
            stdio: ["ignore", "pipe", "pipe"],
          });
          let out = "";
          child.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
          await new Promise<void>((r, j) => {
            child.on("close", code => code === 0 ? r() : j(new Error(`exit ${code}`)));
            child.on("error", j);
          });
          await completeJob(job.id, { phase: "dry-run complete", stdout: out.slice(-3000) });
        } catch (e: any) {
          await failBgJob(job.id, e.message, { phase: "dry-run failed" }).catch(() => {});
        }
      })();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/part-appearances/coverage", requireAdminOrProvisionKey, async (req, res) => {
    try {
      const chassis = typeof req.query.chassis === "string" ? req.query.chassis.trim() : "";
      if (!chassis) return res.status(400).json({ error: "chassis is required (e.g. ?chassis=F30)" });
      const { getChassisCoverage } = await import("./realoem-part-appearance-harvester");
      const coverage = await getChassisCoverage(chassis);
      res.json({ ok: true, coverage });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // ISTA quarterly auto-ingest worker (Task #109).
  // ---------------------------------------------------------------------------
  app.get("/api/admin/ista/runs", requireAdmin, async (_req, res) => {
    try {
      const runs = await storage.listIstaIngestRuns(50);
      const { listBucketPackages } = await import("./ista/ingest-worker");
      const { getIstaSchedulerStatus } = await import("./ista/scheduler");
      let bucketPackages: { bucketKey: string; version: string; ingested: boolean }[] = [];
      let bucketError: string | null = null;
      try {
        const pkgs = await listBucketPackages();
        bucketPackages = await Promise.all(pkgs.map(async (p) => ({
          ...p,
          ingested: await storage.hasSuccessfulIstaIngestForVersion(p.version),
        })));
      } catch (err: any) {
        bucketError = err?.message || String(err);
      }
      res.json({
        runs,
        latest: runs[0] || null,
        bucketPackages,
        bucketError,
        scheduler: getIstaSchedulerStatus(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.post("/api/admin/ista/runs", requireAdmin, async (req: any, res) => {
    try {
      const bucketKey = typeof req.body?.bucketKey === "string" ? req.body.bucketKey.trim() : "";
      const force = !!req.body?.force;
      if (!bucketKey) return res.status(400).json({ error: "bucketKey is required" });
      const { ingestPackage } = await import("./ista/ingest-worker");
      // Don't await — long-running. The admin page polls /runs to see progress.
      ingestPackage({
        bucketKey,
        trigger: "manual",
        triggeredBy: req.user?.id || null,
        force,
      }).catch((err) => console.error("[ISTA/Routes] manual ingest failed:", err));
      res.json({ ok: true, message: `Ingest queued for ${bucketKey}` });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.post("/api/admin/ista/scan", requireAdmin, async (_req, res) => {
    try {
      const { scanAndIngestNewPackages } = await import("./ista/ingest-worker");
      // Fire and forget so the admin gets immediate feedback.
      scanAndIngestNewPackages().catch((err) =>
        console.error("[ISTA/Routes] manual scan failed:", err)
      );
      res.json({ ok: true, message: "Bucket scan queued" });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // bimmer.work bulk VIN discovery (Task #166)
  // ---------------------------------------------------------------------------

  app.post("/api/admin/bimmerwork/bulk-discover", requireAdmin, async (req, res) => {
    try {
      const { getActiveJob, createJob, mergeJobProgress, completeJob, failJob } = await import("./job-manager");

      const existing = await getActiveJob("bimmerwork_bulk_discover");
      if (existing) {
        return res.status(409).json({ error: "A bulk-discover job is already running", job: existing });
      }

      const maxPagesPerEngine = Math.min(
        parseInt(String(req.body?.maxPagesPerEngine ?? "50"), 10) || 50,
        200,
      );

      const job = await createJob("bimmerwork_bulk_discover", {
        discovered: 0,
        processed: 0,
        skipped: 0,
        failed: 0,
        maxPagesPerEngine,
        phase: "discovering",
      });

      res.status(202).json({ job });

      // Fire and forget — runs in the background
      (async () => {
        const {
          discoverAllBimmerWorkHashes,
          resolveVinFromBimmerWorkHash,
          bulkFetchBimmerWorkFromHtml,
        } = await import("./bimmer-work-scraper");
        const { promoteFactoryOptions } = await import("./vin-enrichment-service");
        const { db: database } = await import("./storage");
        const { vinCache: vinCacheTable } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");

        // Fail fast if no proxy credentials are present.
        const isProxyConfigured = !!(
          (process.env.EVOMI_PROXY_HOST && process.env.EVOMI_PROXY_USERNAME && process.env.EVOMI_PROXY_PASSWORD) ||
          (process.env.OXYLABS_USERNAME && process.env.OXYLABS_PASSWORD)
        );
        if (!isProxyConfigured) {
          await failJob(job.id, "No proxy configured; bulk-discover requires a proxy (EVOMI_PROXY_* or OXYLABS_*)", { discovered: 0, processed: 0, skipped: 0, failed: 0, phase: "failed" });
          console.error("[BW Bulk] Aborted: no proxy is configured");
          return;
        }

        // VINs with bimmerwork data cached within this window are skipped.
        const FRESH_TTL_MS = 30 * 24 * 60 * 60_000; // 30 days

        let discovered = 0;
        let processed = 0;
        let skipped = 0;
        let failed = 0;

        const CONCURRENCY = 3;

        async function processHash(hash: string): Promise<void> {
          try {
            // Resolve VIN from the main page, reusing the already-fetched HTML.
            // Passes strict:true — proxy-only, throws if proxy absent (already
            // checked above, but this provides defence-in-depth).
            const resolved = await resolveVinFromBimmerWorkHash(hash, { strict: true });
            if (!resolved) {
              failed++;
              await mergeJobProgress(job.id, { discovered, processed, skipped, failed });
              return;
            }
            const { vin, html: mainHtml } = resolved;

            // Skip if a fresh bimmerwork row already exists for this VIN.
            const [existing] = await database
              .select({ bimmerworkHash: vinCacheTable.bimmerworkHash, source: vinCacheTable.source, updatedAt: vinCacheTable.updatedAt })
              .from(vinCacheTable)
              .where(eq(vinCacheTable.vin, vin));

            if (
              existing?.bimmerworkHash &&
              existing.source === "bimmerwork" &&
              existing.updatedAt &&
              Date.now() - new Date(existing.updatedAt).getTime() < FRESH_TTL_MS
            ) {
              // Already fresh — just correct the hash if it changed.
              if (existing.bimmerworkHash !== hash) {
                await database.update(vinCacheTable)
                  .set({ bimmerworkHash: hash, updatedAt: new Date() })
                  .where(eq(vinCacheTable.vin, vin));
              }
              skipped++;
              await mergeJobProgress(job.id, { discovered, processed, skipped, failed });
              return;
            }

            // Fetch options/images/manuals via proxy, reusing mainHtml for vehicle.
            const bwData = await bulkFetchBimmerWorkFromHtml(vin, hash, mainHtml);

            // Promote SA codes + paint/upholstery into vin_factory_options.
            if (bwData.options.length > 0) {
              const sas = bwData.options.map(o => o.code).filter(Boolean);
              const paintCode = bwData.vehicle?.colorCode ?? null;
              const uphCode = bwData.vehicle?.upholsteryCode ?? null;
              await promoteFactoryOptions(vin, sas, paintCode, uphCode, "bimmerwork");
            }

            // Upsert vin_cache — serialize to plain JSON so no `as any` needed.
            const enrichedJson: Record<string, unknown> = JSON.parse(JSON.stringify(bwData));
            const sourceMap: Record<string, unknown> = {
              vehicle: { source: "bimmerwork", fetchedAt: bwData.fetchedAt },
              options: { source: "bimmerwork", fetchedAt: bwData.fetchedAt },
              images: bwData.images ? { source: "bimmerwork", fetchedAt: bwData.fetchedAt } : { source: "none", fetchedAt: bwData.fetchedAt },
              manuals: bwData.manuals.length ? { source: "bimmerwork", fetchedAt: bwData.fetchedAt } : { source: "none", fetchedAt: bwData.fetchedAt },
            };

            await database
              .insert(vinCacheTable)
              .values({
                vin,
                source: "bimmerwork",
                enrichedData: enrichedJson,
                enrichmentSource: sourceMap,
                bimmerworkHash: hash,
              })
              .onConflictDoUpdate({
                target: vinCacheTable.vin,
                set: {
                  source: "bimmerwork",
                  enrichedData: enrichedJson,
                  enrichmentSource: sourceMap,
                  bimmerworkHash: hash,
                  updatedAt: new Date(),
                },
              });

            processed++;
            await mergeJobProgress(job.id, { discovered, processed, skipped, failed, phase: "processing" });
          } catch (err: any) {
            console.error(`[BW Bulk] Error processing hash ${hash}:`, err.message);
            failed++;
            await mergeJobProgress(job.id, { discovered, processed, skipped, failed });
          }
        }

        try {
          // Paginate all three search engines; dispatch up to CONCURRENCY workers
          // at a time so we saturate the proxy without hammering it.
          // strict:true ensures every search-engine fetch goes through the
          // proxy — no silent fallback to direct origin.
          const gen = discoverAllBimmerWorkHashes({
            maxPagesPerEngine,
            strict: true,
            onPageDone: (engine, page, newHashes) => {
              console.log(`[BW Bulk] ${engine} page ${page}: ${newHashes.length} new hashes`);
            },
          });

          const inFlight = new Set<Promise<void>>();

          for await (const hash of gen) {
            discovered++;
            await mergeJobProgress(job.id, { discovered, processed, skipped, failed, phase: "discovering" });

            // Wait until a slot is free.
            while (inFlight.size >= CONCURRENCY) {
              await Promise.race(inFlight);
            }

            const p: Promise<void> = processHash(hash).finally(() => inFlight.delete(p));
            inFlight.add(p);
          }

          // Drain remaining in-flight work.
          while (inFlight.size > 0) {
            await Promise.race(inFlight);
          }

          await completeJob(job.id, { discovered, processed, skipped, failed, phase: "complete" });
          console.log(`[BW Bulk] Job #${job.id} complete: discovered=${discovered} processed=${processed} skipped=${skipped} failed=${failed}`);
        } catch (err: any) {
          console.error(`[BW Bulk] Job #${job.id} failed:`, err);
          await failJob(job.id, err.message, { discovered, processed, skipped, failed, phase: "failed" });
        }
      })().catch((err) => console.error("[BW Bulk] Unhandled error:", err));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.get("/api/admin/bimmerwork/bulk-discover/status", requireAdmin, async (_req, res) => {
    try {
      const { getLatestJob } = await import("./job-manager");
      const job = await getLatestJob("bimmerwork_bulk_discover");
      if (!job) return res.json({ job: null });
      res.json({ job });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // -------------------------------------------------------------------------
  // Task #175 — Proxy router admin endpoints
  // -------------------------------------------------------------------------

  app.get("/api/admin/proxy/status", requireAdmin, async (_req, res) => {
    try {
      const { getAllProxyStatuses } = await import("./proxy-router");
      const { VINDECODERZ_ENABLED } = await import("./vin-enrichment-service");
      const statuses = await getAllProxyStatuses();
      res.json({ statuses, vindecoderzEnabled: VINDECODERZ_ENABLED });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // ---- Google Search Console integration (Task #185) -----------------------

  interface GscCredentials {
    client_email: string;
    private_key: string;
    project_id?: string;
    [key: string]: unknown;
  }

  interface GscAnalyticsRow {
    keys: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }

  interface GscCoverageIssue {
    reason: string;
    urls: string[];
  }

  interface GscAiRecommendation {
    priority: "high" | "medium" | "low";
    type: string;
    suggestion: string;
    editorialLink: string | null;
  }

  interface GscAiResponse {
    recommendations: GscAiRecommendation[];
  }

  function parseGscCredentials(raw: string): GscCredentials | null {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "client_email" in parsed &&
        "private_key" in parsed &&
        typeof (parsed as Record<string, unknown>).client_email === "string" &&
        typeof (parsed as Record<string, unknown>).private_key === "string"
      ) {
        return parsed as GscCredentials;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Reads credential JSON from the env var first; falls back to the value
  // stored via POST /api/admin/gsc/credentials (saved in global_settings).
  async function getRawGscCredential(): Promise<string | null> {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    }
    const row = await storage.getGlobalSetting("gsc_service_account_json");
    if (typeof row === "string" && row) return row;
    return null;
  }

  async function getGscAuth() {
    const raw = await getRawGscCredential();
    if (!raw) return null;
    const credentials = parseGscCredentials(raw);
    if (!credentials) return null;
    const { google } = await import("googleapis");
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    });
    return auth;
  }

  // In-process GSC response cache — resets on server restart, no persistence needed.
  // Keys encode all query params that affect the response; entries carry an expiry timestamp.
  interface GscCacheEntry { data: unknown; expiresAt: number; }
  const gscAnalyticsCache = new Map<string, GscCacheEntry>();
  const gscCoverageCache  = new Map<string, GscCacheEntry>();
  const GSC_ANALYTICS_TTL_MS = (parseInt(process.env.GSC_ANALYTICS_TTL_MINUTES ?? "5",  10) || 5)  * 60 * 1000;
  const GSC_COVERAGE_TTL_MS  = (parseInt(process.env.GSC_COVERAGE_TTL_MINUTES  ?? "15", 10) || 15) * 60 * 1000;

  function getGscCached(cache: Map<string, GscCacheEntry>, key: string): unknown | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
    return entry.data;
  }

  function setGscCached(cache: Map<string, GscCacheEntry>, key: string, data: unknown, ttlMs: number): void {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  // Shared helper: fetch SEO preview context for a part number using the same
  // full pipeline as GET /api/admin/seo/preview/:partNumberClean — cross-refs,
  // editorial notes, category blurbs — so prompt context exactly matches the
  // live admin SEO preview.
  async function fetchPartSeoPreview(rawPartNumber: string): Promise<{
    metaTitle: string;
    metaDescription: string;
    richness: string;
  } | null> {
    const pn = rawPartNumber.replace(/[\s\-]+/g, "");
    const xref = await storage.crossReferencePart(pn);
    if (!xref) return null;
    const [externalRefs, related, editorial, categoryBlurb] = await Promise.all([
      getCrossRefsForPart(pn).catch(() => [] as string[]),
      storage.getRelatedPartsInDiagram(pn, 8).catch(() => []),
      storage.getPartEditorialNote(pn, "en").catch(() => undefined),
      (async () => {
        const v = xref.vehicles[0];
        if (!v?.categoryName) return null;
        const row = await storage.getCategoryEditorial(v.categoryName, v.subcategoryName || null, "en").catch(() => undefined);
        if (row) return row.blurb;
        const parent = await storage.getCategoryEditorial(v.categoryName, null, "en").catch(() => undefined);
        return parent?.blurb ?? null;
      })(),
    ]);
    const { generateSeoContent, classifyHealth } = await import("./seo/content");
    const inputPayload = {
      partNumber: xref.partNumber,
      partNumberClean: xref.partNumberClean,
      description: xref.description,
      additionalInfo: xref.additionalInfo,
      weight: xref.weight,
      vehicles: xref.vehicles.map(v => ({
        carId: v.carId, carName: v.carName, carSlug: v.carSlug,
        chassis: v.chassis, engine: v.engine, bodyType: v.bodyType,
        yearStart: v.yearStart, yearEnd: v.yearEnd,
        categoryName: v.categoryName, subcategoryName: v.subcategoryName,
        quantity: v.quantity,
      })),
      externalChassis: externalRefs,
      related,
      categoryBlurb,
      editorNote: editorial?.note ?? null,
      locale: "en",
    };
    const content = generateSeoContent(inputPayload);
    const richness = classifyHealth(inputPayload);
    return { metaTitle: content.metaTitle, metaDescription: content.metaDescription, richness };
  }

  // Shared helper — builds the canonical GscStatus payload used by both
  // GET /api/admin/gsc/status and POST /api/admin/gsc/save-credentials.
  // Reads the credential via getRawGscCredential() (env var has precedence over DB),
  // probes the live GSC API, and returns the same structured object both routes return.
  type GscStatusPayload =
    | { configured: false }
    | { configured: true; valid: false; error: string }
    | { configured: true; valid: true; email: string; properties: string[]; source: "env" | "db" };

  async function buildGscStatusPayload(): Promise<GscStatusPayload> {
    const raw = await getRawGscCredential();
    if (!raw) return { configured: false };
    const credentials = parseGscCredentials(raw);
    if (!credentials) {
      return { configured: true, valid: false, error: "Stored credential is not valid JSON or is missing required fields (client_email, private_key)" };
    }
    const { google } = await import("googleapis");
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    });
    const sc = google.searchconsole({ version: "v1", auth });
    const sitesResp = await sc.sites.list();
    const properties = (sitesResp.data.siteEntry ?? [])
      .map(s => s.siteUrl)
      .filter((u): u is string => typeof u === "string");
    const source: "env" | "db" = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? "env" : "db";
    return { configured: true, valid: true, email: credentials.client_email, properties, source };
  }

  app.get("/api/admin/gsc/status", requireAdmin, async (_req, res) => {
    try {
      const payload = await buildGscStatusPayload();
      return res.json(payload);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.json({ configured: true, valid: false, error: msg });
    }
  });

  // POST /api/admin/gsc/credentials — validate and persist GSC service account JSON.
  //
  // Storage design (per task spec § "stored via global_settings DB"):
  //   The task explicitly specifies global_settings as the storage layer, not an env
  //   secret. Replit does not expose a programmatic API to write to the project's
  //   encrypted secrets store from within a running Express process; secrets can only
  //   be set via the Replit GUI or the agent-side `requestEnvVar` callback (which
  //   pauses for user interaction). global_settings (managed Postgres) is therefore
  //   the correct and only feasible in-app persistence path on this platform.
  //
  //   Users who prefer the env-var path can paste the JSON into Replit's "Secrets" tab
  //   as GOOGLE_SERVICE_ACCOUNT_JSON; the status endpoint reports source:"env" vs "db"
  //   so admins can see which path is active.
  //
  //   When GOOGLE_SERVICE_ACCOUNT_JSON env var is set, it always takes precedence over
  //   the DB-stored value (see getRawGscCredential()).
  app.post("/api/admin/gsc/credentials", requireAdmin, express.json(), async (req, res) => {
    try {
      const body = req.body as { json?: unknown };
      if (typeof body.json !== "string" || !body.json.trim()) {
        return res.status(400).json({ error: "json field must be a non-empty string containing the service account JSON" });
      }
      const credentials = parseGscCredentials(body.json);
      if (!credentials) {
        return res.status(400).json({ error: "Invalid service account JSON — must contain client_email and private_key fields" });
      }
      // Test the credentials against the GSC API before saving
      const { google } = await import("googleapis");
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
      });
      const sc = google.searchconsole({ version: "v1", auth });
      const sitesResp = await sc.sites.list();
      const properties = (sitesResp.data.siteEntry ?? [])
        .map(s => s.siteUrl)
        .filter((u): u is string => typeof u === "string");
      await storage.setGlobalSetting("gsc_service_account_json", body.json);
      return res.json({ ok: true, email: credentials.client_email, properties });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ error: `Credential validation failed: ${msg}` });
    }
  });

  // POST /api/admin/gsc/save-credentials — validate, persist and return canonical status payload.
  //
  // Validates the JSON against the live GSC API before persisting. After persisting,
  // returns the same payload as GET /api/admin/gsc/status by calling buildGscStatusPayload(),
  // so the frontend can seed the React Query cache directly for an instant panel transition
  // without a second round-trip.
  //
  // Persistence: credentials are saved to global_settings (Postgres). Replit does not expose a
  // programmatic write API for encrypted secrets from within a running Express process; the
  // agent-side requestEnvVar callback (which pauses for interactive user input) is the only
  // platform path for writing secrets. global_settings is therefore the correct in-app
  // persistence layer. Users can alternatively set GOOGLE_SERVICE_ACCOUNT_JSON via the Replit
  // Secrets UI, which takes precedence over the DB value (see getRawGscCredential()).
  app.post("/api/admin/gsc/save-credentials", requireAdmin, express.json(), async (req, res) => {
    try {
      const body = req.body as { json?: unknown };
      if (typeof body.json !== "string" || !body.json.trim()) {
        return res.status(400).json({ error: "json field must be a non-empty string containing the service account JSON" });
      }
      const credentials = parseGscCredentials(body.json);
      if (!credentials) {
        return res.status(400).json({ error: "Invalid service account JSON — must contain client_email and private_key fields" });
      }
      // Validate against the live GSC API before persisting
      const { google } = await import("googleapis");
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
      });
      const sc = google.searchconsole({ version: "v1", auth });
      await sc.sites.list();
      // Persist to DB (durable across server restarts).
      await storage.setGlobalSetting("gsc_service_account_json", body.json);
      // Return the canonical status payload (same as GET /api/admin/gsc/status) so the
      // frontend can seed the query cache. buildGscStatusPayload() re-resolves via the
      // canonical getRawGscCredential() path (env → DB), so source and all fields reflect
      // the true runtime state.
      const status = await buildGscStatusPayload();
      return res.json(status);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ error: `Credential validation failed: ${msg}` });
    }
  });

  // DELETE /api/admin/gsc/credentials — remove the DB-stored credential.
  app.delete("/api/admin/gsc/credentials", requireAdmin, async (_req, res) => {
    try {
      await storage.setGlobalSetting("gsc_service_account_json", null);
      return res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: msg });
    }
  });

  app.get("/api/admin/gsc/search-analytics", requireAdmin, async (req, res) => {
    try {
      const auth = await getGscAuth();
      if (!auth) return res.status(503).json({ error: "GOOGLE_SERVICE_ACCOUNT_JSON not configured" });
      const siteUrl = typeof req.query.siteUrl === "string" ? req.query.siteUrl : "";
      const dateRangeDays = parseInt(typeof req.query.dateRange === "string" ? req.query.dateRange : "28", 10) || 28;
      const dimension = typeof req.query.dimension === "string" ? req.query.dimension : "query";
      if (!siteUrl) return res.status(400).json({ error: "siteUrl is required" });
      const bust = req.query.bust === "1";

      const cacheKey = `${siteUrl}|${dateRangeDays}|${dimension}`;
      if (!bust) {
        const cached = getGscCached(gscAnalyticsCache, cacheKey);
        if (cached !== null) return res.json(cached);
      }

      const { google } = await import("googleapis");
      const sc = google.searchconsole({ version: "v1", auth });
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - dateRangeDays * 86400000);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const queryDimension: "query" | "page" = dimension === "page" ? "page" : "query";
      const response = await sc.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: [queryDimension],
          rowLimit: 100,
        },
      });
      const rows: GscAnalyticsRow[] = (response.data.rows ?? []).map(r => ({
        keys: r.keys ?? [],
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? 0,
      }));
      const result = { rows };
      setGscCached(gscAnalyticsCache, cacheKey, result, GSC_ANALYTICS_TTL_MS);
      return res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: msg });
    }
  });

  // GET /api/admin/gsc/coverage
  //
  // Returns real page-level index/crawl coverage issues via the URL Inspection API,
  // grouped by reason. Because the URL Inspection API only inspects one URL at a
  // time, this endpoint samples pages from the property's sitemap XML, inspects
  // each one, and aggregates the results.
  //
  // Query params:
  //   siteUrl  — GSC property string (sc-domain:example.com or https://example.com)
  //   maxUrls  — max URLs to inspect (default 25, capped at 50)
  //
  // Response:
  //   issues[]   — pages grouped by coverageState / reason
  //   sampleSize — number of pages actually inspected
  //   totalSampled — number of URLs fetched from the sitemap before deduplication
  //   dataSource — "url_inspection_api"
  app.get("/api/admin/gsc/coverage", requireAdmin, async (req, res) => {
    try {
      const auth = await getGscAuth();
      if (!auth) return res.status(503).json({ error: "GOOGLE_SERVICE_ACCOUNT_JSON not configured" });
      const siteUrl = typeof req.query.siteUrl === "string" ? req.query.siteUrl : "";
      if (!siteUrl) return res.status(400).json({ error: "siteUrl is required" });
      const maxUrls = Math.min(
        parseInt(typeof req.query.maxUrls === "string" ? req.query.maxUrls : "25", 10) || 25,
        50,
      );
      const bust = req.query.bust === "1";

      const cacheKey = `${siteUrl}|${maxUrls}`;
      if (!bust) {
        const cached = getGscCached(gscCoverageCache, cacheKey);
        if (cached !== null) return res.json(cached);
      }

      // Derive the base HTTP hostname from the GSC property string
      const baseHost = siteUrl.startsWith("sc-domain:")
        ? `https://${siteUrl.replace("sc-domain:", "")}`
        : siteUrl.replace(/\/$/, "");

      // Fetch the sitemap index (or regular sitemap) to discover URLs to inspect.
      // We try /sitemap.xml first, then /sitemap_index.xml as a fallback.
      const sitemapUrls: string[] = [];
      for (const path of ["/sitemap.xml", "/sitemap_index.xml"]) {
        try {
          const sitemapResp = await fetch(`${baseHost}${path}`, {
            signal: AbortSignal.timeout(8000),
            headers: { "User-Agent": "BMVAdmin/1.0 (GSC coverage check)" },
          });
          if (!sitemapResp.ok) continue;
          const xml = await sitemapResp.text();
          // Extract <loc> tags — covers both sitemap index and regular sitemap
          const locMatches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)];
          for (const m of locMatches) {
            const url = m[1].trim();
            // If this looks like a nested sitemap, fetch it too (one level deep)
            if (url.endsWith(".xml") || url.includes("sitemap")) {
              try {
                const subResp = await fetch(url, {
                  signal: AbortSignal.timeout(5000),
                  headers: { "User-Agent": "BMVAdmin/1.0 (GSC coverage check)" },
                });
                if (subResp.ok) {
                  const subXml = await subResp.text();
                  const subLocs = [...subXml.matchAll(/<loc>([^<]+)<\/loc>/gi)];
                  for (const sl of subLocs) {
                    const su = sl[1].trim();
                    if (!su.endsWith(".xml")) sitemapUrls.push(su);
                  }
                }
              } catch { /* skip failed sub-sitemap */ }
            } else {
              sitemapUrls.push(url);
            }
            if (sitemapUrls.length >= maxUrls * 4) break;
          }
          if (sitemapUrls.length > 0) break;
        } catch { /* try next path */ }
      }

      // Deduplicate and sample up to maxUrls pages for inspection
      const uniqueUrls = [...new Set(sitemapUrls)].slice(0, maxUrls);
      const totalSampled = uniqueUrls.length;

      if (totalSampled === 0) {
        return res.json({
          issues: [],
          sampleSize: 0,
          totalSampled: 0,
          dataSource: "url_inspection_api",
          note: "No URLs could be fetched from the sitemap. Ensure the sitemap is publicly accessible at /sitemap.xml.",
        });
      }

      const { google } = await import("googleapis");
      const sc = google.searchconsole({ version: "v1", auth });

      // Inspect each URL in parallel (URL Inspection API: 600 req/min limit)
      const inspections = await Promise.allSettled(
        uniqueUrls.map(url =>
          sc.urlInspection.index.inspect({
            requestBody: { inspectionUrl: url, siteUrl },
          })
        )
      );

      // Group inspected pages by their coverage state / reason
      const issueMap = new Map<string, string[]>();
      let successCount = 0;

      for (let i = 0; i < inspections.length; i++) {
        const result = inspections[i];
        if (result.status !== "fulfilled") continue;
        successCount++;
        const indexStatus = result.value.data.inspectionResult?.indexStatusResult;
        if (!indexStatus) continue;
        const coverageState = typeof indexStatus.coverageState === "string"
          ? indexStatus.coverageState
          : null;
        const indexingState = typeof indexStatus.indexingState === "string"
          ? indexStatus.indexingState
          : null;
        // Only surface non-indexed or crawl-issue pages
        const isProblematic = indexingState !== "INDEXING_ALLOWED" || (coverageState !== null && !coverageState.toLowerCase().includes("submitted and indexed"));
        if (isProblematic && coverageState) {
          const reason = coverageState;
          if (!issueMap.has(reason)) issueMap.set(reason, []);
          issueMap.get(reason)!.push(uniqueUrls[i]);
        }
      }

      const issues: GscCoverageIssue[] = Array.from(issueMap.entries()).map(([reason, urls]) => ({ reason, urls }));
      const coverageResult = {
        issues,
        sampleSize: successCount,
        totalSampled,
        dataSource: "url_inspection_api",
      };
      setGscCached(gscCoverageCache, cacheKey, coverageResult, GSC_COVERAGE_TTL_MS);
      return res.json(coverageResult);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[gsc/coverage]", msg);
      // Return a structured error — NOT an empty-issues 200 — so the frontend
      // can distinguish "genuine no issues" from "failed to inspect pages".
      return res.status(503).json({ error: msg });
    }
  });

  app.post("/api/admin/gsc/recommend", requireAdmin, express.json(), async (req, res) => {
    try {
      const body = req.body as {
        url?: unknown;
        type?: unknown;
        metrics?: { clicks?: unknown; impressions?: unknown; ctr?: unknown; position?: unknown };
      };
      if (typeof body.url !== "string" || !body.url) {
        return res.status(400).json({ error: "url must be a non-empty string" });
      }
      const url: string = body.url;
      // "query" rows come from the GSC analytics dimension=query view — url is a keyword,
      // not a URL. "page" rows have an actual page URL.
      const rowType: "page" | "query" = body.type === "query" ? "query" : "page";
      const clicks = Number(body.metrics?.clicks ?? 0);
      const impressions = Number(body.metrics?.impressions ?? 0);
      const ctr = Number(body.metrics?.ctr ?? 0);
      const position = Number(body.metrics?.position ?? 0);

      // Classify URL into known page types, then load SEO context via the
      // shared fetchPartSeoPreview helper (same pipeline as the admin preview endpoint).
      let metaTitle = "";
      let metaDescription = "";
      let pageType = "page";
      let editorialHint = "";

      let urlPath: string;
      try {
        urlPath = new URL(url.startsWith("http") ? url : `https://bmv.parts${url}`).pathname;
      } catch {
        urlPath = url;
      }

      const partMatch = urlPath.match(/\/parts?\/([A-Za-z0-9\-]+)\/?$/);
      const carMatch = urlPath.match(/\/car\/([A-Za-z0-9\-]+)\/?$/);
      const chassisMatch = urlPath.match(/\/chassis\/([A-Za-z0-9]+)\/?$/);
      const seriesMatch = urlPath.match(/\/series\/([A-Za-z0-9\-]+)\/?$/);

      // Section-specific deep-links: Admin.tsx reads ?tab= and the browser
      // scrolls to the hash anchor added to SeoEditorialPanel sections.
      let editorialLink: string | null = null;

      if (partMatch) {
        pageType = "part detail page";
        editorialLink = "/admin?tab=seo#seo-part-notes";
        try {
          const preview = await fetchPartSeoPreview(partMatch[1]);
          if (preview) {
            metaTitle = preview.metaTitle;
            metaDescription = preview.metaDescription;
            editorialHint = `This is a ${preview.richness}-richness part page. Part editorial notes (per-part copy overrides) are the primary lever for part pages; category buying-guide blurbs add richness across a whole category.`;
          }
        } catch { /* proceed without SEO context */ }
      } else if (carMatch) {
        pageType = "car model page";
        editorialLink = "/admin?tab=seo#seo-hub-editorial";
        editorialHint = `Car model pages are catalog-driven. Hub blurbs for the matching chassis code are the primary editorial control for car pages.`;
      } else if (chassisMatch) {
        pageType = `chassis hub (${chassisMatch[1].toUpperCase()})`;
        editorialLink = "/admin?tab=seo#seo-hub-editorial";
        editorialHint = `The hub blurb for chassis ${chassisMatch[1].toUpperCase()} is the primary editorial control. Set it in the admin SEO panel → "Chassis & series hub blurbs".`;
      } else if (seriesMatch) {
        pageType = `series hub (${seriesMatch[1]})`;
        editorialLink = "/admin?tab=seo#seo-hub-editorial";
        editorialHint = `The series hub blurb is the primary editorial control for this page. Set it in the admin SEO panel → "Chassis & series hub blurbs".`;
      }

      const performanceContext = position > 20
        ? `Poor ranking — avg. position ${position.toFixed(1)} (beyond page 2). Ranking signals are the priority.`
        : position > 10
        ? `On page 2 — avg. position ${position.toFixed(1)}. Goal: push onto page 1.`
        : ctr < 0.02
        ? `On page 1 but low CTR (${(ctr * 100).toFixed(1)}%). Title/meta appeal is the priority.`
        : `Performing well — position ${position.toFixed(1)}, CTR ${(ctr * 100).toFixed(1)}%. Look for incremental gains.`;

      // Build a different prompt depending on whether this row represents a search
      // query keyword or a page URL. Query rows need keyword/content-gap recommendations;
      // page rows need on-page/meta/schema recommendations for a specific URL.
      const prompt = rowType === "query"
        ? `You are an SEO specialist for bmv.parts, a BMW OEM parts catalog website.

You are analysing a SEARCH QUERY (keyword) that bmv.parts ranks for — not a specific page URL.

Query: "${url}"

GSC performance for this query:
- Clicks: ${clicks} | Impressions: ${impressions} | CTR: ${(ctr * 100).toFixed(2)}% | Avg. position: ${position.toFixed(1)}
- ${performanceContext}

bmv.parts covers BMW OEM parts, chassis lookup, VIN decoding, and model references.

Provide 3–5 prioritised, actionable recommendations for this keyword. Focus on:
- Whether bmv.parts should create or strengthen a dedicated landing page targeting this query
- Content gaps: what specific information (fitment tables, specs, compatibility lists) would satisfy this search intent
- Title/H1 angles that match the query's intent (informational vs transactional)
- Internal linking opportunities: which existing pages should link to the target page using this keyword as anchor text
- Schema opportunities (Product, FAQPage, HowTo) that match the query intent

Return ONLY valid JSON — no markdown fences, no extra keys:
{
  "recommendations": [
    {
      "priority": "high",
      "type": "Content",
      "suggestion": "...",
      "editorialLink": null
    }
  ]
}

Valid priority values: "high" | "medium" | "low"
Valid type values: "Meta title" | "Meta description" | "Content" | "Internal links" | "Schema" | "UX"
Set editorialLink to null for all query-level recommendations.`
        : `You are an SEO specialist for bmv.parts, a BMW OEM parts catalog website.

Page type: ${pageType}
URL: ${url}
Meta title: ${metaTitle || "(generated from catalog data — not overridden by editorial)"}
Meta description: ${metaDescription || "(generated from catalog data — not overridden by editorial)"}

GSC performance:
- Clicks: ${clicks} | Impressions: ${impressions} | CTR: ${(ctr * 100).toFixed(2)}% | Avg. position: ${position.toFixed(1)}
- ${performanceContext}

${editorialHint ? `Editorial context: ${editorialHint}` : ""}

Provide 3–5 prioritised, specific, actionable SEO fix suggestions. For meta fixes include rewritten copy examples. For content fixes name the exact gap (e.g. "Add a fitment table listing chassis codes E90/E92/E93"). For link fixes name the specific internal link opportunity.

Return ONLY valid JSON — no markdown fences, no extra keys:
{
  "recommendations": [
    {
      "priority": "high",
      "type": "Meta title",
      "suggestion": "...",
      "editorialLink": ${editorialLink ? `"${editorialLink}"` : "null"}
    }
  ]
}

Valid priority values: "high" | "medium" | "low"
Valid type values: "Meta title" | "Meta description" | "Content" | "Internal links" | "Schema" | "UX"
${editorialLink ? `Set editorialLink to "${editorialLink}" for recommendations that involve the admin editorial panel, null for code/schema changes.` : `Set editorialLink to null for all recommendations (no editorial panel available for this page type).`}`;

      const completion = await aiClient.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1500,
        response_format: { type: "json_object" },
      });

      const rawContent = completion.choices[0]?.message?.content ?? "{}";
      let parsed: GscAiResponse;
      try {
        const rawParsed: unknown = JSON.parse(rawContent);
        if (
          typeof rawParsed === "object" &&
          rawParsed !== null &&
          "recommendations" in rawParsed &&
          Array.isArray((rawParsed as { recommendations: unknown }).recommendations)
        ) {
          parsed = rawParsed as GscAiResponse;
        } else {
          parsed = { recommendations: [] };
        }
      } catch {
        parsed = { recommendations: [] };
      }

      const validPriorities = new Set<string>(["high", "medium", "low"]);
      const validTypes = new Set<string>(["Meta title", "Meta description", "Content", "Internal links", "Schema", "UX"]);

      const recs: GscAiRecommendation[] = parsed.recommendations
        .filter(r => typeof r === "object" && r !== null)
        .map(r => ({
          priority: (validPriorities.has(r.priority) ? r.priority : "medium") as GscAiRecommendation["priority"],
          type: validTypes.has(r.type) ? r.type : "Content",
          suggestion: typeof r.suggestion === "string" ? r.suggestion : "",
          editorialLink: typeof r.editorialLink === "string" ? r.editorialLink : null,
        }));

      return res.json({ recommendations: recs });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: msg });
    }
  });

  app.get("/api/admin/proxy/usage", requireAdmin, async (_req, res) => {
    try {
      const { getProxyUsageStats } = await import("./proxy-router");
      const [usage, realoem] = await Promise.all([getProxyUsageStats(), getRealoemBudgetStatus()]);
      res.json({ usage, realoem });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  app.patch("/api/admin/proxy/config/:scraper", requireAdmin, async (req, res) => {
    try {
      const { setProxyConfig } = await import("./proxy-router");
      const { PROXY_SCRAPER_NAMES, PROXY_PROVIDER_NAMES } = await import("@shared/schema");
      const scraper = req.params["scraper"] as string;
      const { primary, backup } = req.body || {};
      if (!primary || !backup) return res.status(400).json({ error: "primary and backup are required" });
      if (!(PROXY_SCRAPER_NAMES as readonly string[]).includes(scraper)) {
        return res.status(400).json({ error: `Unknown scraper '${scraper}'. Valid values: ${PROXY_SCRAPER_NAMES.join(", ")}` });
      }
      if (!(PROXY_PROVIDER_NAMES as readonly string[]).includes(primary)) {
        return res.status(400).json({ error: `Unknown provider '${primary}'. Valid values: ${PROXY_PROVIDER_NAMES.join(", ")}` });
      }
      if (!(PROXY_PROVIDER_NAMES as readonly string[]).includes(backup)) {
        return res.status(400).json({ error: `Unknown provider '${backup}'. Valid values: ${PROXY_PROVIDER_NAMES.join(", ")}` });
      }
      if (primary === backup) {
        return res.status(400).json({ error: "primary and backup must be different providers" });
      }
      await setProxyConfig(
        scraper as import("@shared/schema").ProxyScraperName,
        primary as import("@shared/schema").ProxyProviderName,
        backup as import("@shared/schema").ProxyProviderName,
      );
      res.json({ ok: true, scraper, primary, backup });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // AI Photo Quote API
  // ---------------------------------------------------------------------------
  {
    const { requirePaidAccess } = await import("./auth");
    const { analyzePhotoDamage } = await import("./photo-quote/ai-analyzer");
    const { matchDetectedParts, calcTotals } = await import("./photo-quote/parts-matcher");
    const { buildCsv } = await import("./photo-quote/csv-builder");
    const { submitToMPerformance } = await import("./photo-quote/mperformance-client");
    const { randomUUID } = await import("crypto");

    app.post(
      "/api/vendor/photo-quote",
      requireAuth,
      requirePaidAccess,
      express.json({ limit: "50mb" }),
      async (req, res) => {
        try {
          const { vin, vehicle, photos, customerName, customerEmail, customerPhone, customerPostcode, vehicleYear, vehicleColour } = req.body;
          if (!vehicle) return res.status(400).json({ error: "vehicle is required" });
          if (!Array.isArray(photos) || photos.length === 0) return res.status(400).json({ error: "photos array is required" });
          if (photos.length > 20) return res.status(400).json({ error: "Maximum 20 photos" });

          const detected = await analyzePhotoDamage(photos, vehicle, vin);
          const quoteRows = await matchDetectedParts(detected, vehicle, vin);
          const totals = calcTotals(quoteRows);

          const quoteRef = randomUUID();
          const quote = await storage.createPhotoQuote({
            quoteRef,
            userId: req.user!.id,
            vin: vin ?? null,
            vehicle,
            photoUrls: [] as any,
            aiAnalysisJson: detected as any,
            quoteRows: quoteRows as any,
            ...totals,
            csvUrl: null,
            customerName: customerName ?? null,
            customerEmail: customerEmail ?? null,
            customerPhone: customerPhone ?? null,
            customerPostcode: customerPostcode ?? null,
            vehicleYear: vehicleYear ?? null,
            vehicleColour: vehicleColour ?? null,
            mperformanceRef: null,
          });

          submitToMPerformance(quote).then(async (ref) => {
            if (ref) await storage.updatePhotoQuote(quote.id, { mperformanceRef: ref });
          }).catch((e) => console.error("[mperf] fire-and-forget failed:", e.message));

          const analysisNotes = detected
            .filter((d: any) => d.notes || d.status === "review")
            .map((d: any) => ({ damage_location: d.damage_location, notes: d.notes, status: d.status }));

          return res.status(201).json({
            quote_id: quote.id,
            quote_ref: quote.quoteRef,
            vehicle: quote.vehicle,
            vin: quote.vin,
            detected_parts: quoteRows,
            analysis_notes: analysisNotes,
            total_bmw_new: totals.totalBmwNew,
            total_our_price: totals.totalOurPrice,
            total_saving: totals.totalSaving,
            csv_url: null,
          });
        } catch (err: any) {
          console.error("[photo-quote] POST error:", err.message);
          return res.status(500).json({ error: err.message });
        }
      }
    );

    app.get(
      "/api/vendor/photo-quote",
      requireAuth,
      requirePaidAccess,
      async (req, res) => {
        try {
          const quotes = await storage.listPhotoQuotesByUser(req.user!.id);
          const slim = quotes.map((q: any) => {
            const { aiAnalysisJson: _, ...rest } = q;
            return rest;
          });
          return res.json(slim);
        } catch (err: any) {
          return res.status(500).json({ error: err.message });
        }
      }
    );

    app.get(
      "/api/vendor/photo-quote/:id",
      requireAuth,
      requirePaidAccess,
      async (req, res) => {
        try {
          const id = parseInt(String(req.params.id), 10);
          if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
          const quote = await storage.getPhotoQuote(id);
          if (!quote) return res.status(404).json({ error: "Not found" });
          if (quote.userId !== req.user!.id && req.user!.role !== "admin") {
            return res.status(403).json({ error: "Forbidden" });
          }
          return res.json(quote);
        } catch (err: any) {
          return res.status(500).json({ error: err.message });
        }
      }
    );

    app.patch(
      "/api/vendor/photo-quote/:id/rows",
      requireAuth,
      requirePaidAccess,
      express.json({ limit: "2mb" }),
      async (req, res) => {
        try {
          const id = parseInt(String(req.params.id), 10);
          if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
          const quote = await storage.getPhotoQuote(id);
          if (!quote) return res.status(404).json({ error: "Not found" });
          if (quote.userId !== req.user!.id && req.user!.role !== "admin") {
            return res.status(403).json({ error: "Forbidden" });
          }
          const { quoteRows } = req.body;
          if (!Array.isArray(quoteRows)) return res.status(400).json({ error: "quoteRows must be array" });
          const { calcTotals: ct } = await import("./photo-quote/parts-matcher");
          const totals = ct(quoteRows);
          const updated = await storage.updatePhotoQuote(id, { quoteRows: quoteRows as any, ...totals });
          return res.json(updated);
        } catch (err: any) {
          return res.status(500).json({ error: err.message });
        }
      }
    );

    app.get(
      "/api/vendor/photo-quote/:id/csv",
      requireAuth,
      requirePaidAccess,
      async (req, res) => {
        try {
          const id = parseInt(String(req.params.id), 10);
          if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
          const quote = await storage.getPhotoQuote(id);
          if (!quote) return res.status(404).json({ error: "Not found" });
          if (quote.userId !== req.user!.id && req.user!.role !== "admin") {
            return res.status(403).json({ error: "Forbidden" });
          }
          const { buildCsv: bc } = await import("./photo-quote/csv-builder");
          const csv = bc(quote);

          if (!quote.mperformanceRef) {
            submitToMPerformance(quote).then(async (ref) => {
              if (ref) await storage.updatePhotoQuote(quote.id, { mperformanceRef: ref });
            }).catch((e) => console.error("[mperf] csv trigger failed:", e.message));
          }

          const filename = `bmv-quote-${quote.quoteRef.slice(0, 8)}.csv`;
          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
          return res.send(csv);
        } catch (err: any) {
          return res.status(500).json({ error: err.message });
        }
      }
    );
  }

  // ---------------------------------------------------------------------------
  // AI FAQ API (Task #228)
  // ---------------------------------------------------------------------------

  // GET /api/faq?pageType=chassis&pageKey=E46&locale=en
  // Returns cached FAQ items for the given (pageType, pageKey, locale) triple.
  // Does NOT generate on the fly — generation only happens server-side in SSR
  // handlers or via the admin force-regenerate endpoint below.
  app.get("/api/faq", async (req, res) => {
    const { pageType, pageKey, locale } = req.query as Record<string, string | undefined>;
    if (!pageType || !pageKey || !locale) {
      return res.status(400).json({ error: "pageType, pageKey, and locale are required" });
    }
    try {
      const row = await storage.getAiFaq(pageType, pageKey, locale);
      if (!row) return res.json({ faqItems: [], cached: false });
      return res.json({ faqItems: row.faqItems, cached: true, generatedAt: row.generatedAt });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // POST /api/admin/faq/regenerate
  // Force-regenerates (and re-caches) AI FAQs for a given (pageType, pageKey).
  // If locale is omitted, regenerates all 11 supported locales.
  // Body: { pageType, pageKey, context?, locale? }
  app.post("/api/admin/faq/regenerate", requireAdmin, async (req, res) => {
    const { pageType, pageKey, locale, context = {} } = req.body ?? {};
    if (!pageType || !pageKey) {
      return res.status(400).json({ error: "pageType and pageKey are required" });
    }

    try {
      const { generateAiFaq } = await import("./seo/ai-faq");
      const { SUPPORTED_LOCALES } = await import("@shared/i18n/types");
      const localesToRun: string[] = locale ? [locale] : (SUPPORTED_LOCALES as unknown as string[]);

      const results: { locale: string; ok: boolean; error?: string }[] = [];
      for (const loc of localesToRun) {
        try {
          const items = await generateAiFaq(pageType, pageKey, loc, context, true);
          results.push({ locale: loc, ok: !!items });
        } catch (err: any) {
          results.push({ locale: loc, ok: false, error: err?.message || String(err) });
        }
      }

      return res.json({ regenerated: results });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // GET /api/admin/faq/list?pageType=chassis&limit=100
  // Lists recent AI FAQ cache entries for admin review.
  app.get("/api/admin/faq/list", requireAdmin, async (req, res) => {
    const { pageType = "chassis", limit = "100" } = req.query as Record<string, string>;
    try {
      const rows = await storage.listAiFaqByPageType(pageType, parseInt(limit, 10) || 100);
      return res.json({ rows });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // ===========================================================================
  // SEO Growth Engine Routes
  // ===========================================================================

  // GET /api/seo/growth/stats — public summary (no auth required for transparency)
  app.get("/api/seo/growth/stats", async (_req, res) => {
    try {
      const { getGrowthStats } = await import("./seo/growth-engine");
      const stats = await getGrowthStats();
      return res.json(stats);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  // Admin alias (used by admin panel queryKey)
  app.get("/api/admin/seo/growth/stats", requireAdmin, async (_req, res) => {
    try {
      const { getGrowthStats } = await import("./seo/growth-engine");
      const stats = await getGrowthStats();
      return res.json(stats);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  // POST /api/admin/seo/growth/seed-keywords — seed keyword table from catalog
  app.post("/api/admin/seo/growth/seed-keywords", requireAdmin, async (_req, res) => {
    try {
      const { seedKeywordsFromCatalog } = await import("./seo/growth-engine");
      const result = await seedKeywordsFromCatalog();
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  // POST /api/admin/seo/growth/generate — batch generate N content pages
  app.post("/api/admin/seo/growth/generate", requireAdmin, async (req, res) => {
    const { limit = 3 } = req.body ?? {};
    try {
      const { generateTopKeywordPages } = await import("./seo/growth-engine");
      const result = await generateTopKeywordPages(Math.min(Number(limit) || 3, 20));
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  // POST /api/admin/seo/growth/generate-one — generate a specific keyword page
  app.post("/api/admin/seo/growth/generate-one", requireAdmin, async (req, res) => {
    const { keyword, pageType = "guide" } = req.body ?? {};
    if (!keyword) return res.status(400).json({ error: "keyword is required" });
    try {
      const { generateContentPage } = await import("./seo/growth-engine");
      const result = await generateContentPage(keyword, pageType as any);
      if (!result) return res.status(500).json({ error: "Generation failed" });
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  // POST /api/admin/seo/growth/refresh — process 90-day refresh queue
  app.post("/api/admin/seo/growth/refresh", requireAdmin, async (_req, res) => {
    try {
      const { processRefreshQueue } = await import("./seo/growth-engine");
      const result = await processRefreshQueue(3);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  // GET /api/content/guides/:slug — public content page (buyer guides)
  app.get("/api/content/guides/:slug", async (req, res) => {
    const { slug } = req.params;
    try {
      const row = await db.execute(sql`
        SELECT id, slug, page_type AS "pageType", primary_keyword AS "primaryKeyword",
               title, content, meta_title AS "metaTitle", meta_description AS "metaDescription",
               word_count AS "wordCount", indexed,
               generated_at AS "generatedAt", last_refreshed_at AS "lastRefreshedAt"
        FROM seo_content_pages
        WHERE slug = ${slug} AND page_type = 'guide'
        LIMIT 1
      `);
      const page = (row.rows as any[])[0];
      if (!page) return res.status(404).json({ error: "Guide not found" });
      return res.json(page);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  // GET /api/content/compare/:slug — public content page (comparison)
  app.get("/api/content/compare/:slug", async (req, res) => {
    const { slug } = req.params;
    try {
      const row = await db.execute(sql`
        SELECT id, slug, page_type AS "pageType", primary_keyword AS "primaryKeyword",
               title, content, meta_title AS "metaTitle", meta_description AS "metaDescription",
               word_count AS "wordCount", indexed,
               generated_at AS "generatedAt", last_refreshed_at AS "lastRefreshedAt"
        FROM seo_content_pages
        WHERE slug = ${slug} AND page_type = 'compare'
        LIMIT 1
      `);
      const page = (row.rows as any[])[0];
      if (!page) return res.status(404).json({ error: "Comparison not found" });
      return res.json(page);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  // GET /api/content/data/:slug — public content page (statistics/authority)
  app.get("/api/content/data/:slug", async (req, res) => {
    const { slug } = req.params;
    try {
      const row = await db.execute(sql`
        SELECT id, slug, page_type AS "pageType", primary_keyword AS "primaryKeyword",
               title, content, meta_title AS "metaTitle", meta_description AS "metaDescription",
               word_count AS "wordCount", indexed,
               generated_at AS "generatedAt", last_refreshed_at AS "lastRefreshedAt"
        FROM seo_content_pages
        WHERE slug = ${slug} AND page_type = 'data'
        LIMIT 1
      `);
      const page = (row.rows as any[])[0];
      if (!page) return res.status(404).json({ error: "Data page not found" });
      return res.json(page);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  // GET /api/content/chassis/:chassis/:category — Template A: chassis × part category page
  app.get("/api/content/chassis/:chassis/:category", async (req, res) => {
    const { chassis, category } = req.params;
    const chassisUpper = chassis.toUpperCase();
    try {
      // Look up models for this chassis
      const carsRow = await db.execute(sql`
        SELECT id, model_name AS "modelName", display_name AS "displayName",
               year_start AS "yearStart", year_end AS "yearEnd", engine, slug
        FROM cars
        WHERE UPPER(chassis) = ${chassisUpper}
        ORDER BY model_name
        LIMIT 100
      `);
      const models = carsRow.rows as any[];

      if (models.length === 0) {
        return res.status(404).json({ error: "Chassis not found" });
      }

      // Build a display name from the slug/category
      const categoryDisplay = category.replace(/[-_]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

      // Get parts for this chassis that match the category keyword
      const partsRow = await db.execute(sql`
        SELECT p.id, p.part_number AS "partNumber", p.description,
               p.category_name AS "categoryName", p.price, p.currency
        FROM parts p
        JOIN cars c ON p.car_id = c.id
        WHERE UPPER(c.chassis) = ${chassisUpper}
          AND (
            LOWER(p.category_name) ILIKE ${'%' + category.replace(/-/g, '%') + '%'}
            OR LOWER(p.description) ILIKE ${'%' + category.replace(/-/g, ' ') + '%'}
          )
        ORDER BY p.part_number
        LIMIT 50
      `);
      const parts = partsRow.rows as any[];

      // Get total count for this chassis+category
      const countRow = await db.execute(sql`
        SELECT COUNT(*)::int AS cnt
        FROM parts p
        JOIN cars c ON p.car_id = c.id
        WHERE UPPER(c.chassis) = ${chassisUpper}
          AND (
            LOWER(p.category_name) ILIKE ${'%' + category.replace(/-/g, '%') + '%'}
            OR LOWER(p.description) ILIKE ${'%' + category.replace(/-/g, ' ') + '%'}
          )
      `);
      const totalParts = (countRow.rows as any[])[0]?.cnt || parts.length;

      return res.json({
        chassis: chassisUpper,
        category,
        categoryDisplay,
        parts,
        totalParts,
        models: models.map((m: any) => m.displayName || m.modelName),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  // GET /api/content/hub/:chassis — Template B: model hub page
  app.get("/api/content/hub/:chassis", async (req, res) => {
    const { chassis } = req.params;
    const chassisUpper = chassis.toUpperCase();
    try {
      // Fetch chassis summary
      const chassisRow = await db.execute(sql`
        SELECT chassis, generation, series,
               COUNT(*) AS total_models
        FROM cars
        WHERE UPPER(chassis) = ${chassisUpper}
        GROUP BY chassis, generation, series
        LIMIT 1
      `);
      const chassisData = (chassisRow.rows as any[])[0];
      if (!chassisData) return res.status(404).json({ error: "Chassis not found" });

      // Fetch model variants with part counts
      const modelsRow = await db.execute(sql`
        SELECT c.id, c.model_name AS "modelName", c.display_name AS "displayName",
               c.year_start AS "yearStart", c.year_end AS "yearEnd", c.engine, c.slug,
               COUNT(p.id)::int AS "totalParts"
        FROM cars c
        LEFT JOIN parts p ON p.car_id = c.id
        WHERE UPPER(c.chassis) = ${chassisUpper}
        GROUP BY c.id, c.model_name, c.display_name, c.year_start, c.year_end, c.engine, c.slug
        ORDER BY c.model_name
        LIMIT 100
      `);
      const models = modelsRow.rows as any[];

      // Total parts across all models in this chassis
      const totalPartsRow = await db.execute(sql`
        SELECT COUNT(p.id)::int AS cnt
        FROM parts p
        JOIN cars c ON p.car_id = c.id
        WHERE UPPER(c.chassis) = ${chassisUpper}
      `);
      const totalParts = (totalPartsRow.rows as any[])[0]?.cnt || 0;

      // Top categories for this chassis
      const categoriesRow = await db.execute(sql`
        SELECT p.category_name AS "categoryName",
               LOWER(REPLACE(REPLACE(p.category_name, ' ', '-'), '/', '-')) AS "categorySlug",
               COUNT(p.id)::int AS "partCount"
        FROM parts p
        JOIN cars c ON p.car_id = c.id
        WHERE UPPER(c.chassis) = ${chassisUpper}
          AND p.category_name IS NOT NULL
          AND p.category_name != ''
        GROUP BY p.category_name
        ORDER BY COUNT(p.id) DESC
        LIMIT 18
      `);
      const topCategories = categoriesRow.rows as any[];

      return res.json({
        chassis: chassisUpper,
        generation: chassisData.generation || "N/A",
        series: chassisData.series || "BMW",
        totalParts,
        totalModels: Number(chassisData.total_models) || models.length,
        models,
        topCategories,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  // GET /api/content/index — list all generated content pages (for sitemaps etc.)
  app.get("/api/content/index", async (req, res) => {
    const { type, limit = "200" } = req.query as Record<string, string>;
    try {
      const rows = await db.execute(sql`
        SELECT slug, page_type AS "pageType", primary_keyword AS "primaryKeyword",
               meta_title AS "metaTitle", meta_description AS "metaDescription",
               word_count AS "wordCount", generated_at AS "generatedAt",
               last_refreshed_at AS "lastRefreshedAt"
        FROM seo_content_pages
        ${type ? sql`WHERE page_type = ${type}` : sql``}
        ORDER BY generated_at DESC
        LIMIT ${parseInt(limit, 10) || 200}
      `);
      return res.json({ pages: rows.rows || [] });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message });
    }
  });

  // ===========================================================================
  // Sitemap extensions for SEO growth content pages
  // ===========================================================================

  // Extend existing /sitemap.xml to include growth content sitemaps
  // This is handled by adding to sitemap-pages.xml — growth pages are included
  // in the dynamic /sitemap-content.xml route below:

  app.get("/sitemap-content.xml", async (req, res, next) => {
    if ((req as any).bmvVinHost) return next();
    try {
      const [contentRows, publisherRows] = await Promise.all([
        db.execute(sql`
          SELECT slug, page_type, generated_at, last_refreshed_at
          FROM seo_content_pages
          ORDER BY generated_at DESC
          LIMIT 50000
        `),
        db.execute(sql`
          SELECT slug, updated_at
          FROM seo_publisher_pages
          WHERE status = 'published' AND domain = 'bmv.parts'
          ORDER BY updated_at DESC
          LIMIT 10000
        `).catch(() => ({ rows: [] })),
      ]);
      const pages = (contentRows.rows as any[]) || [];
      const publisherPages = ((publisherRows as any).rows as any[]) || [];

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      for (const p of pages) {
        const prefix = p.page_type === "compare" ? "compare"
          : p.page_type === "data" ? "data" : "guides";
        const lastmod = new Date(p.last_refreshed_at || p.generated_at || new Date()).toISOString().slice(0, 10);
        xml += `  <url><loc>https://bmv.parts/${prefix}/${p.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
      }
      for (const p of publisherPages) {
        const lastmod = new Date(p.updated_at || new Date()).toISOString().slice(0, 10);
        xml += `  <url><loc>https://bmv.parts/${p.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;
      }
      xml += `</urlset>`;
      res.type("application/xml").send(xml);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // SEO Growth Engine admin endpoints (Task #259)
  // =========================================================================

  // GET /api/admin/seo-engine/stats — aggregate dashboard stats
  app.get("/api/admin/seo-engine/stats", requireAdmin, async (_req, res) => {
    try {
      const { getSeoGrowthStats } = await import("./seo/seo-growth-engine");
      const stats = await getSeoGrowthStats();
      return res.json(stats);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // GET /api/admin/seo-engine/keywords?limit=20 — top keywords by priority
  app.get("/api/admin/seo-engine/keywords", requireAdmin, async (req, res) => {
    const limit = Math.min(100, parseInt(String(req.query.limit ?? "20"), 10) || 20);
    try {
      const { getTopKeywords } = await import("./seo/seo-growth-engine");
      const keywords = await getTopKeywords(limit);
      return res.json({ keywords });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // GET /api/admin/seo-engine/refresh-queue?limit=20 — pending refresh items
  app.get("/api/admin/seo-engine/refresh-queue", requireAdmin, async (req, res) => {
    const limit = Math.min(100, parseInt(String(req.query.limit ?? "20"), 10) || 20);
    try {
      const { getRefreshQueue } = await import("./seo/seo-growth-engine");
      const queue = await getRefreshQueue(limit);
      return res.json({ queue });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // POST /api/admin/seo-engine/discover-keywords — run 24-hour keyword discovery now
  app.post("/api/admin/seo-engine/discover-keywords", requireAdmin, async (_req, res) => {
    try {
      const { runKeywordDiscovery } = await import("./seo/seo-growth-engine");
      const result = await runKeywordDiscovery();
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // POST /api/admin/seo-engine/generate-content — run AI guide generation batch
  app.post("/api/admin/seo-engine/generate-content", requireAdmin, async (req, res) => {
    const batchSize = Math.min(10, parseInt(String((req.body as any)?.batchSize ?? "3"), 10) || 3);
    try {
      const { runContentGeneration } = await import("./seo/seo-growth-engine");
      const result = await runContentGeneration(batchSize);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // POST /api/admin/seo-engine/run-refresh — process refresh queue (1 item)
  app.post("/api/admin/seo-engine/run-refresh", requireAdmin, async (_req, res) => {
    try {
      const { runRefreshEngine } = await import("./seo/seo-growth-engine");
      const result = await runRefreshEngine(2);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // POST /api/admin/seo-engine/run-linking — update internal link graph
  app.post("/api/admin/seo-engine/run-linking", requireAdmin, async (_req, res) => {
    try {
      const { runInternalLinking } = await import("./seo/seo-growth-engine");
      await runInternalLinking();
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // POST /api/admin/seo-engine/register-pages — upsert all static page records
  app.post("/api/admin/seo-engine/register-pages", requireAdmin, async (_req, res) => {
    try {
      const { registerStaticPages } = await import("./seo/seo-growth-engine");
      await registerStaticPages();
      return res.json({ ok: true, message: "All static pages registered in seo_content_pages" });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // ---------------------------------------------------------------------------
  // VIN Enrichment Queue admin endpoints (Task #289)
  // ---------------------------------------------------------------------------

  app.get("/api/admin/vin-enrichment/stats", requireAdmin, async (_req, res) => {
    try {
      const { getVinBackfillStatus } = await import("./vin-backfill/worker");
      const status = await getVinBackfillStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/vin-enrichment/recent", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
      // Join with vin_cache to extract chassis and SA code count for completed rows
      const rows = await db.execute(sql`
        SELECT
          q.vin,
          q.status,
          q.attempts,
          q.last_attempted_at,
          q.error,
          q.created_at,
          vc.enriched_data->>'vehicle' AS vehicle_json,
          jsonb_array_length(
            CASE
              WHEN vc.enriched_data ? 'options' AND jsonb_typeof(vc.enriched_data->'options') = 'array'
              THEN vc.enriched_data->'options'
              ELSE '[]'::jsonb
            END
          ) AS sa_count
        FROM vin_enrichment_queue q
        LEFT JOIN vin_cache vc ON vc.vin = q.vin
        WHERE q.status IN ('done', 'failed', 'in_progress')
        ORDER BY q.last_attempted_at DESC NULLS LAST
        LIMIT ${limit}
      `);
      const result = ((rows as any).rows || rows).map((r: any) => {
        let chassis: string | null = null;
        try {
          if (r.vehicle_json) {
            const v = typeof r.vehicle_json === "string" ? JSON.parse(r.vehicle_json) : r.vehicle_json;
            chassis = v?.chassis ?? null;
          }
        } catch { /* ignore */ }
        return {
          vin: r.vin,
          status: r.status,
          attempts: r.attempts,
          lastAttemptedAt: r.last_attempted_at,
          error: r.error,
          createdAt: r.created_at,
          chassis,
          saCount: r.sa_count != null ? Number(r.sa_count) : null,
        };
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // SEO Pages catalog panel + scheduler toggle (Task #315)
  // ---------------------------------------------------------------------------

  // GET /api/admin/seo-pages — unified paginated list of seo_content_pages +
  // bmv_vin_guide rows. Query params: page, limit, project, type, search.
  //
  // Stats are always global totals (unfiltered) so the summary cards reflect
  // the full corpus regardless of the active filter state.
  app.get("/api/admin/seo-pages", requireAdmin, async (req, res) => {
    try {
      const page    = Math.max(1,   parseInt(String(req.query.page  ?? "1"),  10) || 1);
      const limit   = Math.min(100, parseInt(String(req.query.limit ?? "50"), 10) || 50);
      const offset  = (page - 1) * limit;
      const project = String(req.query.project ?? "all");
      const type    = String(req.query.type    ?? "all");
      const search  = String(req.query.search  ?? "").trim();

      // ------------------------------------------------------------------
      // Global stats (always unfiltered — summarises full corpus).
      // Two simple aggregates; no user input is interpolated here.
      // ------------------------------------------------------------------
      const [cpStatsResult, guideStatsResult] = await Promise.all([
        db.execute(sql`
          SELECT project, page_type, COUNT(*)::int AS cnt
          FROM seo_content_pages
          GROUP BY project, page_type
        `),
        db.execute(sql`
          SELECT 'bmv.vin' AS project,
                 COALESCE(category, schema_type) AS page_type,
                 COUNT(*)::int AS cnt
          FROM bmv_vin_guide
          GROUP BY COALESCE(category, schema_type)
        `),
      ]);

      const allStatRows = [
        ...((cpStatsResult as any).rows || cpStatsResult),
        ...((guideStatsResult as any).rows || guideStatsResult),
      ];
      let statsTotal = 0;
      const byProject: Record<string, number> = {};
      const byType:    Record<string, number> = {};
      for (const r of allStatRows) {
        const n = Number(r.cnt);
        statsTotal += n;
        byProject[r.project]   = (byProject[r.project]   ?? 0) + n;
        byType[r.page_type]    = (byType[r.page_type]    ?? 0) + n;
      }

      // ------------------------------------------------------------------
      // Filtered + paginated rows. User-supplied filter values are bound
      // via Drizzle sql template parameters (never interpolated as strings).
      // ------------------------------------------------------------------

      // Build filter fragments using Drizzle's sql tag for safe binding.
      // We UNION two tables so we build each half separately then combine.

      // seo_content_pages half
      let cpFilter = sql`TRUE`;
      if (project !== "all") cpFilter = sql`${cpFilter} AND cp.project = ${project}`;
      if (type    !== "all") cpFilter = sql`${cpFilter} AND cp.page_type = ${type}`;
      if (search)            cpFilter = sql`${cpFilter} AND cp.primary_keyword ILIKE ${'%' + search + '%'}`;

      // bmv_vin_guide half — project is always bmv.vin
      let guideFilter = sql`TRUE`;
      const guideProjectMatch = project === "all" || project === "bmv.vin";
      if (!guideProjectMatch) guideFilter = sql`FALSE`;
      if (type   !== "all") guideFilter = sql`${guideFilter} AND COALESCE(g.category, g.schema_type) = ${type}`;
      if (search)           guideFilter = sql`${guideFilter} AND (g.title->>'en') ILIKE ${'%' + search + '%'}`;

      // Run count + rows in parallel
      const [countResult, rowsResult] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total FROM (
            SELECT cp.id FROM seo_content_pages cp WHERE ${cpFilter}
            UNION ALL
            SELECT g.id FROM bmv_vin_guide g WHERE ${guideFilter}
          ) t
        `),
        db.execute(sql`
          SELECT * FROM (
            SELECT
              cp.id::text    AS id,
              'seo_content_pages'::text AS source,
              cp.url,
              cp.page_type,
              cp.project,
              cp.primary_keyword,
              cp.word_count,
              cp.generated_at,
              cp.indexed     AS published
            FROM seo_content_pages cp WHERE ${cpFilter}
            UNION ALL
            SELECT
              g.id::text     AS id,
              'bmv_vin_guide'::text AS source,
              '/guides/' || g.slug AS url,
              COALESCE(g.category, g.schema_type) AS page_type,
              'bmv.vin'::text AS project,
              (g.title->>'en')::text AS primary_keyword,
              NULL::int      AS word_count,
              g.published_at AS generated_at,
              g.published
            FROM bmv_vin_guide g WHERE ${guideFilter}
          ) t
          ORDER BY generated_at DESC NULLS LAST
          LIMIT ${limit} OFFSET ${offset}
        `),
      ]);

      const total = Number(((countResult as any).rows || countResult)[0]?.total ?? 0);
      const rows  = ((rowsResult as any).rows || rowsResult).map((r: any) => ({
        id:             r.id,
        source:         r.source,
        url:            r.url,
        pageType:       r.page_type,
        project:        r.project,
        primaryKeyword: r.primary_keyword,
        wordCount:      r.word_count != null ? Number(r.word_count) : null,
        generatedAt:    r.generated_at,
        published:      r.published,
      }));

      res.json({ rows, total, page, limit, stats: { total: statsTotal, byProject, byType } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/seo-scheduler/status — returns enabled state + source
  app.get("/api/admin/seo-scheduler/status", requireAdmin, async (_req, res) => {
    try {
      const envDisabled = process.env.BMV_DISABLE_SEO_SCHEDULER === "1";
      if (envDisabled) {
        return res.json({ enabled: false, source: "env" });
      }
      const dbValue = await storage.getGlobalSetting("seo_scheduler_enabled");
      const enabled = dbValue === false || dbValue === "false" ? false : true;
      res.json({ enabled, source: "db" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/seo-scheduler/toggle — flip the DB flag
  app.post("/api/admin/seo-scheduler/toggle", requireAdmin, async (_req, res) => {
    try {
      const envDisabled = process.env.BMV_DISABLE_SEO_SCHEDULER === "1";
      if (envDisabled) {
        return res.status(400).json({ error: "Scheduler is hard-disabled via BMV_DISABLE_SEO_SCHEDULER=1 env var; cannot toggle from UI." });
      }
      const current = await storage.getGlobalSetting("seo_scheduler_enabled");
      const currentEnabled = current === false || current === "false" ? false : true;
      const newEnabled = !currentEnabled;
      await storage.setGlobalSetting("seo_scheduler_enabled", newEnabled);
      console.log(`[seo-scheduler] toggled to ${newEnabled ? "ENABLED" : "DISABLED"} via admin panel`);
      res.json({ enabled: newEnabled, source: "db" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // Admin — AI Usage stats (Task #300)
  // ---------------------------------------------------------------------------
  app.get("/api/admin/ai-usage/summary", requireAdmin, async (_req, res) => {
    try {
      const summary = await storage.getAiUsageSummary();
      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/ai-usage/logs", requireAdmin, async (req, res) => {
    try {
      const limit  = Math.min(parseInt(String(req.query.limit  ?? "50"),  10) || 50,  200);
      const offset = Math.max(parseInt(String(req.query.offset ?? "0"),   10) || 0,   0);
      const [logs, total] = await Promise.all([
        storage.listAiUsageLogs(limit, offset),
        storage.countAiUsageLogs(),
      ]);
      res.json({ logs, total, limit, offset });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // Rego -> VIN lookup (BMW Australia recall site, browser-side reCAPTCHA v3)
  // ---------------------------------------------------------------------------

  // In-process job store for async poll flow (token is sent by browser,
  // BMW call happens server-side and may take 1-3s)
  const regoJobs = new Map<string, {
    status: "pending" | "done" | "failed";
    result?: any;
    error?: string;
    startedAt: number;
  }>();

  function cleanOldRegoJobs() {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [id, job] of Array.from(regoJobs.entries())) {
      if (job.startedAt < cutoff) regoJobs.delete(id);
    }
  }

  app.post("/api/rego-lookup", async (req, res) => {
    try {
      const { rego, state, recaptchaToken } = req.body as { rego?: string; state?: string; recaptchaToken?: string };

      if (!rego || typeof rego !== "string") {
        return res.status(400).json({ error: "rego is required" });
      }
      const upperRego = rego.toUpperCase().trim();
      if (!/^[A-Z0-9]{1,9}$/.test(upperRego)) {
        return res.status(400).json({ error: "Invalid rego format" });
      }

      const st = (state ?? "NSW").toUpperCase() as AusState;
      if (!(AUS_STATES as readonly string[]).includes(st)) {
        return res.status(400).json({ error: `State must be one of: ${AUS_STATES.join(", ")}` });
      }

      // Cache hit -- instant return, no token needed
      const cached = await checkRegoCache(upperRego, st);
      if (cached) {
        return res.json({ status: "found", source: "cache", ...cached });
      }

      // No token -- tell frontend to solve reCAPTCHA first
      if (!recaptchaToken || typeof recaptchaToken !== "string") {
        return res.json({ status: "needs_token" });
      }

      // Kick off async BMW call
      cleanOldRegoJobs();
      const jobId = `${upperRego}-${st}-${Date.now()}`;
      regoJobs.set(jobId, { status: "pending", startedAt: Date.now() });

      lookupRegoWithToken(upperRego, st, recaptchaToken).then((outcome) => {
        const job = regoJobs.get(jobId);
        if (!job) return;
        if (outcome.found) {
          job.status = "done";
          job.result = outcome;
        } else {
          job.status = "failed";
          job.error = outcome.reason;
        }
      }).catch((err) => {
        const job = regoJobs.get(jobId);
        if (job) { job.status = "failed"; job.error = err?.message ?? "unknown"; }
      });

      return res.json({ status: "pending", jobId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/rego-lookup/:jobId", (req, res) => {
    const job = regoJobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found or expired" });
    }
    if (job.status === "pending") {
      return res.json({ status: "pending" });
    }
    if (job.status === "failed") {
      return res.json({ status: "failed", error: job.error });
    }
    return res.json({ status: "found", ...job.result });
  });

  return httpServer;
}

