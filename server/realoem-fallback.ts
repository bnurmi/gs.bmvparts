// RealOEM fallback — last-resort chassis resolution when our local catalog
// can't decode/match a VIN. One proxy call per VIN family (keyed on the
// last-7), cached forever for confirmed chassis, 30-day negative cache for
// "vin_not_found", short retry on transient errors. Hard daily call budget.

import { eq, desc, gte, sql } from "drizzle-orm";
import { db } from "./storage";
import { realoemVinCache, realoemChassisScrapeJobs, proxyUsageLogs } from "@shared/schema";
import { promises as fs } from "fs";
import path from "path";
import { proxyFetch } from "./proxy-router";

const RAW_HTML_DIR = path.join(process.cwd(), "scripts", "fixtures", "realoem-responses");

const NEGATIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ERROR_TTL_MS = 60 * 60 * 1000; // 1 hour

// Default sized to ~1/30 of the operator's standard 220k/month plan,
// rounded up for a little headroom. Override via REALOEM_DAILY_BUDGET.
const DAILY_BUDGET = parseInt(process.env.REALOEM_DAILY_BUDGET || "7500", 10);

function todayKey() { return new Date().toISOString().slice(0, 10); }

// Lightweight in-memory snapshot for synchronous display-only callers
// (getBackfillState, getAuditState). Refreshed by every DB-gated call and
// seeded from DB on startup so it is accurate immediately after restart.
let _displayDay = todayKey();
let _displayUsed = 0;

// Seed display cache from DB on startup (fire-and-forget).
;(async () => {
  try {
    const today = todayKey();
    const todayStart = new Date(`${today}T00:00:00.000Z`);
    const result = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM proxy_usage_logs
      WHERE scraper = 'realoem' AND created_at >= ${todayStart}
    `);
    const count = Number((result as unknown as { rows?: Array<{ cnt?: unknown }> }).rows?.[0]?.cnt ?? 0);
    if (today !== _displayDay) { _displayDay = today; _displayUsed = 0; }
    if (count > _displayUsed) _displayUsed = count;
  } catch { /* DB may not be ready yet; display shows 0 until first gated call */ }
})();

// Returns a fast synchronous view of today's budget for display/logging.
// Gating decisions use tryConsumeRealoemBudget() which queries the DB.
export function getRealoemBudgetStatus(): { day: string; used: number; limit: number; remaining: number } {
  const today = todayKey();
  if (today !== _displayDay) { _displayDay = today; _displayUsed = 0; }
  return { day: _displayDay, used: _displayUsed, limit: DAILY_BUDGET, remaining: Math.max(0, DAILY_BUDGET - _displayUsed) };
}

// Query proxy_usage_logs as the live source of truth for today's RealOEM call
// count. Used for the gating decision; also refreshes the display cache.
async function liveRealoemCount(): Promise<number> {
  try {
    const today = todayKey();
    const todayStart = new Date(`${today}T00:00:00.000Z`);
    const result = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM proxy_usage_logs
      WHERE scraper = 'realoem' AND created_at >= ${todayStart}
    `);
    const count = Number((result as unknown as { rows?: Array<{ cnt?: unknown }> }).rows?.[0]?.cnt ?? 0);
    // Refresh display cache (never lower, to account for in-flight calls)
    const today2 = todayKey();
    if (today2 !== _displayDay) { _displayDay = today2; _displayUsed = 0; }
    if (count > _displayUsed) _displayUsed = count;
    return count;
  } catch {
    return _displayUsed; // degrade gracefully to cached value
  }
}

// Shared budget gate for any module that hits RealOEM (audit runner, fallback
// resolver). Queries proxy_usage_logs as live source of truth — accurate
// across restarts and when primary+backup both log for the same request.
// Returns true if the call should proceed (budget not yet exhausted).
export async function tryConsumeRealoemBudget(): Promise<boolean> {
  const used = await liveRealoemCount();
  return used < DAILY_BUDGET;
}

// In-flight dedupe: same VIN requested twice in rapid succession reuses the
// first promise instead of issuing two Oxylabs calls.
const inflight = new Map<string, Promise<RealoemResolution>>();

// Per-caller rate limit on the *miss path* — protects against budget drain
// from anonymous traffic hitting /api/vin/decode with random VINs that all
// miss the local catalog. This is a sliding 1h window keyed by an opaque
// caller ID (typically the request IP).
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_PER_WINDOW = parseInt(process.env.REALOEM_FALLBACK_RATE_PER_HOUR || "60", 10);
const callerHits = new Map<string, number[]>();
export function checkFallbackRateLimit(callerId: string): { allowed: boolean; remaining: number } {
  if (!callerId) callerId = "anon";
  const now = Date.now();
  const arr = (callerHits.get(callerId) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX_PER_WINDOW) {
    callerHits.set(callerId, arr);
    return { allowed: false, remaining: 0 };
  }
  arr.push(now);
  callerHits.set(callerId, arr);
  return { allowed: true, remaining: RATE_MAX_PER_WINDOW - arr.length };
}

