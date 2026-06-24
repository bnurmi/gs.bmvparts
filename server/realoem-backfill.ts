// RealOEM Backfill (Task #87)
//
// One-button operation that walks every BMW car in scope, fetches each
// RealOEM diagram via Oxylabs, and inserts missing parts directly into
// matching subcategories — no per-finding approval step. Subcategories
// that have no fuzzy match (jaccard >= threshold) are auto-created.
//
// Reuses:
//   - extractRealoemParts / extractDiagramLinks / fetchRealoemHtml from
//     `realoem-audit.ts` so the parser is the single source of truth.
//   - subcategory_realoem_map (auto-cache of the chosen mapping).
//   - realoem_audit_findings as a per-(run, diagram) ledger so freshness
//     skips and CSV exports are queryable per run.
//   - The shared daily Oxylabs budget (`tryConsumeRealoemBudget`).
//
// Concurrency: per-car diagram processing is fanned out across up to
// `REALOEM_BACKFILL_MAX_CONCURRENCY` parallel workers (default 4) so a
// whole-catalog refresh measures in hours instead of days. Cross-car
// processing stays serial to keep the live UI's "current car" state
// meaningful and to bound peak DB/proxy load.
//
// Inserted rows are tagged with `additional_info=notes='realoem-backfill:<runId>'`
// so the CLI rollback (`scripts/revert-realoem-backfill.ts`) can locate
// and remove them.

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./storage";
import {
  cars as carsTable,
  parts as partsTable,
  subcategories as subcategoriesTable,
  subcategoryRealoemMap,
  realoemAuditFindings,
  type SubcategoryRealoemMap,
} from "@shared/schema";
import {
  createJob,
  completeJob,
  failJob,
  cancelJob,
  cancelJobByType,
  startPeriodicCheckpoint,
  stopPeriodicCheckpoint,
  type JobType,
} from "./job-manager";
import {
  fetchRealoemHtml,
  extractRealoemPartsStrict,
  extractDiagramMeta,
  extractDiagramLinks,
  extractSubLandingLinks,
  upsertMapping,
  resolveRealoemTarget,
  ParserDriftError,
  type ExtractedRealoemPart,
} from "./realoem-audit";
import { getRealoemBudgetStatus } from "./realoem-fallback";
import { discoverVariantsForChassisList, insertDiscoveredVariants } from "./variant-discovery";
import { startCrossRefEnrichment, getCrossRefStatus } from "./realoem-crossref";
import {
  lookupCanonical,
  upsertCanonical,
  isCanonicalFresh,
} from "./realoem-diagram-canonical";
import { classifyDiagId, isClonableShared } from "./realoem-diagram-classifier";

const JOB: JobType = "realoem_backfill";

