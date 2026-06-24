// Importer for the SA / paint / upholstery dictionaries used by the
// first-party VIN enrichment pipeline (Task #59). Reads JSON files from
// `data/dictionaries/` and upserts every row into the corresponding
// table. Safe to re-run (full overwrite per code).
import { readFile } from "fs/promises";
import path from "path";
import { db } from "./storage";
import { saCodes, paintCodes, upholsteryCodes } from "@shared/schema";
import { sql } from "drizzle-orm";

const DICT_DIR = path.join(process.cwd(), "data", "dictionaries");

interface DictionaryImportResult {
  saCodes: number;
  paintCodes: number;
  upholsteryCodes: number;
}

async function readJson<T>(filename: string): Promise<T[]> {
  try {
    const buf = await readFile(path.join(DICT_DIR, filename), "utf-8");
    return JSON.parse(buf) as T[];
  } catch (err: any) {
    console.warn(`[Dictionaries] ${filename} not readable: ${err.message}`);
    return [];
  }
}

export async function importDictionaries(): Promise<DictionaryImportResult> {
  const result: DictionaryImportResult = { saCodes: 0, paintCodes: 0, upholsteryCodes: 0 };

  const sas = await readJson<{ code: string; category?: string; names: Record<string, string> }>("sa_codes.json");
  for (const row of sas) {
    if (!row?.code) continue;
    const code = row.code.toUpperCase();
    const values = { code, category: row.category || null, names: row.names || {} };
    await db.insert(saCodes).values(values).onConflictDoUpdate({
      target: saCodes.code,
      set: { category: values.category, names: values.names, updatedAt: new Date() },
    });
    result.saCodes++;
  }

  const paints = await readJson<{ code: string; rgb?: string; finish?: string; names: Record<string, string> }>("paint_codes.json");
  for (const row of paints) {
    if (!row?.code) continue;
    const code = row.code.toUpperCase();
    const values = { code, rgb: row.rgb || null, finish: row.finish || null, names: row.names || {} };
    await db.insert(paintCodes).values(values).onConflictDoUpdate({
      target: paintCodes.code,
      set: { rgb: values.rgb, finish: values.finish, names: values.names, updatedAt: new Date() },
    });
    result.paintCodes++;
  }

  const uphs = await readJson<{ code: string; material?: string; rgb?: string; names: Record<string, string> }>("upholstery_codes.json");
  for (const row of uphs) {
    if (!row?.code) continue;
    const code = row.code.toUpperCase();
    const values = { code, material: row.material || null, rgb: row.rgb || null, names: row.names || {} };
    await db.insert(upholsteryCodes).values(values).onConflictDoUpdate({
      target: upholsteryCodes.code,
      set: { material: values.material, rgb: values.rgb, names: values.names, updatedAt: new Date() },
    });
    result.upholsteryCodes++;
  }

  console.log(`[Dictionaries] Imported sa=${result.saCodes} paint=${result.paintCodes} upholstery=${result.upholsteryCodes}`);
  return result;
}

export async function countDictionaries(): Promise<DictionaryImportResult> {
  const sa = await db.execute(sql`SELECT COUNT(*)::int AS c FROM sa_codes`);
  const paint = await db.execute(sql`SELECT COUNT(*)::int AS c FROM paint_codes`);
  const up = await db.execute(sql`SELECT COUNT(*)::int AS c FROM upholstery_codes`);
  return {
    saCodes: Number((sa.rows?.[0] as any)?.c ?? 0),
    paintCodes: Number((paint.rows?.[0] as any)?.c ?? 0),
    upholsteryCodes: Number((up.rows?.[0] as any)?.c ?? 0),
  };
}