export interface RealoemResolution {
  vinLast7: string;
  status: "confirmed" | "vin_not_found" | "fetch_error" | "budget_exceeded" | "disabled";
  chassis: string | null;
  partType: string | null;
  series: string | null;
  modelName: string | null;
  fromCache: boolean;
  fetchedAt: Date;
  error?: string;
}

function isProxyConfigured(): boolean {
  return !!(
    (process.env.OXYLABS_USERNAME && process.env.OXYLABS_PASSWORD) ||
    (process.env.EVOMI_PROXY_HOST && process.env.EVOMI_PROXY_USERNAME && process.env.EVOMI_PROXY_PASSWORD)
  );
}

// Heuristic extractor — same shape used by scripts/fetch_realoem_truth.mjs.
function extractFromHtml(html: string): { chassis: string | null; partType: string | null; series: string | null; modelName: string | null; notFound: boolean } {
  if (!html) return { chassis: null, partType: null, series: null, modelName: null, notFound: false };
  const lower = html.toLowerCase();
  const notFound = lower.includes("not a valid bmw vin")
    || lower.includes("vin not found")
    || lower.includes("invalid vin")
    || lower.includes("no vehicle found");
  const seriesMatch = html.match(/series=([A-Z0-9]+)/);
  const partType = seriesMatch ? seriesMatch[1] : null;
  const headerMatch = html.match(/<h\d[^>]*>\s*([A-Z]\d{1,3}N?)\b[^<]*<\/h\d>/i)
    || html.match(/breadcrumbs?[^>]*>[\s\S]{0,200}?>\s*([A-Z]\d{1,3}N?)\b/i)
    || html.match(/\b([EFGI]\d{2,3}N?)\b\s+(?:M\d|\d{3,4}[a-z]|X\d|Z\d)/);
  const chassis = headerMatch ? headerMatch[1].toUpperCase() : null;
  // Best-effort series + model name extraction from <title> e.g.
  // "BMW 320i Sedan F30 - RealOEM.com"
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  let series: string | null = null;
  let modelName: string | null = null;
  if (titleMatch) {
    const t = titleMatch[1];
    const sm = t.match(/BMW\s+([A-Z0-9]+)\s/i);
    modelName = sm ? sm[1] : null;
    const sx = t.match(/(\d Series|X\d|Z\d|M\d|i\d)/i);
    series = sx ? sx[1] : null;
  }
  return { chassis, partType, series, modelName, notFound };
}

async function fetchRealoem(vin: string): Promise<{ html: string }> {
  const url = `https://www.realoem.com/bmw/enUS/vinlookup?vin=${encodeURIComponent(vin)}`;
  const html = await proxyFetch("realoem", url, { timeoutMs: 60_000, render: true });
  return { html };
}

function isCacheFresh(row: { status: string; fetchedAt: Date }): boolean {
  if (row.status === "confirmed") return true; // chassis is immutable
  const ageMs = Date.now() - new Date(row.fetchedAt).getTime();
  if (row.status === "vin_not_found") return ageMs < NEGATIVE_TTL_MS;
  if (row.status === "fetch_error") return ageMs < ERROR_TTL_MS;
  return false;
}

function rowToResolution(row: any, fromCache: boolean): RealoemResolution {
  return {
    vinLast7: row.vinLast7,
    status: row.status as any,
    chassis: row.chassis ?? null,
    partType: row.partType ?? null,
    series: row.series ?? null,
    modelName: row.modelName ?? null,
    fromCache,
    fetchedAt: row.fetchedAt,
    error: row.error,
  };
}

/**
 * Resolve a VIN's chassis via RealOEM. Cache-first; only hits the network
 * when nothing usable is cached.
 *
 * Returns status="disabled" if Oxylabs creds aren't configured (caller can
 * silently degrade) and status="budget_exceeded" if the daily call budget
 * has been hit.
 */