const FRESHNESS_HOURS_DEFAULT = (() => {
  const raw = parseInt(process.env.REALOEM_BACKFILL_FRESHNESS_HOURS || "168", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 168; // 7 days
})();

const FUZZY_THRESHOLD = (() => {
  const raw = parseFloat(process.env.REALOEM_BACKFILL_FUZZY_THRESHOLD || "0.5");
  return Number.isFinite(raw) && raw > 0 ? raw : 0.5;
})();

// Bounded per-car parallelism: how many diagrams we fetch+ingest at the
// same time for a single car. The shared daily Oxylabs budget (an int
// counter behind `tryConsumeRealoemBudget`) is safe under concurrent
// callers because Node's event loop serialises the increment. Capped at
// 16 to keep us well below RealOEM's per-IP rate limits.
const MAX_CONCURRENCY = (() => {
  const raw = parseInt(process.env.REALOEM_BACKFILL_MAX_CONCURRENCY || "4", 10);
  if (!Number.isFinite(raw) || raw < 1) return 4;
  return Math.min(raw, 16);
})();

// Avg diagrams per chassis on RealOEM. Used solely for the up-front
// "this run will use ~N proxy requests" estimate the UI shows the
// admin before they hit Run.
const AVG_DIAGRAMS_PER_CHASSIS = 26;

// Safety guard: abort the run if N consecutive cars yield 0 diagrams from
// their landing fetch AND nothing has been inserted yet. This is the main
// loop's mirror of the discovery pre-step's existing 5-empty abort. Without
// it, a wholesale URL-format mismatch (e.g. RealOEM returning its welcome
// page for every chassis) silently completes "successfully" while burning
// the full daily Oxylabs budget on empty pages. See resolveRealoemTarget
// in realoem-audit.ts for the URL-format caveat.
// Set to 0 to disable the guard entirely (e.g. for an audit-mode run that
// intentionally tolerates many empty landings).
const EMPTY_LANDING_ABORT_THRESHOLD = (() => {
  const env = process.env.REALOEM_BACKFILL_EMPTY_ABORT_THRESHOLD;
  if (env === undefined) return 5;
  const raw = parseInt(env, 10);
  if (!Number.isFinite(raw) || raw < 0) return 5;
  return raw; // 0 = disabled
})();

// Hard per-run Oxylabs request ceiling. The partgrp URL fix means each
// car's catalog walk now correctly drills into ~36 sub-landings × ~25
// diagrams ≈ ~900 Oxylabs requests per car when walked exhaustively.
// Across 2,198 cars that's ~2M requests for an unconstrained scope=all
// run — which would shred any sane daily budget. This cap is the
// run-local circuit breaker: when the run's own proxy delta crosses the
// threshold, we stop after the current car finishes so the operator
// can decide whether to bump the cap or split the run by chassis.
// Set 0 to disable. The default is generous enough to cover roughly
// 30 cars worth of full walks before tripping; tune via env per-run.
const MAX_PROXY_REQUESTS_PER_RUN = (() => {
  const env = process.env.REALOEM_BACKFILL_MAX_PROXY_REQUESTS_PER_RUN;
  if (env === undefined) return 30000;
  const raw = parseInt(env, 10);
  if (!Number.isFinite(raw) || raw < 0) return 30000;
  return raw; // 0 = disabled
})();

export type BackfillScope = "car" | "chassis" | "all";

export interface BackfillRunOptions {
  scope: BackfillScope;
  carId?: number;
  chassis?: string;
  fixtureOnly?: boolean;
  forceRefetch?: boolean;
  freshnessHours?: number;
}

export interface BackfillState {
  running: boolean;
  cancelled: boolean;
  jobId: number | null;
  runId: number | null;
  scope: BackfillScope | null;
  scopeLabel: string | null;
  // High-level phase the run is currently in. "idle" when not running.
  // "discovery" = variant-discovery pre-step (scope=all only, walks
  // bmwpartsdeal via Evomi — does NOT spend Oxylabs budget). "main" =
  // per-car landing+diagram fetch loop (the long-running phase that
  // actually spends Oxylabs budget and inserts parts). "post" = idle
  // book-keeping after the main loop completes.
  phase: "idle" | "discovery" | "main" | "post";
  startedAt: Date | null;
  finishedAt: Date | null;
  totalCars: number;
  carsProcessed: number;
  diagramsTotal: number;
  diagramsFetched: number;
  diagramsCached: number;
  diagramsSkippedFresh: number;
  // Task #101 — Cross-variant diagram dedup. `diagramsClonedFromCanonical`
  // counts how many per-(car, diagram) processings short-circuited via
  // the (chassis, diag_id) canonical store and skipped the proxy fetch
  // entirely; `proxyRequestsSaved` is the corresponding tally of
  // Oxylabs requests we did NOT spend (1 saved request per clone).
  diagramsClonedFromCanonical: number;
  proxyRequestsSaved: number;
  partsInserted: number;
  newSubcategories: number;
  proxyRequestsAtStart: number;
  proxyRequestsUsed: number;
  errors: number;
  lastError: string | null;
  currentCar: string | null;
  currentDiagram: string | null;
  freshnessHours: number;
  // Discovery pre-step live counters. Populated only while phase ===
  // "discovery"; reset between runs. Surfaced in the admin UI so the
  // operator can see chassis-by-chassis progress instead of a wall of
  // zeros while the (Evomi-bound) sweep is in flight.
  discoveryChassisTotal: number;
  discoveryChassisChecked: number;
  discoveryCurrentChassis: string | null;
  discoveryVariantsFound: number;
  discoveryNewCarsInserted: number;
  discoveryCatalogIdsBackfilled: number;
  // Set when the run ends due to the EMPTY_LANDING_ABORT_THRESHOLD guard so
  // the chain watcher can detect it without parsing lastError strings.
  // "empty_landing_threshold" = chassis has no usable RealOEM data.
  // "proxy_cap" = per-run proxy cap reached (not a skip signal).
  // null = clean finish or cancel.
  abortCode: "empty_landing_threshold" | "proxy_cap" | null;
}

const initialState = (): BackfillState => ({
  running: false,
  cancelled: false,
  jobId: null,
  runId: null,
  scope: null,
  scopeLabel: null,
  phase: "idle",
  startedAt: null,
  finishedAt: null,
  totalCars: 0,
  carsProcessed: 0,
  diagramsTotal: 0,
  diagramsFetched: 0,
  diagramsCached: 0,
  diagramsSkippedFresh: 0,
  diagramsClonedFromCanonical: 0,
  proxyRequestsSaved: 0,
  partsInserted: 0,
  newSubcategories: 0,
  proxyRequestsAtStart: 0,
  proxyRequestsUsed: 0,
  errors: 0,
  lastError: null,
  currentCar: null,
  currentDiagram: null,
  freshnessHours: FRESHNESS_HOURS_DEFAULT,
  discoveryChassisTotal: 0,
  discoveryChassisChecked: 0,
  discoveryCurrentChassis: null,
  discoveryVariantsFound: 0,
  discoveryNewCarsInserted: 0,
  discoveryCatalogIdsBackfilled: 0,
  abortCode: null,
});

const state: BackfillState = initialState();

export function getBackfillState() {
  const budget = getRealoemBudgetStatus();
  const proxyDelta = state.startedAt ? Math.max(0, budget.used - state.proxyRequestsAtStart) : 0;
  return {
    ...state,
    proxyRequestsUsed: state.running ? proxyDelta : state.proxyRequestsUsed,
    budget,
  };
}

export function cancelBackfill(): boolean {
  if (!state.running) return false;
  state.cancelled = true;
  cancelJobByType(JOB).catch(() => {});
  return true;
}

export function recordBackgroundFailure(message: string): void {
  state.lastError = message;
  state.running = false;
  state.finishedAt = new Date();
}

// ---------- Car selection / estimate ----------

type CarRow = typeof carsTable.$inferSelect;

export const BACKFILL_SCOPES = ["car", "chassis", "all"] as const;

export function isBackfillScope(v: unknown): v is BackfillScope {
  return typeof v === "string" && (BACKFILL_SCOPES as readonly string[]).includes(v);
}

async function selectCarsForScope(opts: BackfillRunOptions): Promise<CarRow[]> {
  // Defense-in-depth: never let an unrecognized scope silently fall
  // through to "all" (would be a runaway full-catalog scrape vs the
  // operator's intent + daily proxy budget).
  if (!isBackfillScope(opts.scope)) {
    throw new Error(`scope must be one of ${BACKFILL_SCOPES.join("|")} (got "${String(opts.scope)}")`);
  }
  if (opts.scope === "car") {
    if (!opts.carId) throw new Error("carId is required when scope='car'");
    const rows = await db.select().from(carsTable).where(eq(carsTable.id, opts.carId));
    if (rows.length === 0) throw new Error(`Car ${opts.carId} not found`);
    return rows;
  }
  if (opts.scope === "chassis") {
    if (!opts.chassis) throw new Error("chassis is required when scope='chassis'");
    const rows = await db.select().from(carsTable).where(eq(carsTable.chassis, opts.chassis.toUpperCase()));
    if (rows.length === 0) throw new Error(`No cars match chassis "${opts.chassis}"`);
    return rows;
  }
  // opts.scope === "all" (only after the strict enum check above)
  return db.select().from(carsTable);
}

export async function estimateBackfill(opts: BackfillRunOptions): Promise<{
  cars: number;
  chassisLandings: number;
  estimatedProxyRequests: number;
  budgetRemaining: number;
}> {
  const cars = await selectCarsForScope(opts);
  // RealOEM groups diagrams by chassis-style landing slug. Many of our
  // car rows resolve to the same landing page, so we collapse to the
  // unique landing keys for a realistic call estimate.
  const landings = new Set<string>();
  for (const c of cars) {
    landings.add(landingKeyForCar(c));
  }
  const budget = getRealoemBudgetStatus();
  return {
    cars: cars.length,
    chassisLandings: landings.size,
    estimatedProxyRequests: landings.size * AVG_DIAGRAMS_PER_CHASSIS,
    budgetRemaining: budget.remaining,
  };
}

function landingKeyForCar(car: CarRow): string {
  // Group cars by their canonical RealOEM landing — i.e. by mospid when
  // we have one (cars.catalog_id IS the BMW mospid that RealOEM also
  // uses), so two car rows pointing at the same RealOEM page count as
  // one chassis landing in the proxy estimate.
  const t = resolveRealoemTarget(car);
  if (t) return t.landingKey;
  const firstSegment = (car.slug ?? "").split("-")[0]?.toLowerCase();
  return (car.chassis || firstSegment || `car-${car.id}`).toLowerCase();
}

// `resolveRealoemTarget` lives in server/realoem-audit.ts (the shared
// primitives module) so audit and backfill never drift apart on how a
// `cars` row maps onto a RealOEM URL. Re-export it here for callers
// that already depend on this module.
export { resolveRealoemTarget };

// ---------- Recursive sub-landing crawl ----------

// Per-car safety rails for the recursive walk. RealOEM organizes the
// catalog as: top landing → main-group sub-landings → diagrams. A
// well-behaved chassis has ~10 main groups × ~20–40 diagrams each.
// These caps keep a misbehaved page (or a parser regression that
// confuses sub-landings with the top landing) from ballooning into
// runaway proxy spend.
const SUB_LANDING_MAX_DEPTH = (() => {
  const raw = parseInt(process.env.REALOEM_BACKFILL_SUB_DEPTH || "3", 10);
  return Number.isFinite(raw) && raw >= 0 ? Math.min(raw, 5) : 3;
})();
const SUB_LANDING_MAX_FETCHES_PER_CAR = (() => {
  const raw = parseInt(process.env.REALOEM_BACKFILL_SUB_MAX || "80", 10);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 500) : 80;
})();

/**
 * BFS over the chassis landing's sub-landings, accumulating every
 * unique diagram link reachable within `SUB_LANDING_MAX_DEPTH` hops.
 * Returns the deduped list (top-landing diagrams + sub-landing
 * diagrams) in a shape compatible with `extractDiagramLinks`.
 *
 * Hard caps (depth + total fetches) protect against pathological pages
 * and parser regressions. Honors `state.cancelled` between fetches.
 */
async function collectAllDiagramLinks(
  rootHtml: string,
  rootUrl: string,
  opts: {
    fixtureOnly?: boolean;
    forceRefetch?: boolean;
    onFetched?: (source: "fixture" | "cache" | "oxylabs") => void;
  },
): Promise<{ url: string; diagramId: string | null; title: string | null }[]> {
  const diagrams = new Map<string, { url: string; diagramId: string | null; title: string | null }>();
  const visited = new Set<string>([rootUrl]);

  // Seed: top landing's own diagrams + its sub-landings (depth 1).
  for (const d of extractDiagramLinks(rootHtml)) {
    if (!diagrams.has(d.url)) diagrams.set(d.url, d);
  }
  const queue: { url: string; depth: number }[] = [];
  for (const s of extractSubLandingLinks(rootHtml)) {
    if (!visited.has(s.url)) {
      visited.add(s.url);
      queue.push({ url: s.url, depth: 1 });
    }
  }

  let fetches = 0;
  while (queue.length > 0) {
    if (state.cancelled) break;
    if (fetches >= SUB_LANDING_MAX_FETCHES_PER_CAR) {
      console.warn(`[RealoemBackfill] sub-landing walk hit per-car fetch cap (${SUB_LANDING_MAX_FETCHES_PER_CAR}) — stopping`);
      break;
    }
    const { url, depth } = queue.shift()!;
    let html: string;
    try {
      const fetched = await fetchRealoemHtml(url, {
        fixtureOnly: opts.fixtureOnly,
        forceRefetch: opts.forceRefetch,
      });
      opts.onFetched?.(fetched.source);
      html = fetched.html;
      fetches++;
    } catch (e) {
      // Non-fatal: log and continue. Budget exhaustion / network errors
      // shouldn't abort the whole car — we still process whatever
      // diagrams we already collected.
      console.warn(`[RealoemBackfill] sub-landing fetch failed (${url}): ${(e as Error).message}`);
      continue;
    }
    for (const d of extractDiagramLinks(html)) {
      if (!diagrams.has(d.url)) diagrams.set(d.url, d);
    }
    if (depth < SUB_LANDING_MAX_DEPTH) {
      for (const s of extractSubLandingLinks(html)) {
        if (visited.has(s.url)) continue;
        visited.add(s.url);
        queue.push({ url: s.url, depth: depth + 1 });
      }
    }
  }

  return [...diagrams.values()];
}

