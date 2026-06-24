#!/usr/bin/env tsx
import { db } from "../server/storage";
import { vinCache, vinFactoryOptions } from "@shared/schema";
import { sql } from "drizzle-orm";

async function main() {
  console.log("[promote] scanning vin_cache for promotable rows...");
  const candidates = await db.execute(sql`
    SELECT
      vin,
      enriched_data->'options' AS options,
      enriched_data->'vehicle'->>'colorCode' AS paint_code,
      enriched_data->'vehicle'->>'upholsteryCode' AS upholstery_code,
      enriched_data->'vehicle'->>'startOfProduction' AS production_date
    FROM vin_cache
    WHERE jsonb_array_length(COALESCE(enriched_data->'options', '[]'::jsonb)) > 0
  `);
  console.log(`[promote] found ${candidates.rows.length} cached VINs with non-empty options`);

  let inserted = 0;
  let skipped = 0;
  for (const row of candidates.rows as any[]) {
    const opts = (row.options as any[]) || [];
    const saCodes = opts
      .map((o) => (typeof o?.code === "string" ? o.code.toUpperCase() : null))
      .filter((c): c is string => !!c && /^S[A-Z0-9]{3,5}$/.test(c));
    if (saCodes.length === 0) {
      skipped++;
      continue;
    }
    const productionDate = (row.production_date as string | null) || null;
    const productionMonth = productionDate
      ? productionDate.slice(0, 7).replace(/-(\d)$/, "-0$1")
      : null;
    await db
      .insert(vinFactoryOptions)
      .values({
        vin: row.vin as string,
        saCodes,
        paintCode: (row.paint_code as string | null) || null,
        upholsteryCode: (row.upholstery_code as string | null) || null,
        productionDate: productionMonth,
        source: "promoted_from_cache",
      })
      .onConflictDoUpdate({
        target: vinFactoryOptions.vin,
        set: {
          saCodes,
          paintCode: (row.paint_code as string | null) || null,
          upholsteryCode: (row.upholstery_code as string | null) || null,
          productionDate: productionMonth,
          source: sql`CASE WHEN ${vinFactoryOptions.source} IN ('etk_fa_import','e2e_fixture') THEN ${vinFactoryOptions.source} ELSE 'promoted_from_cache' END`,
          updatedAt: new Date(),
        },
      });
    inserted++;
  }

  const total = await db.execute(sql`SELECT COUNT(*)::int AS n FROM vin_factory_options`);
  console.log(`[promote] inserted/updated ${inserted}, skipped ${skipped}`);
  console.log(`[promote] vin_factory_options total now: ${(total.rows[0] as any).n}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[promote] FAILED:", err);
  process.exit(1);
});
