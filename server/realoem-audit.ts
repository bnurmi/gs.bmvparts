// Catalog audit (Task #84)
//
// Compares our cached BMW parts catalog against RealOEM diagram pages,
// surfaces the parts RealOEM has but we don't, and lets an admin
// one-click backfill them with provenance source = "realoem-audit".
//
// Design notes:
//   - Reuses the daily Oxylabs budget gate from realoem-fallback so the
//     audit can never out-spend the rest of the RealOEM stack.
//   - Supports a fixture mode (REALOEM_AUDIT_FIXTURE_DIR env var or per
//     diagram-URL local file://-style override) so verification scripts
//     and tests can run without a live proxy.
//   - Persists every audit comparison as a `realoem_audit_findings` row
//     even when no parts are missing, so admins see "we checked X
//     diagrams, all clean" instead of an empty page.

import { promises as fs } from "fs";
import path from "path";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./storage";
import {
  cars as carsTable,
  parts as partsTable,
  subcategories as subcategoriesTable,
  subcategoryRealoemMap,
  realoemAuditFindings,
  realoemUnmatchedDiagrams,
  type SubcategoryRealoemMap,
  type RealoemAuditFinding,
} from "@shared/schema";
import {
  createJob,
  completeJob,
  failJob,
  startPeriodicCheckpoint,
  stopPeriodicCheckpoint,
  cancelJob,
  cancelJobByType,
  getActiveJob,
  type JobType,
} from "./job-manager";
import { tryConsumeRealoemBudget, getRealoemBudgetStatus } from "./realoem-fallback";

import { proxyFetch } from "./proxy-router";

const FIXTURE_DIR = process.env.REALOEM_AUDIT_FIXTURE_DIR
  ? path.resolve(process.env.REALOEM_AUDIT_FIXTURE_DIR)
  : path.join(process.cwd(), "scripts", "fixtures", "realoem-audit");
const HTML_CACHE_DIR = path.join(process.cwd(), "scripts", "fixtures", "realoem-audit", "_runtime");

// Cast the audit job kind to JobType. The tracker is intentionally loose
// (`text("job_type")`) so we can introduce new kinds without a migration.
const AUDIT_JOB_TYPE: JobType = "catalog_audit";

/**
 * How many subcategory diagrams the runner is willing to fetch in
 * parallel. Default 1 because RealOEM is rate-sensitive and a higher
 * concurrency can trigger captchas / IP cooldowns. Override per-deploy
 * with REALOEM_AUDIT_MAX_CONCURRENCY (positive integer).
 */
const AUDIT_CONCURRENCY = (() => {
  const raw = parseInt(String(process.env.REALOEM_AUDIT_MAX_CONCURRENCY ?? ""), 10);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 8) : 1;
})();

// ---------- Types ----------

export interface ExtractedRealoemPart {
  partNumberClean: string;
  partNumber: string;
  description: string | null;
  diagramRefNumber: string | null;
  quantity: number | null;
}

export interface MissingPartEntry extends ExtractedRealoemPart {}
export interface ExtraPartEntry {
  partNumberClean: string;
  partNumber: string | null;
  description: string | null;
}

export interface AuditFindingResult {
  subcategoryId: number;
  subcategoryName: string;
  realoemDiagramUrl: string;
  realoemDiagramId: string | null;
  realoemPartCount: number;
  ourPartCount: number;
  missingParts: MissingPartEntry[];
  extraParts: ExtraPartEntry[];
}

export interface AuditRunOptions {
  carId?: number;
  /**
   * Chassis code (e.g. "G07") — expands at the start of the run to every
   * car_id whose `chassis` matches, so admins can audit a whole platform
   * in one click without enumerating cars manually.
   */
  chassis?: string;
  subcategoryIds?: number[];
  forceRefetch?: boolean;
  fixtureOnly?: boolean;
  /**
   * If true, before running the comparison the audit will fetch each
   * unique chassis landing page once, enumerate every RealOEM diagram
   * link, and (a) record any link not present in `subcategory_realoem_map`
   * into `realoem_unmatched_diagrams` and (b) try to auto-suggest a
   * mapping when a diagram title fuzzy-matches a subcategory name on
   * the same car. Costs 1 budget unit per unique chassis page.
   */
  discover?: boolean;
}

export interface AuditRunSummary {
  auditRunId: number;
  carId: number | null;
  diagramsChecked: number;
  diagramsWithMissing: number;
  totalMissingParts: number;
  budgetUsedAtEnd: number;
  durationMs: number;
}

interface AuditState {
  running: boolean;
  cancelled: boolean;
  jobId: number | null;
  auditRunId: number | null;
  carId: number | null;
  totalDiagrams: number;
  checkedDiagrams: number;
  diagramsWithMissing: number;
  totalMissingParts: number;
  startedAt: Date | null;
  currentSubcategory: string;
  lastError: string | null;
}

const state: AuditState = {
  running: false,
  cancelled: false,
  jobId: null,
  auditRunId: null,
  carId: null,
  totalDiagrams: 0,
  checkedDiagrams: 0,
  diagramsWithMissing: 0,
  totalMissingParts: 0,
  startedAt: null,
  currentSubcategory: "",
  lastError: null,
};

export function getAuditState(): AuditState & { budget: ReturnType<typeof getRealoemBudgetStatus> } {
  return { ...state, budget: getRealoemBudgetStatus() };
}

export function cancelAudit(): boolean {
  if (!state.running) return false;
  state.cancelled = true;
  cancelJobByType(AUDIT_JOB_TYPE).catch(() => {});
  return true;
}

/**
 * Surface a background-runner failure on the live audit state. The /run
 * endpoint returns immediately with started:true and runs the audit in
 * the background; if that promise rejects (e.g. preflight passed but
 * the runner threw "no mappings"), we still want the operator's UI to
 * see the error in `lastError` instead of silently observing nothing
 * happen.
 */
export function recordBackgroundFailure(message: string): void {
  state.lastError = message;
  state.running = false;
}

// ---------- HTML fetch / fixture loader ----------

/**
 * Resolve a car row to its canonical RealOEM landing-page URL.
 *
 * Shared by both the Catalog Audit code (this file) and the RealOEM
 * Backfill runner (`server/realoem-backfill.ts`) so a single primitive
 * decides how a `cars` row maps onto a RealOEM page — no duplicated
 * slug heuristics drifting between modules.
 *
 * The cars table carries the BMW mospid in `catalog_id` (sourced from
 * the bmw-etk.info catalog URL — the same mospid RealOEM uses). The
 * slug typically embeds the mospid as its trailing segment (e.g.
 * `g07-x7-m50dx-60487`); we strip that to recover the chassis-style
 * id RealOEM expects. Returns `null` when neither a usable slug nor a
 * chassis is available so callers can record a structured error for
 * that car instead of fetching a meaningless URL.
 *
 * Output:
 *   - `landingUrl`  Full RealOEM URL: `?id=<id>` + `&mospid=<mospid>`
 *                   when present. Canonical chassis page that lists
 *                   every diagram for the car.
 *   - `landingKey`  `<id>[+mospid:<mospid>]` — used to coalesce
 *                   identically-targeted cars in the proxy estimate.
 *   - `id`, `mospid` Pieces, exposed so callers can log them.
 */
