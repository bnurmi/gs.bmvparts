import { db } from "../storage";
import { sql } from "drizzle-orm";
import type { DetectedPart } from "./ai-analyzer";
import type { QuoteRow } from "@shared/schema";
import { randomUUID } from "crypto";

export interface MatchedPart {
  partNumberClean: string | null;
  description: string;
  audApprox: number | null;
  dealPrice: number | null;
  category: string;
}

async function findBestMatch(description: string, carIds?: number[]): Promise<MatchedPart | null> {
  try {
    let result: any;
    if (carIds && carIds.length > 0) {
      result = await db.execute(sql.raw(`
        SELECT
          p.part_number_clean,
          p.description,
          pp.aud_approx,
          pp.deal_price,
          similarity(p.description, ${escStr(description)}) AS sim
        FROM parts p
        LEFT JOIN part_pricing pp ON pp.part_number_clean = p.part_number_clean
        WHERE
          p.car_id = ANY(ARRAY[${carIds.join(",")}]::int[])
          AND similarity(p.description, ${escStr(description)}) > 0.2
        ORDER BY sim DESC
        LIMIT 1
      `));
    } else {
      result = await db.execute(sql.raw(`
        SELECT
          p.part_number_clean,
          p.description,
          pp.aud_approx,
          pp.deal_price,
          similarity(p.description, ${escStr(description)}) AS sim
        FROM parts p
        LEFT JOIN part_pricing pp ON pp.part_number_clean = p.part_number_clean
        WHERE similarity(p.description, ${escStr(description)}) > 0.25
        ORDER BY sim DESC
        LIMIT 1
      `));
    }

    const rows = (result as any).rows ?? result;
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      partNumberClean: row.part_number_clean ?? null,
      description: row.description,
      audApprox: row.aud_approx != null ? parseFloat(row.aud_approx) : null,
      dealPrice: row.deal_price != null ? parseFloat(row.deal_price) : null,
      category: "",
    };
  } catch {
    return null;
  }
}

async function resolveCarIds(chassis: string): Promise<number[]> {
  try {
    const result = await db.execute(sql.raw(
      `SELECT id FROM cars WHERE chassis = ${escStr(chassis)} LIMIT 20`
    ));
    const rows = (result as any).rows ?? result;
    return rows.map((r: any) => r.id);
  } catch {
    return [];
  }
}

function escStr(v: string): string {
  return `'${v.replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
}

function extractChassis(vehicle?: string, vin?: string): string | null {
  if (!vehicle && !vin) return null;
  const combined = `${vehicle ?? ""} ${vin ?? ""}`.toUpperCase();
  const m = combined.match(/\b(G8[02]|G8[013456789]|F8[024]|F[89][0-9]|F[0-9][0-9]|E[0-9][0-9]|G[0-9][0-9]|F[0-9][0-9]|U[0-9][0-9])\b/);
  return m ? m[1] : null;
}

export async function matchDetectedParts(
  detectedParts: DetectedPart[],
  vehicle?: string,
  vin?: string
): Promise<QuoteRow[]> {
  const chassis = extractChassis(vehicle, vin);
  const carIds = chassis ? await resolveCarIds(chassis) : [];

  const rows: QuoteRow[] = [];
  let itemIdx = 1;

  for (const part of detectedParts) {
    const match = await findBestMatch(part.oem_description, carIds);

    const bmwNew = match?.audApprox ?? 0;
    const ourPrice = bmwNew * 0.5;
    const saving = bmwNew - ourPrice;

    rows.push({
      id: randomUUID(),
      estimateItem: `Item ${itemIdx++}`,
      oemDescription: match ? match.description : part.oem_description,
      oemNumber: match?.partNumberClean ?? null,
      bmwNew: Math.round(bmwNew * 100) / 100,
      ourPrice: Math.round(ourPrice * 100) / 100,
      saving: Math.round(saving * 100) / 100,
      category: part.suggested_category,
      status: !match ? "review" : part.status,
      notes: part.notes,
    });
  }

  return rows;
}

export function calcTotals(rows: QuoteRow[]): { totalBmwNew: number; totalOurPrice: number; totalSaving: number } {
  let totalBmwNew = 0, totalOurPrice = 0, totalSaving = 0;
  for (const r of rows) {
    totalBmwNew += r.bmwNew;
    totalOurPrice += r.ourPrice;
    totalSaving += r.saving;
  }
  return {
    totalBmwNew: Math.round(totalBmwNew * 100) / 100,
    totalOurPrice: Math.round(totalOurPrice * 100) / 100,
    totalSaving: Math.round(totalSaving * 100) / 100,
  };
}
