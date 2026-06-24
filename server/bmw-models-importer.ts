import { sql } from "drizzle-orm";
import { db } from "./storage";
import { bmwModels as bmwModelsTable } from "@shared/schema";

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Idempotent bulk inserter for the bmw_models reference table. Accepts
 * camelCase or snake_case keys (PG dump compatible). Existing
 * (chassis, type_code) rows are skipped both via a pre-fetch dedupe AND
 * the bmw_models_chassis_type_code_key UNIQUE constraint
 * (onConflictDoNothing). Safe to call repeatedly and from multiple
 * call-sites (startup seed, /api/sync-from-dev, scrape pipeline).
 */
export async function importBmwModels(models: any[]): Promise<{ inserted: number; existed: number }> {
  if (!Array.isArray(models) || models.length === 0) {
    return { inserted: 0, existed: 0 };
  }

  const existing = await db.execute(sql.raw(`SELECT chassis, type_code FROM bmw_models`));
  const existingKeys = new Set(((existing as any).rows || existing).map((r: any) => `${r.chassis}:${r.type_code}`));

  const newModels = models.filter((m: any) => {
    const chassis = m.chassis;
    const typeCode = m.type_code || m.typeCode;
    return !existingKeys.has(`${chassis}:${typeCode}`);
  });

  if (newModels.length === 0) {
    console.log(`  BMW models: all ${models.length} already exist, skipping`);
    return { inserted: 0, existed: models.length };
  }

  const BATCH = 500;
  for (let i = 0; i < newModels.length; i += BATCH) {
    const batch = newModels.slice(i, i + BATCH).map((m: any) => ({
      chassis: m.chassis,
      typeCode: m.type_code || m.typeCode,
      modelName: m.model_name || m.modelName,
      developmentCode: m.development_code || m.developmentCode,
      market: m.market,
      bodyType: m.body_type || m.bodyType,
      engineDisplacement: m.engine_displacement || m.engineDisplacement,
      enginePowerKw: toNumOrNull(m.engine_power_kw ?? m.enginePowerKw),
      engineCode: m.engine_code || m.engineCode,
      imageUrl: m.image_url || m.imageUrl,
      sourceUrl: m.source_url || m.sourceUrl,
    }));
    try {
      await db
        .insert(bmwModelsTable)
        .values(batch)
        .onConflictDoNothing({
          target: [bmwModelsTable.chassis, bmwModelsTable.typeCode],
        });
    } catch (e: any) {
      console.error(`  BMW models batch starting at ${i} failed: ${e.message}`);
      throw e;
    }
  }
  console.log(`  BMW models: imported ${newModels.length} new (${models.length - newModels.length} already existed)`);
  return { inserted: newModels.length, existed: models.length - newModels.length };
}
