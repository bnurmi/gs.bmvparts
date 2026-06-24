// First-party per-VIN factory option (FA / SA) loader.
//
// Mirrors the `data/etk/exports/fztyp.psv` pattern (see
// `server/etk-vehicle.ts`) but for the per-VIN FA dump that lives at
// `data/etk/exports/vin_fa.psv`. The leaked ETK Transbase dump only
// carries type-code-level vehicle metadata — the per-VIN list of
// installed Sonderausstattung (SA) codes, paint code, upholstery code
// and production date come from a separate FA dump (e.g. exported
// from PartsLink24 or scraped once per VIN from a first-party BMW
// vehicle-profile API).
//
// File format (pipe-delimited, no header, `#`-prefixed comments OK):
//   VIN | sa1,sa2,sa3 | paintCode | upholsteryCode | YYYY-MM
// Sample row:
//   WBS32AY090FM28236|S206,S2VB,S2TB|475|FAAT|2020-09
//
// Loading is best-effort: a missing file just means we have no FA
// dump on disk yet — the orchestrator continues to read whatever rows
// were already in `vin_factory_options` (admin imports, promoted
// cache, e2e fixture).
//
// Source priority preserved on conflict:
//   etk_fa_import (admin HTTP) > etk_fa_dump (this loader)
//                              > promoted_from_cache
//                              > e2e_fixture / unknown
import { readFile, stat } from "fs/promises";
import path from "path";
import { db } from "./storage";
import { sql } from "drizzle-orm";
import { vinFactoryOptions } from "@shared/schema";

export const VIN_FA_PSV_PATH = path.join(process.cwd(), "data", "etk", "exports", "vin_fa.psv");

export interface ParsedVinFaRow {
  vin: string;
  saCodes: string[];
  paintCode: string | null;
  upholsteryCode: string | null;
  productionDate: string | null;
}

export interface VinFaImportStats {
  parsed: number;
  upserted: number;
  skipped: number;
}

// Strict parser shared by the startup loader and the CLI script. Any
// malformed row is silently skipped (logged) so a single bad line
// doesn't block ingest of the rest of the dump.
export function parseVinFaPsv(raw: string): ParsedVinFaRow[] {
  const out: ParsedVinFaRow[] = [];
  const lines = raw.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("|").map(s => s.trim());
    const vin = (parts[0] || "").toUpperCase().replace(/[\s-]/g, "");
    if (vin.length !== 17) continue;
    const sas = (parts[1] || "")
      .split(/[,\s]+/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
      .filter(c => /^S[A-Z0-9]{3,5}$/.test(c));
    out.push({
      vin,
      saCodes: sas,
      paintCode: parts[2] || null,
      upholsteryCode: parts[3] || null,
      productionDate: parts[4] || null,
    });
  }
  return out;
}

// Upsert one row honouring the source-priority ladder. We treat any
// existing `etk_fa_import` row as the authoritative override and
// leave it alone; everything weaker gets overwritten by this dump.
// Uses the Drizzle insert builder so the `text[]` column gets
// serialized correctly (raw `${array}::text[]` substitution silently
// becomes a `record` cast and fails).
async function upsertRow(row: ParsedVinFaRow): Promise<"upserted" | "skipped"> {
  // Read existing source first so we can short-circuit when an admin
  // override is in place. This costs one extra round-trip per row but
  // the FA dump is loaded only at boot (and on demand from the CLI),
  // so the simplicity is worth it.
  const existing = await db
    .select({ source: vinFactoryOptions.source })
    .from(vinFactoryOptions)
    .where(sql`${vinFactoryOptions.vin} = ${row.vin}`);
  if (existing[0]?.source === "etk_fa_import") return "skipped";

  await db
    .insert(vinFactoryOptions)
    .values({
      vin: row.vin,
      saCodes: row.saCodes,
      paintCode: row.paintCode,
      upholsteryCode: row.upholsteryCode,
      productionDate: row.productionDate,
      source: "etk_fa_dump",
    })
    .onConflictDoUpdate({
      target: vinFactoryOptions.vin,
      set: {
        saCodes: row.saCodes,
        paintCode: row.paintCode,
        upholsteryCode: row.upholsteryCode,
        productionDate: row.productionDate,
        source: "etk_fa_dump",
        updatedAt: new Date(),
      },
    });
  return "upserted";
}

// Bulk-import the rows produced by `parseVinFaPsv`. Returns a small
// stats object the caller can log.
export async function importVinFaRows(rows: ParsedVinFaRow[]): Promise<VinFaImportStats> {
  let upserted = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const r = await upsertRow(row);
      if (r === "skipped") skipped++;
      else upserted++;
    } catch (err: any) {
      console.error(`[ETK-FA] upsert failed for ${row.vin}: ${err.message}`);
      skipped++;
    }
  }
  return { parsed: rows.length, upserted, skipped };
}

// Startup hook. Called once from `server/index.ts` after the
// `vin_factory_options` table is created. Silently no-ops when the
// dump file is missing so dev/prod environments that haven't shipped
// a `vin_fa.psv` keep booting cleanly.
export async function loadVinFaDumpOnStartup(filePath: string = VIN_FA_PSV_PATH): Promise<VinFaImportStats | null> {
  try {
    await stat(filePath);
  } catch {
    console.log(`[ETK-FA] no vin_fa.psv at ${filePath} — skipping per-VIN FA import`);
    return null;
  }
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err: any) {
    console.warn(`[ETK-FA] vin_fa.psv exists but unreadable (${err.message}); skipping`);
    return null;
  }
  const rows = parseVinFaPsv(raw);
  if (rows.length === 0) {
    console.log(`[ETK-FA] vin_fa.psv parsed to 0 rows — nothing to import`);
    return { parsed: 0, upserted: 0, skipped: 0 };
  }
  const stats = await importVinFaRows(rows);
  console.log(
    `[ETK-FA] Loaded ${stats.upserted} VIN→SA rows from vin_fa.psv ` +
    `(parsed=${stats.parsed}, skipped=${stats.skipped} respecting etk_fa_import overrides)`
  );
  return stats;
}