export function resolveRealoemTarget(
  car: {
    id: number;
    slug: string | null;
    chassis: string | null;
    catalogId: string | null;
    realoemPartgrpId?: string | null;
  },
): { landingUrl: string; landingKey: string; id: string; mospid: string | null } | null {
  // Preferred path: a real partgrp id (e.g. `CW82-EUR-11-2019-G07-BMW-X7_30dX`)
  // resolved from the crawled `realoem_vehicles` table by
  // `scripts/match-cars-to-partgrp.ts`. RealOEM only serves catalog
  // content for `/bmw/enUS/partgrp?id=<KEY>` — slug-based URLs always
  // return the welcome page. The empty-landing abort guard in
  // `realoem-backfill.ts` is what catches any remaining unmatched
  // cars rather than letting them silently burn proxy budget.
  const partgrpId = (car.realoemPartgrpId || "").trim() || null;
  if (partgrpId) {
    const landingUrl = `https://www.realoem.com/bmw/enUS/partgrp?id=${encodeURIComponent(partgrpId)}`;
    return { landingUrl, landingKey: partgrpId, id: partgrpId, mospid: null };
  }

  // Fallback (kept for backwards-compat with cars that haven't been
  // matched yet): the old slug+mospid URL shape. This is the broken
  // shape that prompted the partgrp fix in the first place — when this
  // path runs, the empty-landing guard fires after a few cars instead
  // of running an entire 2,000-car job blind.
  const mospid = (car.catalogId || "").trim() || null;

  let id: string | null = null;
  if (car.slug) {
    const parts = car.slug.split("-").filter(Boolean);
    // If the trailing segment is the mospid, strip it.
    if (mospid && parts.length > 1 && parts[parts.length - 1] === mospid) {
      id = parts.slice(0, -1).join("-");
    } else if (parts.length >= 3) {
      // Pre-canonical-resolver fallback: first 3 segments form the
      // chassis id (e.g. g07-x7-m50dx). Kept as a safety net for any
      // car whose slug does not end in catalog_id (older rows).
      id = parts.slice(0, 3).join("-");
    } else {
      id = parts.join("-") || null;
    }
  }
  if (!id && car.chassis) id = car.chassis.toLowerCase();
  if (!id) return null;

  const params = new URLSearchParams({ id });
  if (mospid) params.set("mospid", mospid);
  const landingUrl = `https://www.realoem.com/bmw/enUS/showparts?${params.toString()}`;
  const landingKey = mospid ? `${id}+mospid:${mospid}` : id;
  return { landingUrl, landingKey, id, mospid };
}

