#!/usr/bin/env tsx
// Standalone CLI for bulk-importing a per-VIN factory option (FA/SA)
// dump into the local `vin_factory_options` table. Reads PSV files
// shaped like `data/etk/exports/vin_fa.psv` (see `server/etk-vin-fa.ts`
// for the format spec).
//
// Usage:
//   npx tsx scripts/import-vin-fa-dump.ts                       # default path
//   npx tsx scripts/import-vin-fa-dump.ts path/to/dump.psv      # custom file
//
// Honours the same source-priority ladder as the startup loader:
// existing rows whose source is `etk_fa_import` (admin HTTP override)
// are preserved untouched.
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { importVinFaRows, parseVinFaPsv, VIN_FA_PSV_PATH } from "../server/etk-vin-fa";
import { db } from "../server/storage";
import { sql } from "drizzle-orm";

async function main() {
  const arg = process.argv[2];
  const filePath = arg ? path.resolve(process.cwd(), arg) : VIN_FA_PSV_PATH;
  console.log(`[import-vin-fa] reading ${filePath}`);

  if (!existsSync(filePath)) {
    console.error(`[import-vin-fa] file not found: ${filePath}`);
    process.exit(1);
  }

  const raw = await readFile(filePath, "utf-8");
  const rows = parseVinFaPsv(raw);
  console.log(`[import-vin-fa] parsed ${rows.length} rows`);

  if (rows.length === 0) {
    console.log(`[import-vin-fa] nothing to import`);
    process.exit(0);
  }

  const stats = await importVinFaRows(rows);
  const total = await db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM vin_factory_options`);
  const totalRows = total.rows[0]?.n ?? 0;
  console.log(
    `[import-vin-fa] upserted=${stats.upserted}, skipped=${stats.skipped} ` +
    `(skipped includes rows whose existing source is etk_fa_import — admin overrides preserved)`,
  );
  console.log(`[import-vin-fa] vin_factory_options total now: ${totalRows}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[import-vin-fa] FAILED:", err);
  process.exit(1);
});