// ---------- Pre-step: chassis variant discovery + catalog_id fixup ----------

export interface VariantFixupSummary {
  chassisChecked: number;
  variantsDiscovered: number;
  newCarsInserted: number;
  catalogIdsBackfilled: number;
  errors: number;
}

/**
 * Pre-step run before the main "all" backfill loop. Closes two gaps:
 *   #1) cars/variants we've never seen — discover via bmwpartsdeal
 *       (Evomi proxy, NOT the Oxylabs budget) and INSERT them into
 *       `cars`.
 *   #2) existing `cars` rows with NULL `catalog_id` — match the
 *       discovered variants by (chassis, modelName) and UPDATE the
 *       row so subsequent `resolveRealoemTarget()` produces a real
 *       RealOEM landing URL.
 *
 * Idempotent: if a discovered variant already exists by catalogId
 * (matched in `discoverVariantsForChassisList`), it's filtered out
 * before insert. The catalog_id UPDATE only touches rows where the
 * column is currently NULL.
 */
export async function runVariantDiscoveryFixup(): Promise<VariantFixupSummary> {
  const summary: VariantFixupSummary = {
    chassisChecked: 0,
    variantsDiscovered: 0,
    newCarsInserted: 0,
    catalogIdsBackfilled: 0,
    errors: 0,
  };

  // Pull every distinct chassis we know about from bmw_models. This is
  // the canonical list — discoverVariantsForChassisList walks each one
  // through bmwpartsdeal's catalog tree to enumerate all variants.
  const chassisRows = await db.execute<{ chassis: string }>(
    sql`SELECT DISTINCT chassis FROM bmw_models WHERE chassis IS NOT NULL AND chassis <> '' ORDER BY chassis`,
  );
  const allChassis: string[] = (chassisRows.rows as { chassis: string }[])
    .map((r) => (r.chassis || "").trim().toUpperCase())
    .filter((c) => c.length > 0);
  summary.chassisChecked = allChassis.length;
  console.log(`[RealoemBackfill] variant-discovery sweep: ${allChassis.length} distinct chassis`);

  let discovered: Awaited<ReturnType<typeof discoverVariantsForChassisList>>;
  try {
    // Wire chassis-by-chassis progress + cancel into module state so
    // (a) the admin UI can show "Discovery: 152/296 · current=F36"
    // instead of a wall of zeros while the sweep is in flight, and
    // (b) the operator's Cancel actually stops the sweep within one
    // chassis instead of waiting ~15 min for the alphabet to finish.
    discovered = await discoverVariantsForChassisList(allChassis, {
      onStart: (total) => {
        state.discoveryChassisTotal = total;
        state.discoveryChassisChecked = 0;
      },
      onChassis: (chassis) => {
        state.discoveryCurrentChassis = chassis;
      },
      onChassisComplete: (_chassis, _i, _total, variantsFoundSoFar) => {
        state.discoveryChassisChecked++;
        state.discoveryVariantsFound = variantsFoundSoFar;
      },
      shouldCancel: () => state.cancelled,
    });
  } catch (e) {
    summary.errors++;
    console.warn(`[RealoemBackfill] variant-discovery failed: ${(e as Error).message}`);
    return summary;
  }
  summary.variantsDiscovered = discovered.discovered.length;
  state.discoveryVariantsFound = discovered.discovered.length;

  // (#1) INSERT brand-new variants we've never seen.
  if (discovered.newVariants.length > 0) {
    try {
      const inserted = await insertDiscoveredVariants(discovered.newVariants);
      summary.newCarsInserted = inserted.length;
      state.discoveryNewCarsInserted = inserted.length;
      console.log(`[RealoemBackfill] inserted ${inserted.length} new car variants`);
    } catch (e) {
      summary.errors++;
      console.warn(`[RealoemBackfill] insertDiscoveredVariants failed: ${(e as Error).message}`);
    }
  }

  // (#2) Backfill catalog_id on existing cars that match a discovered
  // variant. Only touch rows where catalog_id is currently NULL.
  //
  // Two-tier match (a discovered variant has chassis + bodyCode +
  // bodyType + modelName; an existing car has chassis + bodyType +
  // displayName, where displayName conventionally starts with the
  // chassis code, e.g. "G87 M2"):
  //   1) Primary: (chassis, normalized model-name-without-chassis).
  //      Strip a leading chassis prefix and any leading "BMW " from
  //      the existing displayName so it lines up with the variant's
  //      bare modelName ("M2", "M3 CS", …).
  //   2) Fallback: (chassis, bodyType) — only used when there's
  //      EXACTLY ONE discovered variant for that pair (so we don't
  //      blindly assign a Saloon's catalog_id to another Saloon of
  //      the same chassis when there are multiple body variants).
  const ghosts = await db
    .select()
    .from(carsTable)
    .where(sql`${carsTable.catalogId} IS NULL`);
  if (ghosts.length > 0) {
    const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "");
    const stripChassis = (chassis: string, name: string) => {
      const s = (name || "").replace(/^bmw\s+/i, "");
      const re = new RegExp(`^${chassis}\\s+`, "i");
      return s.replace(re, "");
    };

    const byChassisModel = new Map<string, string>();        // (chassis, model) → catalogId
    const byChassisBody = new Map<string, string[]>();        // (chassis, bodyType) → catalogIds
    for (const v of discovered.discovered) {
      const chassis = (v.chassis || "").toUpperCase();
      const k1 = `${chassis}::${norm(v.modelName)}`;
      if (!byChassisModel.has(k1)) byChassisModel.set(k1, v.catalogId);
      const k2 = `${chassis}::${norm(v.bodyType)}`;
      const arr = byChassisBody.get(k2) || [];
      arr.push(v.catalogId);
      byChassisBody.set(k2, arr);
    }

    for (const g of ghosts) {
      const chassis = (g.chassis || "").toUpperCase();
      let cat: string | undefined;

      // Tier 1: chassis + model-name (chassis prefix stripped).
      const modelOnly = stripChassis(chassis, g.displayName || "");
      cat = byChassisModel.get(`${chassis}::${norm(modelOnly)}`);

      // Tier 2: chassis + bodyType, only if unambiguous.
      if (!cat) {
        const candidates = byChassisBody.get(`${chassis}::${norm(g.bodyType || "")}`);
        if (candidates && candidates.length === 1) cat = candidates[0];
      }

      if (!cat) continue;
      try {
        await db.execute(sql`UPDATE cars SET catalog_id = ${cat} WHERE id = ${g.id} AND catalog_id IS NULL`);
        summary.catalogIdsBackfilled++;
        state.discoveryCatalogIdsBackfilled = summary.catalogIdsBackfilled;
      } catch (e) {
        summary.errors++;
        console.warn(`[RealoemBackfill] catalog_id backfill failed for car #${g.id}: ${(e as Error).message}`);
      }
    }
    console.log(`[RealoemBackfill] backfilled catalog_id on ${summary.catalogIdsBackfilled}/${ghosts.length} ghost cars`);
  }

  return summary;
}