export async function resolveChassisViaRealoem(vin: string): Promise<RealoemResolution> {
  const fullVin = (vin || "").trim().toUpperCase();
  if (fullVin.length < 7) {
    return { vinLast7: fullVin, status: "vin_not_found", chassis: null, partType: null, series: null, modelName: null, fromCache: false, fetchedAt: new Date(), error: "VIN too short" };
  }
  const last7 = fullVin.slice(-7);

  // Cache check
  const [cached] = await db.select().from(realoemVinCache).where(eq(realoemVinCache.vinLast7, last7)).limit(1);
  if (cached && isCacheFresh(cached as any)) {
    return rowToResolution(cached, true);
  }

  // Disabled?
  if (!isProxyConfigured()) {
    return { vinLast7: last7, status: "disabled", chassis: null, partType: null, series: null, modelName: null, fromCache: false, fetchedAt: new Date(), error: "Proxy credentials not configured" };
  }

  // In-flight dedupe FIRST — concurrent callers for the same VIN family must
  // share one upstream call (and one budget unit). This must precede the
  // budget guard or the same VIN can burn N units under load.
  const existing = inflight.get(last7);
  if (existing) return existing;

  // Budget guard — query proxy_usage_logs as live source of truth.
  if (!await tryConsumeRealoemBudget()) {
    console.warn(`[RealOEM] Daily budget ${DAILY_BUDGET} exceeded; skipping fetch for ${last7}`);
    return { vinLast7: last7, status: "budget_exceeded", chassis: null, partType: null, series: null, modelName: null, fromCache: false, fetchedAt: new Date(), error: `Daily budget ${DAILY_BUDGET} reached` };
  }

  const promise = (async (): Promise<RealoemResolution> => {
    try {
      console.log(`[RealOEM] Fetching ${fullVin} (last7=${last7})`);
      const { html } = await fetchRealoem(fullVin);
      const ext = extractFromHtml(html);
      const status = ext.notFound ? "vin_not_found" : ext.chassis ? "confirmed" : "vin_not_found";

      // Persist raw HTML for confirmed hits (debugging / future re-extraction)
      let rawHtmlPath: string | null = null;
      if (status === "confirmed") {
        try {
          await fs.mkdir(RAW_HTML_DIR, { recursive: true });
          const p = path.join(RAW_HTML_DIR, `runtime_${last7}.html`);
          await fs.writeFile(p, html);
          rawHtmlPath = path.relative(process.cwd(), p);
        } catch (e) {
          console.warn(`[RealOEM] Failed to persist raw HTML for ${last7}: ${(e as Error).message}`);
        }
      }

      const row = {
        vinLast7: last7,
        fullVin,
        status,
        chassis: ext.chassis,
        partType: ext.partType,
        series: ext.series,
        modelName: ext.modelName,
        rawHtmlPath,
      };
      await db.insert(realoemVinCache)
        .values(row)
        .onConflictDoUpdate({
          target: realoemVinCache.vinLast7,
          set: { ...row, fetchedAt: new Date() },
        });

      console.log(`[RealOEM] ${last7} → ${status} chassis=${ext.chassis || "-"}`);
      return { ...row, fromCache: false, fetchedAt: new Date() } as RealoemResolution;
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`[RealOEM] Fetch error for ${last7}: ${msg}`);
      try {
        await db.insert(realoemVinCache)
          .values({ vinLast7: last7, fullVin, status: "fetch_error" })
          .onConflictDoUpdate({
            target: realoemVinCache.vinLast7,
            set: { fullVin, status: "fetch_error", fetchedAt: new Date() },
          });
      } catch {}
      return { vinLast7: last7, status: "fetch_error", chassis: null, partType: null, series: null, modelName: null, fromCache: false, fetchedAt: new Date(), error: msg };
    } finally {
      inflight.delete(last7);
    }
  })();

  inflight.set(last7, promise);
  return promise;
}

/** Force-refresh a cached VIN (admin action). Bypasses cache but still budget-gated. */
export async function refreshRealoemVin(vin: string): Promise<RealoemResolution> {
  const last7 = (vin || "").trim().toUpperCase().slice(-7);
  await db.delete(realoemVinCache).where(eq(realoemVinCache.vinLast7, last7));
  return resolveChassisViaRealoem(vin);
}

export async function getRealoemCachePage(limit = 100, offset = 0) {
  const rows = await db.select().from(realoemVinCache).limit(limit).offset(offset);
  return rows;
}

// ----- Tier 2: chassis-level scrape jobs -----------------------------------
// These helpers manage the *job ledger*. The actual scraping is performed by
// scripts/realoem-chassis-scraper.mjs as a child process (so a long crawl
// doesn't block the API).

export async function createScrapeJob(chassis: string, partType?: string | null) {
  const [row] = await db.insert(realoemChassisScrapeJobs)
    .values({ chassis: chassis.toUpperCase(), partType: partType ?? null, status: "pending" })
    .returning();
  return row;
}

export async function getLatestScrapeJob(chassis: string) {
  const [row] = await db.select().from(realoemChassisScrapeJobs)
    .where(eq(realoemChassisScrapeJobs.chassis, chassis.toUpperCase()))
    .orderBy(desc(realoemChassisScrapeJobs.startedAt))
    .limit(1);
  return row ?? null;
}

export async function listScrapeJobs(limit = 50) {
  return db.select().from(realoemChassisScrapeJobs)
    .orderBy(desc(realoemChassisScrapeJobs.startedAt))
    .limit(limit);
}
