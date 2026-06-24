#!/usr/bin/env tsx
/**
 * Match every car in `cars` to its best `realoem_vehicles.partgrp_id`,
 * then write that id (and the encoded `type_code`) back to the cars row.
 * The resulting `cars.realoem_partgrp_id` is what `resolveRealoemTarget`
 * uses to build a working `/bmw/enUS/partgrp?id=…` landing URL — without
 * it, the backfill silently lands on RealOEM's welcome page.
 *
 * Scoring:
 *   1. Jaccard token overlap between car.model_name and the model_slug
 *      tail of the partgrp id (e.g. `BMW-X7_30dX` → ["x7", "30dx"]).
 *      Hard requirement: at least one shared token, otherwise the
 *      candidate is dropped.
 *   2. Year fit (+0.3 if candidate.prodYear is in [year_start, year_end]).
 *      Soft signal — many cars have no year populated, in which case
 *      year fit is skipped entirely.
 *   3. Market preference: USA +0.15, EUR +0.10, anything else 0. We
 *      prefer USA because the rest of the catalog is enUS-localised.
 *   4. Tie-break by most recent prodYear, then by lexicographically
 *      smallest partgrpId (deterministic).
 *
 * Usage:
 *   npx tsx scripts/match-cars-to-partgrp.ts [--dry-run] [--rematch]
 *
 *   --dry-run   Print scoring & top match per car, write nothing.
 *   --rematch   Re-evaluate cars whose realoem_partgrp_id is already set.
 */
import { db } from "../server/storage";
import { cars, realoemVehicles } from "../shared/schema";
import { eq, isNull, sql } from "drizzle-orm";

interface CarRow {
  id: number;
  chassis: string;
  modelName: string;
  yearStart: number | null;
  yearEnd: number | null;
  realoemPartgrpId: string | null;
}

interface VehicleRow {
  partgrpId: string;
  chassis: string;
  modelName: string;
  modelSlug: string;
  typeCode: string | null;
  market: string;
  prodYear: number | null;
}

const stripDiacritics = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Tokenise a model name/slug into lowercased alphanumeric tokens. */
function tokens(s: string): string[] {
  if (!s) return [];
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);
}

/** Extract the model slug from a partgrp id (segment after `BMW-`). */
function partgrpModelSlug(partgrpId: string): string {
  const idx = partgrpId.lastIndexOf("BMW-");
  if (idx < 0) return partgrpId;
  return partgrpId.slice(idx + 4);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

interface ScoredCandidate {
  vehicle: VehicleRow;
  score: number;
  shared: number;
  detail: string;
}

function scoreCandidate(car: CarRow, v: VehicleRow): ScoredCandidate {
  const carTokens = tokens(car.modelName);
  const vTokens = tokens(v.modelSlug);
  const j = jaccard(carTokens, vTokens);
  const sharedSet = new Set(carTokens.filter(t => new Set(vTokens).has(t)));

  let score = j;
  let detail = `j=${j.toFixed(3)}`;

  // Year fit (soft, only when car has a year).
  if (car.yearStart != null && v.prodYear != null) {
    const yEnd = car.yearEnd ?? 2030;
    if (v.prodYear >= car.yearStart && v.prodYear <= yEnd) {
      score += 0.3;
      detail += " +year";
    }
  }

  // Market preference.
  if (v.market === "USA") {
    score += 0.15;
    detail += " +usa";
  } else if (v.market === "EUR") {
    score += 0.1;
    detail += " +eur";
  }

  return { vehicle: v, score, shared: sharedSet.size, detail };
}

function pickBest(car: CarRow, candidates: VehicleRow[]): ScoredCandidate | null {
  if (candidates.length === 0) return null;
  const scored = candidates
    .map(c => scoreCandidate(car, c))
    .filter(s => s.shared >= 1) // hard requirement: at least one shared token
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const yA = a.vehicle.prodYear ?? 0;
      const yB = b.vehicle.prodYear ?? 0;
      if (yB !== yA) return yB - yA;
      return a.vehicle.partgrpId.localeCompare(b.vehicle.partgrpId);
    });
  return scored[0] ?? null;
}

/** Pure-function form of the matcher — used by the CLI and importable
 *  by other modules that need to re-evaluate cars→partgrp matching. */
export interface MatchPartgrpOptions {
  dryRun?: boolean;   // default: false
  rematch?: boolean;  // default: false (only matches cars with NULL partgrp_id)
}

export interface MatchPartgrpResult {
  evaluated: number;
  matched: number;
  unmatched: number;
  updatesWritten: number;
  unmatchedReasons: Record<string, number>;
  finalCoverage: { total: number; withPartgrp: number; withTypeCode: number };
}

