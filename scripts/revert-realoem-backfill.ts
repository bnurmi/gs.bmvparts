/**
 * CLI rollback for a RealOEM backfill run (Task #87).
 *
 * Removes every part inserted by the run, deletes any subcategories the
 * run auto-created, drops the auto-mappings, clears the per-(run,diagram)
 * findings ledger and refreshes affected cars' total_parts. Marks the
 * background_jobs row as "reverted".
 *
 * Usage:
 *   npx tsx scripts/revert-realoem-backfill.ts <runId>
 *   npx tsx scripts/revert-realoem-backfill.ts <runId> --dry
 *
 * The runId is the background_jobs.id (== same id surfaced as
 * "run #N" in the admin UI and in the realoem-backfill:<runId>
 * provenance tag on inserted rows).
 */
import { db } from "../server/storage";
import { sql } from "drizzle-orm";
import { revertBackfillRun } from "../server/realoem-backfill";

async function main() {
  const args = process.argv.slice(2);
  const runIdArg = args.find(a => /^\d+$/.test(a));
  const dryRun = args.includes("--dry") || args.includes("--dry-run");
  if (!runIdArg) {
    console.error("Usage: tsx scripts/revert-realoem-backfill.ts <runId> [--dry]");
    process.exit(2);
  }
  const runId = parseInt(runIdArg, 10);

  const provenance = `realoem-backfill:${runId}`;
  const partCount = await db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM parts WHERE notes = ${provenance}`);
  const mapCount = await db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM subcategory_realoem_map WHERE source = ${provenance}`);
  const autoCount = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM subcategory_realoem_map
    WHERE source = ${provenance} AND notes LIKE 'auto-created subcategory%'
  `);
  const findingCount = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM realoem_audit_findings WHERE audit_run_id = ${runId}
  `);

  console.log(`[revert] run #${runId}: ${partCount.rows[0].n} parts, ` +
              `${mapCount.rows[0].n} mappings (${autoCount.rows[0].n} auto-created subcategories), ` +
              `${findingCount.rows[0].n} ledger rows`);

  if (dryRun) {
    console.log("[revert] --dry: not deleting anything. Re-run without --dry to apply.");
    process.exit(0);
  }

  const result = await revertBackfillRun(runId);
  console.log(`[revert] DONE — parts removed: ${result.partsRemoved}, ` +
              `subcategories removed: ${result.subcategoriesRemoved}, ` +
              `mappings removed: ${result.mappingsRemoved}, ` +
              `cars touched: ${result.carsTouched.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[revert-realoem-backfill] FAILED:", e);
  process.exit(1);
});
