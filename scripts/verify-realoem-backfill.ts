/**
 * Task #87 verification: end-to-end fixture-mode run on car id=666
 * (G07 X7 M50dX, slug g07-x7-m50dx-60487).
 *
 * Asserts the business example: part 31508487444 lands under the
 * 168AL diagram (subcategory 500720 / subcategory_id "31_2091") with
 * provenance source="realoem-backfill:<runId>".
 *
 * Also exercises the new-subcategory creation path (the landing
 * fixture has 3 diagram links; the two unmatched ones must produce
 * fresh subcategories tagged with the same provenance).
 *
 * Usage:
 *   npx tsx scripts/verify-realoem-backfill.ts
 */
import { db } from "../server/storage";
import { and, eq, sql } from "drizzle-orm";
import {
  cars as carsTable,
  parts as partsTable,
  subcategories as subcategoriesTable,
  subcategoryRealoemMap,
  realoemAuditFindings,
} from "../shared/schema";
import { runBackfill, listBackfillRuns, exportRunCsv, revertBackfillRun } from "../server/realoem-backfill";

const CAR_ID = 666;
const SUBCATEGORY_ID = 500720;
const TARGET_PART = "31508487444";
const SYNTHETIC_PARTS = [TARGET_PART, "31108632895", "31607570281"];
// Of the three diagrams in the landing fixture:
//   31_2091 → already mapped to subcategory 500720 (168AL)
//   33_1010 → fuzzy-matches existing subcategory "Rear axle carrier" (jaccard ≥ 0.5)
//   99_9999 → no fuzzy match → auto-created as a brand-new subcategory
const NEW_SUB_DIAG_IDS = ["99_9999"];
const AUTO_MATCHED_DIAG_IDS = ["33_1010"];

function ok(label: string) { console.log(`  ✓ ${label}`); }
function fail(label: string, detail?: any): never { console.error(`  ✗ ${label}`, detail ?? ""); process.exit(1); }

async function clean() {
  // Idempotent reset of any prior verify state for this car/sub.
  for (const pn of SYNTHETIC_PARTS) {
    await db.delete(partsTable).where(and(
      eq(partsTable.subcategoryId, SUBCATEGORY_ID),
      eq(partsTable.partNumberClean, pn),
    ));
  }
  // Drop any prior auto-created subcategories on this car so re-runs
  // don't accumulate phantom mappings.
  const priorMaps = await db.execute<{ id: number; subcategory_id: number; notes: string | null }>(sql`
    SELECT id, subcategory_id, notes FROM subcategory_realoem_map
    WHERE car_id = ${CAR_ID} AND source LIKE 'realoem-backfill:%'
  `);
  for (const m of priorMaps.rows) {
    if ((m.notes || "").startsWith("auto-created subcategory")) {
      await db.delete(subcategoriesTable).where(eq(subcategoriesTable.id, m.subcategory_id));
    }
  }
  await db.execute(sql`
    DELETE FROM subcategory_realoem_map
    WHERE car_id = ${CAR_ID} AND source LIKE 'realoem-backfill:%'
  `);
  await db.execute(sql`
    DELETE FROM categories WHERE car_id = ${CAR_ID} AND category_id = 'realoem-backfill'
  `);
  // Wipe any stale audit findings for this car so freshness isn't blocked.
  await db.delete(realoemAuditFindings).where(eq(realoemAuditFindings.carId, CAR_ID));
}

