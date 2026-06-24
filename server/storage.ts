import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, like, or, ilike, and, desc, count, gt, sql as drzSql, type SQL } from "drizzle-orm";
import * as appCache from "./cache";
import {
  cars, categories, subcategories, parts, users, apiKeys, bmwModels, userCars, partPricing, vinCache, provisionedAccounts,
  externalCatalogParts, backupLogs, globalSettings, passwordResetTokens,
  categoryEditorial, partEditorialNotes, hubEditorial,
  istaIngestRuns, istaIngestLocks,
  aiFaqCache,
  aiUsageLogs,
  type AiUsageLog,
  type IstaIngestRun, type InsertIstaIngestRun,
  type Car, type InsertCar, type Category, type InsertCategory,
  type Subcategory, type InsertSubcategory, type Part, type InsertPart,
  type User, type InsertUser, type ApiKey, type InsertApiKey,
  type BmwModel, type InsertBmwModel,
  type UserCar, type InsertUserCar,
  type PartPricing, type InsertPartPricing,
  type VinCache, type InsertVinCache,
  type ExternalCatalogPart, type InsertExternalCatalogPart,
  type BackupLog, type InsertBackupLog,
  type CategoryEditorial, type InsertCategoryEditorial,
  type PartEditorialNote, type InsertPartEditorialNote,
  type HubEditorial, type InsertHubEditorial,
  type AiFaqCache, type InsertAiFaqCache,
} from "@shared/schema";
import { sql } from "drizzle-orm";

// In production the dev DATABASE_URL points to the container-local "helium"
// postgres which is unreachable from the deployed VM.  PROD_DATABASE_URL is
// the real external connection string and takes precedence in that case.
const DB_URL =
  process.env.NODE_ENV === "production" && process.env.PROD_DATABASE_URL
    ? process.env.PROD_DATABASE_URL
    : process.env.DATABASE_URL;

// Web-app pool — capped so background workers cannot starve HTTP requests.
// statement_timeout=4500ms means any runaway query fails fast instead of
// blocking the pool for 30 s. idleTimeoutMillis releases idle connections
// after 30 s; connectionTimeoutMillis fails fast when the pool is full;
// idle_in_transaction_session_timeout kills stuck transactions within 10 s.
const pool = new pg.Pool({
  connectionString: DB_URL,
  max: 5,
  statement_timeout: 4500,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  options: "--idle_in_transaction_session_timeout=10000",
});
export const db = drizzle(pool);

// Separate pool for high-volume background workers (scraper, backfills).
// Higher statement_timeout (120 s) because bulk upserts can legitimately
// take a while; lower max (3) so workers cannot crowd out web-app queries.
const workerPool = new pg.Pool({
  connectionString: DB_URL,
  max: 3,
  statement_timeout: 120000,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  options: "--idle_in_transaction_session_timeout=10000",
});
export const workerDb = drizzle(workerPool);

// Dedicated health-probe pool — single connection, very short timeouts so
// the /health SELECT 1 can never block or be starved by the web/worker pools.
const healthPool = new pg.Pool({
  connectionString: DB_URL,
  max: 1,
  statement_timeout: 1000,
  connectionTimeoutMillis: 1500,
});
export const healthDb = drizzle(healthPool);

// Slim per-card shape used by the homepage car grid (Task #162). Only
// the columns the BMV `CarCard` and grouping logic actually render —
// dropping the bulky text columns (catalogUrl, scrapeError, etc.) cuts
// the response from a multi-MB blob to ~tens of KB. Keep this shape in
// sync with `client/src/pages/Home.tsx`'s `HomepageCar` type.
export type HomepageCar = {
  id: number;
  slug: string | null;
  displayName: string;
  modelName: string;
  series: string;
  chassis: string;
  bodyType: string;
  engine: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  scrapeStatus: string;
  scrapeProgress: number | null;
  totalCategories: number | null;
  totalSubcategories: number | null;
  totalParts: number | null;
  lastScrapedAt: Date | null;
};

export interface IStorage {
  getCars(): Promise<Car[]>;
  getCarsForHomepage(): Promise<HomepageCar[]>;
  getStatsSummary(): Promise<{ totalCars: number; scrapedCars: number; totalParts: number }>;
  getChassisAggregates(): Promise<{ chassis: string; carCount: number; totalParts: number; yearStart: number | null; yearEnd: number | null }[]>;
  getCar(id: number): Promise<Car | undefined>;
  getCarBySlug(slug: string): Promise<Car | undefined>;
  createCar(car: InsertCar): Promise<Car>;
  updateCar(id: number, data: Partial<Car>): Promise<Car | undefined>;

  getCategoriesByCarId(carId: number): Promise<Category[]>;
  createCategory(cat: InsertCategory): Promise<Category>;
  deleteCategories(carId: number): Promise<void>;

  getSubcategoriesByCategoryId(categoryId: number): Promise<Subcategory[]>;
  createSubcategory(sub: InsertSubcategory): Promise<Subcategory>;
  updateSubcategory(id: number, data: Partial<Subcategory>): Promise<void>;
  getSubcategoriesByCarId(carId: number): Promise<Subcategory[]>;