function fixturePathForUrl(url: string): string {
  const safe = url.replace(/^https?:\/\//, "").replace(/[^a-z0-9._-]/gi, "_").slice(0, 200);
  return path.join(FIXTURE_DIR, `${safe}.html`);
}

function runtimeCachePathForUrl(url: string): string {
  const safe = url.replace(/^https?:\/\//, "").replace(/[^a-z0-9._-]/gi, "_").slice(0, 200);
  return path.join(HTML_CACHE_DIR, `${safe}.html`);
}

async function readIfExists(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Fetch a RealOEM page. Resolution order:
 *   1. Per-URL fixture file in FIXTURE_DIR (so verification scripts and
 *      tests get deterministic responses without touching the network).
 *   2. Cached runtime HTML written by a previous successful fetch
 *      (unless forceRefetch is set).
 *   3. Oxylabs proxy — only if creds are configured AND today's daily
 *      budget hasn't been exhausted.
 */
export async function fetchRealoemHtml(
  url: string,
  opts: { forceRefetch?: boolean; fixtureOnly?: boolean } = {},
): Promise<{ html: string; source: "fixture" | "cache" | "oxylabs" }> {
  const fixture = await readIfExists(fixturePathForUrl(url));
  if (fixture) return { html: fixture, source: "fixture" };

  if (opts.fixtureOnly) {
    throw new Error(`No fixture found for ${url} (fixtureOnly mode)`);
  }

  if (!opts.forceRefetch) {
    const cached = await readIfExists(runtimeCachePathForUrl(url));
    if (cached) return { html: cached, source: "cache" };
  }

  if (!await tryConsumeRealoemBudget()) {
    throw new Error(`Daily RealOEM budget exhausted (${getRealoemBudgetStatus().limit})`);
  }

  const html = await proxyFetch("realoem", url, { timeoutMs: 60_000, render: true });

  try {
    await fs.mkdir(HTML_CACHE_DIR, { recursive: true });
    await fs.writeFile(runtimeCachePathForUrl(url), html);
  } catch (e) {
    console.warn(`[CatalogAudit] failed to cache html for ${url}: ${(e as Error).message}`);
  }
  return { html, source: "oxylabs" };
}

// ---------- Parts extractor ----------

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, "");
const cleanText = (s: string) => stripHtml(s).replace(/\s+/g, " ").trim();

/**
 * Extract BMW parts from a RealOEM showparts/diagram HTML. Mirrors the
 * heuristic in scripts/realoem-chassis-scraper.mjs but returns a richer
 * structure (including the 11-digit `partNumberClean` we use as the
 * comparison key) and is robust to the lighter markup we use in fixture
 * test files (just a <table> with 11-digit part numbers per row).
 */
export function extractRealoemParts(html: string): ExtractedRealoemPart[] {
  if (!html) return [];
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const out: ExtractedRealoemPart[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => cleanText(c[1]));
    if (cells.length < 2) continue;
    let pnRaw: string | null = null;
    let pnClean: string | null = null;
    for (const c of cells) {
      const collapsed = c.replace(/[\s.-]/g, "");
      if (/^\d{11}$/.test(collapsed)) {
        pnRaw = c.trim();
        pnClean = collapsed;
        break;
      }
    }
    if (!pnClean) continue;
    if (seen.has(pnClean)) continue;
    seen.add(pnClean);

    let qty: number | null = null;
    let ref: string | null = null;
    for (const c of cells) {
      const t = c.trim();
      if (/^\d{1,3}$/.test(t)) {
        if (ref === null) ref = t;
        else if (qty === null) qty = parseInt(t, 10);
      }
    }
    const desc = cells
      .filter(c => c && c.replace(/[\s.-]/g, "") !== pnClean && !/^\d{1,3}$/.test(c.trim()) && !/[\$€£]/.test(c))
      .sort((a, b) => b.length - a.length)[0] || null;

    out.push({
      partNumberClean: pnClean,
      partNumber: pnRaw || pnClean,
      description: desc,
      diagramRefNumber: ref,
      quantity: qty,
    });
  }
  return out;
}

/**
 * Discriminator for the known shapes of RealOEM "this page is broken or
 * has drifted" output. Surfaced on `ParserDriftError.kind` so the
 * backfill ledger row, recent-runs panel, and test assertions can speak
 * about each shape by name.
 */
export type ParserDriftKind =
  | "js-required"      // RealOEM served a JavaScript-required stub (no parts table at all).
  | "paginated"        // Page advertises pagination but this page contains 0 part rows.
  | "malformed-table"  // Table is present but no row holds a recognizable 11-digit part #.
  | "no-table";        // Page has no <table> element at all.

/**
 * Thrown by `extractRealoemPartsStrict` when the page parses to zero
 * parts AND the markup matches a known degraded shape. The backfill
 * catches this, writes a `status="parser_drift"` finding, and bumps
 * `state.errors` so admins see the per-diagram failure on the recent-runs
 * panel instead of the silent "0 parts inserted" outcome we used to get.
 */
export class ParserDriftError extends Error {
  readonly kind: ParserDriftKind;
  constructor(kind: ParserDriftKind, message: string) {
    super(message);
    this.name = "ParserDriftError";
    this.kind = kind;
  }
}

/**
 * Strict variant of `extractRealoemParts` for the backfill insertion
 * path. Identical to the lenient extractor when the page is healthy
 * (returns the same array). When the page parses to zero rows, classifies
 * the markup against the known-bad shapes and throws a `ParserDriftError`
 * so the caller can surface a per-diagram failure instead of silently
 * inserting nothing.
 *
 * Kept separate from `extractRealoemParts` so the audit comparator
 * (which tolerates legitimately empty diagrams) is undisturbed.
 */
export function extractRealoemPartsStrict(html: string): ExtractedRealoemPart[] {
  const parts = extractRealoemParts(html);
  if (parts.length > 0) return parts;

  // Zero parts → diagnose why so the ledger row carries a real reason.
  const hasTable = /<table[\s\S]*?<\/table>/i.test(html);
  const hasNoscriptStub = /<noscript[\s\S]*?<\/noscript>/i.test(html)
    || /requires?\s+javascript|enable\s+javascript|please\s+enable\s+js|javascript\s+is\s+disabled/i.test(html);
  const hasPagination =
    /class\s*=\s*["'][^"']*paginat/i.test(html)
    || /\bpage\s*\d+\s*(?:of|\/)\s*\d+/i.test(html)
    || /rel\s*=\s*["']next["']/i.test(html)
    || /<a[^>]*>\s*Next(?:\s+Page)?\s*<\/a>/i.test(html);

  if (!hasTable) {
    if (hasNoscriptStub) {
      throw new ParserDriftError(
        "js-required",
        "RealOEM page returned a JavaScript-required stub; the parts table is missing.",
      );
    }
    throw new ParserDriftError(
      "no-table",
      "RealOEM page contains no <table> element; the layout has drifted.",
    );
  }

  if (hasPagination) {
    throw new ParserDriftError(
      "paginated",
      "RealOEM page advertises pagination but the parser found no part rows on this page.",
    );
  }

  throw new ParserDriftError(
    "malformed-table",
    "RealOEM page has a parts table but no row contains a recognizable 11-digit part number.",
  );
}

/** Best-effort extraction of the diagId / page title for surfacing to admins. */
export function extractDiagramMeta(html: string, fallbackUrl: string): { diagramId: string | null; title: string | null } {
  const idMatch = html.match(/diagId=([^&"'\s]+)/i)
    || fallbackUrl.match(/diagId=([^&]+)/i);
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1Match ? cleanText(h1Match[1]) : titleMatch ? cleanText(titleMatch[1]) : null;
  return { diagramId: idMatch ? idMatch[1] : null, title };
}

// ---------- Mapping CRUD ----------

export async function listMappingsForCar(carId: number) {
  return db.select().from(subcategoryRealoemMap).where(eq(subcategoryRealoemMap.carId, carId));
}

export async function listAllMappings(limit = 200, offset = 0) {
  return db.select().from(subcategoryRealoemMap).orderBy(desc(subcategoryRealoemMap.updatedAt)).limit(limit).offset(offset);
}

export async function upsertMapping(input: {
  subcategoryId: number;
  realoemDiagramUrl: string;
  realoemDiagramId?: string | null;
  confidence?: number;
  source?: string;
  notes?: string | null;
}): Promise<SubcategoryRealoemMap> {
  // Look up the carId via the subcategory so callers don't have to.
  const [sub] = await db.select().from(subcategoriesTable).where(eq(subcategoriesTable.id, input.subcategoryId)).limit(1);
  if (!sub) throw new Error(`Subcategory ${input.subcategoryId} not found`);

  const row = {
    subcategoryId: input.subcategoryId,
    carId: sub.carId,
    realoemDiagramUrl: input.realoemDiagramUrl,
    realoemDiagramId: input.realoemDiagramId ?? null,
    confidence: input.confidence ?? 1,
    source: input.source ?? "manual",
    notes: input.notes ?? null,
  };

  type MapRow = {
    id: number;
    subcategory_id: number;
    car_id: number;
    realoem_diagram_url: string;
    realoem_diagram_id: string | null;
    confidence: number;
    source: string;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
  } & Record<string, unknown>;
  const result = await db.execute<MapRow>(sql`
    INSERT INTO subcategory_realoem_map
      (subcategory_id, car_id, realoem_diagram_url, realoem_diagram_id, confidence, source, notes, updated_at)
    VALUES (${row.subcategoryId}, ${row.carId}, ${row.realoemDiagramUrl}, ${row.realoemDiagramId},
            ${row.confidence}, ${row.source}, ${row.notes}, NOW())
    ON CONFLICT (subcategory_id) DO UPDATE SET
      car_id = EXCLUDED.car_id,
      realoem_diagram_url = EXCLUDED.realoem_diagram_url,
      realoem_diagram_id = EXCLUDED.realoem_diagram_id,
      confidence = EXCLUDED.confidence,
      source = EXCLUDED.source,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    RETURNING *
  `);
  const r = result.rows[0];
  if (!r) throw new Error("Mapping upsert returned no row");
  return {
    id: r.id,
    subcategoryId: r.subcategory_id,
    carId: r.car_id,
    realoemDiagramUrl: r.realoem_diagram_url,
    realoemDiagramId: r.realoem_diagram_id,
    confidence: r.confidence,
    source: r.source,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function deleteMapping(id: number): Promise<void> {
  await db.delete(subcategoryRealoemMap).where(eq(subcategoryRealoemMap.id, id));
}

// ---------- Audit comparison ----------

async function fetchOurPartsFor(subcategoryId: number): Promise<Map<string, { partNumber: string | null; description: string | null }>> {
  const rows = await db.select().from(partsTable).where(eq(partsTable.subcategoryId, subcategoryId));
  const map = new Map<string, { partNumber: string | null; description: string | null }>();
  for (const r of rows) {
    const clean = (r.partNumberClean || (r.partNumber || "").replace(/[\s.-]/g, "")).toString();
    if (!clean) continue;
    if (!map.has(clean)) map.set(clean, { partNumber: r.partNumber, description: r.description });
  }
  return map;
}

/**
 * Audit a single subcategory against its mapped RealOEM diagram URL.
 * Returns the comparison without persisting (caller decides whether to
 * record a finding row).
 */
export async function auditSubcategory(
  mapping: SubcategoryRealoemMap,
  opts: { forceRefetch?: boolean; fixtureOnly?: boolean } = {},
): Promise<AuditFindingResult> {
  const [sub] = await db.select().from(subcategoriesTable).where(eq(subcategoriesTable.id, mapping.subcategoryId)).limit(1);
  if (!sub) throw new Error(`Subcategory ${mapping.subcategoryId} not found`);

  const { html, source } = await fetchRealoemHtml(mapping.realoemDiagramUrl, opts);
  // Per-fetch provenance line so operators can audit how a run consumed
  // (or did not consume) the daily Oxylabs budget.
  console.log(`[CatalogAudit] sub#${mapping.subcategoryId} fetched ${mapping.realoemDiagramUrl} via ${source}`);
  const realoemParts = extractRealoemParts(html);
  const meta = extractDiagramMeta(html, mapping.realoemDiagramUrl);
  const ourParts = await fetchOurPartsFor(mapping.subcategoryId);

  const realoemKeys = new Set(realoemParts.map(p => p.partNumberClean));
  const missing = realoemParts.filter(p => !ourParts.has(p.partNumberClean));
  const extras: ExtraPartEntry[] = [];
  for (const [clean, info] of ourParts.entries()) {
    if (!realoemKeys.has(clean)) {
      extras.push({ partNumberClean: clean, partNumber: info.partNumber, description: info.description });
    }
  }

  return {
    subcategoryId: mapping.subcategoryId,
    subcategoryName: sub.name,
    realoemDiagramUrl: mapping.realoemDiagramUrl,
    realoemDiagramId: mapping.realoemDiagramId ?? meta.diagramId,
    realoemPartCount: realoemParts.length,
    ourPartCount: ourParts.size,
    missingParts: missing,
    extraParts: extras,
  };
}

// ---------- Run lifecycle (background job) ----------

/**
 * Synchronous-ish viability check for an audit run. Throws (with a
 * user-facing message) on the conditions that would make
 * `runAuditOnce` reject immediately:
 *   - another run is already in progress
 *   - the chassis filter resolves to zero cars
 *   - no mappings match the (sub/car/chassis) selection AND discovery
 *     is not requested
 *
 * The async POST /run endpoint awaits this so it can return 4xx on
 * unstartable runs instead of falsely reporting `started:true`.
 */
export async function preflightAudit(opts: AuditRunOptions = {}): Promise<void> {
  if (state.running) throw new Error("Catalog audit already running");

  let resolvedCarIds: number[] | null = null;
  if (opts.chassis) {
    const chassisCars = await db.select({ id: carsTable.id }).from(carsTable)
      .where(eq(carsTable.chassis, opts.chassis));
    if (chassisCars.length === 0) throw new Error(`No cars match chassis "${opts.chassis}".`);
    resolvedCarIds = chassisCars.map(c => c.id);
  } else if (opts.carId) {
    resolvedCarIds = [opts.carId];
  }

  // Discovery may add mappings on the fly, so don't require them up front.
  if (opts.discover) return;

  let mappingCount: number;
  if (opts.subcategoryIds && opts.subcategoryIds.length > 0) {
    const rows = await db.select({ id: subcategoryRealoemMap.id }).from(subcategoryRealoemMap)
      .where(inArray(subcategoryRealoemMap.subcategoryId, opts.subcategoryIds));
    mappingCount = rows.length;
  } else if (resolvedCarIds) {
    const rows = await db.select({ id: subcategoryRealoemMap.id }).from(subcategoryRealoemMap)
      .where(inArray(subcategoryRealoemMap.carId, resolvedCarIds));
    mappingCount = rows.length;
  } else {
    const [{ n }] = await db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM subcategory_realoem_map`).then(r => r.rows);
    mappingCount = Number(n ?? 0);
  }
  if (mappingCount === 0) {
    throw new Error("No subcategory→RealOEM mappings to audit (configure at least one first, or pass discover:true).");
  }
}

export async function runAuditOnce(opts: AuditRunOptions = {}): Promise<AuditRunSummary> {
  if (state.running) throw new Error("Catalog audit already running");

  // Resolve a chassis filter to a concrete list of car ids so the rest
  // of the runner doesn't need to special-case it.
  let resolvedCarIds: number[] | null = null;
  if (opts.chassis) {
    const chassisCars = await db.select({ id: carsTable.id }).from(carsTable)
      .where(eq(carsTable.chassis, opts.chassis));
    resolvedCarIds = chassisCars.map(c => c.id);
    if (resolvedCarIds.length === 0) {
      throw new Error(`No cars match chassis "${opts.chassis}".`);
    }
  } else if (opts.carId) {
    resolvedCarIds = [opts.carId];
  }

  // Pick mappings based on filters.
  let mappings: SubcategoryRealoemMap[];
  if (opts.subcategoryIds && opts.subcategoryIds.length > 0) {
    mappings = await db.select().from(subcategoryRealoemMap)
      .where(inArray(subcategoryRealoemMap.subcategoryId, opts.subcategoryIds));
  } else if (resolvedCarIds) {
    mappings = await db.select().from(subcategoryRealoemMap)
      .where(inArray(subcategoryRealoemMap.carId, resolvedCarIds));
  } else {
    mappings = await db.select().from(subcategoryRealoemMap);
  }

  // Optional discovery pass — fetch each unique chassis landing page
  // once, enumerate diagram links, record unmatched ones, and (when
  // possible) auto-suggest mappings via fuzzy title matching.
  //
  // Important: RealOEM groups diagrams by short chassis slug
  // (e.g. "g07-x7-m50dx"), and many cars in our DB resolve to the same
  // slug (different ROW packages on the same chassis). We deduplicate
  // by that slug so a chassis-wide run does not re-fetch the same
  // landing page once per car and waste the daily Oxylabs budget.
  let discoveredCount = 0;
  let autoMappedCount = 0;
  if (opts.discover) {
    // When the operator passes discover:true with no chassis/car filter
    // and no mappings exist yet (first-time seed), default to discovering
    // across every car in the catalog. We dedupe by chassis landing slug
    // immediately below, so 674 cars collapse to ~50 RealOEM pages.
    let carIdsToDiscover: number[];
    if (resolvedCarIds) {
      carIdsToDiscover = resolvedCarIds;
    } else if (mappings.length > 0) {
      carIdsToDiscover = Array.from(new Set(mappings.map(m => m.carId)));
    } else {
      const allCars = await db.select({ id: carsTable.id }).from(carsTable);
      carIdsToDiscover = allCars.map(c => c.id);
      console.log(`[CatalogAudit] discovery: no filter and no existing mappings — defaulting to all ${carIdsToDiscover.length} cars`);
    }
    // Dedup by **chassis only** (first slug segment, falling back to the
    // chassis column). The previous 3-segment dedup was effectively
    // useless: trims like `e92-330xi-n52n`, `e92-330xi-n53`,
    // `e92-330i-n52n` all became distinct landing pages and exploded
    // 674 cars to 566 calls. Chassis-only collapses to ~50 (one
    // RealOEM landing page per chassis generation).
    const seenLandingSlugs = new Set<string>();
    const uniqueCarIds: number[] = [];
    if (carIdsToDiscover.length > 0) {
      const carsForDiscovery = await db.select({ id: carsTable.id, slug: carsTable.slug, chassis: carsTable.chassis })
        .from(carsTable).where(inArray(carsTable.id, carIdsToDiscover));
      for (const c of carsForDiscovery) {
        const firstSegment = (c.slug ?? "").split("-")[0]?.toLowerCase();
        const landingKey = (c.chassis || firstSegment || `car-${c.id}`).toLowerCase();
        if (seenLandingSlugs.has(landingKey)) continue;
        seenLandingSlugs.add(landingKey);
        uniqueCarIds.push(c.id);
      }
      console.log(`[CatalogAudit] discovery: ${carIdsToDiscover.length} car(s) → ${uniqueCarIds.length} unique chassis page(s)`);
    }

    // Hard safety cap on the discovery pass. The current discovery URL
    // builder (showparts?id=<slug>) is known-broken — RealOEM only
    // recognises ids of the form MODELID-MARKET-MM-YYYY-SERIES-BMW-VARIANT
    // (e.g. 1513-EUR-01-1961-700-BMW-700L) and silently returns its
    // homepage for anything else. Rather than burn the daily Oxylabs
    // budget for nothing, we (a) enforce an absolute call cap, and
    // (b) abort early if the first N pages all return 0 links.
    const DISCOVERY_CALL_CAP = Math.max(
      1,
      parseInt(process.env.REALOEM_DISCOVERY_MAX_CALLS ?? "25", 10) || 25,
    );
    const ABORT_AFTER_CONSECUTIVE_EMPTY = 5;
    const carsToProcess = uniqueCarIds.slice(0, DISCOVERY_CALL_CAP);
    if (carsToProcess.length < uniqueCarIds.length) {
      console.log(`[CatalogAudit] discovery: capped at ${DISCOVERY_CALL_CAP} of ${uniqueCarIds.length} chassis pages (REALOEM_DISCOVERY_MAX_CALLS)`);
    }
    let consecutiveEmpty = 0;
    let firstPagesAllEmpty = false;
    for (const cid of carsToProcess) {
      if (state.cancelled) break;
      try {
        const r = await discoverDiagramsForCar(cid, { fixtureOnly: opts.fixtureOnly });
        discoveredCount += r.unmatched;
        autoMappedCount += r.autoMapped;
        if (r.totalLinks === 0) {
          consecutiveEmpty++;
          if (consecutiveEmpty >= ABORT_AFTER_CONSECUTIVE_EMPTY) {
            firstPagesAllEmpty = true;
            console.warn(`[CatalogAudit] discovery: aborting — ${ABORT_AFTER_CONSECUTIVE_EMPTY} consecutive chassis pages returned 0 diagram links. Likely cause: RealOEM URL format mismatch (slug-based ids return homepage). Need to derive proper partgrp ids from /vehicles or /vinlookup.`);
            break;
          }
        } else {
          consecutiveEmpty = 0;
        }
        // Re-load mappings — auto-suggested ones should now be in the run.
        if (r.autoMapped > 0 && resolvedCarIds) {
          mappings = await db.select().from(subcategoryRealoemMap)
            .where(inArray(subcategoryRealoemMap.carId, resolvedCarIds));
        }
      } catch (e: any) {
        console.warn(`[CatalogAudit] discovery failed for car #${cid}: ${e.message}`);
      }
    }
    if (firstPagesAllEmpty && autoMappedCount === 0 && discoveredCount === 0) {
      throw new Error(
        `Discovery aborted after ${ABORT_AFTER_CONSECUTIVE_EMPTY} consecutive empty chassis pages. ` +
        `The RealOEM URL builder (showparts?id=<slug>) returns the homepage for our slug ids. ` +
        `Discovery needs proper partgrp ids (e.g. 1513-EUR-01-1961-700-BMW-700L) — derive these ` +
        `from /vehicles or /vinlookup and store on cars first.`,
      );
    }
  }

  if (mappings.length === 0) {
    throw new Error("No subcategory→RealOEM mappings to audit (configure at least one first, or pass discover:true).");
  }

  state.running = true;
  state.cancelled = false;
  state.carId = opts.carId ?? null;
  state.totalDiagrams = mappings.length;
  state.checkedDiagrams = 0;
  state.diagramsWithMissing = 0;
  state.totalMissingParts = 0;
  state.startedAt = new Date();
  state.currentSubcategory = "";
  state.lastError = null;

  const job = await createJob(AUDIT_JOB_TYPE, {
    status: "starting",
    carId: opts.carId ?? null,
    totalDiagrams: mappings.length,
  });
  state.jobId = job.id;
  state.auditRunId = job.id; // run id == job id (1:1)
  startPeriodicCheckpoint(job.id, () => ({ ...state }));

  const t0 = Date.now();
  try {
    // Bounded concurrency. Default 1 (RealOEM-friendly); overridable
    // via REALOEM_AUDIT_MAX_CONCURRENCY for future fixture-only batch
    // runs. We checkpoint via shared `state` so the periodic checkpoint
    // observes the live counters regardless of which worker advanced them.
    console.log(`[CatalogAudit] runId=${job.id} mappings=${mappings.length} concurrency=${AUDIT_CONCURRENCY}`);
    let cursor = 0;
    const auditOne = async (m: SubcategoryRealoemMap) => {
      if (state.cancelled) return;
      state.currentSubcategory = `sub#${m.subcategoryId}`;
      try {
        const result = await auditSubcategory(m, { forceRefetch: opts.forceRefetch, fixtureOnly: opts.fixtureOnly });
        state.currentSubcategory = result.subcategoryName;
        await db.insert(realoemAuditFindings).values({
          auditRunId: job.id,
          carId: m.carId,
          subcategoryId: m.subcategoryId,
          realoemDiagramUrl: m.realoemDiagramUrl,
          realoemDiagramId: result.realoemDiagramId ?? null,
          realoemPartCount: result.realoemPartCount,
          ourPartCount: result.ourPartCount,
          missingPartCount: result.missingParts.length,
          missingParts: result.missingParts,
          extraParts: result.extraParts,
          status: result.missingParts.length === 0 ? "clean" : "open",
        });
        state.checkedDiagrams++;
        if (result.missingParts.length > 0) {
          state.diagramsWithMissing++;
          state.totalMissingParts += result.missingParts.length;
        }
      } catch (e: any) {
        state.lastError = e.message;
        console.warn(`[CatalogAudit] sub#${m.subcategoryId} failed: ${e.message}`);
        state.checkedDiagrams++;
      }
    };
    const worker = async () => {
      while (!state.cancelled) {
        const i = cursor++;
        if (i >= mappings.length) return;
        await auditOne(mappings[i]);
      }
    };
    const workers = Array.from({ length: Math.min(AUDIT_CONCURRENCY, mappings.length) }, () => worker());
    await Promise.all(workers);

    if (state.cancelled) {
      // Operator hit the cancel button — surface that distinctly in the
      // job tracker so the run does not look like a successful complete.
      console.log(`[CatalogAudit] runId=${job.id} cancelled after ${state.checkedDiagrams}/${mappings.length} diagrams`);
      await cancelJob(job.id);
    } else {
      await completeJob(job.id, { ...state });
    }
  } catch (e: any) {
    await failJob(job.id, e.message, { ...state });
    throw e;
  } finally {
    stopPeriodicCheckpoint(job.id);
    state.running = false;
  }

  return {
    auditRunId: job.id,
    carId: opts.carId ?? null,
    diagramsChecked: state.checkedDiagrams,
    diagramsWithMissing: state.diagramsWithMissing,
    totalMissingParts: state.totalMissingParts,
    budgetUsedAtEnd: getRealoemBudgetStatus().used,
    durationMs: Date.now() - t0,
  };
}

// ---------- Findings query / CSV / backfill / dismiss ----------

export interface FindingsFilter {
  carId?: number;
  /** Filter by car chassis (e.g. "G07"); joins through `cars` table. */
  chassis?: string;
  status?: string; // "open" | "backfilled" | "dismissed" | "clean" | "all"
  auditRunId?: number;
  withMissingOnly?: boolean;
  limit?: number;
  offset?: number;
}

export type FindingRowWithJoins = {
  id: number;
  audit_run_id: number;
  car_id: number;
  subcategory_id: number;
  realoem_diagram_url: string;
  realoem_diagram_id: string | null;
  realoem_part_count: number;
  our_part_count: number;
  missing_part_count: number;
  missing_parts: MissingPartEntry[];
  status: string;
  parts_backfilled: number;
  created_at: Date;
  backfilled_at: Date | null;
  subcategory_name: string | null;
  subcategory_code: string | null;
  car_display_name: string | null;
  car_slug: string | null;
  car_chassis: string | null;
} & Record<string, unknown>;

export interface AuditSummaryRow {
  key: string;
  label: string;
  totalFindings: number;
  openFindings: number;
  cleanFindings: number;
  backfilledFindings: number;
  totalMissingParts: number;
  partsBackfilled: number;
}

export interface AuditSummariesResult {
  byChassis: AuditSummaryRow[];
  byCar: AuditSummaryRow[];
}

/**
 * Aggregate the findings table by chassis and by car so the admin UI
 * can render at-a-glance summary cards above the row-level findings
 * table. Honors the same chassis/runId/missingOnly filters as
 * `listFindings`.
 */
export async function getAuditSummaries(
  filter: { chassis?: string; auditRunId?: number; withMissingOnly?: boolean } = {},
): Promise<AuditSummariesResult> {
  const where: ReturnType<typeof sql>[] = [];
  if (filter.chassis) where.push(sql`c.chassis = ${filter.chassis}`);
  if (filter.auditRunId) where.push(sql`f.audit_run_id = ${filter.auditRunId}`);
  if (filter.withMissingOnly) where.push(sql`f.missing_part_count > 0`);
  const whereSql = where.length > 0 ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;

  const aggCols = sql`
    COUNT(*)::int AS total_findings,
    SUM(CASE WHEN f.status = 'open' THEN 1 ELSE 0 END)::int AS open_findings,
    SUM(CASE WHEN f.status = 'clean' THEN 1 ELSE 0 END)::int AS clean_findings,
    SUM(CASE WHEN f.status = 'backfilled' THEN 1 ELSE 0 END)::int AS backfilled_findings,
    COALESCE(SUM(f.missing_part_count), 0)::int AS total_missing_parts,
    COALESCE(SUM(f.parts_backfilled), 0)::int AS parts_backfilled
  `;

  type AggRow = {
    label: string | null;
    key: string | null;
    total_findings: number;
    open_findings: number;
    clean_findings: number;
    backfilled_findings: number;
    total_missing_parts: number;
    parts_backfilled: number;
  } & Record<string, unknown>;

  const chassisRes = await db.execute<AggRow>(sql`
    SELECT COALESCE(c.chassis, '(unknown)') AS key, COALESCE(c.chassis, '(unknown)') AS label, ${aggCols}
    FROM realoem_audit_findings f
    LEFT JOIN cars c ON c.id = f.car_id
    ${whereSql}
    GROUP BY c.chassis
    ORDER BY total_missing_parts DESC, total_findings DESC
    LIMIT 50
  `);
  const carRes = await db.execute<AggRow>(sql`
    SELECT
      f.car_id::text AS key,
      COALESCE(c.display_name, c.slug, 'car #' || f.car_id) AS label,
      ${aggCols}
    FROM realoem_audit_findings f
    LEFT JOIN cars c ON c.id = f.car_id
    ${whereSql}
    GROUP BY f.car_id, c.display_name, c.slug
    ORDER BY total_missing_parts DESC, total_findings DESC
    LIMIT 100
  `);

  const toRow = (r: AggRow): AuditSummaryRow => ({
    key: r.key ?? "(unknown)",
    label: r.label ?? "(unknown)",
    totalFindings: r.total_findings,
    openFindings: r.open_findings,
    cleanFindings: r.clean_findings,
    backfilledFindings: r.backfilled_findings,
    totalMissingParts: r.total_missing_parts,
    partsBackfilled: r.parts_backfilled,
  });

  return {
    byChassis: chassisRes.rows.map(toRow),
    byCar: carRes.rows.map(toRow),
  };
}

/**
 * Build the WHERE clause shared by `listFindings` and the streaming CSV
 * exporter. Pulled out so both paths apply the same filters (carId,
 * chassis, status, run id, missing-only).
 */
function buildFindingsWhere(filter: FindingsFilter): ReturnType<typeof sql> {
  const where: ReturnType<typeof sql>[] = [];
  if (filter.carId) where.push(sql`f.car_id = ${filter.carId}`);
  if (filter.chassis) where.push(sql`c.chassis = ${filter.chassis}`);
  if (filter.auditRunId) where.push(sql`f.audit_run_id = ${filter.auditRunId}`);
  if (filter.status && filter.status !== "all") where.push(sql`f.status = ${filter.status}`);
  if (filter.withMissingOnly) where.push(sql`f.missing_part_count > 0`);
  return where.length > 0 ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;
}

export async function listFindings(filter: FindingsFilter = {}): Promise<{ rows: FindingRowWithJoins[]; total: number }> {
  const whereSql = buildFindingsWhere(filter);

  const limit = Math.min(filter.limit ?? 100, 500);
  const offset = filter.offset ?? 0;

  const rowsRes = await db.execute<FindingRowWithJoins>(sql`
    SELECT
      f.*,
      s.name AS subcategory_name,
      s.subcategory_id AS subcategory_code,
      c.display_name AS car_display_name,
      c.slug AS car_slug,
      c.chassis AS car_chassis
    FROM realoem_audit_findings f
    LEFT JOIN subcategories s ON s.id = f.subcategory_id
    LEFT JOIN cars c ON c.id = f.car_id
    ${whereSql}
    ORDER BY f.created_at DESC, f.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  const totalRes = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM realoem_audit_findings f
    LEFT JOIN cars c ON c.id = f.car_id
    ${whereSql}
  `);
  return { rows: rowsRes.rows, total: Number(totalRes.rows[0]?.n ?? 0) };
}

export async function getFinding(id: number): Promise<RealoemAuditFinding | null> {
  const [row] = await db.select().from(realoemAuditFindings).where(eq(realoemAuditFindings.id, id)).limit(1);
  return row ?? null;
}

export async function exportFindingsCsv(filter: FindingsFilter = {}): Promise<string> {
  // Stream all matching rows in pages of 500 (the per-call cap on
  // listFindings) so a chassis-wide or full-catalog export is not
  // silently truncated. Pre-count to avoid pulling more pages than
  // necessary on large datasets.
  const PAGE = 500;
  const rows: FindingRowWithJoins[] = [];
  let offset = 0;
  // Loop with a hard upper bound (200 pages = 100k rows) as a runaway
  // guard. Realistic audits are well under this; this only exists to
  // prevent an endless loop if something pathological happens.
  for (let i = 0; i < 200; i++) {
    const page = await listFindings({ ...filter, limit: PAGE, offset });
    rows.push(...page.rows);
    if (page.rows.length < PAGE) break;
    offset += PAGE;
    if (rows.length >= page.total) break;
  }
  const header = [
    "finding_id", "audit_run_id", "car_id", "car_chassis", "car_display_name", "car_slug",
    "subcategory_id", "subcategory_code", "subcategory_name",
    "realoem_diagram_id", "realoem_diagram_url",
    "realoem_part_count", "our_part_count", "missing_part_count",
    "missing_part_numbers", "status", "created_at", "backfilled_at",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const missingNumbers = Array.isArray(r.missing_parts)
      ? r.missing_parts.map((p: any) => p.partNumberClean).join("|")
      : "";
    const fields = [
      r.id,
      r.audit_run_id,
      r.car_id,
      r.car_chassis ?? "",
      r.car_display_name ?? "",
      r.car_slug ?? "",
      r.subcategory_id,
      r.subcategory_code ?? "",
      r.subcategory_name ?? "",
      r.realoem_diagram_id ?? "",
      r.realoem_diagram_url ?? "",
      r.realoem_part_count,
      r.our_part_count,
      r.missing_part_count,
      missingNumbers,
      r.status,
      r.created_at?.toISOString?.() ?? r.created_at ?? "",
      r.backfilled_at?.toISOString?.() ?? r.backfilled_at ?? "",
    ].map(csvEscape);
    lines.push(fields.join(","));
  }
  return lines.join("\n") + "\n";
}

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * One-click backfill of every part the audit reported as missing for a
 * given finding. Inserts into `parts` (our primary catalog) with the
 * subcategory's car/subcategory ids and tags both `additional_info` and
 * `notes` with provenance "source = realoem-audit:<finding_id>" so we
 * can later trace which audit produced which row.
 *
 * Idempotent — already-present (subcategory_id, part_number_clean) pairs
 * are skipped. Updates the finding to status='backfilled' with an
 * audit-trail of who clicked and when.
 */
export async function backfillFinding(
  findingId: number,
  adminUserId: string | null,
): Promise<{ inserted: number; skipped: number; finding: RealoemAuditFinding }> {
  const finding = await getFinding(findingId);
  if (!finding) throw new Error(`Finding ${findingId} not found`);
  if (finding.status === "backfilled") {
    return { inserted: 0, skipped: finding.partsBackfilled ?? 0, finding };
  }
  // missingParts is stored as Drizzle `jsonb<MissingPartEntry[]>()`,
  // but Drizzle's row inference widens jsonb columns to `unknown`.
  // We narrow defensively here since the writer (auditSubcategory) is
  // the only thing that ever populates this column.
  const missing: MissingPartEntry[] = Array.isArray(finding.missingParts)
    ? (finding.missingParts as MissingPartEntry[])
    : [];
  if (missing.length === 0) {
    // Nothing to do — flip to backfilled so it disappears from the queue.
    const updated = await db.update(realoemAuditFindings)
      .set({ status: "backfilled", backfilledAt: new Date(), backfilledBy: adminUserId, partsBackfilled: 0 })
      .where(eq(realoemAuditFindings.id, findingId))
      .returning();
    return { inserted: 0, skipped: 0, finding: updated[0] };
  }

  let inserted = 0;
  let skipped = 0;
  const provenance = `source=realoem-audit:${findingId}`;

  for (const p of missing) {
    if (!p.partNumberClean) continue;
    // Skip if already present in this subcategory.
    const [exists] = await db.select({ id: partsTable.id }).from(partsTable)
      .where(and(eq(partsTable.subcategoryId, finding.subcategoryId), eq(partsTable.partNumberClean, p.partNumberClean)))
      .limit(1);
    if (exists) { skipped++; continue; }

    await db.insert(partsTable).values({
      subcategoryId: finding.subcategoryId,
      carId: finding.carId,
      itemNo: p.diagramRefNumber ?? null,
      partNumber: p.partNumber ?? p.partNumberClean,
      partNumberClean: p.partNumberClean,
      description: p.description || `Part ${p.partNumber || p.partNumberClean}`,
      additionalInfo: provenance,
      quantity: p.quantity != null ? String(p.quantity) : null,
      notes: provenance,
    });
    inserted++;
  }

  // Refresh the parent car's total_parts counter so the UI badge stays
  // in sync with the new rows we just inserted.
  if (inserted > 0) {
    await db.execute(sql`
      UPDATE cars
      SET total_parts = (SELECT COUNT(*) FROM parts WHERE car_id = ${finding.carId})
      WHERE id = ${finding.carId}
    `);
  }

  const [updated] = await db.update(realoemAuditFindings)
    .set({
      status: "backfilled",
      backfilledAt: new Date(),
      backfilledBy: adminUserId,
      partsBackfilled: inserted,
    })
    .where(eq(realoemAuditFindings.id, findingId))
    .returning();

  console.log(`[CatalogAudit] Finding #${findingId}: backfilled ${inserted} parts (skipped ${skipped}) into car #${finding.carId} sub #${finding.subcategoryId}`);
  return { inserted, skipped, finding: updated };
}

export async function dismissFinding(findingId: number, adminUserId: string | null, note?: string): Promise<RealoemAuditFinding> {
  const [updated] = await db.update(realoemAuditFindings)
    .set({ status: "dismissed", dismissedAt: new Date(), dismissedBy: adminUserId, notes: note ?? null })
    .where(eq(realoemAuditFindings.id, findingId))
    .returning();
  if (!updated) throw new Error(`Finding ${findingId} not found`);
  return updated;
}

// ---------- Unmatched diagrams ----------

export async function recordUnmatchedDiagram(input: {
  carId: number;
  realoemDiagramUrl: string;
  realoemDiagramId?: string | null;
  realoemDiagramTitle?: string | null;
  realoemPartCount?: number;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO realoem_unmatched_diagrams
      (car_id, realoem_diagram_url, realoem_diagram_id, realoem_diagram_title, realoem_part_count)
    VALUES
      (${input.carId}, ${input.realoemDiagramUrl}, ${input.realoemDiagramId ?? null},
       ${input.realoemDiagramTitle ?? null}, ${input.realoemPartCount ?? 0})
    ON CONFLICT (car_id, realoem_diagram_url) DO UPDATE SET
      realoem_diagram_id = EXCLUDED.realoem_diagram_id,
      realoem_diagram_title = EXCLUDED.realoem_diagram_title,
      realoem_part_count = EXCLUDED.realoem_part_count,
      discovered_at = NOW()
  `);
}

export async function listUnmatchedDiagrams(carId?: number, limit = 200) {
  if (carId) {
    return db.select().from(realoemUnmatchedDiagrams)
      .where(eq(realoemUnmatchedDiagrams.carId, carId))
      .orderBy(desc(realoemUnmatchedDiagrams.discoveredAt))
      .limit(limit);
  }
  return db.select().from(realoemUnmatchedDiagrams)
    .orderBy(desc(realoemUnmatchedDiagrams.discoveredAt))
    .limit(limit);
}

export async function dismissUnmatched(id: number): Promise<void> {
  await db.update(realoemUnmatchedDiagrams)
    .set({ status: "dismissed" })
    .where(eq(realoemUnmatchedDiagrams.id, id));
}

// ---------- Diagram discovery (chassis enumeration + auto-suggest mappings) ----------

/** Pull every showparts/diagram link out of a RealOEM landing-page HTML blob. */
export function extractDiagramLinks(html: string): { url: string; diagramId: string | null; title: string | null }[] {
  const out = new Map<string, { url: string; diagramId: string | null; title: string | null }>();
  // Matches <a href="/bmw/enUS/showparts?...">label</a> as well as direct
  // diagId hrefs that RealOEM also emits in nav menus.
  const re = /<a[^>]+href="([^"]*\/bmw\/enUS\/showparts\?[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].replace(/&amp;/g, "&");
    const url = href.startsWith("http") ? href : `https://www.realoem.com${href}`;
    const label = cleanText(m[2]);
    const idMatch = url.match(/diagId=([^&]+)/i);
    if (!url.includes("diagId=")) continue;
    if (!out.has(url)) out.set(url, { url, diagramId: idMatch ? idMatch[1] : null, title: label || null });
  }
  return [...out.values()];
}

/**
 * Pull every sub-landing link out of a RealOEM landing-page HTML blob.
 *
 * RealOEM organizes a chassis catalog as: top landing → main-group
 * sub-landings (Engine, Transmission, Brakes, …) → diagrams. The top
 * landing (`/bmw/enUS/partgrp?id=KEY`) exposes only the main-group
 * links as `/bmw/enUS/partgrp?id=KEY&mg=NN` (no `diagId=`); each
 * main-group sub-landing then expands into the diagrams. We also
 * accept the legacy `/bmw/enUS/parts?…` shape (older snapshots and
 * fixture pages still use it) so the extractor stays compatible with
 * both URL families.
 *
 * The recursive walker uses this to discover diagrams that aren't
 * linked directly from the top landing. Diagram URLs (`/showparts?…`)
 * are filtered out here so the two extractors stay disjoint.
 */
export function extractSubLandingLinks(html: string): { url: string; title: string | null }[] {
  const out = new Map<string, { url: string; title: string | null }>();
  // Match either `/bmw/enUS/parts?…` (legacy) or `/bmw/enUS/partgrp?…&mg=…`
  // (current — main-group sub-landings off a partgrp landing). The
  // `&mg=` filter keeps us from matching the partgrp landing URL
  // itself when it's referenced from inside the page (e.g. nav
  // breadcrumbs).
  const re = /<a[^>]+href="([^"]*\/bmw\/enUS\/(?:parts|partgrp)\?[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].replace(/&amp;/g, "&");
    if (href.includes("/showparts?")) continue;
    if (href.includes("diagId=")) continue;
    // For partgrp URLs, only treat them as sub-landings when they
    // carry a main-group selector (`mg=`). The naked partgrp URL is
    // the top landing itself; recursing into it would loop forever.
    if (href.includes("/partgrp?") && !/[?&]mg=/.test(href)) continue;
    const url = href.startsWith("http") ? href : `https://www.realoem.com${href}`;
    const label = cleanText(m[2]);
    if (!out.has(url)) out.set(url, { url, title: label || null });
  }
  return [...out.values()];
}

/** Lower-case alphanumerics-only token bag for fuzzy matching. */
function tokenize(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter(t => t.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Fetches the chassis landing page for a car, enumerates all RealOEM
 * diagram links, then for each link:
 *   - if it's already mapped → skip
 *   - else if a subcategory on this car has a fuzzy-name match (≥0.5
 *     Jaccard) → upsert a mapping with source="realoem-audit:auto"
 *     and confidence = score, and skip the unmatched table
 *   - else → record in `realoem_unmatched_diagrams`
 */
export async function discoverDiagramsForCar(
  carId: number,
  opts: { fixtureOnly?: boolean } = {},
): Promise<{ totalLinks: number; alreadyMapped: number; autoMapped: number; unmatched: number }> {
  const [car] = await db.select().from(carsTable).where(eq(carsTable.id, carId)).limit(1);
  if (!car) throw new Error(`Car ${carId} not found`);

  // Resolve via the shared canonical primitive so audit and backfill
  // hit the same RealOEM URL for any given car (mospid-aware).
  const target = resolveRealoemTarget(car);
  if (!target) {
    throw new Error(`Car ${carId} has no slug/chassis/catalog_id — cannot derive RealOEM landing URL.`);
  }
  const realoemId = target.landingKey;
  const landingUrl = target.landingUrl;

  const fetched = await fetchRealoemHtml(landingUrl, { fixtureOnly: opts.fixtureOnly });
  const links = extractDiagramLinks(fetched.html);

  const existing = await db.select().from(subcategoryRealoemMap).where(eq(subcategoryRealoemMap.carId, carId));
  const mappedUrls = new Set(existing.map(m => m.realoemDiagramUrl));
  const mappedIds = new Set(existing.map(m => m.realoemDiagramId).filter(Boolean) as string[]);

  const subs = await db.select().from(subcategoriesTable).where(eq(subcategoriesTable.carId, carId));
  const subTokens = subs.map(s => ({ id: s.id, code: s.subcategoryId, name: s.name, tokens: tokenize(s.name || "") }));

  let alreadyMapped = 0;
  let autoMapped = 0;
  let unmatched = 0;

  for (const link of links) {
    if (mappedUrls.has(link.url) || (link.diagramId && mappedIds.has(link.diagramId))) {
      alreadyMapped++;
      continue;
    }
    const linkTokens = tokenize(link.title || "");
    let best: { sub: typeof subTokens[number]; score: number } | null = null;
    for (const s of subTokens) {
      const score = jaccard(linkTokens, s.tokens);
      if (!best || score > best.score) best = { sub: s, score };
    }
    if (best && best.score >= 0.5) {
      await upsertMapping({
        subcategoryId: best.sub.id,
        realoemDiagramUrl: link.url,
        realoemDiagramId: link.diagramId,
        confidence: Math.round(best.score * 100) / 100,
        source: "realoem-audit:auto",
        notes: `auto-matched "${link.title}" ↔ "${best.sub.name}" (jaccard=${best.score.toFixed(2)})`,
      });
      autoMapped++;
      mappedUrls.add(link.url);
      if (link.diagramId) mappedIds.add(link.diagramId);
    } else {
      await recordUnmatchedDiagram({
        carId,
        realoemDiagramUrl: link.url,
        realoemDiagramId: link.diagramId,
        realoemDiagramTitle: link.title,
        realoemPartCount: 0,
      });
      unmatched++;
    }
  }

  console.log(`[CatalogAudit] discovery car #${carId} (${realoemId}): ${links.length} links → ${alreadyMapped} mapped, ${autoMapped} auto, ${unmatched} unmatched`);
  return { totalLinks: links.length, alreadyMapped, autoMapped, unmatched };
}

// ---------- Bulk backfill ----------

export async function bulkBackfillFindings(
  findingIds: number[],
  adminUserId: string | null,
): Promise<{ totalRequested: number; results: Array<{ findingId: number; inserted?: number; skipped?: number; error?: string }> }> {
  const results: Array<{ findingId: number; inserted?: number; skipped?: number; error?: string }> = [];
  for (const id of findingIds) {
    try {
      const r = await backfillFinding(id, adminUserId);
      results.push({ findingId: id, inserted: r.inserted, skipped: r.skipped });
    } catch (e: any) {
      results.push({ findingId: id, error: e.message || String(e) });
    }
  }
  return { totalRequested: findingIds.length, results };
}
