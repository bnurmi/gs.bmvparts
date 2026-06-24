import { execFileSync } from "node:child_process";
import { createReadStream, statSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { db } from "./storage";
import { partPricing } from "@shared/schema";
import { sql } from "drizzle-orm";

const EUR_TO_AUD_RATE = 1.65;

export interface PriceRow {
  partNumberClean: string;
  eurListPrice: number;
  eurNetPrice: number;
  eurVatPercent: number;
  eurTier: string;
}

export function parsePriceLine(line: string): PriceRow | null {
  if (line.length < 82) return null;
  const partRaw = line.substring(0, 11).trim();
  if (!/^\d{11}$/.test(partRaw)) return null;
  const list = parseFloat(line.substring(11, 23));
  const vat = parseInt(line.substring(35, 37), 10);
  const tier = line.substring(57, 58).trim() || "1";
  const net = parseFloat(line.substring(66, 79));
  const ccy = line.substring(79, 82);
  if (ccy !== "EUR") return null;
  if (isNaN(list) || isNaN(net)) return null;
  return {
    partNumberClean: partRaw,
    eurListPrice: list,
    eurNetPrice: net,
    eurVatPercent: isNaN(vat) ? 0 : vat,
    eurTier: tier,
  };
}

export interface ImportResult {
  filename: string;
  totalLines: number;
  parsedRows: number;
  upsertedRows: number;
  matchedExistingParts: number;
  durationMs: number;
}

async function batchUpsert(rows: PriceRow[], filename: string, eurAudRate: number): Promise<number> {
  if (rows.length === 0) return 0;
  const now = new Date();
  const values = rows.map(r => ({
    partNumberClean: r.partNumberClean,
    eurListPrice: r.eurListPrice,
    eurNetPrice: r.eurNetPrice,
    eurVatPercent: r.eurVatPercent,
    eurTier: r.eurTier,
    eurAudApprox: r.eurNetPrice * eurAudRate,
    eurSourceFile: filename,
    eurUpdatedAt: now,
    found: false,
  }));
  await db.insert(partPricing).values(values).onConflictDoUpdate({
    target: partPricing.partNumberClean,
    set: {
      eurListPrice: sql`excluded.eur_list_price`,
      eurNetPrice: sql`excluded.eur_net_price`,
      eurVatPercent: sql`excluded.eur_vat_percent`,
      eurTier: sql`excluded.eur_tier`,
      eurAudApprox: sql`excluded.eur_aud_approx`,
      eurSourceFile: sql`excluded.eur_source_file`,
      eurUpdatedAt: sql`excluded.eur_updated_at`,
    },
  });
  return values.length;
}

export async function importEtkPriceZip(
  zipBuffer: Buffer,
  filename: string,
  opts: { eurAudRate?: number } = {}
): Promise<ImportResult> {
  const t0 = Date.now();
  const eurAudRate = opts.eurAudRate ?? EUR_TO_AUD_RATE;

  const workdir = join(tmpdir(), `etkpr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(workdir, { recursive: true });
  const zipPath = join(workdir, filename);
  writeFileSync(zipPath, zipBuffer);

  try {
    execFileSync("unzip", ["-o", "-q", zipPath, "-d", workdir], { stdio: "pipe" });
  } catch (e: any) {
    throw new Error(`unzip failed: ${e.message}`);
  }

  // Find Price.* file (Price.1, Price.2, etc.)
  const entries = readdirSync(workdir).filter(n => /^Price\.\d+$/i.test(n));
  if (entries.length === 0) {
    throw new Error(`No Price.* file found inside zip. Contents: ${readdirSync(workdir).join(", ")}`);
  }

  let totalLines = 0;
  let parsedRows = 0;
  let upsertedRows = 0;
  const BATCH = 2000;
  let batch: PriceRow[] = [];

  for (const entry of entries) {
    const filePath = join(workdir, entry);
    const stream = createReadStream(filePath, { encoding: "latin1" });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      totalLines++;
      const row = parsePriceLine(line);
      if (!row) continue;
      parsedRows++;
      batch.push(row);
      if (batch.length >= BATCH) {
        upsertedRows += await batchUpsert(batch, filename, eurAudRate);
        batch = [];
      }
    }
  }

  if (batch.length > 0) {
    upsertedRows += await batchUpsert(batch, filename, eurAudRate);
  }

  // Count how many imported rows match parts in our catalog
  const matchedRes = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM part_pricing pp
    WHERE pp.eur_source_file = ${filename}
      AND EXISTS (SELECT 1 FROM parts p WHERE p.part_number_clean = pp.part_number_clean)
  `);
  const matchedExistingParts = Number((matchedRes as any).rows?.[0]?.n ?? 0);

  // Cleanup
  try {
    rmSync(workdir, { recursive: true, force: true });
  } catch {}

  return {
    filename,
    totalLines,
    parsedRows,
    upsertedRows,
    matchedExistingParts,
    durationMs: Date.now() - t0,
  };
}