// ---------- Fuzzy matching ----------

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
  a.forEach((t) => { if (b.has(t)) inter++; });
  return inter / (a.size + b.size - inter);
}

// ---------- Freshness ----------

async function isFresh(subcategoryId: number, diagramUrl: string, freshHours: number): Promise<boolean> {
  if (freshHours <= 0) return false;
  const rows = await db
    .select({ createdAt: realoemAuditFindings.createdAt })
    .from(realoemAuditFindings)
    .where(and(
      eq(realoemAuditFindings.subcategoryId, subcategoryId),
      eq(realoemAuditFindings.realoemDiagramUrl, diagramUrl),
    ))
    .orderBy(desc(realoemAuditFindings.createdAt))
    .limit(1);
  if (rows.length === 0) return false;
  const ageMs = Date.now() - new Date(rows[0].createdAt).getTime();
  return ageMs < freshHours * 3600 * 1000;
}

// ---------- Parent-category dedupe (race-safe) ----------

// Per-car promise cache so concurrent diagram workers that all need the
// auto-created "RealOEM Backfill" parent category share one INSERT
// instead of each racing their own SELECT/INSERT and producing dupes.
// Cleared at the start of every run so a previous run's id (which may
// have been removed by a revert) can never be returned stale.
const parentCategoryCache = new Map<number, Promise<number>>();

function resetParentCategoryCache(): void {
  parentCategoryCache.clear();
}

async function ensureBackfillParentCategory(carId: number, fallbackUrl: string): Promise<number> {
  const cached = parentCategoryCache.get(carId);
  if (cached) return cached;
  const p = (async () => {
    const cats = await db.execute<{ id: number }>(sql`
      SELECT id FROM categories WHERE car_id = ${carId} AND category_id = 'realoem-backfill' LIMIT 1
    `);
    if (cats.rows[0]) return cats.rows[0].id;
    const inserted = await db.execute<{ id: number }>(sql`
      INSERT INTO categories (car_id, category_id, name, url)
      VALUES (${carId}, 'realoem-backfill', 'Additional Parts', ${fallbackUrl})
      RETURNING id
    `);
    return inserted.rows[0].id;
  })();
  parentCategoryCache.set(carId, p);
  // On failure, drop the rejected promise so the next diagram retries
  // instead of inheriting a permanent error.
  p.catch(() => parentCategoryCache.delete(carId));
  return p;
}

// ---------- Per-diagram processing ----------

interface DiagramResult {
  inserted: number;
  realoemPartCount: number;
  ourPartCount: number;
  skipped: boolean;
  newSubcategory: boolean;
  diagramId: string | null;
  title: string | null;
  subcategoryId: number;
}

async function ensureMappingForDiagram(
  car: CarRow,
  link: { url: string; diagramId: string | null; title: string | null },
  runId: number,
): Promise<{ mapping: SubcategoryRealoemMap; created: boolean }> {
  const byUrl = await db.select().from(subcategoryRealoemMap)
    .where(and(eq(subcategoryRealoemMap.carId, car.id), eq(subcategoryRealoemMap.realoemDiagramUrl, link.url)))
    .limit(1);
  if (byUrl[0]) return { mapping: byUrl[0], created: false };

  if (link.diagramId) {
    const byId = await db.select().from(subcategoryRealoemMap)
      .where(and(eq(subcategoryRealoemMap.carId, car.id), eq(subcategoryRealoemMap.realoemDiagramId, link.diagramId)))
      .limit(1);
    if (byId[0]) return { mapping: byId[0], created: false };
  }

  // Try fuzzy match against existing subcategories on this car.
  const subs = await db.select().from(subcategoriesTable).where(eq(subcategoriesTable.carId, car.id));
  const linkTokens = tokenize(link.title || "");
  let best: { sub: typeof subs[number]; score: number } | null = null;
  for (const s of subs) {
    const score = jaccard(linkTokens, tokenize(s.name || ""));
    if (!best || score > best.score) best = { sub: s, score };
  }

  if (best && best.score >= FUZZY_THRESHOLD) {
    const m = await upsertMapping({
      subcategoryId: best.sub.id,
      realoemDiagramUrl: link.url,
      realoemDiagramId: link.diagramId,
      confidence: Math.round(best.score * 100) / 100,
      source: `realoem-backfill:${runId}`,
      notes: `auto-matched "${link.title || ""}" ↔ "${best.sub.name}" (jaccard=${best.score.toFixed(2)})`,
    });
    return { mapping: m, created: false };
  }

  // No fuzzy match — auto-create a subcategory under the car. Pick (or
  // create) a parent category named "RealOEM Backfill" so the new rows
  // are still navigable from the car's category list. Race-safe under
  // parallel diagram workers via a per-car promise cache.
  const categoryId = await ensureBackfillParentCategory(car.id, link.url);

  const subCode = link.diagramId || `realoem-${Date.now()}`;
  const subName = link.title || `RealOEM diagram ${subCode}`;
  const [newSub] = await db.insert(subcategoriesTable).values({
    categoryId,
    carId: car.id,
    subcategoryId: subCode,
    name: subName,
    url: link.url,
  }).returning();

  const m = await upsertMapping({
    subcategoryId: newSub.id,
    realoemDiagramUrl: link.url,
    realoemDiagramId: link.diagramId,
    confidence: 0,
    source: `realoem-backfill:${runId}`,
    notes: `auto-created subcategory for unmatched diagram "${link.title || ""}"`,
  });
  return { mapping: m, created: true };
}