async function main() {
  console.log("[verify-realoem-backfill] starting...");

  const [car] = await db.select().from(carsTable).where(eq(carsTable.id, CAR_ID)).limit(1);
  if (!car) fail(`car id=${CAR_ID} not found`);
  ok(`car ${car.slug} (chassis ${car.chassis}) found`);

  const [sub] = await db.select().from(subcategoriesTable).where(eq(subcategoriesTable.id, SUBCATEGORY_ID)).limit(1);
  if (!sub) fail(`subcategory id=${SUBCATEGORY_ID} not found`);
  ok(`subcategory "${sub.name}" (${sub.subcategoryId}) found`);

  await clean();
  ok("cleaned prior verify state");

  // Run the backfill on just this car, fixtureOnly so no proxy is hit.
  const summary = await runBackfill({
    scope: "car",
    carId: CAR_ID,
    fixtureOnly: true,
    forceRefetch: true,
  });
  ok(`run #${summary.runId} done · cars=${summary.carsProcessed} inserted=${summary.partsInserted} newSubs=${summary.newSubcategories} errors=${summary.errors}`);

  if (summary.errors !== 0) fail(`expected 0 errors, got ${summary.errors}`, summary.lastError);
  if (summary.partsInserted < SYNTHETIC_PARTS.length) {
    fail(`expected ≥ ${SYNTHETIC_PARTS.length} parts inserted (168AL diagram), got ${summary.partsInserted}`);
  }

  // Business example: 31508487444 must exist on the 168AL subcategory
  // tagged with the run's provenance.
  const provenance = `realoem-backfill:${summary.runId}`;
  const [target] = await db.select().from(partsTable)
    .where(and(eq(partsTable.subcategoryId, SUBCATEGORY_ID), eq(partsTable.partNumberClean, TARGET_PART)))
    .limit(1);
  if (!target) fail(`target part ${TARGET_PART} not inserted on subcategory ${SUBCATEGORY_ID}`);
  if (target.notes !== provenance) fail(`target part notes mismatch`, { got: target.notes, expected: provenance });
  if (target.additionalInfo !== provenance) fail(`target part additional_info mismatch`, { got: target.additionalInfo });
  if (target.carId !== CAR_ID) fail(`target part car_id mismatch`, { got: target.carId });
  ok(`target part ${TARGET_PART} present (id=${target.id}) on subcategory ${SUBCATEGORY_ID} with provenance ${provenance}`);

  // The unmatched landing link must have produced a fresh subcategory.
  for (const diagId of NEW_SUB_DIAG_IDS) {
    const m = await db.select().from(subcategoryRealoemMap).where(and(
      eq(subcategoryRealoemMap.carId, CAR_ID),
      eq(subcategoryRealoemMap.realoemDiagramId, diagId),
    )).limit(1);
    if (m.length === 0) fail(`no mapping for unmatched diagram ${diagId}`);
    if (m[0].source !== provenance) fail(`mapping source mismatch for ${diagId}`, { got: m[0].source });
    if (!(m[0].notes || "").startsWith("auto-created subcategory")) {
      fail(`mapping notes for ${diagId} not auto-created`, { got: m[0].notes });
    }
    ok(`auto-created subcategory mapping for diagId=${diagId} (sub=${m[0].subcategoryId})`);
  }

  // Auto-matched diagrams must have an upserted mapping with auto-matched notes
  // (no new subcategory created).
  for (const diagId of AUTO_MATCHED_DIAG_IDS) {
    const m = await db.select().from(subcategoryRealoemMap).where(and(
      eq(subcategoryRealoemMap.carId, CAR_ID),
      eq(subcategoryRealoemMap.realoemDiagramId, diagId),
    )).limit(1);
    if (m.length === 0) fail(`no mapping for fuzzy-matched diagram ${diagId}`);
    if (m[0].source !== provenance) fail(`mapping source mismatch for ${diagId}`, { got: m[0].source });
    if (!(m[0].notes || "").startsWith("auto-matched")) {
      fail(`mapping notes for ${diagId} not auto-matched`, { got: m[0].notes });
    }
    ok(`auto-matched mapping for diagId=${diagId} (sub=${m[0].subcategoryId}) notes="${m[0].notes}"`);
  }

  if (summary.newSubcategories !== NEW_SUB_DIAG_IDS.length) {
    fail(`expected ${NEW_SUB_DIAG_IDS.length} new subcategories, got ${summary.newSubcategories}`);
  }

  // Recent runs panel must surface the run.
  const runs = await listBackfillRuns(5);
  const r = runs.find(x => x.runId === summary.runId);
  if (!r) fail(`run ${summary.runId} not in listBackfillRuns`);
  if (r.ledgerPartsInserted < SYNTHETIC_PARTS.length) {
    fail(`ledgerPartsInserted < expected`, { got: r.ledgerPartsInserted, expected: SYNTHETIC_PARTS.length });
  }
  ok(`recent runs panel: run #${r.runId} ledgerPartsInserted=${r.ledgerPartsInserted}`);

  // CSV export must include the target part number.
  const csv = await exportRunCsv(summary.runId);
  if (!csv.includes(TARGET_PART)) fail("CSV export missing target part", csv.split("\n").slice(0, 5));
  ok(`CSV export contains ${TARGET_PART}`);

  // Re-run with the same options: freshness skip (forceRefetch=false this time)
  // must skip the diagrams we just touched and insert nothing new.
  const summary2 = await runBackfill({
    scope: "car",
    carId: CAR_ID,
    fixtureOnly: true,
    forceRefetch: false,
  });
  if (summary2.partsInserted !== 0) fail(`re-run should insert 0 parts, got ${summary2.partsInserted}`);
  if (summary2.diagramsSkippedFresh < 1) fail(`re-run should skip ≥ 1 fresh diagram, got ${summary2.diagramsSkippedFresh}`);
  ok(`re-run #${summary2.runId} skipped ${summary2.diagramsSkippedFresh} fresh diagram(s); inserted 0`);

  // Revert the original run to prove the rollback story.
  const revert = await revertBackfillRun(summary.runId);
  if (revert.partsRemoved < SYNTHETIC_PARTS.length) {
    fail(`revert removed ${revert.partsRemoved} parts, expected ≥ ${SYNTHETIC_PARTS.length}`);
  }
  if (revert.subcategoriesRemoved !== NEW_SUB_DIAG_IDS.length) {
    fail(`revert removed ${revert.subcategoriesRemoved} subs, expected ${NEW_SUB_DIAG_IDS.length}`);
  }
  ok(`revert run #${summary.runId}: parts=${revert.partsRemoved} subs=${revert.subcategoriesRemoved} maps=${revert.mappingsRemoved}`);

  // Target part must be gone after revert.
  const [stillThere] = await db.select().from(partsTable)
    .where(and(eq(partsTable.subcategoryId, SUBCATEGORY_ID), eq(partsTable.partNumberClean, TARGET_PART)))
    .limit(1);
  if (stillThere) fail(`target part ${TARGET_PART} still present after revert (id=${stillThere.id})`);
  ok(`revert removed target part ${TARGET_PART}`);

  // Also revert the freshness-skip run so the verify script is fully idempotent.
  await revertBackfillRun(summary2.runId);

  console.log("\n[verify-realoem-backfill] ALL ASSERTIONS PASSED ✅");
  process.exit(0);
}

main().catch((e) => {
  console.error("[verify-realoem-backfill] FAILED:", e);
  process.exit(1);
});
