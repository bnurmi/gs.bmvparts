// Task #101 — RealOEM cross-variant diagram canonical store.
//
// Persistence + helper layer for the dedup mechanism described in
// `server/realoem-diagram-classifier.ts`. Owns three responsibilities:
//
//   1. Lookup/upsert primitives keyed on `(chassis, diag_id)`.
//   2. Stable parts-payload normalization + content hashing so two
//      writers can compare canonical rows by hash without re-parsing.
//   3. A dry-run / preview report the admin endpoint surfaces before
//      a backfill, breaking the (chassis, diagId) population we've
//      already seen into "would-be-cloned" vs "would-still-be-fetched"
//      buckets and projecting the proxy-budget savings.
//
// The store deliberately does NOT touch `parts` or
// `realoem_audit_findings` — that's the backfill's job. A clone in
// the dedup path means: read the parts payload from this table, and
// hand it to the same code path that would have processed a fresh
// extraction, so part rows end up byte-identical.

import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./storage";
import {
  realoemDiagramCanonical,
  realoemAuditFindings,
  cars as carsTable,
  type RealoemDiagramCanonical,
} from "@shared/schema";
import {
  extractRealoemParts,
  extractDiagramMeta,
  type ExtractedRealoemPart,
} from "./realoem-audit";
import { classifyDiagId, type DiagramClass } from "./realoem-diagram-classifier";

const HTML_CACHE_DIR = path.join(process.cwd(), "scripts", "fixtures", "realoem-audit", "_runtime");

// ---------- Normalization / hashing ----------

/**
 * Stable normalization of an `ExtractedRealoemPart[]` for hashing and
 * cross-variant equality checks. Sorts by `partNumberClean`, drops
 * `undefined`s in favor of `null`, and coerces missing fields to a
 * fixed shape so two equivalent parts payloads from two parses always
 * produce the same JSON serialization.
 */
export function normalizeParts(parts: ExtractedRealoemPart[]): ExtractedRealoemPart[] {
  return [...parts]
    .map((p) => ({
      partNumberClean: (p.partNumberClean || "").toString(),
      partNumber: (p.partNumber || p.partNumberClean || "").toString(),
      description: p.description ?? null,
      diagramRefNumber: p.diagramRefNumber ?? null,
      quantity: p.quantity ?? null,
    }))
    .sort((a, b) => {
      const cmp = a.partNumberClean.localeCompare(b.partNumberClean);
      if (cmp !== 0) return cmp;
      // Tie-break on diagramRefNumber so genuinely-different rows that
      // happen to share a part number (rare; same number listed twice
      // at different ref positions) still hash deterministically.
      return (a.diagramRefNumber || "").localeCompare(b.diagramRefNumber || "");
    });
}

/** sha256 of the canonical JSON of a normalized parts payload. */
export function hashParts(parts: ExtractedRealoemPart[]): string {
  return createHash("sha256")
    .update(JSON.stringify(normalizeParts(parts)))
    .digest("hex");
}

// ---------- Lookup / upsert ----------

export interface CanonicalLookupResult {
  row: RealoemDiagramCanonical;
  parts: ExtractedRealoemPart[];
}

/**
 * Look up the canonical row for `(chassis, diagId)`. Returns `null`
 * when no row exists or either key is missing — callers must treat
 * that as "go fetch fresh". Chassis is uppercased to match the
 * convention used everywhere else in the catalog.
 */
export async function lookupCanonical(
  chassis: string | null | undefined,
  diagId: string | null | undefined,
): Promise<CanonicalLookupResult | null> {
  if (!chassis || !diagId) return null;
  const ch = String(chassis).toUpperCase().trim();
  const id = String(diagId).trim();
  if (!ch || !id) return null;
  const [row] = await db
    .select()
    .from(realoemDiagramCanonical)
    .where(and(eq(realoemDiagramCanonical.chassis, ch), eq(realoemDiagramCanonical.diagId, id)))
    .limit(1);
  if (!row) return null;
  // The jsonb column comes back already parsed.
  const parts = Array.isArray(row.partsPayload) ? (row.partsPayload as ExtractedRealoemPart[]) : [];
  return { row, parts };
}

/**
 * Task #101 — Canonical-row freshness gate.
 *
 * Mirrors the `freshHours` semantics of the per-car `isFresh()` helper
 * in `realoem-backfill.ts`: a row counts as "fresh" when it was
 * upserted within the configured window. The dedup clone path uses
 * this so a long-lived canonical row can never silently keep serving
 * stale parts to new sibling cars after RealOEM updates the diagram.
 *
 * `freshHours <= 0` disables the gate (matches the per-car helper),
 * which is useful for one-off forced re-pulls.
 */