export async function matchCarsToPartgrp(opts: MatchPartgrpOptions = {}): Promise<MatchPartgrpResult> {
  const dryRun = !!opts.dryRun;
  const rematch = !!opts.rematch;

  console.log(`[match-partgrp] starting (dryRun=${dryRun}, rematch=${rematch})`);

  // Load all cars (filtered by rematch flag).
  const carRows: CarRow[] = await db
    .select({
      id: cars.id,
      chassis: cars.chassis,
      modelName: cars.modelName,
      yearStart: cars.yearStart,
      yearEnd: cars.yearEnd,
      realoemPartgrpId: cars.realoemPartgrpId,
    })
    .from(cars)
    .where(rematch ? sql`true` : isNull(cars.realoemPartgrpId));

  console.log(`[match-partgrp] cars to evaluate: ${carRows.length}`);

  // Pre-load all vehicles, indexed by chassis (also store ‘base’ chassis
  // → variants without the trailing N suffix to handle G20/G20N pairs).
  const allVehicles = await db
    .select({
      partgrpId: realoemVehicles.partgrpId,
      chassis: realoemVehicles.chassis,
      modelName: realoemVehicles.modelName,
      typeCode: realoemVehicles.typeCode,
      market: realoemVehicles.market,
      prodYear: realoemVehicles.prodYear,
    })
    .from(realoemVehicles);

  const byChassis = new Map<string, VehicleRow[]>();
  for (const v of allVehicles) {
    const row: VehicleRow = {
      partgrpId: v.partgrpId,
      chassis: v.chassis,
      modelName: v.modelName,
      modelSlug: partgrpModelSlug(v.partgrpId),
      typeCode: v.typeCode,
      market: v.market,
      prodYear: v.prodYear,
    };
    const list = byChassis.get(v.chassis) ?? [];
    list.push(row);
    byChassis.set(v.chassis, list);
  }

  // Stats.
  let matched = 0;
  let unmatched = 0;
  const unmatchedReasons: Record<string, number> = {};
  const unmatchedSamples: { id: number; chassis: string; model: string; reason: string }[] = [];

  // Update batch.
  type Update = { id: number; partgrpId: string; typeCode: string | null };
  const updates: Update[] = [];

  for (const car of carRows) {
    // Try chassis directly, then base chassis (G20N → G20) and ‘N’ variant
    // (G20 → G20N) so generation siblings act as fallbacks.
    const candidatePool = new Map<string, VehicleRow>();
    const variants = new Set<string>([car.chassis]);
    if (/N$/.test(car.chassis)) variants.add(car.chassis.replace(/N$/, ""));
    else variants.add(`${car.chassis}N`);
    for (const ch of variants) {
      for (const v of byChassis.get(ch) ?? []) {
        candidatePool.set(v.partgrpId, v);
      }
    }
    const candidates = [...candidatePool.values()];

    if (candidates.length === 0) {
      unmatched++;
      const reason = `no realoem_vehicles row for chassis ${car.chassis}`;
      unmatchedReasons[reason] = (unmatchedReasons[reason] ?? 0) + 1;
      if (unmatchedSamples.length < 10) {
        unmatchedSamples.push({ id: car.id, chassis: car.chassis, model: car.modelName, reason });
      }
      continue;
    }

    const best = pickBest(car, candidates);
    if (!best) {
      unmatched++;
      const reason = `no token overlap (chassis ${car.chassis}, ${candidates.length} candidates)`;
      unmatchedReasons[reason.replace(/chassis \w+/, "chassis ?")] = (unmatchedReasons[reason.replace(/chassis \w+/, "chassis ?")] ?? 0) + 1;
      if (unmatchedSamples.length < 10) {
        unmatchedSamples.push({ id: car.id, chassis: car.chassis, model: car.modelName, reason });
      }
      continue;
    }

    matched++;
    updates.push({ id: car.id, partgrpId: best.vehicle.partgrpId, typeCode: best.vehicle.typeCode });

    if (dryRun && matched <= 25) {
      console.log(
        `  car ${car.id} [${car.chassis}] "${car.modelName}" -> ${best.vehicle.partgrpId} ` +
          `(slug=${best.vehicle.modelSlug}, market=${best.vehicle.market}, year=${best.vehicle.prodYear ?? "?"}, ${best.detail})`,
      );
    }
  }

  console.log(`[match-partgrp] matched=${matched} unmatched=${unmatched}`);
  if (unmatched > 0) {
    console.log("[match-partgrp] unmatched reasons:");
    for (const [r, n] of Object.entries(unmatchedReasons).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${n.toString().padStart(4)}× ${r}`);
    }
    console.log("[match-partgrp] sample unmatched cars:");
    for (const s of unmatchedSamples) {
      console.log(`    car ${s.id} [${s.chassis}] "${s.model}" — ${s.reason}`);
    }
  }

  let updatesWritten = 0;
  if (!dryRun) {
    // Write updates in chunks.
    const CHUNK = 200;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      await db.transaction(async tx => {
        for (const u of chunk) {
          await tx
            .update(cars)
            .set({
              realoemPartgrpId: u.partgrpId,
              ...(u.typeCode ? { typeCode: u.typeCode } : {}),
            })
            .where(eq(cars.id, u.id));
        }
      });
      updatesWritten += chunk.length;
      if ((i + CHUNK) % 1000 === 0 || i + CHUNK >= updates.length) {
        console.log(`[match-partgrp] wrote ${Math.min(i + CHUNK, updates.length)}/${updates.length}`);
      }
    }
  } else {
    console.log("[match-partgrp] dry run — no updates written");
  }

  // Final coverage.
  const cov = await db.execute(sql`SELECT count(*)::int AS total, count(realoem_partgrp_id)::int AS with_partgrp, count(type_code)::int AS with_type FROM cars`);
  const covRow = (cov.rows?.[0] ?? (cov as unknown as Record<string, unknown>[])[0]) as Record<string, number>;
  console.log(`[match-partgrp] final coverage: ${JSON.stringify(covRow)}`);

  return {
    evaluated: carRows.length,
    matched,
    unmatched,
    updatesWritten,
    unmatchedReasons,
    finalCoverage: {
      total: Number(covRow.total ?? 0),
      withPartgrp: Number(covRow.with_partgrp ?? 0),
      withTypeCode: Number(covRow.with_type ?? 0),
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const rematch = args.includes("--rematch");
  await matchCarsToPartgrp({ dryRun, rematch });
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error(`[match-partgrp] fatal: ${(e as Error).stack ?? e}`);
    process.exit(1);
  });
}
