#!/usr/bin/env tsx
/**
 * One-car smoke test: prove the partgrp URL fix end-to-end.
 *
 * Selects a single car (default: G07 X7 30dX, the chassis we have
 * cached HTML for), runs `runBackfill({ scope: "car" })`, and prints
 * the summary. Sub-landing fetches are capped tightly so the test
 * spends a small, predictable amount of Oxylabs budget regardless of
 * how the catalog hierarchy expands. The expectation:
 *
 *   - landing URL is `/bmw/enUS/partgrp?id=<KEY>` (not the welcome page)
 *   - sub-landings are discovered (≥ 1)
 *   - at least one diagram is fetched
 *   - at least one part is inserted
 *
 * Usage:
 *   npx tsx scripts/smoke-test-partgrp-backfill.ts [--car-id=N] [--sub-max=M]
 */
import { db } from "../server/storage";
import { cars } from "../shared/schema";
import { eq } from "drizzle-orm";
import { runBackfill } from "../server/realoem-backfill";

function parseFlag(name: string): string | undefined {
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}

async function main(): Promise<void> {
  const carIdRaw = parseFlag("car-id");
  const subMaxRaw = parseFlag("sub-max");
  if (subMaxRaw) process.env.REALOEM_BACKFILL_SUB_MAX = subMaxRaw;

  // Default: G07 X7 30dX — picked because we already have the partgrp
  // top page cached, so the smoke test mostly exercises the new code
  // paths without re-spending budget on the landing fetch itself.
  let carId: number;
  if (carIdRaw) {
    carId = parseInt(carIdRaw, 10);
  } else {
    const row = await db
      .select({ id: cars.id })
      .from(cars)
      .where(eq(cars.chassis, "G07"))
      .limit(1);
    if (!row[0]) throw new Error("No G07 cars found — pass --car-id=N explicitly");
    carId = row[0].id;
  }

  const car = await db.select().from(cars).where(eq(cars.id, carId));
  if (!car[0]) throw new Error(`Car ${carId} not found`);
  console.log(
    `[smoke] car ${car[0].id}: chassis=${car[0].chassis} model="${car[0].modelName}" ` +
      `partgrp=${car[0].realoemPartgrpId} type_code=${car[0].typeCode}`,
  );
  console.log(`[smoke] SUB_MAX=${process.env.REALOEM_BACKFILL_SUB_MAX || "(default 80)"}`);

  const summary = await runBackfill({ scope: "car", carId });

  console.log("\n[smoke] backfill summary:");
  console.log(JSON.stringify(summary, null, 2));

  if (summary.partsInserted > 0) {
    console.log("\n[smoke] PASS — parts were inserted.");
    process.exit(0);
  } else {
    console.log("\n[smoke] FAIL — no parts inserted (check landingEmpty/welcomePage flags above).");
    process.exit(1);
  }
}

main().catch(e => {
  console.error(`[smoke] fatal: ${(e as Error).stack ?? e}`);
  process.exit(1);
});