export function isCanonicalFresh(
  row: Pick<RealoemDiagramCanonical, "updatedAt" | "fetchedAt">,
  freshHours: number,
): boolean {
  if (freshHours <= 0) return false;
  // Prefer updatedAt (last refresh) but fall back to fetchedAt if the
  // schema ever drifts and updatedAt is missing.
  const stamp = row.updatedAt ?? row.fetchedAt;
  if (!stamp) return false;
  const ageMs = Date.now() - new Date(stamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return false;
  return ageMs < freshHours * 3600 * 1000;
}

export interface UpsertCanonicalInput {
  chassis: string;
  diagId: string;
  realoemDiagramUrl: string;
  realoemDiagramTitle?: string | null;
  parts: ExtractedRealoemPart[];
  diagramClass?: DiagramClass; // defaults to classifyDiagId(diagId)
  sourceCarId?: number | null;
}

/**
 * Insert or update the canonical row for `(chassis, diagId)`. Always
 * stores the *normalized* parts payload + its sha256, so a downstream
 * cloner can compare hashes without re-normalizing. `diagramClass` is
 * recomputed from the classifier on every upsert (cheap; lets operator
 * overrides take effect on the next run without a manual backfill).
 */
export async function upsertCanonical(input: UpsertCanonicalInput): Promise<RealoemDiagramCanonical> {
  const ch = input.chassis.toUpperCase().trim();
  const id = input.diagId.trim();
  if (!ch || !id) throw new Error("upsertCanonical: chassis and diagId are required");

  const normalized = normalizeParts(input.parts);
  const contentHash = hashParts(normalized);
  const diagramClass = input.diagramClass ?? classifyDiagId(id);

  // Use ON CONFLICT for an atomic upsert keyed on the unique
  // (chassis, diag_id) index. JSON serialization is bounded to the
  // diagram's parts list (~10–80 entries), so the per-row payload
  // stays small.
  const result = await db.execute<RealoemDiagramCanonical>(sql`
    INSERT INTO realoem_diagram_canonical (
      chassis, diag_id, realoem_diagram_url, realoem_diagram_title,
      parts_payload, part_count, content_hash, diagram_class,
      source_car_id, fetched_at, updated_at
    ) VALUES (
      ${ch}, ${id}, ${input.realoemDiagramUrl}, ${input.realoemDiagramTitle ?? null},
      ${JSON.stringify(normalized)}::jsonb, ${normalized.length}, ${contentHash}, ${diagramClass},
      ${input.sourceCarId ?? null}, NOW(), NOW()
    )
    ON CONFLICT (chassis, diag_id) DO UPDATE SET
      realoem_diagram_url = EXCLUDED.realoem_diagram_url,
      realoem_diagram_title = COALESCE(EXCLUDED.realoem_diagram_title, realoem_diagram_canonical.realoem_diagram_title),
      parts_payload = EXCLUDED.parts_payload,
      part_count = EXCLUDED.part_count,
      content_hash = EXCLUDED.content_hash,
      diagram_class = EXCLUDED.diagram_class,
      source_car_id = COALESCE(EXCLUDED.source_car_id, realoem_diagram_canonical.source_car_id),
      updated_at = NOW()
    RETURNING *
  `);
  return result.rows[0] as RealoemDiagramCanonical;
}

// ---------- Cache seeding ----------

interface ParsedCacheFile {
  chassis: string | null;
  diagId: string | null;
  url: string;
  html: string;
}

/**
 * Reverse the URL → cache-filename transform used by realoem-audit.ts
 * (`runtimeCachePathForUrl`) just enough to extract `(chassis, diagId)`
 * from a cached `showparts?…` HTML file.
 *
 * Recognized URL families:
 *   - partgrp-style: `…/showparts?id=CW82-EUR-11-2019-G07-BMW-X7_30dX&diagId=…`
 *     → chassis is segment 4 of the id token (uppercased)
 *   - legacy slug+mospid: `…/showparts?id=e90-320d&mospid=49541&diagId=…`
 *     → chassis is the leading segment of the slug (uppercased)
 *
 * Filenames that don't carry a `diagId_` token (the landing pages) are
 * filtered out by the caller.
 */
function parseCacheFilename(filename: string): { chassis: string | null; diagId: string | null } {
  // Filename shape:  www.realoem.com_bmw_enUS_showparts_id_<ID>_diagId_<DD>.html
  // (with optional `_mospid_<N>` between the id and diagId).
  if (!filename.endsWith(".html")) return { chassis: null, diagId: null };
  const stem = filename.slice(0, -".html".length);
  if (!stem.includes("_showparts_")) return { chassis: null, diagId: null };

  const diagMatch = stem.match(/_diagId_([0-9_]+)$/);
  if (!diagMatch) return { chassis: null, diagId: null };
  const diagId = diagMatch[1];

  const idMatch = stem.match(/_showparts_id_(.+?)(?:_mospid_[^_]+)?_diagId_/);
  if (!idMatch) return { chassis: null, diagId: diagId };
  const idToken = idMatch[1];

  // Partgrp-style: 7 dash-separated segments where segment 4 is the
  // chassis (e.g. `CW82-EUR-11-2019-G07-BMW-X7_30dX`).
  const segs = idToken.split("-");
  if (segs.length >= 5 && /^[A-Z][0-9]{2,3}$/i.test(segs[4])) {
    return { chassis: segs[4].toUpperCase(), diagId };
  }
  // Legacy slug-style: leading segment is the chassis (e90, f10, …).
  if (segs.length >= 1 && /^[a-z][0-9]{2,3}$/i.test(segs[0])) {
    return { chassis: segs[0].toUpperCase(), diagId };
  }
  return { chassis: null, diagId };
}

/**
 * Reconstruct the original showparts URL from a cache filename so we
 * can store it as the canonical row's `realoem_diagram_url`. Mirror of
 * `runtimeCachePathForUrl` in realoem-audit.ts. We can't perfectly
 * recover the URL (the slug-safe transform is one-way) but we can build
 * a recognizable, query-style URL using the parsed id and diagId.
 */
function reconstructCanonicalUrl(filename: string): string {
  const stem = filename.replace(/\.html$/, "");
  const idMatch = stem.match(/_showparts_id_(.+?)(?:_mospid_([^_]+))?_diagId_([0-9_]+)$/);
  if (!idMatch) return `https://www.realoem.com/`;
  const id = idMatch[1];
  const mospid = idMatch[2] || null;
  const diagId = idMatch[3];
  const params = new URLSearchParams({ id });
  if (mospid) params.set("mospid", mospid);
  params.set("diagId", diagId);
  return `https://www.realoem.com/bmw/enUS/showparts?${params.toString()}`;
}

export interface SeedFromCacheReport {
  filesScanned: number;
  filesParsed: number;
  rowsUpserted: number;
  rowsSkipped: number;
  errors: number;
  byChassis: Array<{ chassis: string; rows: number }>;
}

/**
 * Walk the local HTML cache (`scripts/fixtures/realoem-audit/_runtime`),
 * parse every `showparts` file we can recognize a `(chassis, diagId)`
 * from, and upsert the resulting canonical rows. Idempotent — re-runs
 * just bump `updated_at` on existing rows.
 *
 * This is the cheap "free seeding" step the task calls out: any
 * diagram already on disk gets into the canonical store at zero proxy
 * cost, so the very first dedup-aware backfill run already hits the
 * cache for those diagrams instead of fetching them again.
 */
export async function seedCanonicalFromCache(opts: { fixtureDir?: string } = {}): Promise<SeedFromCacheReport> {
  const dir = opts.fixtureDir || HTML_CACHE_DIR;
  const report: SeedFromCacheReport = {
    filesScanned: 0,
    filesParsed: 0,
    rowsUpserted: 0,
    rowsSkipped: 0,
    errors: 0,
    byChassis: [],
  };
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch (e: unknown) {
    // ENOENT just means there's no on-disk cache yet — treat as an
    // empty seed source rather than a hard error so the dry-run
    // endpoint still works on a fresh checkout.
    if (typeof e === "object" && e !== null && (e as { code?: unknown }).code === "ENOENT") return report;
    throw e;
  }

  const perChassis = new Map<string, number>();

  for (const filename of entries) {
    if (!filename.endsWith(".html")) continue;
    if (!filename.includes("_showparts_")) continue;
    if (!filename.includes("_diagId_")) continue;
    report.filesScanned++;

    const { chassis, diagId } = parseCacheFilename(filename);
    if (!chassis || !diagId) {
      report.rowsSkipped++;
      continue;
    }
    let html: string;
    try {
      html = await fs.readFile(path.join(dir, filename), "utf-8");
    } catch (e) {
      report.errors++;
      continue;
    }
    const parts = extractRealoemParts(html);
    if (parts.length === 0) {
      // Don't seed empty/parser-drift rows — they'd poison the cache.
      report.rowsSkipped++;
      continue;
    }
    report.filesParsed++;
    const meta = extractDiagramMeta(html, "");
    const url = reconstructCanonicalUrl(filename);
    try {
      await upsertCanonical({
        chassis,
        diagId,
        realoemDiagramUrl: url,
        realoemDiagramTitle: meta.title || null,
        parts,
      });
      report.rowsUpserted++;
      perChassis.set(chassis, (perChassis.get(chassis) || 0) + 1);
    } catch (e) {
      report.errors++;
    }
  }

  report.byChassis = [...perChassis.entries()]
    .map(([chassis, rows]) => ({ chassis, rows }))
    .sort((a, b) => b.rows - a.rows);
  return report;
}

// ---------- Dry-run / preview ----------

export interface DedupPreview {
  chassis: string;
  // How many (carId, diagId) pairs we've recorded for this chassis in
  // the audit-findings ledger. Each pair represents a fetch the
  // backfill made for that chassis the last time it ran — so this is
  // the "without dedup" baseline.
  fetchesObservedTotal: number;
  // Distinct diagIds on this chassis (fetches the dedup path would
  // collapse to one — assuming "shared" classification).
  uniqueDiagIds: number;
  // Breakdown of those distinct diagIds by classification.
  sharedDiagIds: number;
  perCarDiagIds: number;
  unknownDiagIds: number;
  // Number of canonical rows already stored for this chassis (i.e.
  // diagrams that would clone instantly with zero proxy cost).
  canonicalRowsAvailable: number;
  // Subset of `canonicalRowsAvailable` that pass the freshness gate at
  // preview time — these are the rows that will actually clone in a
  // backfill running with the same `freshHours` value. Stale rows
  // would force a refetch+upsert, so they are *not* counted toward
  // free savings in the projection below.
  canonicalRowsFresh: number;
  canonicalRowsStale: number;
  // The freshness window the preview was computed with (hours). 0 or
  // negative means the gate was disabled.
  freshHoursUsed: number;
  // Projection: with dedup enabled, every "shared" diagId costs 1
  // fetch (the first car), every "per-car" / "unknown" diagId costs
  // (number of cars that had it) fetches. A "shared" diagId backed by
  // a stale canonical row still costs 1 fetch (the freshness refresh)
  // — same as having no canonical row at all — so the savings are
  // realistic, not aspirational.
  projectedFetchesWithDedup: number;
  projectedFetchesSaved: number;
  projectedSavingsPercent: number;
  // Per-(diagId) row for the operator's eyeball check.
  perDiagram: Array<{
    diagId: string;
    class: DiagramClass;
    carsThatHadIt: number;
    canonicalAvailable: boolean;
    canonicalFresh: boolean;
  }>;
}

/**
 * Build a dedup-preview report for a chassis from the audit-findings
 * ledger + canonical store. Pure read, no proxy cost. Used by the
 * admin dry-run endpoint and by CHANGELOG measurement scripts.
 */
export async function buildDedupPreview(
  chassis: string,
  opts: { freshHours?: number } = {},
): Promise<DedupPreview> {
  const ch = chassis.toUpperCase().trim();
  if (!ch) throw new Error("chassis is required");
  // Default to 720h (30 days) — long enough for a multi-week backfill
  // run to reuse rows from a previous run, short enough that real
  // RealOEM drift gets caught on the next pass. Mirrors the value
  // operators typically pass to `runBackfill`.
  const freshHours = Number.isFinite(opts.freshHours) ? Number(opts.freshHours) : 720;

  // Pull every (car, diagId) pair the catalog audit/backfill has
  // observed for this chassis. We use realoem_diagram_id (the column
  // populated by both processors) as the dedup key. Rows with a NULL
  // diag_id are excluded — they can't be deduped semantically.
  type Row = { car_id: number; diag_id: string };
  const observed = await db.execute<Row>(sql`
    SELECT DISTINCT f.car_id, f.realoem_diagram_id AS diag_id
    FROM realoem_audit_findings f
    JOIN cars c ON c.id = f.car_id
    WHERE c.chassis = ${ch}
      AND f.realoem_diagram_id IS NOT NULL
      AND f.realoem_diagram_id <> ''
  `);

  const carsByDiagId = new Map<string, Set<number>>();
  for (const r of observed.rows) {
    const set = carsByDiagId.get(r.diag_id) || new Set<number>();
    set.add(r.car_id);
    carsByDiagId.set(r.diag_id, set);
  }

  const canonicalRows = await db
    .select({
      diagId: realoemDiagramCanonical.diagId,
      updatedAt: realoemDiagramCanonical.updatedAt,
      fetchedAt: realoemDiagramCanonical.fetchedAt,
    })
    .from(realoemDiagramCanonical)
    .where(eq(realoemDiagramCanonical.chassis, ch));
  const canonicalFreshness = new Map<string, boolean>();
  let canonicalRowsFresh = 0;
  let canonicalRowsStale = 0;
  for (const r of canonicalRows) {
    const fresh = isCanonicalFresh(r, freshHours);
    canonicalFreshness.set(r.diagId, fresh);
    if (fresh) canonicalRowsFresh++;
    else canonicalRowsStale++;
  }
  const canonicalSet = new Set(canonicalRows.map((r) => r.diagId));

  let fetchesObservedTotal = 0;
  let projectedFetchesWithDedup = 0;
  let sharedCount = 0;
  let perCarCount = 0;
  let unknownCount = 0;

  const perDiagram: DedupPreview["perDiagram"] = [];
  // Sort for deterministic output.
  const sortedDiagIds = [...carsByDiagId.keys()].sort();
  for (const diagId of sortedDiagIds) {
    const cars = carsByDiagId.get(diagId)!;
    const cls = classifyDiagId(diagId);
    fetchesObservedTotal += cars.size;
    if (cls === "shared") {
      sharedCount++;
      projectedFetchesWithDedup += 1; // single chassis-wide fetch
    } else {
      // "per-car" or "unknown" — neither clones, so the projection
      // matches what we already pay (one fetch per variant that has
      // the diagram).
      if (cls === "per-car") perCarCount++;
      else unknownCount++;
      projectedFetchesWithDedup += cars.size;
    }
    perDiagram.push({
      diagId,
      class: cls,
      carsThatHadIt: cars.size,
      canonicalAvailable: canonicalSet.has(diagId),
      canonicalFresh: canonicalFreshness.get(diagId) ?? false,
    });
  }

  // Add chassis-only canonical rows that we don't have ledger
  // observations for yet. They don't change the savings projection
  // (we have no baseline fetches to compare against) but the operator
  // wants to see them in the per-diagram table.
  for (const diagId of canonicalSet) {
    if (carsByDiagId.has(diagId)) continue;
    const cls = classifyDiagId(diagId);
    if (cls === "shared") sharedCount++;
    else if (cls === "per-car") perCarCount++;
    else unknownCount++;
    perDiagram.push({
      diagId,
      class: cls,
      carsThatHadIt: 0,
      canonicalAvailable: true,
      canonicalFresh: canonicalFreshness.get(diagId) ?? false,
    });
  }
  perDiagram.sort((a, b) => a.diagId.localeCompare(b.diagId));

  const projectedFetchesSaved = Math.max(0, fetchesObservedTotal - projectedFetchesWithDedup);
  const projectedSavingsPercent = fetchesObservedTotal > 0
    ? Math.round((projectedFetchesSaved / fetchesObservedTotal) * 1000) / 10
    : 0;

  return {
    chassis: ch,
    fetchesObservedTotal,
    uniqueDiagIds: carsByDiagId.size,
    sharedDiagIds: sharedCount,
    perCarDiagIds: perCarCount,
    unknownDiagIds: unknownCount,
    canonicalRowsAvailable: canonicalSet.size,
    canonicalRowsFresh,
    canonicalRowsStale,
    freshHoursUsed: freshHours,
    projectedFetchesWithDedup,
    projectedFetchesSaved,
    projectedSavingsPercent,
    perDiagram,
  };
}

/**
 * Convenience re-aggregation for the dry-run endpoint: the universe
 * of chassis that have at least one audit-findings row. Lets the UI
 * present a chassis picker without enumerating every car.
 */
export async function listChassisWithObservations(): Promise<Array<{ chassis: string; observations: number }>> {
  const rows = await db.execute<{ chassis: string; n: number }>(sql`
    SELECT c.chassis AS chassis, COUNT(*)::int AS n
    FROM realoem_audit_findings f
    JOIN cars c ON c.id = f.car_id
    WHERE c.chassis IS NOT NULL AND c.chassis <> ''
    GROUP BY c.chassis
    ORDER BY c.chassis
  `);
  return rows.rows.map((r) => ({ chassis: r.chassis, observations: Number(r.n) }));
}