  getPartsBySubcategoryId(subcategoryId: number): Promise<Part[]>;
  getPartsByCarId(carId: number, search?: string, limit?: number, offset?: number): Promise<Part[]>;
  countPartsByCarId(carId: number, search?: string): Promise<number>;
  searchParts(search: string, carIds?: number[]): Promise<(Part & { subcategoryName: string; categoryName: string; carName: string })[]>;
  crossReferencePart(partNumberClean: string): Promise<{
    partNumber: string;
    partNumberClean: string;
    description: string;
    additionalInfo: string | null;
    weight: number | null;
    vehicles: { carId: number; carName: string; carSlug: string | null; chassis: string; engine: string; bodyType: string; yearStart: number; yearEnd: number | null; categoryId: number; categoryName: string; subcategoryId: number; subcategoryName: string; quantity: string | null; itemNo: string | null }[];
  } | null>;
  createParts(parts: InsertPart[]): Promise<void>;
  countParts(): Promise<number>;

  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser & { role?: string; email?: string | null }): Promise<User>;
  getUsers(): Promise<User[]>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getFirstAdminEmail(): Promise<string | null>;
  deleteUser(id: string): Promise<void>;

  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  isPasswordResetTokenValid(tokenHash: string): Promise<boolean>;
  consumePasswordResetToken(tokenHash: string): Promise<{ id: number; userId: string } | null>;
  deletePasswordResetTokensForUser(userId: string): Promise<void>;

  getBmwModels(chassis?: string): Promise<BmwModel[]>;
  getBmwModelByTypeCode(chassis: string, typeCode: string): Promise<BmwModel | undefined>;
  searchBmwModels(query: string): Promise<BmwModel[]>;
  upsertBmwModel(model: InsertBmwModel): Promise<BmwModel>;
  updateBmwModelImageUrl(id: number, imageUrl: string | null): Promise<void>;
  countBmwModels(): Promise<number>;
  getBmwModelChassisCodes(): Promise<{ chassis: string; count: number }[]>;
  clearBmwModels(): Promise<void>;

  getApiKeysByUserId(userId: string): Promise<ApiKey[]>;
  getAllApiKeys(): Promise<(ApiKey & { username: string })[]>;
  getApiKeyByKey(key: string): Promise<(ApiKey & { username: string }) | undefined>;
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  updateApiKey(id: number, data: Partial<ApiKey>): Promise<ApiKey | undefined>;
  deleteApiKey(id: number): Promise<void>;
  incrementApiKeyUsage(id: number): Promise<void>;

  getProvisionedAccountBySourceUser(source: string, sourceUserId: number): Promise<any | undefined>;
  getProvisionedAccountByUsername(username: string): Promise<any | undefined>;
  createProvisionedAccount(data: any): Promise<any>;
  updateProvisionedAccount(id: number, data: any): Promise<any>;

  getUserCars(userId: string): Promise<(UserCar & { matchedCar?: Car | null })[]>;
  getAllUserCarsRaw(): Promise<{ id: number; vin: string; vinData: any; userId: string }[]>;
  addUserCar(car: InsertUserCar): Promise<UserCar>;
  removeUserCar(id: number, userId: string): Promise<void>;
  updateUserCar(id: number, userId: string, data: Partial<UserCar>): Promise<UserCar | undefined>;
  updateUserCarVinData(id: number, vinData: any): Promise<void>;

  getVinCache(vin: string): Promise<VinCache | undefined>;
  upsertVinCache(data: InsertVinCache): Promise<VinCache>;
  getAllVinCache(): Promise<VinCache[]>;
  countVinCache(): Promise<number>;

  createBackupLog(data: InsertBackupLog): Promise<BackupLog>;
  updateBackupLog(id: number, data: Partial<BackupLog>): Promise<BackupLog | undefined>;
  getBackupLog(id: number): Promise<BackupLog | undefined>;
  listBackupLogs(limit?: number, offset?: number, type?: string): Promise<BackupLog[]>;
  countBackupLogs(type?: string): Promise<number>;
  countBackupLogsSince(since: Date, type?: string, status?: string): Promise<number>;
  getLatestBackupLog(type: string, status?: string): Promise<BackupLog | undefined>;

  getGlobalSetting(key: string): Promise<any | undefined>;
  setGlobalSetting(key: string, value: any): Promise<void>;

  upsertPartPricing(data: InsertPartPricing): Promise<PartPricing>;
  getPartPricing(partNumberClean: string): Promise<PartPricing | undefined>;
  countPartPricing(): Promise<number>;
  getDistinctPartNumbers(): Promise<string[]>;
  getUnpricedPartNumbers(): Promise<string[]>;

  upsertExternalCatalogParts(parts: InsertExternalCatalogPart[]): Promise<number>;
  getExternalCatalogPartByPartNumberClean(partNumberClean: string): Promise<ExternalCatalogPart | undefined>;
  searchExternalCatalogParts(opts: { model?: string; description?: string; limit?: number }): Promise<ExternalCatalogPart[]>;
  countExternalCatalogParts(): Promise<number>;
  getMaxExternalCatalogId(): Promise<number>;

  // SEO editorial. Locale-aware: passing `locale` retrieves that variant,
  // omitting it defaults to "en" so legacy callers keep working.
  listCategoryEditorial(): Promise<CategoryEditorial[]>;
  getCategoryEditorial(categoryKey: string, subcategoryKey?: string | null, locale?: string): Promise<CategoryEditorial | undefined>;
  upsertCategoryEditorial(data: InsertCategoryEditorial): Promise<CategoryEditorial>;
  deleteCategoryEditorial(id: number): Promise<void>;

  getPartEditorialNote(partNumberClean: string, locale?: string): Promise<PartEditorialNote | undefined>;
  upsertPartEditorialNote(data: InsertPartEditorialNote): Promise<PartEditorialNote>;
  deletePartEditorialNote(partNumberClean: string, locale?: string): Promise<void>;
  listPartEditorialNotes(limit?: number): Promise<PartEditorialNote[]>;

  listHubEditorial(): Promise<HubEditorial[]>;
  getHubEditorial(hubType: string, hubKey: string): Promise<HubEditorial | undefined>;
  upsertHubEditorial(data: InsertHubEditorial): Promise<HubEditorial>;
  deleteHubEditorial(id: number): Promise<void>;

  // Per-locale request analytics (Task #32). One bucket per (locale, day);
  // upsert increments hits.
  bumpLanguageRequestStat(locale: string): Promise<void>;
  getLanguageRequestStats(days?: number): Promise<{ locale: string; hits: number }[]>;

  // ISTA quarterly auto-ingest worker (Task #109).
  createIstaIngestRun(data: InsertIstaIngestRun): Promise<IstaIngestRun>;
  updateIstaIngestRun(id: number, data: Partial<IstaIngestRun>): Promise<IstaIngestRun | undefined>;
  getIstaIngestRun(id: number): Promise<IstaIngestRun | undefined>;
  listIstaIngestRuns(limit?: number): Promise<IstaIngestRun[]>;
  getLatestSuccessfulIstaIngestRun(excludeVersion?: string): Promise<IstaIngestRun | undefined>;
  hasSuccessfulIstaIngestForVersion(version: string): Promise<boolean>;
  tryAcquireIstaLock(version: string, bucketKey: string, owner: string): Promise<boolean>;
  releaseIstaLock(version: string): Promise<void>;

  // Related parts in same diagram (subcategory) for SEO internal linking.
  // Excludes the current part. Limited to keep payload small.
  getRelatedPartsInDiagram(partNumberClean: string, limit?: number): Promise<{ partNumber: string; partNumberClean: string; description: string }[]>;

  // AI FAQ cache (Task #228). Keyed by (pageType, pageKey, locale).
  getAiFaq(pageType: string, pageKey: string, locale: string): Promise<AiFaqCache | undefined>;
  upsertAiFaq(data: InsertAiFaqCache): Promise<AiFaqCache>;
  deleteAiFaqForKey(pageType: string, pageKey: string, locale?: string): Promise<void>;
  listAiFaqByPageType(pageType: string, limit?: number): Promise<AiFaqCache[]>;

  // Photo Quote (AI damage quoting tool)
  createPhotoQuote(data: import("@shared/schema").InsertPhotoQuote): Promise<import("@shared/schema").PhotoQuote>;
  getPhotoQuote(id: number): Promise<import("@shared/schema").PhotoQuote | undefined>;
  getPhotoQuoteByRef(ref: string): Promise<import("@shared/schema").PhotoQuote | undefined>;
  listPhotoQuotesByUser(userId: string): Promise<import("@shared/schema").PhotoQuote[]>;
  updatePhotoQuote(id: number, data: Partial<import("@shared/schema").PhotoQuote>): Promise<import("@shared/schema").PhotoQuote | undefined>;

  // AI Usage tracking (Task #300)
  getAiUsageSummary(): Promise<{
    allTime: number;
    last30Days: number;
    last7Days: number;
    today: number;
    byFeature: { feature: string; callCount: number; totalTokens: number; costUsd: number }[];
    byModel: { model: string; callCount: number; totalTokens: number; costUsd: number }[];
    dailySpend: { date: string; costUsd: number }[];
  }>;
  listAiUsageLogs(limit: number, offset: number): Promise<AiUsageLog[]>;
  countAiUsageLogs(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getCars(): Promise<Car[]> {
    return db.select().from(cars).orderBy(cars.id);
  }

  // Slim payload for the homepage car grid (Task #162). Selects only
  // the columns the per-card UI and grouping logic actually render so
  // the response stays small and parses fast in the browser.
  async getCarsForHomepage(): Promise<HomepageCar[]> {
    return db
      .select({
        id: cars.id,
        slug: cars.slug,
        displayName: cars.displayName,
        modelName: cars.modelName,
        series: cars.series,
        chassis: cars.chassis,
        bodyType: cars.bodyType,
        engine: cars.engine,
        yearStart: cars.yearStart,
        yearEnd: cars.yearEnd,
        scrapeStatus: cars.scrapeStatus,
        scrapeProgress: cars.scrapeProgress,
        totalCategories: cars.totalCategories,
        totalSubcategories: cars.totalSubcategories,
        totalParts: cars.totalParts,
        lastScrapedAt: cars.lastScrapedAt,
      })
      .from(cars)
      .orderBy(cars.id);
  }

  // Cheap aggregate for the homepage stat cards. Uses a single
  // round-trip with three SQL aggregates against the small `cars`
  // table (~2.4k rows) instead of `count(*) FROM parts` (5.97M rows,
  // ~4s seq scan). Total parts comes from `cars.total_parts` which
  // is written by the scraper at sync time and is the authoritative
  // counter we already display per-card; summing it avoids touching
  // the parts table at all.
  async getStatsSummary(): Promise<{ totalCars: number; scrapedCars: number; totalParts: number }> {
    const [row] = await db
      .select({
        totalCars: drzSql<number>`count(*)::int`,
        scrapedCars: drzSql<number>`count(*) FILTER (WHERE ${cars.scrapeStatus} = 'complete')::int`,
        totalParts: drzSql<number>`COALESCE(SUM(${cars.totalParts}), 0)::bigint`,
      })
      .from(cars);
    return {
      totalCars: Number(row?.totalCars ?? 0),
      scrapedCars: Number(row?.scrapedCars ?? 0),
      totalParts: Number(row?.totalParts ?? 0),
    };
  }

  // SQL-side chassis rollup used by the homepage Popular Chassis grid
  // and any other UI that just needs (chassis, carCount, totalParts,
  // yearRange). Replaces the previous /api/chassis handler that pulled
  // every car into Node and rebuilt the rollup in JS, including a per-
  // chassis nested cars[] array that the homepage didn't actually need.
  async getChassisAggregates(): Promise<{ chassis: string; carCount: number; totalParts: number; yearStart: number | null; yearEnd: number | null }[]> {
    const rows = await db
      .select({
        chassis: cars.chassis,
        carCount: drzSql<number>`count(*)::int`,
        totalParts: drzSql<number>`COALESCE(SUM(${cars.totalParts}), 0)::bigint`,
        yearStart: drzSql<number | null>`MIN(${cars.yearStart})`,
        yearEnd: drzSql<number | null>`MAX(COALESCE(${cars.yearEnd}, ${cars.yearStart}))`,
      })
      .from(cars)
      .where(drzSql`${cars.chassis} IS NOT NULL AND ${cars.chassis} <> ''`)
      .groupBy(cars.chassis)
      .orderBy(cars.chassis);
    return rows.map(r => ({
      chassis: r.chassis as string,
      carCount: Number(r.carCount ?? 0),
      totalParts: Number(r.totalParts ?? 0),
      yearStart: r.yearStart === null ? null : Number(r.yearStart),
      yearEnd: r.yearEnd === null ? null : Number(r.yearEnd),
    }));
  }

  async getCar(id: number): Promise<Car | undefined> {
    const [car] = await db.select().from(cars).where(eq(cars.id, id));
    return car;
  }

  async getCarBySlug(slug: string): Promise<Car | undefined> {
    const [car] = await db.select().from(cars).where(eq(cars.slug, slug));
    return car;
  }

  async createCar(car: InsertCar): Promise<Car> {
    const [created] = await db.insert(cars).values(car).returning();
    return created;
  }

  async getCategoriesByCarId(carId: number): Promise<Category[]> {
    return db.select().from(categories).where(eq(categories.carId, carId)).orderBy(categories.categoryId);
  }

  async createCategory(cat: InsertCategory): Promise<Category> {
    const [created] = await db.insert(categories).values(cat).returning();
    return created;
  }

  async deleteCategories(carId: number): Promise<void> {
    await db.delete(categories).where(eq(categories.carId, carId));
  }

  async getSubcategoriesByCategoryId(categoryId: number): Promise<Subcategory[]> {
    return db.select().from(subcategories).where(eq(subcategories.categoryId, categoryId)).orderBy(subcategories.subcategoryId);
  }

  async createSubcategory(sub: InsertSubcategory): Promise<Subcategory> {
    const [created] = await db.insert(subcategories).values(sub).returning();
    return created;
  }

  async updateSubcategory(id: number, data: Partial<Subcategory>): Promise<void> {
    await db.update(subcategories).set(data).where(eq(subcategories.id, id));
  }

  async getSubcategoriesByCarId(carId: number): Promise<Subcategory[]> {
    return db.select().from(subcategories).where(eq(subcategories.carId, carId));
  }

  async getPartsBySubcategoryId(subcategoryId: number): Promise<Part[]> {
    return db.select().from(parts).where(eq(parts.subcategoryId, subcategoryId)).orderBy(parts.itemNo);
  }

  async getPartsByCarId(carId: number, search?: string, limit = 50, offset = 0): Promise<Part[]> {
    if (search) {
      return db.select().from(parts)
        .where(and(
          eq(parts.carId, carId),
          or(
            ilike(parts.description, `%${search}%`),
            ilike(parts.partNumber, `%${search}%`),
            ilike(parts.partNumberClean, `%${search}%`),
          )
        ))
        .limit(limit)
        .offset(offset);
    }
    return db.select().from(parts)
      .where(eq(parts.carId, carId))
      .limit(limit)
      .offset(offset);
  }

  async countPartsByCarId(carId: number, search?: string): Promise<number> {
    const { count } = await import("drizzle-orm");
    if (search) {
      const [{ value }] = await db.select({ value: count() }).from(parts)
        .where(and(
          eq(parts.carId, carId),
          or(
            ilike(parts.description, `%${search}%`),
            ilike(parts.partNumber, `%${search}%`),
          )
        ));
      return Number(value);
    }
    const [{ value }] = await db.select({ value: count() }).from(parts).where(eq(parts.carId, carId));
    return Number(value);
  }

  async searchParts(search: string, carIds?: number[]): Promise<(Part & { subcategoryName: string; categoryName: string; carName: string })[]> {
    const cacheKey = `search:${search}:${carIds?.join(',') ?? ''}`;
    const cached = await appCache.getSearch<(Part & { subcategoryName: string; categoryName: string; carName: string })[]>(cacheKey);
    if (cached !== undefined) return cached;

    const results = await db
      .select({
        id: parts.id,
        subcategoryId: parts.subcategoryId,
        carId: parts.carId,
        itemNo: parts.itemNo,
        partNumber: parts.partNumber,
        partNumberClean: parts.partNumberClean,
        description: parts.description,
        additionalInfo: parts.additionalInfo,
        partDate: parts.partDate,
        quantity: parts.quantity,
        weight: parts.weight,
        notes: parts.notes,
        subcategoryName: subcategories.name,
        categoryName: categories.name,
        carName: cars.displayName,
      })
      .from(parts)
      .leftJoin(subcategories, eq(parts.subcategoryId, subcategories.id))
      .leftJoin(categories, eq(subcategories.categoryId, categories.id))
      .leftJoin(cars, eq(parts.carId, cars.id))
      .where(
        or(
          ilike(parts.description, `%${search}%`),
          ilike(parts.partNumber, `%${search}%`),
          ilike(parts.partNumberClean, `%${search}%`),
        )
      )
      .limit(100);
    const mapped = (results as any).map((r: any) => ({
      ...r,
      additionalInfo: r.additionalInfo && (r.additionalInfo.startsWith('realoem-backfill:') || r.additionalInfo.startsWith('realoem_backfill')) ? null : r.additionalInfo,
      notes: r.notes && (r.notes.startsWith('realoem-backfill:') || r.notes.startsWith('realoem_backfill')) ? null : r.notes,
    }));
    await appCache.setSearch(cacheKey, mapped);
    return mapped;
  }

  async crossReferencePart(partNumberClean: string): Promise<{
    partNumber: string;
    partNumberClean: string;
    description: string;
    additionalInfo: string | null;
    weight: number | null;
    vehicles: { carId: number; carName: string; carSlug: string | null; chassis: string; engine: string; bodyType: string; yearStart: number; yearEnd: number | null; categoryId: number; categoryName: string; subcategoryId: number; subcategoryName: string; quantity: string | null; itemNo: string | null }[];
  } | null> {
    const cacheKey = `xref:${partNumberClean}`;
    type XrefResult = NonNullable<Awaited<ReturnType<typeof this.crossReferencePart>>>;
    const cached = await appCache.getXref<XrefResult>(cacheKey);
    if (cached !== undefined) return cached;

    const results = await db
      .select({
        partNumber: parts.partNumber,
        partNumberClean: parts.partNumberClean,
        description: parts.description,
        additionalInfo: parts.additionalInfo,
        weight: parts.weight,
        quantity: parts.quantity,
        itemNo: parts.itemNo,
        carId: cars.id,
        carName: cars.displayName,
        carSlug: cars.slug,
        chassis: cars.chassis,
        engine: cars.engine,
        bodyType: cars.bodyType,
        yearStart: cars.yearStart,
        yearEnd: cars.yearEnd,
        categoryId: categories.id,
        categoryName: categories.name,
        subcategoryId: subcategories.id,
        subcategoryName: subcategories.name,
      })
      .from(parts)
      .leftJoin(subcategories, eq(parts.subcategoryId, subcategories.id))
      .leftJoin(categories, eq(subcategories.categoryId, categories.id))
      .leftJoin(cars, eq(parts.carId, cars.id))
      .where(eq(parts.partNumberClean, partNumberClean));

    if (results.length === 0) return null;

    const first = results[0];
    const seen = new Set<string>();
    const vehicles = results
      .filter(r => {
        const key = `${r.carId}-${r.categoryName}-${r.subcategoryName}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(r => ({
        carId: r.carId!,
        carName: r.carName || "",
        carSlug: r.carSlug || null,
        chassis: r.chassis || "",
        engine: r.engine || "",
        bodyType: r.bodyType || "",
        yearStart: r.yearStart || 0,
        yearEnd: r.yearEnd,
        categoryId: r.categoryId!,
        categoryName: r.categoryName || "",
        subcategoryId: r.subcategoryId!,
        subcategoryName: r.subcategoryName || "",
        quantity: r.quantity,
        itemNo: r.itemNo,
      }));

    const rawAdditionalInfo = first.additionalInfo;
    const cleanAdditionalInfo = rawAdditionalInfo && (rawAdditionalInfo.startsWith('realoem-backfill:') || rawAdditionalInfo.startsWith('realoem_backfill')) ? null : rawAdditionalInfo;
    const xref = {
      partNumber: first.partNumber || "",
      partNumberClean: first.partNumberClean || partNumberClean,
      description: first.description || "",
      additionalInfo: cleanAdditionalInfo,
      weight: first.weight,
      vehicles,
    };
    await appCache.setXref(cacheKey, xref);
    return xref;
  }

  async createParts(partsData: InsertPart[]): Promise<void> {
    if (partsData.length === 0) return;
    await db.insert(parts).values(partsData);
    for (const p of partsData) {
      if (p.partNumberClean) await appCache.invalidatePart(p.partNumberClean);
    }
  }

  // updateCar invalidates the homepage/chassis rollup cache whenever
  // scrapeStatus is part of the update so the homepage sees fresh data
  // shortly after a scrape completes rather than serving a 60-s stale view.
  async updateCar(id: number, data: Partial<Car>): Promise<Car | undefined> {
    const [updated] = await db.update(cars).set(data).where(eq(cars.id, id)).returning();
    if (data.scrapeStatus !== undefined) {
      await appCache.invalidateHomepageChassis();
    }
    return updated;
  }

  async countParts(): Promise<number> {
    const { count } = await import("drizzle-orm");
    const [{ value }] = await db.select({ value: count() }).from(parts);
    return Number(value);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser & { role?: string; email?: string | null }): Promise<User> {
    const { randomUUID } = await import("crypto");
    const bcrypt = await import("bcrypt");
    const hashedPassword = await bcrypt.hash(user.password, 10);
    const [created] = await db.insert(users).values({
      id: randomUUID(),
      username: user.username,
      password: hashedPassword,
      email: user.email ?? null,
      role: user.role || "user",
    }).returning();
    return created;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.createdAt);
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    if (data.password) {
      const bcrypt = await import("bcrypt");
      data.password = await bcrypt.hash(data.password, 10);
    }
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async getFirstAdminEmail(): Promise<string | null> {
    const [admin] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.role, "admin"))
      .orderBy(users.createdAt)
      .limit(1);
    const email = admin?.email?.trim();
    return email && email.length > 0 ? email : null;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
  }

  async isPasswordResetTokenValid(tokenHash: string): Promise<boolean> {
    const result = await db.execute(sql`
      SELECT 1 FROM password_reset_tokens
      WHERE token_hash = ${tokenHash}
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `);
    const rows = (result as any).rows || result;
    return rows.length > 0;
  }

  async consumePasswordResetToken(tokenHash: string): Promise<{ id: number; userId: string } | null> {
    const result = await db.execute(sql`
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE token_hash = ${tokenHash}
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING id, user_id
    `);
    const rows = (result as any).rows || result;
    if (rows.length === 0) return null;
    return { id: rows[0].id, userId: rows[0].user_id };
  }

  async deletePasswordResetTokensForUser(userId: string): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  }

  async getApiKeysByUserId(userId: string): Promise<ApiKey[]> {
    return db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(apiKeys.createdAt);
  }

  async getAllApiKeys(): Promise<(ApiKey & { username: string })[]> {
    const results = await db
      .select({
        id: apiKeys.id,
        userId: apiKeys.userId,
        key: apiKeys.key,
        name: apiKeys.name,
        tier: apiKeys.tier,
        active: apiKeys.active,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        requestCount: apiKeys.requestCount,
        username: users.username,
      })
      .from(apiKeys)
      .leftJoin(users, eq(apiKeys.userId, users.id))
      .orderBy(apiKeys.createdAt);
    return results.map(r => ({ ...r, username: r.username || "" })) as any;
  }

  async getApiKeyByKey(key: string): Promise<(ApiKey & { username: string }) | undefined> {
    const [result] = await db
      .select({
        id: apiKeys.id,
        userId: apiKeys.userId,
        key: apiKeys.key,
        name: apiKeys.name,
        tier: apiKeys.tier,
        active: apiKeys.active,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        requestCount: apiKeys.requestCount,
        username: users.username,
      })
      .from(apiKeys)
      .leftJoin(users, eq(apiKeys.userId, users.id))
      .where(eq(apiKeys.key, key));
    if (!result) return undefined;
    return { ...result, username: result.username || "" } as any;
  }

  async createApiKey(apiKey: InsertApiKey): Promise<ApiKey> {
    const [created] = await db.insert(apiKeys).values(apiKey).returning();
    return created;
  }

  async updateApiKey(id: number, data: Partial<ApiKey>): Promise<ApiKey | undefined> {
    const [updated] = await db.update(apiKeys).set(data).where(eq(apiKeys.id, id)).returning();
    return updated;
  }

  async deleteApiKey(id: number): Promise<void> {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  }

  async incrementApiKeyUsage(id: number): Promise<void> {
    const { sql } = await import("drizzle-orm");
    await db.update(apiKeys)
      .set({ lastUsedAt: new Date(), requestCount: sql`${apiKeys.requestCount} + 1` })
      .where(eq(apiKeys.id, id));
  }

  async getBmwModels(chassis?: string): Promise<BmwModel[]> {
    if (chassis) {
      return db.select().from(bmwModels).where(ilike(bmwModels.chassis, chassis)).orderBy(bmwModels.modelName);
    }
    return db.select().from(bmwModels).orderBy(bmwModels.chassis, bmwModels.modelName);
  }

  async getBmwModelByTypeCode(chassis: string, typeCode: string): Promise<BmwModel | undefined> {
    const [model] = await db.select().from(bmwModels)
      .where(and(ilike(bmwModels.chassis, chassis), ilike(bmwModels.typeCode, typeCode)));
    return model;
  }

  async searchBmwModels(query: string): Promise<BmwModel[]> {
    const q = `%${query}%`;
    return db.select().from(bmwModels)
      .where(or(
        ilike(bmwModels.modelName, q),
        ilike(bmwModels.chassis, q),
        ilike(bmwModels.typeCode, q),
        ilike(bmwModels.engineCode, q),
        ilike(bmwModels.market, q),
      ))
      .orderBy(bmwModels.chassis, bmwModels.modelName)
      .limit(100);
  }

  async upsertBmwModel(model: InsertBmwModel): Promise<BmwModel> {
    const { sql } = await import("drizzle-orm");
    const existing = await this.getBmwModelByTypeCode(model.chassis, model.typeCode);
    if (existing) {
      const [updated] = await db.update(bmwModels).set(model).where(eq(bmwModels.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(bmwModels).values(model).returning();
    return created;
  }

  async updateBmwModelImageUrl(id: number, imageUrl: string | null): Promise<void> {
    await db.update(bmwModels).set({ imageUrl }).where(eq(bmwModels.id, id));
  }

  async countBmwModels(): Promise<number> {
    const { sql } = await import("drizzle-orm");
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(bmwModels);
    return Number(result.count);
  }

  async getBmwModelChassisCodes(): Promise<{ chassis: string; count: number }[]> {
    const { sql } = await import("drizzle-orm");
    const rows = await db.select({
      chassis: bmwModels.chassis,
      count: sql<number>`count(*)`,
    }).from(bmwModels).groupBy(bmwModels.chassis).orderBy(bmwModels.chassis);
    return rows.map(r => ({ chassis: r.chassis, count: Number(r.count) }));
  }

  async clearBmwModels(): Promise<void> {
    await db.delete(bmwModels);
  }

  async getProvisionedAccountBySourceUser(source: string, sourceUserId: number): Promise<any | undefined> {
    const [row] = await db.select().from(provisionedAccounts)
      .where(and(eq(provisionedAccounts.source, source), eq(provisionedAccounts.sourceUserId, sourceUserId)));
    return row;
  }

  async getProvisionedAccountByUsername(username: string): Promise<any | undefined> {
    const [row] = await db.select().from(provisionedAccounts).where(eq(provisionedAccounts.username, username));
    return row;
  }

  async createProvisionedAccount(data: any): Promise<any> {
    const [created] = await db.insert(provisionedAccounts).values(data).returning();
    return created;
  }

  async updateProvisionedAccount(id: number, data: any): Promise<any> {
    const [updated] = await db.update(provisionedAccounts).set({ ...data, updatedAt: new Date() }).where(eq(provisionedAccounts.id, id)).returning();
    return updated;
  }

  async getUserCars(userId: string): Promise<(UserCar & { matchedCar?: Car | null })[]> {
    const rows = await db.select().from(userCars).where(eq(userCars.userId, userId)).orderBy(desc(userCars.createdAt));
    const result: (UserCar & { matchedCar?: Car | null })[] = [];
    for (const row of rows) {
      let matchedCar: Car | null = null;
      if (row.matchedCarId) {
        matchedCar = (await db.select().from(cars).where(eq(cars.id, row.matchedCarId)))[0] || null;
      }
      result.push({ ...row, matchedCar });
    }
    return result;
  }

  async addUserCar(car: InsertUserCar): Promise<UserCar> {
    const [created] = await db.insert(userCars).values(car).returning();
    return created;
  }

  async removeUserCar(id: number, userId: string): Promise<void> {
    await db.delete(userCars).where(and(eq(userCars.id, id), eq(userCars.userId, userId)));
  }

  async getAllUserCarsRaw(): Promise<{ id: number; vin: string; vinData: any; userId: string }[]> {
    const rows = await db.select({
      id: userCars.id,
      vin: userCars.vin,
      vinData: userCars.vinData,
      userId: userCars.userId,
    }).from(userCars);
    return rows;
  }

  async updateUserCar(id: number, userId: string, data: Partial<UserCar>): Promise<UserCar | undefined> {
    const [updated] = await db.update(userCars).set(data).where(and(eq(userCars.id, id), eq(userCars.userId, userId))).returning();
    return updated;
  }

  async updateUserCarVinData(id: number, vinData: any): Promise<void> {
    await db.update(userCars).set({ vinData }).where(eq(userCars.id, id));
  }

  async getVinCache(vin: string): Promise<VinCache | undefined> {
    const [row] = await db.select().from(vinCache).where(eq(vinCache.vin, vin.toUpperCase()));
    return row;
  }

  async upsertVinCache(data: InsertVinCache): Promise<VinCache> {
    const cleanVin = data.vin.toUpperCase();
    const existing = await this.getVinCache(cleanVin);
    if (existing) {
      const [updated] = await db.update(vinCache)
        .set({ ...data, vin: cleanVin, updatedAt: new Date() })
        .where(eq(vinCache.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(vinCache).values({ ...data, vin: cleanVin }).returning();
    return created;
  }

  async getAllVinCache(): Promise<VinCache[]> {
    return db.select().from(vinCache).orderBy(desc(vinCache.updatedAt));
  }

  async countVinCache(): Promise<number> {
    const { sql } = await import("drizzle-orm");
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(vinCache);
    return row?.count || 0;
  }

  async upsertPartPricing(data: InsertPartPricing): Promise<PartPricing> {
    const { sql } = await import("drizzle-orm");
    const existing = await this.getPartPricing(data.partNumberClean);
    if (existing) {
      const [updated] = await db.update(partPricing)
        .set({ ...data, lastCheckedAt: new Date() })
        .where(eq(partPricing.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(partPricing).values(data).returning();
    return created;
  }

  async getPartPricing(partNumberClean: string): Promise<PartPricing | undefined> {
    const [row] = await db.select().from(partPricing).where(eq(partPricing.partNumberClean, partNumberClean));
    return row;
  }

  async countPartPricing(): Promise<number> {
    const { sql } = await import("drizzle-orm");
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(partPricing);
    return Number(result.count);
  }

  async getDistinctPartNumbers(): Promise<string[]> {
    const { sql } = await import("drizzle-orm");
    const rows = await db.select({ pn: sql<string>`DISTINCT part_number_clean` }).from(parts).where(sql`part_number_clean IS NOT NULL AND part_number_clean != ''`);
    return rows.map(r => r.pn);
  }

  async createBackupLog(data: InsertBackupLog): Promise<BackupLog> {
    const [created] = await db.insert(backupLogs).values(data).returning();
    return created;
  }

  async updateBackupLog(id: number, data: Partial<BackupLog>): Promise<BackupLog | undefined> {
    const [updated] = await db.update(backupLogs).set(data).where(eq(backupLogs.id, id)).returning();
    return updated;
  }

  async getBackupLog(id: number): Promise<BackupLog | undefined> {
    const [row] = await db.select().from(backupLogs).where(eq(backupLogs.id, id));
    return row;
  }

  async listBackupLogs(limit = 50, offset = 0, type?: string): Promise<BackupLog[]> {
    const q = db.select().from(backupLogs);
    const filtered = type ? q.where(eq(backupLogs.backupType, type)) : q;
    return filtered.orderBy(desc(backupLogs.createdAt)).limit(limit).offset(offset);
  }

  async countBackupLogs(type?: string): Promise<number> {
    if (type) {
      const [{ value }] = await db.select({ value: count() }).from(backupLogs).where(eq(backupLogs.backupType, type));
      return Number(value);
    }
    const [{ value }] = await db.select({ value: count() }).from(backupLogs);
    return Number(value);
  }

  async countBackupLogsSince(since: Date, type?: string, status?: string): Promise<number> {
    const conditions: any[] = [gt(backupLogs.createdAt, since)];
    if (type) conditions.push(eq(backupLogs.backupType, type));
    if (status) conditions.push(eq(backupLogs.status, status));
    const [{ value }] = await db.select({ value: count() }).from(backupLogs).where(and(...conditions));
    return Number(value);
  }

  async getLatestBackupLog(type: string, status?: string): Promise<BackupLog | undefined> {
    const conditions: any[] = [eq(backupLogs.backupType, type)];
    if (status) conditions.push(eq(backupLogs.status, status));
    const [row] = await db.select().from(backupLogs).where(and(...conditions)).orderBy(desc(backupLogs.createdAt)).limit(1);
    return row;
  }

  async getGlobalSetting(key: string): Promise<any | undefined> {
    const [row] = await db.select().from(globalSettings).where(eq(globalSettings.key, key));
    return row?.value;
  }

  async setGlobalSetting(key: string, value: any): Promise<void> {
    const existing = await this.getGlobalSetting(key);
    if (existing === undefined) {
      await db.insert(globalSettings).values({ key, value });
    } else {
      await db.update(globalSettings).set({ value, updatedAt: new Date() }).where(eq(globalSettings.key, key));
    }
  }

  async getUnpricedPartNumbers(): Promise<string[]> {
    const rows = await db.select({ pn: drzSql<string>`DISTINCT part_number_clean` }).from(parts).where(drzSql`part_number_clean IS NOT NULL AND part_number_clean != '' AND part_number_clean NOT IN (SELECT part_number_clean FROM part_pricing)`);
    return rows.map(r => r.pn);
  }

  async upsertExternalCatalogParts(rows: InsertExternalCatalogPart[]): Promise<number> {
    if (rows.length === 0) return 0;
    // ON CONFLICT(external_id) DO UPDATE — upserts in a single round-trip per chunk.
    const result = await db
      .insert(externalCatalogParts)
      .values(rows)
      .onConflictDoUpdate({
        target: externalCatalogParts.externalId,
        set: {
          brand: sql`excluded.brand`,
          modelSeries: sql`excluded.model_series`,
          model: sql`excluded.model`,
          partGroup: sql`excluded.part_group`,
          subgroup: sql`excluded.subgroup`,
          partNumber: sql`excluded.part_number`,
          partNumberClean: sql`excluded.part_number_clean`,
          description: sql`excluded.description`,
          price: sql`excluded.price`,
          currency: sql`excluded.currency`,
          supersessionPartNumber: sql`excluded.supersession_part_number`,
          supersessionInfo: sql`excluded.supersession_info`,
          quantity: sql`excluded.quantity`,
          diagramImagePath: sql`excluded.diagram_image_path`,
          diagramRefNumber: sql`excluded.diagram_ref_number`,
          compatibility: sql`excluded.compatibility`,
          hierarchyPath: sql`excluded.hierarchy_path`,
          sourceUrl: sql`excluded.source_url`,
          metadata: sql`excluded.metadata`,
          catalogLastScrapedAt: sql`excluded.catalog_last_scraped_at`,
          importedAt: sql`now()`,
        },
      });
    return rows.length;
  }

  async getExternalCatalogPartByPartNumberClean(partNumberClean: string): Promise<ExternalCatalogPart | undefined> {
    // Strip any whitespace/dashes a caller may have left in (cache stores cleaned form).
    const pn = String(partNumberClean || "").replace(/[\s\-]+/g, "");
    if (!pn) return undefined;
    const [row] = await db.select().from(externalCatalogParts)
      .where(eq(externalCatalogParts.partNumberClean, pn))
      .limit(1);
    return row;
  }

  async searchExternalCatalogParts(opts: { model?: string; description?: string; limit?: number }): Promise<ExternalCatalogPart[]> {
    const limit = Math.min(opts.limit ?? 24, 100);
    const conditions = [] as any[];
    if (opts.model) {
      // Engineroom stores chassis codes uppercase ("G20", "F30"); normalize input
      // so callers can pass lowercase/mixed case without missing local cache hits.
      const m = opts.model.trim().toUpperCase();
      conditions.push(sql`upper(${externalCatalogParts.model}) = ${m}`);
    }
    if (opts.description) {
      conditions.push(ilike(externalCatalogParts.description, `%${opts.description}%`));
    }
    const where = conditions.length === 1 ? conditions[0] : and(...conditions);
    return db.select().from(externalCatalogParts).where(where).limit(limit);
  }

  async countExternalCatalogParts(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(externalCatalogParts);
    return row?.count ?? 0;
  }

  async getMaxExternalCatalogId(): Promise<number> {
    const [row] = await db.select({ max: sql<number>`coalesce(max(external_id), 0)::int` }).from(externalCatalogParts);
    return row?.max ?? 0;
  }

  async listCategoryEditorial(): Promise<CategoryEditorial[]> {
    return db.select().from(categoryEditorial).orderBy(categoryEditorial.categoryKey, categoryEditorial.subcategoryKey);
  }

  async getCategoryEditorial(categoryKey: string, subcategoryKey?: string | null, locale: string = "en"): Promise<CategoryEditorial | undefined> {
    const sub = subcategoryKey ?? null;
    const rows = await db.select().from(categoryEditorial)
      .where(sub === null
        ? and(eq(categoryEditorial.categoryKey, categoryKey), sql`${categoryEditorial.subcategoryKey} IS NULL`, eq(categoryEditorial.locale, locale))
        : and(eq(categoryEditorial.categoryKey, categoryKey), eq(categoryEditorial.subcategoryKey, sub), eq(categoryEditorial.locale, locale))
      )
      .limit(1);
    if (rows[0]) return rows[0];
    // Graceful fallback: when a locale-specific blurb is missing, return the
    // English variant so non-en pages still render the editorial paragraph.
    if (locale !== "en") {
      const en = await db.select().from(categoryEditorial)
        .where(sub === null
          ? and(eq(categoryEditorial.categoryKey, categoryKey), sql`${categoryEditorial.subcategoryKey} IS NULL`, eq(categoryEditorial.locale, "en"))
          : and(eq(categoryEditorial.categoryKey, categoryKey), eq(categoryEditorial.subcategoryKey, sub), eq(categoryEditorial.locale, "en"))
        )
        .limit(1);
      return en[0];
    }
    return undefined;
  }

  async upsertCategoryEditorial(data: InsertCategoryEditorial): Promise<CategoryEditorial> {
    const locale = data.locale ?? "en";
    const existing = await this.getCategoryEditorial(data.categoryKey, data.subcategoryKey ?? null, locale);
    // existing might be the English fallback; only treat it as "the same row"
    // if its locale matches what we're upserting.
    if (existing && existing.locale === locale) {
      const [row] = await db.update(categoryEditorial)
        .set({ blurb: data.blurb, updatedAt: new Date() })
        .where(eq(categoryEditorial.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(categoryEditorial).values({ ...data, locale }).returning();
    return row;
  }

  async deleteCategoryEditorial(id: number): Promise<void> {
    await db.delete(categoryEditorial).where(eq(categoryEditorial.id, id));
  }

  async getPartEditorialNote(partNumberClean: string, locale: string = "en"): Promise<PartEditorialNote | undefined> {
    const rows = await db.select().from(partEditorialNotes)
      .where(and(eq(partEditorialNotes.partNumberClean, partNumberClean), eq(partEditorialNotes.locale, locale)))
      .limit(1);
    if (rows[0]) return rows[0];
    if (locale !== "en") {
      const en = await db.select().from(partEditorialNotes)
        .where(and(eq(partEditorialNotes.partNumberClean, partNumberClean), eq(partEditorialNotes.locale, "en")))
        .limit(1);
      return en[0];
    }
    return undefined;
  }

  async upsertPartEditorialNote(data: InsertPartEditorialNote): Promise<PartEditorialNote> {
    const locale = data.locale ?? "en";
    const existing = await this.getPartEditorialNote(data.partNumberClean, locale);
    if (existing && existing.locale === locale) {
      const [row] = await db.update(partEditorialNotes)
        .set({ note: data.note, updatedAt: new Date() })
        .where(eq(partEditorialNotes.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(partEditorialNotes).values({ ...data, locale }).returning();
    return row;
  }

  async deletePartEditorialNote(partNumberClean: string, locale?: string): Promise<void> {
    if (locale) {
      await db.delete(partEditorialNotes)
        .where(and(eq(partEditorialNotes.partNumberClean, partNumberClean), eq(partEditorialNotes.locale, locale)));
    } else {
      await db.delete(partEditorialNotes).where(eq(partEditorialNotes.partNumberClean, partNumberClean));
    }
  }

  async listPartEditorialNotes(limit: number = 200): Promise<PartEditorialNote[]> {
    return db.select().from(partEditorialNotes).orderBy(desc(partEditorialNotes.updatedAt)).limit(limit);
  }

  async listHubEditorial(): Promise<HubEditorial[]> {
    return db.select().from(hubEditorial).orderBy(hubEditorial.hubType, hubEditorial.hubKey);
  }

  async getHubEditorial(hubType: string, hubKey: string): Promise<HubEditorial | undefined> {
    const rows = await db.select().from(hubEditorial)
      .where(and(eq(hubEditorial.hubType, hubType), eq(hubEditorial.hubKey, hubKey)))
      .limit(1);
    return rows[0];
  }

  async upsertHubEditorial(data: InsertHubEditorial): Promise<HubEditorial> {
    const existing = await this.getHubEditorial(data.hubType, data.hubKey);
    if (existing) {
      const [row] = await db.update(hubEditorial)
        .set({ blurb: data.blurb, updatedAt: new Date() })
        .where(eq(hubEditorial.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(hubEditorial).values(data).returning();
    return row;
  }

  async deleteHubEditorial(id: number): Promise<void> {
    await db.delete(hubEditorial).where(eq(hubEditorial.id, id));
  }

  async bumpLanguageRequestStat(locale: string): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    // Upsert via raw SQL — simple and avoids a select+update round-trip.
    await db.execute(sql`
      INSERT INTO language_request_stats (locale, day, hits, updated_at)
      VALUES (${locale}, ${day}, 1, NOW())
      ON CONFLICT (locale, day) DO UPDATE
      SET hits = language_request_stats.hits + 1, updated_at = NOW()
    `);
  }

  async getLanguageRequestStats(days: number = 30): Promise<{ locale: string; hits: number }[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = await db.execute(sql`
      SELECT locale, SUM(hits)::int AS hits
      FROM language_request_stats
      WHERE day >= ${cutoff}
      GROUP BY locale
      ORDER BY hits DESC
    `);
    return (result.rows as any[]).map(r => ({ locale: r.locale, hits: Number(r.hits) }));
  }

  async getRelatedPartsInDiagram(partNumberClean: string, limit: number = 8): Promise<{ partNumber: string; partNumberClean: string; description: string }[]> {
    const cacheKey = `related:${partNumberClean}`;
    const cached = await appCache.getRelated<{ partNumber: string; partNumberClean: string; description: string }[]>(cacheKey);
    if (cached !== undefined) return cached;

    // Find the subcategories the part appears in, then return distinct sibling parts.
    const result = await db.execute(sql`
      WITH self_subs AS (
        SELECT DISTINCT subcategory_id FROM parts WHERE part_number_clean = ${partNumberClean}
      )
      SELECT DISTINCT ON (p.part_number_clean)
        p.part_number AS "partNumber",
        p.part_number_clean AS "partNumberClean",
        p.description AS "description"
      FROM parts p
      WHERE p.subcategory_id IN (SELECT subcategory_id FROM self_subs)
        AND p.part_number_clean <> ${partNumberClean}
        AND p.description IS NOT NULL
        AND p.description <> ''
      ORDER BY p.part_number_clean
      LIMIT ${limit}
    `);
    const rows = result.rows as Array<{ partNumber: string; partNumberClean: string; description: string }>;
    const related = rows.map(r => ({
      partNumber: r.partNumber,
      partNumberClean: r.partNumberClean,
      description: r.description,
    }));
    await appCache.setRelated(cacheKey, related);
    return related;
  }

  async createIstaIngestRun(data: InsertIstaIngestRun): Promise<IstaIngestRun> {
    const [created] = await db.insert(istaIngestRuns).values(data).returning();
    return created;
  }

  async updateIstaIngestRun(id: number, data: Partial<IstaIngestRun>): Promise<IstaIngestRun | undefined> {
    const [updated] = await db.update(istaIngestRuns).set(data).where(eq(istaIngestRuns.id, id)).returning();
    return updated;
  }

  async getIstaIngestRun(id: number): Promise<IstaIngestRun | undefined> {
    const [row] = await db.select().from(istaIngestRuns).where(eq(istaIngestRuns.id, id));
    return row;
  }

  async listIstaIngestRuns(limit = 50): Promise<IstaIngestRun[]> {
    return db.select().from(istaIngestRuns).orderBy(desc(istaIngestRuns.createdAt)).limit(limit);
  }

  async getLatestSuccessfulIstaIngestRun(excludeVersion?: string): Promise<IstaIngestRun | undefined> {
    const conds: any[] = [eq(istaIngestRuns.status, "succeeded")];
    if (excludeVersion) conds.push(drzSql`${istaIngestRuns.version} <> ${excludeVersion}`);
    const [row] = await db.select().from(istaIngestRuns)
      .where(and(...conds))
      .orderBy(desc(istaIngestRuns.finishedAt))
      .limit(1);
    return row;
  }

  async hasSuccessfulIstaIngestForVersion(version: string): Promise<boolean> {
    const [row] = await db.select({ id: istaIngestRuns.id }).from(istaIngestRuns)
      .where(and(eq(istaIngestRuns.version, version), eq(istaIngestRuns.status, "succeeded")))
      .limit(1);
    return !!row;
  }

  async tryAcquireIstaLock(version: string, bucketKey: string, owner: string): Promise<boolean> {
    const result = await db.insert(istaIngestLocks)
      .values({ version, bucketKey, acquiredBy: owner })
      .onConflictDoNothing()
      .returning({ version: istaIngestLocks.version });
    return result.length > 0;
  }

  async releaseIstaLock(version: string): Promise<void> {
    await db.delete(istaIngestLocks).where(eq(istaIngestLocks.version, version));
  }

  // --- AI FAQ cache (Task #228) ---

  async getAiFaq(pageType: string, pageKey: string, locale: string): Promise<AiFaqCache | undefined> {
    const [row] = await db
      .select()
      .from(aiFaqCache)
      .where(
        and(
          eq(aiFaqCache.pageType, pageType),
          eq(aiFaqCache.pageKey, pageKey),
          eq(aiFaqCache.locale, locale),
        ),
      )
      .limit(1);
    return row;
  }

  async upsertAiFaq(data: InsertAiFaqCache): Promise<AiFaqCache> {
    const [row] = await db
      .insert(aiFaqCache)
      .values({ ...data, generatedAt: new Date() })
      .onConflictDoUpdate({
        target: [aiFaqCache.pageType, aiFaqCache.pageKey, aiFaqCache.locale],
        set: { faqItems: data.faqItems, generatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async deleteAiFaqForKey(pageType: string, pageKey: string, locale?: string): Promise<void> {
    if (locale) {
      await db
        .delete(aiFaqCache)
        .where(
          and(
            eq(aiFaqCache.pageType, pageType),
            eq(aiFaqCache.pageKey, pageKey),
            eq(aiFaqCache.locale, locale),
          ),
        );
    } else {
      await db
        .delete(aiFaqCache)
        .where(
          and(
            eq(aiFaqCache.pageType, pageType),
            eq(aiFaqCache.pageKey, pageKey),
          ),
        );
    }
  }

  async listAiFaqByPageType(pageType: string, limit = 100): Promise<AiFaqCache[]> {
    return db
      .select()
      .from(aiFaqCache)
      .where(eq(aiFaqCache.pageType, pageType))
      .orderBy(desc(aiFaqCache.generatedAt))
      .limit(limit);
  }

  async createPhotoQuote(data: import("@shared/schema").InsertPhotoQuote): Promise<import("@shared/schema").PhotoQuote> {
    const { photoQuotes } = await import("@shared/schema");
    const [row] = await db.insert(photoQuotes).values(data).returning();
    return row;
  }

  async getPhotoQuote(id: number): Promise<import("@shared/schema").PhotoQuote | undefined> {
    const { photoQuotes } = await import("@shared/schema");
    const [row] = await db.select().from(photoQuotes).where(eq(photoQuotes.id, id));
    return row;
  }

  async getPhotoQuoteByRef(ref: string): Promise<import("@shared/schema").PhotoQuote | undefined> {
    const { photoQuotes } = await import("@shared/schema");
    const [row] = await db.select().from(photoQuotes).where(eq(photoQuotes.quoteRef, ref));
    return row;
  }

  async listPhotoQuotesByUser(userId: string): Promise<import("@shared/schema").PhotoQuote[]> {
    const { photoQuotes } = await import("@shared/schema");
    return db
      .select()
      .from(photoQuotes)
      .where(eq(photoQuotes.userId, userId))
      .orderBy(desc(photoQuotes.createdAt));
  }

  async updatePhotoQuote(id: number, data: Partial<import("@shared/schema").PhotoQuote>): Promise<import("@shared/schema").PhotoQuote | undefined> {
    const { photoQuotes } = await import("@shared/schema");
    const [row] = await db
      .update(photoQuotes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(photoQuotes.id, id))
      .returning();
    return row;
  }

  async getAiUsageSummary(): Promise<{
    allTime: number;
    last30Days: number;
    last7Days: number;
    today: number;
    byFeature: { feature: string; callCount: number; totalTokens: number; costUsd: number }[];
    byModel: { model: string; callCount: number; totalTokens: number; costUsd: number }[];
    dailySpend: { date: string; costUsd: number }[];
  }> {
    const totalsResult = await db.execute<any>(drzSql`
      SELECT
        COALESCE(SUM(cost_usd), 0)::float                                                      AS all_time,
        COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0)::float AS last_30,
        COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'),  0)::float AS last_7,
        COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= NOW()::date),                0)::float AS today
      FROM ai_usage_logs
    `);

    const featureRows = await db.execute<any>(drzSql`
      SELECT
        feature,
        COUNT(*)::int                                  AS call_count,
        COALESCE(SUM(prompt_tokens + completion_tokens), 0)::int AS total_tokens,
        COALESCE(SUM(cost_usd), 0)::float              AS cost_usd
      FROM ai_usage_logs
      GROUP BY feature
      ORDER BY cost_usd DESC
    `);

    const modelRows = await db.execute<any>(drzSql`
      SELECT
        model,
        COUNT(*)::int                                  AS call_count,
        COALESCE(SUM(prompt_tokens + completion_tokens), 0)::int AS total_tokens,
        COALESCE(SUM(cost_usd), 0)::float              AS cost_usd
      FROM ai_usage_logs
      GROUP BY model
      ORDER BY cost_usd DESC
    `);

    const dailyRows = await db.execute<any>(drzSql`
      SELECT
        TO_CHAR(created_at::date, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(cost_usd), 0)::float        AS cost_usd
      FROM ai_usage_logs
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY created_at::date
      ORDER BY created_at::date ASC
    `);

    const row = ((totalsResult as any).rows ?? totalsResult)?.[0] ?? {};
    return {
      allTime:    Number(row?.all_time  ?? 0),
      last30Days: Number(row?.last_30   ?? 0),
      last7Days:  Number(row?.last_7    ?? 0),
      today:      Number(row?.today     ?? 0),
      byFeature: ((featureRows as any).rows ?? featureRows).map((r: any) => ({
        feature:     String(r.feature),
        callCount:   Number(r.call_count),
        totalTokens: Number(r.total_tokens),
        costUsd:     Number(r.cost_usd),
      })),
      byModel: ((modelRows as any).rows ?? modelRows).map((r: any) => ({
        model:       String(r.model),
        callCount:   Number(r.call_count),
        totalTokens: Number(r.total_tokens),
        costUsd:     Number(r.cost_usd),
      })),
      dailySpend: ((dailyRows as any).rows ?? dailyRows).map((r: any) => ({
        date:    String(r.date),
        costUsd: Number(r.cost_usd),
      })),
    };
  }

  async listAiUsageLogs(limit: number, offset: number): Promise<AiUsageLog[]> {
    return db
      .select()
      .from(aiUsageLogs)
      .orderBy(desc(aiUsageLogs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async countAiUsageLogs(): Promise<number> {
    const [{ value }] = await db.select({ value: count() }).from(aiUsageLogs);
    return Number(value);
  }
}

export const storage = new DatabaseStorage();

// =============================================================================
// BMV.VIN content storage (Task #96)
// =============================================================================
// Thin CRUD wrappers around the five `bmv_vin_*` tables. Imported lazily by
// the SSR layer + admin routes so legacy callers don't pay the import cost.

import {
  bmvVinHomeCopy, bmvVinBrandDecoderCopy, bmvVinFacetBlurb,
  bmvVinGuide, bmvVinGlossary,
  type BmvVinHomeCopy, type BmvVinBrandDecoderCopy, type BmvVinFacetBlurb,
  type BmvVinGuide, type BmvVinGlossary,
  type InsertBmvVinHomeCopy, type InsertBmvVinBrandDecoderCopy,
  type InsertBmvVinFacetBlurb, type InsertBmvVinGuide, type InsertBmvVinGlossary,
} from "@shared/schema";

export const bmvVinStorage = {
  // ---- Home copy ----
  async getHomeCopy(key: string = "default"): Promise<BmvVinHomeCopy | undefined> {
    const [row] = await db.select().from(bmvVinHomeCopy).where(eq(bmvVinHomeCopy.key, key)).limit(1);
    return row;
  },
  async upsertHomeCopy(data: InsertBmvVinHomeCopy): Promise<BmvVinHomeCopy> {
    const existing = await this.getHomeCopy(data.key ?? "default");
    if (existing) {
      const [row] = await db.update(bmvVinHomeCopy)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(bmvVinHomeCopy.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(bmvVinHomeCopy).values(data).returning();
    return row;
  },
  async listHomeCopy(): Promise<BmvVinHomeCopy[]> {
    return db.select().from(bmvVinHomeCopy);
  },

  // ---- Brand decoder copy ----
  async getBrandDecoderCopy(brand: string): Promise<BmvVinBrandDecoderCopy | undefined> {
    const [row] = await db.select().from(bmvVinBrandDecoderCopy).where(eq(bmvVinBrandDecoderCopy.brand, brand)).limit(1);
    return row;
  },
  async listBrandDecoderCopy(): Promise<BmvVinBrandDecoderCopy[]> {
    return db.select().from(bmvVinBrandDecoderCopy).orderBy(bmvVinBrandDecoderCopy.brand);
  },
  async upsertBrandDecoderCopy(data: InsertBmvVinBrandDecoderCopy): Promise<BmvVinBrandDecoderCopy> {
    const existing = await this.getBrandDecoderCopy(data.brand);
    if (existing) {
      const [row] = await db.update(bmvVinBrandDecoderCopy)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(bmvVinBrandDecoderCopy.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(bmvVinBrandDecoderCopy).values(data).returning();
    return row;
  },

  // ---- Facet blurb ----
  async getFacetBlurb(facetKind: string, facetValue: string): Promise<BmvVinFacetBlurb | undefined> {
    const [row] = await db.select().from(bmvVinFacetBlurb)
      .where(and(eq(bmvVinFacetBlurb.facetKind, facetKind), eq(bmvVinFacetBlurb.facetValue, facetValue)))
      .limit(1);
    return row;
  },
  async listFacetBlurbs(facetKind?: string): Promise<BmvVinFacetBlurb[]> {
    if (facetKind) {
      return db.select().from(bmvVinFacetBlurb).where(eq(bmvVinFacetBlurb.facetKind, facetKind))
        .orderBy(bmvVinFacetBlurb.facetValue);
    }
    return db.select().from(bmvVinFacetBlurb).orderBy(bmvVinFacetBlurb.facetKind, bmvVinFacetBlurb.facetValue);
  },
  async upsertFacetBlurb(data: InsertBmvVinFacetBlurb): Promise<BmvVinFacetBlurb> {
    const existing = await this.getFacetBlurb(data.facetKind, data.facetValue);
    if (existing) {
      const [row] = await db.update(bmvVinFacetBlurb)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(bmvVinFacetBlurb.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(bmvVinFacetBlurb).values(data).returning();
    return row;
  },
  async deleteFacetBlurb(id: number): Promise<void> {
    await db.delete(bmvVinFacetBlurb).where(eq(bmvVinFacetBlurb.id, id));
  },

  // ---- Guides ----
  // Returns published-only by default; pass { includeDrafts: true } for admin.
  async getGuide(slug: string, opts: { includeDrafts?: boolean } = {}): Promise<BmvVinGuide | undefined> {
    const where = opts.includeDrafts
      ? eq(bmvVinGuide.slug, slug)
      : and(eq(bmvVinGuide.slug, slug), eq(bmvVinGuide.published, true));
    const [row] = await db.select().from(bmvVinGuide).where(where).limit(1);
    return row;
  },
  // Returns published guides by default; pass { includeDrafts: true } for admin.
  async listGuides(opts: { includeDrafts?: boolean } = {}): Promise<BmvVinGuide[]> {
    const q = db.select().from(bmvVinGuide);
    if (!opts.includeDrafts) {
      return q.where(eq(bmvVinGuide.published, true)).orderBy(desc(bmvVinGuide.publishedAt));
    }
    return q.orderBy(desc(bmvVinGuide.publishedAt));
  },
  async upsertGuide(data: InsertBmvVinGuide): Promise<BmvVinGuide> {
    const existing = await this.getGuide(data.slug, { includeDrafts: true });
    if (existing) {
      const [row] = await db.update(bmvVinGuide)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(bmvVinGuide.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(bmvVinGuide).values(data).returning();
    return row;
  },
  async deleteGuide(id: number): Promise<void> {
    await db.delete(bmvVinGuide).where(eq(bmvVinGuide.id, id));
  },

  // ---- Glossary ----
  // Returns published-only by default; pass { includeDrafts: true } for admin.
  async getGlossary(term: string, opts: { includeDrafts?: boolean } = {}): Promise<BmvVinGlossary | undefined> {
    const where = opts.includeDrafts
      ? eq(bmvVinGlossary.term, term)
      : and(eq(bmvVinGlossary.term, term), eq(bmvVinGlossary.published, true));
    const [row] = await db.select().from(bmvVinGlossary).where(where).limit(1);
    return row;
  },
  // Returns published terms by default; pass { includeDrafts: true } for admin.
  async listGlossary(termSet?: string, opts: { includeDrafts?: boolean } = {}): Promise<BmvVinGlossary[]> {
    const conds: SQL[] = [];
    if (termSet) conds.push(eq(bmvVinGlossary.termSet, termSet));
    if (!opts.includeDrafts) conds.push(eq(bmvVinGlossary.published, true));
    const q = db.select().from(bmvVinGlossary);
    const filtered = conds.length === 0
      ? q
      : conds.length === 1 ? q.where(conds[0]) : q.where(and(...conds));
    return filtered.orderBy(bmvVinGlossary.term);
  },
  async upsertGlossary(data: InsertBmvVinGlossary): Promise<BmvVinGlossary> {
    const existing = await this.getGlossary(data.term, { includeDrafts: true });
    if (existing) {
      const [row] = await db.update(bmvVinGlossary)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(bmvVinGlossary.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(bmvVinGlossary).values(data).returning();
    return row;
  },
  async deleteGlossary(id: number): Promise<void> {
    await db.delete(bmvVinGlossary).where(eq(bmvVinGlossary.id, id));
  },

  // ---- Coverage helpers (admin dashboard) ----
  /** Returns counts of vin_cache rows grouped by chassis/year/plant/market. */
  async getFacetCoverage(): Promise<{ chassis: { value: string; count: number }[]; year: { value: string; count: number }[]; plant: { value: string; count: number }[]; market: { value: string; count: number }[] }> {
    const chassis = await db.execute(sql`
      SELECT COALESCE(LOWER(decoded_data->>'chassis'), 'unknown') AS value, COUNT(*)::int AS count
      FROM vin_cache WHERE decoded_data IS NOT NULL
      GROUP BY value ORDER BY count DESC LIMIT 200
    `);
    const year = await db.execute(sql`
      SELECT COALESCE(decoded_data->>'modelYear', 'unknown') AS value, COUNT(*)::int AS count
      FROM vin_cache WHERE decoded_data IS NOT NULL
      GROUP BY value ORDER BY value DESC LIMIT 200
    `);
    const plant = await db.execute(sql`
      SELECT COALESCE(LOWER(decoded_data->'plant'->>'city'), 'unknown') AS value, COUNT(*)::int AS count
      FROM vin_cache WHERE decoded_data IS NOT NULL
      GROUP BY value ORDER BY count DESC LIMIT 200
    `);
    const market = await db.execute(sql`
      SELECT COALESCE(LOWER(enriched_data->'vehicle'->>'market'), 'unknown') AS value, COUNT(*)::int AS count
      FROM vin_cache WHERE enriched_data IS NOT NULL
      GROUP BY value ORDER BY count DESC LIMIT 200
    `);
    return {
      chassis: (chassis.rows as any[]).map(r => ({ value: r.value, count: Number(r.count) })),
      year:    (year.rows as any[]).map(r => ({ value: r.value, count: Number(r.count) })),
      plant:   (plant.rows as any[]).map(r => ({ value: r.value, count: Number(r.count) })),
      market:  (market.rows as any[]).map(r => ({ value: r.value, count: Number(r.count) })),
    };
  },

  /**
   * Per-page-type / per-locale authoring coverage matrix for the admin
   * heatmap (Task #99). For each of the five bmv.vin page types we count how
   * many rows have a non-empty primary content slot in each supported locale.
   *
   * The "primary slot" is the field a crawler/visitor would notice missing
   * first: hero/intro for hubs, blurb for facets, body for guides, definition
   * for glossary terms. We check just one slot rather than all of them so the
   * matrix is meaningful at a glance — translating one slot is the gating
   * step for shipping a new locale.
   */
  async getContentCoverage(): Promise<{
    locales: string[];
    pageTypes: {
      key: "home" | "brand" | "facet" | "guide" | "glossary";
      total: number;
      perLocale: Record<string, number>;
    }[];
  }> {
    const { SUPPORTED_LOCALES } = await import("@shared/i18n/types");
    const locales: string[] = SUPPORTED_LOCALES as unknown as string[];

    const [home, brand, facet, guide, glossary] = await Promise.all([
      this.listHomeCopy(),
      this.listBrandDecoderCopy(),
      this.listFacetBlurbs(),
      this.listGuides({ includeDrafts: true }),
      this.listGlossary(undefined, { includeDrafts: true }),
    ]);

    const isFilled = (v: any, locale: string): boolean => {
      if (!v || typeof v !== "object" || Array.isArray(v)) return false;
      const x = (v as any)[locale];
      if (x == null) return false;
      if (typeof x === "string") return x.trim().length > 0;
      if (Array.isArray(x))      return x.length > 0;
      if (typeof x === "object") return Object.keys(x).length > 0;
      return true;
    };
    const perLocale = (rows: any[], field: string): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const l of locales) out[l] = rows.filter(r => isFilled(r[field], l)).length;
      return out;
    };

    return {
      locales,
      pageTypes: [
        { key: "home",     total: home.length,     perLocale: perLocale(home,     "intro") },
        { key: "brand",    total: brand.length,    perLocale: perLocale(brand,    "intro") },
        { key: "facet",    total: facet.length,    perLocale: perLocale(facet,    "blurb") },
        { key: "guide",    total: guide.length,    perLocale: perLocale(guide,    "body") },
        { key: "glossary", total: glossary.length, perLocale: perLocale(glossary, "definition") },
      ],
    };
  },
}

// ---------------------------------------------------------------------------
// Worker-pool helpers — used by high-volume background scrapers so their
// bulk writes go through the isolated workerDb (max=3) and cannot starve
// the web-app pool (max=5).
// ---------------------------------------------------------------------------

/**
 * Insert a batch of parts using the background-worker pool and invalidate
 * the relevant cache entries. Same semantics as storage.createParts() but
 * routed through workerDb so scraper writes cannot starve web-app queries.
 */
export async function createPartsWorker(partsData: InsertPart[]): Promise<void> {
  if (partsData.length === 0) return;
  await workerDb.insert(parts).values(partsData);
  for (const p of partsData) {
    if (p.partNumberClean) await appCache.invalidatePart(p.partNumberClean);
  }
}

/**
 * Upsert a VIN cache entry via the background-worker pool.
 * Used by the vin-enrichment-backfill script so its high-concurrency
 * writes go through workerDb (max=3) and cannot starve web-app queries.
 */
export async function upsertVinCacheWorker(data: InsertVinCache): Promise<VinCache> {
  const cleanVin = data.vin.toUpperCase();
  // Check for existing row — read can go through workerDb; it's only a lookup.
  const [existing] = await workerDb.select().from(vinCache).where(eq(vinCache.vin, cleanVin));
  if (existing) {
    const [updated] = await workerDb.update(vinCache)
      .set({ ...data, vin: cleanVin, updatedAt: new Date() })
      .where(eq(vinCache.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await workerDb.insert(vinCache).values({ ...data, vin: cleanVin }).returning();
  return created;
}

// NOTE — scripts/import-external-catalog.mjs and the chain-multi-chassis
// backfill create their own isolated pg.Pool({ max: 3 }) and never touch
// the shared pools here, so they are already DB-isolated by design.