async function processDiagram(opts: {
  car: CarRow;
  link: { url: string; diagramId: string | null; title: string | null };
  runId: number;
  fixtureOnly?: boolean;
  forceRefetch?: boolean;
  freshHours: number;
}): Promise<DiagramResult> {
  const { car, link, runId, fixtureOnly, forceRefetch, freshHours } = opts;
  state.currentDiagram = link.title || link.diagramId || link.url;

  const { mapping, created } = await ensureMappingForDiagram(car, link, runId);
  if (created) state.newSubcategories++;

  if (!forceRefetch && await isFresh(mapping.subcategoryId, mapping.realoemDiagramUrl, freshHours)) {
    state.diagramsSkippedFresh++;
    return {
      inserted: 0, realoemPartCount: 0, ourPartCount: 0,
      skipped: true, newSubcategory: created,
      diagramId: link.diagramId, title: link.title,
      subcategoryId: mapping.subcategoryId,
    };
  }

  // Task #101 — Cross-variant dedup. Before spending an Oxylabs request,
  // check the (chassis, diag_id) canonical store: if a sibling variant
  // of this chassis already fetched this diagram AND the diag_id is
  // classified "shared" (body/trim/glass — see
  // realoem-diagram-classifier.ts), clone the parts payload onto this
  // car's subcategory and skip the proxy fetch entirely. The ledger
  // and parts inserts otherwise stay byte-identical to the per-car
  // path so the audit-findings UI / CSV / revert tooling are unchanged.
  const chassisKey = (car.chassis || "").toUpperCase().trim() || null;
  const diagIdKey = link.diagramId || null;
  let realoemParts: ExtractedRealoemPart[] | null = null;
  let resolvedDiagramId: string | null = link.diagramId ?? null;
  let resolvedTitle: string | null = link.title ?? null;
  let cloned = false;

  if (!forceRefetch && chassisKey && diagIdKey && isClonableShared(diagIdKey)) {
    const canonical = await lookupCanonical(chassisKey, diagIdKey);
    // Freshness gate: only clone when the canonical row is within the
    // same `freshHours` window the per-car `isFresh()` helper enforces.
    // Without this check, a one-time canonical write would let the
    // backfill keep handing stale parts to new sibling cars even after
    // RealOEM updated the diagram. Stale rows fall through to the
    // fetch path below, which then re-upserts the canonical row with
    // the latest payload (refreshing it for subsequent siblings in the
    // same run).
    if (
      canonical &&
      canonical.parts.length > 0 &&
      isCanonicalFresh(canonical.row, freshHours)
    ) {
      realoemParts = canonical.parts;
      resolvedDiagramId = canonical.row.diagId || resolvedDiagramId;
      resolvedTitle = canonical.row.realoemDiagramTitle || resolvedTitle;
      cloned = true;
      state.diagramsClonedFromCanonical++;
      state.proxyRequestsSaved++;
      // Keep `diagramsTotal` semantics consistent with the pre-Task-#101
      // behavior: it counts every (car, diagram) pair the backfill
      // touched, not just ones that triggered an HTTP fetch. Without
      // this increment, the recent-runs telemetry would under-report
      // the work done once dedup starts cloning.
      state.diagramsTotal++;
    }
  }

  if (!cloned) {
    const fetched = await fetchRealoemHtml(mapping.realoemDiagramUrl, { fixtureOnly, forceRefetch });
    if (fetched.source === "oxylabs") state.diagramsFetched++;
    else state.diagramsCached++;
    state.diagramsTotal++;

    const meta = extractDiagramMeta(fetched.html, mapping.realoemDiagramUrl);
    resolvedDiagramId = link.diagramId ?? meta.diagramId ?? null;
    resolvedTitle = meta.title || link.title;

    try {
      realoemParts = extractRealoemPartsStrict(fetched.html);
    } catch (e) {
      if (e instanceof ParserDriftError) {
        // Loud per-diagram failure: write a `parser_drift` ledger row so
        // the recent-runs panel shows it instead of inserting nothing.
        await db.insert(realoemAuditFindings).values({
          auditRunId: runId,
          carId: car.id,
          subcategoryId: mapping.subcategoryId,
          realoemDiagramUrl: mapping.realoemDiagramUrl,
          realoemDiagramId: resolvedDiagramId,
          realoemPartCount: 0,
          ourPartCount: 0,
          missingPartCount: 0,
          missingParts: [],
          extraParts: [],
          status: "parser_drift",
          partsBackfilled: 0,
          backfilledAt: null,
          backfilledBy: `realoem-backfill:${runId}`,
          notes: `parser_drift:${e.kind} — ${e.message}`,
        });
        state.errors++;
        state.lastError = `parser drift (${e.kind}) on ${mapping.realoemDiagramUrl}: ${e.message}`;
        console.warn(`[RealoemBackfill] ${state.lastError}`);
        return {
          inserted: 0,
          realoemPartCount: 0,
          ourPartCount: 0,
          skipped: false,
          newSubcategory: created,
          diagramId: resolvedDiagramId,
          title: resolvedTitle,
          subcategoryId: mapping.subcategoryId,
        };
      }
      throw e;
    }

    // Successful fetch + extract → upsert the canonical row so the
    // next sibling of this chassis can clone (when classified shared)
    // or just see the row in the dry-run preview (per-car / unknown).
    if (chassisKey && diagIdKey && realoemParts.length > 0) {
      try {
        await upsertCanonical({
          chassis: chassisKey,
          diagId: diagIdKey,
          realoemDiagramUrl: mapping.realoemDiagramUrl,
          realoemDiagramTitle: resolvedTitle,
          parts: realoemParts,
          diagramClass: classifyDiagId(diagIdKey),
          sourceCarId: car.id,
        });
      } catch (e) {
        // Non-fatal: dedup is an optimization, not a correctness path.
        console.warn(`[RealoemBackfill] canonical upsert failed (${chassisKey}/${diagIdKey}): ${(e as Error).message}`);
      }
    }
  }

  if (!realoemParts) realoemParts = [];

  const ourRows = await db
    .select({ pn: partsTable.partNumberClean, pnRaw: partsTable.partNumber })
    .from(partsTable)
    .where(eq(partsTable.subcategoryId, mapping.subcategoryId));
  const ourSet = new Set(
    ourRows.map(r => (r.pn || (r.pnRaw || "").replace(/[\s.-]/g, ""))).filter(Boolean) as string[],
  );

  const missing = realoemParts.filter(p => !ourSet.has(p.partNumberClean));
  let inserted = 0;
  const provenance = `realoem-backfill:${runId}`;

  for (const p of missing) {
    if (!p.partNumberClean) continue;
    // Race-safe re-check (parallel workers may target the same sub).
    const [exists] = await db.select({ id: partsTable.id }).from(partsTable)
      .where(and(
        eq(partsTable.subcategoryId, mapping.subcategoryId),
        eq(partsTable.partNumberClean, p.partNumberClean),
      ))
      .limit(1);
    if (exists) continue;

    await db.insert(partsTable).values({
      subcategoryId: mapping.subcategoryId,
      carId: car.id,
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

  await db.insert(realoemAuditFindings).values({
    auditRunId: runId,
    carId: car.id,
    subcategoryId: mapping.subcategoryId,
    realoemDiagramUrl: mapping.realoemDiagramUrl,
    realoemDiagramId: resolvedDiagramId,
    realoemPartCount: realoemParts.length,
    ourPartCount: ourSet.size,
    missingPartCount: missing.length,
    missingParts: missing,
    extraParts: [],
    status: inserted > 0 ? "backfilled" : "clean",
    partsBackfilled: inserted,
    backfilledAt: inserted > 0 ? new Date() : null,
    backfilledBy: `realoem-backfill:${runId}`,
    notes: cloned ? `cloned-from-canonical:${chassisKey}/${diagIdKey}` : null,
  });

  return {
    inserted,
    realoemPartCount: realoemParts.length,
    ourPartCount: ourSet.size,
    skipped: false,
    newSubcategory: created,
    diagramId: resolvedDiagramId,
    title: resolvedTitle,
    subcategoryId: mapping.subcategoryId,
  };
}

// ---------- Per-car processing ----------

/**
 * Detect RealOEM's generic "Welcome to RealOEM.com!" page.
 *
 * Hitting `/bmw/enUS/showparts?id=<slug>&mospid=<n>` (without `&diagId=…`)
 * returns the welcome page with HTTP 200 instead of an error or redirect.
 * Without this signature check, callers can only see the symptom ("0
 * diagrams in landing") and don't know whether the chassis really has no
 * diagrams or whether the URL is malformed. The marker text below is on
 * the welcome page and never appears on a real chassis-landing page.
 */
function isRealoemWelcomePage(html: string): boolean {
  return /Welcome to RealOEM\.com!/i.test(html)
    && /Click here to enter BMW catalog/i.test(html);
}

async function processCar(car: CarRow, opts: {
  runId: number;
  fixtureOnly?: boolean;
  forceRefetch?: boolean;
  freshHours: number;
}): Promise<{ landingEmpty: boolean; welcomePage: boolean }> {
  state.currentCar = `${car.chassis} · ${car.displayName}`;
  state.currentDiagram = null;

  const target = resolveRealoemTarget(car);
  if (!target) {
    state.errors++;
    state.lastError = `Car #${car.id} has no slug/chassis/catalog_id — cannot derive RealOEM landing URL.`;
    console.warn(`[RealoemBackfill] ${state.lastError}`);
    return { landingEmpty: true, welcomePage: false };
  }
  const landingUrl = target.landingUrl;

  let landingHtml: string;
  try {
    const fetched = await fetchRealoemHtml(landingUrl, {
      fixtureOnly: opts.fixtureOnly,
      forceRefetch: opts.forceRefetch,
    });
    if (fetched.source === "oxylabs") state.diagramsFetched++;
    else state.diagramsCached++;
    landingHtml = fetched.html;
  } catch (e) {
    state.errors++;
    state.lastError = `Car #${car.id} landing fetch: ${(e as Error).message}`;
    console.warn(`[RealoemBackfill] ${state.lastError}`);
    return { landingEmpty: true, welcomePage: false };
  }

  // Discover ALL diagrams reachable from the landing — including those
  // only linked from main-group sub-landings (Engine, Transmission, …).
  // RealOEM hides most diagrams behind these intermediate pages, so a
  // top-landing-only scan captures only ~10–15% of the catalog.
  let links: { url: string; diagramId: string | null; title: string | null }[];
  try {
    links = await collectAllDiagramLinks(landingHtml, landingUrl, {
      fixtureOnly: opts.fixtureOnly,
      forceRefetch: opts.forceRefetch,
      onFetched: (src) => {
        if (src === "oxylabs") state.diagramsFetched++;
        else state.diagramsCached++;
      },
    });
  } catch (e) {
    state.errors++;
    state.lastError = `Car #${car.id} sub-landing crawl: ${(e as Error).message}`;
    console.warn(`[RealoemBackfill] ${state.lastError}`);
    links = extractDiagramLinks(landingHtml); // graceful fallback
  }
  if (links.length === 0) {
    const welcomePage = isRealoemWelcomePage(landingHtml);
    if (welcomePage) {
      console.warn(
        `[RealoemBackfill] car #${car.id} (${target.landingKey}): RealOEM returned its welcome page — landing URL is wrong (likely id format). url=${landingUrl}`,
      );
    } else {
      console.log(`[RealoemBackfill] car #${car.id} (${target.landingKey}): 0 diagrams in landing`);
    }
    return { landingEmpty: true, welcomePage };
  }

  // Bounded per-car worker pool: pull diagrams from a shared cursor and
  // fetch+ingest up to MAX_CONCURRENCY at once. State counters
  // (partsInserted / diagramsFetched / errors) are mutated from each
  // worker — Node's single-threaded event loop guarantees the integer
  // increments themselves are atomic, and the daily Oxylabs budget
  // counter is similarly safe under concurrent callers.
  const concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, links.length));
  let cursor = 0;

  const runWorker = async (): Promise<void> => {
    while (!state.cancelled) {
      const i = cursor++;
      if (i >= links.length) return;
      const link = links[i];
      try {
        const r = await processDiagram({
          car, link, runId: opts.runId,
          fixtureOnly: opts.fixtureOnly,
          forceRefetch: opts.forceRefetch,
          freshHours: opts.freshHours,
        });
        state.partsInserted += r.inserted;
      } catch (e) {
        state.errors++;
        state.lastError = `Car #${car.id} ${link.diagramId || link.url}: ${(e as Error).message}`;
        console.warn(`[RealoemBackfill] ${state.lastError}`);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
  return { landingEmpty: false, welcomePage: false };
}

// ---------- Run lifecycle ----------

export async function preflightBackfill(opts: BackfillRunOptions): Promise<{ cars: CarRow[]; estimate: Awaited<ReturnType<typeof estimateBackfill>> }> {
  if (state.running) throw new Error("RealOEM backfill is already running");
  if (!opts.scope) throw new Error("scope is required");
  const cars = await selectCarsForScope(opts);
  const estimate = await estimateBackfill(opts);
  return { cars, estimate };
}

export interface BackfillRunSummary {
  runId: number;
  scope: BackfillScope;
  carsProcessed: number;
  diagramsFetched: number;
  diagramsCached: number;
  diagramsSkippedFresh: number;
  // Task #101 — cross-variant diagram dedup. `diagramsClonedFromCanonical`
  // is the count of diagrams served from the (chassis, diag_id) canonical
  // store (zero proxy cost); `proxyRequestsSaved` is the corresponding
  // tally of Oxylabs requests we avoided spending. CHANGELOG quotes a
  // measured % savings derived from these against `diagramsFetched`.
  diagramsClonedFromCanonical: number;
  proxyRequestsSaved: number;
  partsInserted: number;
  newSubcategories: number;
  proxyRequestsUsed: number;
  errors: number;
  lastError: string | null;
  durationMs: number;
}

export async function runBackfill(opts: BackfillRunOptions): Promise<BackfillRunSummary> {
  if (state.running) throw new Error("RealOEM backfill is already running");
  const cars = await selectCarsForScope(opts);

  // Reset state for this run.
  Object.assign(state, initialState());
  resetParentCategoryCache();
  state.running = true;
  state.scope = opts.scope;
  state.scopeLabel = opts.scope === "car" ? `car #${opts.carId}`
                   : opts.scope === "chassis" ? `chassis ${opts.chassis}`
                   : "all cars";
  state.startedAt = new Date();
  state.totalCars = cars.length;
  state.proxyRequestsAtStart = getRealoemBudgetStatus().used;
  state.freshnessHours = opts.freshnessHours ?? FRESHNESS_HOURS_DEFAULT;

  const job = await createJob(JOB, {
    status: "starting",
    scope: opts.scope,
    scopeLabel: state.scopeLabel,
    totalCars: cars.length,
    fixtureOnly: !!opts.fixtureOnly,
    forceRefetch: !!opts.forceRefetch,
    freshnessHours: state.freshnessHours,
  });
  state.jobId = job.id;
  state.runId = job.id;

  startPeriodicCheckpoint(job.id, () => {
    const s = getBackfillState();
    return {
      scope: s.scope,
      scopeLabel: s.scopeLabel,
      totalCars: s.totalCars,
      carsProcessed: s.carsProcessed,
      diagramsFetched: s.diagramsFetched,
      diagramsCached: s.diagramsCached,
      diagramsSkippedFresh: s.diagramsSkippedFresh,
      diagramsClonedFromCanonical: s.diagramsClonedFromCanonical,
      proxyRequestsSaved: s.proxyRequestsSaved,
      partsInserted: s.partsInserted,
      newSubcategories: s.newSubcategories,
      proxyRequestsUsed: s.proxyRequestsUsed,
      errors: s.errors,
      lastError: s.lastError,
      currentCar: s.currentCar,
      currentDiagram: s.currentDiagram,
    };
  });

  const t0 = Date.now();
  console.log(`[RealoemBackfill] runId=${job.id} cars=${cars.length} scope=${state.scopeLabel}`);

  // Pre-step (scope=all only): variant-discovery sweep to insert any
  // chassis/variants we don't yet have a `cars` row for, and to
  // backfill `catalog_id` on rows where it's NULL. Non-fatal: a sweep
  // failure is logged but never aborts the main loop.
  if (opts.scope === "all" && !state.cancelled) {
    state.phase = "discovery";
    try {
      const fixup = await runVariantDiscoveryFixup();
      console.log(
        `[RealoemBackfill] runId=${job.id} variant-fixup: ` +
        `chassis=${fixup.chassisChecked} discovered=${fixup.variantsDiscovered} ` +
        `newCars=${fixup.newCarsInserted} catalogIdsBackfilled=${fixup.catalogIdsBackfilled} errors=${fixup.errors}`,
      );
      // Re-load car list — newly inserted variants and freshly
      // catalog_id-fixed ghosts should be processed in the same run.
      if (fixup.newCarsInserted > 0 || fixup.catalogIdsBackfilled > 0) {
        const refreshed = await selectCarsForScope(opts);
        cars.length = 0;
        cars.push(...refreshed);
        state.totalCars = cars.length;
      }
    } catch (e) {
      state.errors++;
      state.lastError = `variant-fixup: ${(e as Error).message}`;
      console.warn(`[RealoemBackfill] ${state.lastError}`);
    } finally {
      // Hand off to the main per-car loop. We intentionally clear the
      // discoveryCurrentChassis pointer (it's stale once we leave the
      // pre-step) but keep the running totals visible so the operator
      // can still see what the sweep produced after the fact.
      state.discoveryCurrentChassis = null;
      state.phase = "main";
    }
  } else {
    state.phase = "main";
  }

  // Wholesale-failure guard. If the first N cars all return 0 diagrams
  // from their landing fetch AND nothing has been inserted yet, abort
  // the run instead of letting it silently burn the daily Oxylabs budget
  // on bad URLs. See EMPTY_LANDING_ABORT_THRESHOLD.
  let consecutiveEmptyLandings = 0;
  let welcomePageHits = 0;
  let aborted = false;
  let abortReason: string | null = null;
  try {
    for (const car of cars) {
      if (state.cancelled) break;
      const r = await processCar(car, {
        runId: job.id,
        fixtureOnly: opts.fixtureOnly,
        forceRefetch: opts.forceRefetch,
        freshHours: state.freshnessHours,
      });
      state.carsProcessed++;

      if (r.landingEmpty) {
        consecutiveEmptyLandings++;
        if (r.welcomePage) welcomePageHits++;
      } else {
        consecutiveEmptyLandings = 0;
      }
      if (
        EMPTY_LANDING_ABORT_THRESHOLD > 0
        && consecutiveEmptyLandings >= EMPTY_LANDING_ABORT_THRESHOLD
        && state.partsInserted === 0
      ) {
        const cause = welcomePageHits >= EMPTY_LANDING_ABORT_THRESHOLD
          ? `RealOEM returned its welcome page for the first ${EMPTY_LANDING_ABORT_THRESHOLD} cars — landing-URL format is wrong (resolveRealoemTarget needs to emit /bmw/enUS/partgrp?id=<key>, not /bmw/enUS/showparts?id=<slug>).`
          : `First ${EMPTY_LANDING_ABORT_THRESHOLD} cars returned 0 diagrams from their landing pages. Likely a wholesale URL or parser problem.`;
        abortReason = `${cause} Aborted run after ${state.carsProcessed}/${cars.length} cars to preserve daily Oxylabs budget. Set REALOEM_BACKFILL_EMPTY_ABORT_THRESHOLD=0 to disable this guard.`;
        console.error(`[RealoemBackfill] ${abortReason}`);
        state.lastError = abortReason;
        state.abortCode = "empty_landing_threshold";
        state.errors++;
        aborted = true;
        break;
      }

      // Per-run hard proxy-request cap. Trips after the current car
      // finishes so we don't leave a half-walked car behind. Computed
      // against the run-local proxy delta (not the daily budget) so the
      // cap is meaningful even when the daily budget is large.
      if (MAX_PROXY_REQUESTS_PER_RUN > 0) {
        const proxyDelta = Math.max(
          0,
          getRealoemBudgetStatus().used - state.proxyRequestsAtStart,
        );
        if (proxyDelta >= MAX_PROXY_REQUESTS_PER_RUN) {
          abortReason = `Per-run proxy-request cap reached: ${proxyDelta} >= ${MAX_PROXY_REQUESTS_PER_RUN} after ${state.carsProcessed}/${cars.length} cars. Bump REALOEM_BACKFILL_MAX_PROXY_REQUESTS_PER_RUN or split the run by chassis.`;
          console.error(`[RealoemBackfill] ${abortReason}`);
          state.lastError = abortReason;
          state.abortCode = "proxy_cap";
          state.errors++;
          aborted = true;
          break;
        }
      }

      // Refresh the parent car's total_parts counter so the visible
      // /car/:slug badge stays in sync as the run progresses.
      try {
        await db.execute(sql`
          UPDATE cars
          SET total_parts = (SELECT COUNT(*) FROM parts WHERE car_id = ${car.id})
          WHERE id = ${car.id}
        `);
      } catch (e) {
        console.warn(`[RealoemBackfill] failed to refresh totals for car #${car.id}: ${(e as Error).message}`);
      }
    }

    if (state.cancelled) {
      console.log(`[RealoemBackfill] runId=${job.id} cancelled after ${state.carsProcessed}/${cars.length} cars`);
      await cancelJob(job.id);
    } else if (aborted) {
      // Wholesale-failure guard tripped — fail the job loudly so the run
      // history shows it and the operator gets the actionable error.
      await failJob(job.id, abortReason || "wholesale empty-landing abort", {
        ...state,
        budget: getRealoemBudgetStatus(),
      });
    } else {
      await completeJob(job.id, {
        ...state,
        budget: getRealoemBudgetStatus(),
      });
      // Post-step (scope=all only): kick off cross-reference enrichment
      // so the freshly-inserted parts get their RealOEM cross-refs
      // walked in the background. Fire-and-forget; failures are logged
      // but never propagate back to the backfill summary.
      if (opts.scope === "all") {
        state.phase = "post";
        try {
          const xref = getCrossRefStatus();
          if (xref?.running) {
            console.log(`[RealoemBackfill] cross-ref enrichment already running — skipping post-step kick`);
          } else {
            await startCrossRefEnrichment();
            console.log(`[RealoemBackfill] cross-ref enrichment kicked off post-backfill`);
          }
        } catch (e) {
          console.warn(`[RealoemBackfill] cross-ref post-step failed (non-fatal): ${(e as Error).message}`);
        }
      }
    }
  } catch (e) {
    const msg = (e as Error).message;
    state.lastError = msg;
    state.errors++;
    await failJob(job.id, msg, { ...state });
    throw e;
  } finally {
    stopPeriodicCheckpoint(job.id);
    state.running = false;
    state.phase = "idle";
    state.finishedAt = new Date();
    // Snapshot the final proxy delta so the idle UI keeps showing it.
    state.proxyRequestsUsed = Math.max(0, getRealoemBudgetStatus().used - state.proxyRequestsAtStart);
  }

  return {
    runId: job.id,
    scope: opts.scope,
    carsProcessed: state.carsProcessed,
    diagramsFetched: state.diagramsFetched,
    diagramsCached: state.diagramsCached,
    diagramsSkippedFresh: state.diagramsSkippedFresh,
    diagramsClonedFromCanonical: state.diagramsClonedFromCanonical,
    proxyRequestsSaved: state.proxyRequestsSaved,
    partsInserted: state.partsInserted,
    newSubcategories: state.newSubcategories,
    proxyRequestsUsed: state.proxyRequestsUsed,
    errors: state.errors,
    lastError: state.lastError,
    durationMs: Date.now() - t0,
  };
}

// ---------- Recent runs ----------

export interface BackfillRunRecord {
  runId: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  scope: string | null;
  scopeLabel: string | null;
  totalCars: number;
  carsProcessed: number;
  diagramsFetched: number;
  diagramsCached: number;
  diagramsSkippedFresh: number;
  // Task #101 — cross-variant dedup tally surfaced on the recent-runs panel.
  diagramsClonedFromCanonical: number;
  proxyRequestsSaved: number;
  partsInserted: number;
  newSubcategories: number;
  errors: number;
  lastError: string | null;
  // Live re-aggregation from the findings ledger so the recent-runs
  // panel stays accurate even if the in-memory progress was lost
  // (process restart mid-run).
  ledgerPartsInserted: number;
  ledgerDiagramsTouched: number;
  byChassis: Array<{ chassis: string; partsInserted: number; diagramsTouched: number }>;
}

// Persisted progress shape we write to background_jobs.progress for
// realoem_backfill jobs. JobProgress in job-manager is `Record<string, unknown>`-ish,
// so this concrete interface tells the recent-runs reader exactly which
// fields to expect (with `unknown` for anything we don't read here).
export interface BackfillJobProgress {
  scope?: string | null;
  scopeLabel?: string | null;
  totalCars?: number;
  carsProcessed?: number;
  diagramsFetched?: number;
  diagramsCached?: number;
  diagramsSkippedFresh?: number;
  // Task #101 — cross-variant dedup tally read back by listBackfillRuns().
  diagramsClonedFromCanonical?: number;
  proxyRequestsSaved?: number;
  partsInserted?: number;
  newSubcategories?: number;
  errors?: number;
  lastError?: string | null;
  [k: string]: unknown;
}

// Postgres timestamps come back as either Date (drizzle ORM mapping) or
// raw string (db.execute<JobRow> with raw SQL). Normalize to ISO string.
function toIso(v: Date | string): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : String(v);
}

export async function listBackfillRuns(limit = 10): Promise<BackfillRunRecord[]> {
  type JobRow = {
    id: number;
    job_type: string;
    status: string;
    progress: BackfillJobProgress | null;
    started_at: Date | string;
    completed_at: Date | string | null;
    error: string | null;
  };

  const jobs = await db.execute<JobRow>(sql`
    SELECT * FROM background_jobs
    WHERE job_type = 'realoem_backfill'
    ORDER BY started_at DESC
    LIMIT ${limit}
  `);

  const out: BackfillRunRecord[] = [];
  for (const j of jobs.rows) {
    const p: BackfillJobProgress = j.progress || {};
    // Re-aggregate from the findings ledger keyed on auditRunId == job.id.
    const agg = await db.execute<{
      n: number;
      total_inserted: number;
    }>(sql`
      SELECT COUNT(*)::int AS n, COALESCE(SUM(parts_backfilled), 0)::int AS total_inserted
      FROM realoem_audit_findings WHERE audit_run_id = ${j.id}
    `);
    const byCh = await db.execute<{ chassis: string; parts_inserted: number; diagrams_touched: number }>(sql`
      SELECT COALESCE(c.chassis, '(unknown)') AS chassis,
             COALESCE(SUM(f.parts_backfilled), 0)::int AS parts_inserted,
             COUNT(*)::int AS diagrams_touched
      FROM realoem_audit_findings f
      LEFT JOIN cars c ON c.id = f.car_id
      WHERE f.audit_run_id = ${j.id}
      GROUP BY c.chassis
      ORDER BY parts_inserted DESC, diagrams_touched DESC
    `);
    out.push({
      runId: j.id,
      status: j.status,
      startedAt: toIso(j.started_at),
      completedAt: j.completed_at ? toIso(j.completed_at) : null,
      scope: p.scope ?? null,
      scopeLabel: p.scopeLabel ?? null,
      totalCars: Number(p.totalCars ?? 0),
      carsProcessed: Number(p.carsProcessed ?? 0),
      diagramsFetched: Number(p.diagramsFetched ?? 0),
      diagramsCached: Number(p.diagramsCached ?? 0),
      diagramsSkippedFresh: Number(p.diagramsSkippedFresh ?? 0),
      diagramsClonedFromCanonical: Number(p.diagramsClonedFromCanonical ?? 0),
      proxyRequestsSaved: Number(p.proxyRequestsSaved ?? 0),
      partsInserted: Number(p.partsInserted ?? 0),
      newSubcategories: Number(p.newSubcategories ?? 0),
      errors: Number(p.errors ?? 0),
      lastError: p.lastError ?? j.error ?? null,
      ledgerPartsInserted: Number(agg.rows[0]?.total_inserted ?? 0),
      ledgerDiagramsTouched: Number(agg.rows[0]?.n ?? 0),
      byChassis: byCh.rows.map(r => ({
        chassis: r.chassis,
        partsInserted: r.parts_inserted,
        diagramsTouched: r.diagrams_touched,
      })),
    });
  }
  return out;
}

// ---------- CSV export per run ----------

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export async function exportRunCsv(runId: number): Promise<string> {
  type Row = {
    finding_id: number;
    car_id: number;
    car_chassis: string | null;
    car_display_name: string | null;
    car_slug: string | null;
    subcategory_id: number;
    subcategory_code: string | null;
    subcategory_name: string | null;
    realoem_diagram_id: string | null;
    realoem_diagram_url: string;
    realoem_part_count: number;
    our_part_count: number;
    parts_backfilled: number;
    status: string;
    inserted_part_numbers: string | null;
    created_at: Date | string;
  };

  const rows = await db.execute<Row>(sql`
    SELECT f.id AS finding_id, f.car_id,
           c.chassis AS car_chassis, c.display_name AS car_display_name, c.slug AS car_slug,
           f.subcategory_id, s.subcategory_id AS subcategory_code, s.name AS subcategory_name,
           f.realoem_diagram_id, f.realoem_diagram_url,
           f.realoem_part_count, f.our_part_count, f.parts_backfilled, f.status,
           (SELECT string_agg(p.part_number_clean, '|')
            FROM parts p
            WHERE p.subcategory_id = f.subcategory_id
              AND p.notes = ${`realoem-backfill:${runId}`}) AS inserted_part_numbers,
           f.created_at
    FROM realoem_audit_findings f
    LEFT JOIN cars c ON c.id = f.car_id
    LEFT JOIN subcategories s ON s.id = f.subcategory_id
    WHERE f.audit_run_id = ${runId}
    ORDER BY f.id ASC
  `);
  const header = [
    "run_id", "finding_id", "car_id", "car_chassis", "car_display_name", "car_slug",
    "subcategory_id", "subcategory_code", "subcategory_name",
    "realoem_diagram_id", "realoem_diagram_url",
    "realoem_part_count", "our_part_count", "parts_backfilled", "status",
    "inserted_part_numbers", "created_at",
  ];
  const lines = [header.join(",")];
  for (const r of rows.rows) {
    lines.push([
      runId, r.finding_id, r.car_id, r.car_chassis ?? "", r.car_display_name ?? "", r.car_slug ?? "",
      r.subcategory_id, r.subcategory_code ?? "", r.subcategory_name ?? "",
      r.realoem_diagram_id ?? "", r.realoem_diagram_url,
      r.realoem_part_count, r.our_part_count, r.parts_backfilled, r.status,
      r.inserted_part_numbers ?? "",
      toIso(r.created_at),
    ].map(csvEscape).join(","));
  }
  return lines.join("\n") + "\n";
}

// ---------- Revert (used by CLI rollback) ----------

export interface RevertReport {
  runId: number;
  partsRemoved: number;
  subcategoriesRemoved: number;
  mappingsRemoved: number;
  carsTouched: number[];
}

export async function revertBackfillRun(runId: number): Promise<RevertReport> {
  const provenance = `realoem-backfill:${runId}`;

  // Capture which cars are affected so we can refresh totals at the end.
  const touchedCars = await db.execute<{ car_id: number }>(sql`
    SELECT DISTINCT car_id FROM parts WHERE notes = ${provenance}
    UNION
    SELECT DISTINCT car_id FROM realoem_audit_findings WHERE audit_run_id = ${runId}
  `);
  const carIds = touchedCars.rows.map(r => r.car_id).filter(Boolean) as number[];

  // 1. Delete parts inserted by this run.
  const partsDel = await db.execute<{ n: number }>(sql`
    WITH d AS (DELETE FROM parts WHERE notes = ${provenance} RETURNING 1)
    SELECT COUNT(*)::int AS n FROM d
  `);
  const partsRemoved = Number(partsDel.rows[0]?.n ?? 0);

  // 2. Identify mappings created/auto-claimed by this run. Auto-created
  // subcategories carry notes starting with "auto-created subcategory".
  const mappingRows = await db.execute<{ id: number; subcategory_id: number; notes: string | null }>(sql`
    SELECT id, subcategory_id, notes FROM subcategory_realoem_map
    WHERE source = ${provenance}
  `);
  let subcategoriesRemoved = 0;
  for (const m of mappingRows.rows) {
    if ((m.notes || "").startsWith("auto-created subcategory")) {
      // Delete the subcategory (cascades to its parts and to the mapping).
      const subDel = await db.execute<{ n: number }>(sql`
        WITH d AS (DELETE FROM subcategories WHERE id = ${m.subcategory_id} RETURNING 1)
        SELECT COUNT(*)::int AS n FROM d
      `);
      subcategoriesRemoved += Number(subDel.rows[0]?.n ?? 0);
    }
  }

  // 3. Delete remaining mappings tagged with this run (auto-matched only).
  const mapDel = await db.execute<{ n: number }>(sql`
    WITH d AS (DELETE FROM subcategory_realoem_map WHERE source = ${provenance} RETURNING 1)
    SELECT COUNT(*)::int AS n FROM d
  `);
  const mappingsRemoved = Number(mapDel.rows[0]?.n ?? 0);

  // 4. Delete the findings ledger entries for this run.
  await db.execute(sql`DELETE FROM realoem_audit_findings WHERE audit_run_id = ${runId}`);

  // 5. Mark the original job as reverted (purely informational).
  await db.execute(sql`
    UPDATE background_jobs
    SET status = 'reverted', updated_at = NOW(),
        progress = COALESCE(progress, '{}'::jsonb) || jsonb_build_object(
          'revertedAt', NOW(),
          'partsRemoved', ${partsRemoved}::int,
          'subcategoriesRemoved', ${subcategoriesRemoved}::int
        )
    WHERE id = ${runId} AND job_type = 'realoem_backfill'
  `);

  // 6. Refresh total_parts on every affected car.
  for (const cid of carIds) {
    try {
      await db.execute(sql`
        UPDATE cars
        SET total_parts = (SELECT COUNT(*) FROM parts WHERE car_id = ${cid})
        WHERE id = ${cid}
      `);
    } catch (e) {
      console.warn(`[RealoemBackfill] revert: failed to refresh totals for car #${cid}: ${(e as Error).message}`);
    }
  }

  return { runId, partsRemoved, subcategoriesRemoved, mappingsRemoved, carsTouched: carIds };
}
