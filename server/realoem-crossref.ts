import { db } from "./storage";
import { sql } from "drizzle-orm";
import { partCrossReferences } from "@shared/schema";
import { createJob, completeJob, failJob, startPeriodicCheckpoint, stopPeriodicCheckpoint, getActiveJob, cancelJobByType } from "./job-manager";
import { proxyFetch } from "./proxy-router";

const REALOEM_BASE = "https://www.realoem.com";
const CONCURRENCY = 5;
const DELAY_MS = 250;
const BATCH_SIZE = 100;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractSeriesCodes(html: string): string[] {
  const codes: string[] = [];
  const seriesPattern = /series=([A-Z0-9]+)/g;
  let match;
  while ((match = seriesPattern.exec(html)) !== null) {
    const code = match[1];
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

function extractChassisFromSeries(html: string, seriesCode: string): string | null {
  const chassisPattern = new RegExp(`series=${seriesCode}[^"]*"[^>]*>([^<]+)`, 'i');
  const match = chassisPattern.exec(html);
  if (match) {
    const text = match[1].trim();
    const chassisMatch = text.match(/^([A-Z]\d{2,3})/);
    return chassisMatch ? chassisMatch[1] : null;
  }
  return null;
}

interface CrossRefResult {
  partNumberClean: string;
  seriesCodes: string[];
  found: boolean;
}

async function checkPartOnRealoem(partNumberClean: string): Promise<CrossRefResult> {
  const formatted = partNumberClean.replace(/(\d{2})(\d{2})(\d{1})(\d{3})(\d{3})/, "$1 $2 $3 $4 $5");
  const searchUrl = `${REALOEM_BASE}/bmw/enUS/partxref?q=${encodeURIComponent(formatted)}`;

  try {
    const html = await proxyFetch("realoem", searchUrl, { render: true });
    const seriesCodes = extractSeriesCodes(html);
    return { partNumberClean, seriesCodes, found: seriesCodes.length > 0 };
  } catch (err: any) {
    console.warn(`[RealOEM] Error checking ${partNumberClean}: ${err.message}`);
    return { partNumberClean, seriesCodes: [], found: false };
  }
}

interface CrossRefState {
  running: boolean;
  totalParts: number;
  checkedCount: number;
  foundCount: number;
  errorCount: number;
  startedAt: Date | null;
  estimatedEndAt: Date | null;
  cancelled: boolean;
  currentPart: string;
  partsPerSecond: number;
}

const state: CrossRefState = {
  running: false,
  totalParts: 0,
  checkedCount: 0,
  foundCount: 0,
  errorCount: 0,
  startedAt: null,
  estimatedEndAt: null,
  cancelled: false,
  currentPart: "",
  partsPerSecond: 0,
};

export function getCrossRefStatus(): CrossRefState {
  return { ...state };
}

let crossRefJobId: number | null = null;

export function cancelCrossRef(): void {
  state.cancelled = true;
  if (crossRefJobId) {
    cancelJobByType("crossref").catch(() => {});
  }
}

async function processBatch(partNumbers: string[]): Promise<void> {
  const chunks: string[][] = [];
  for (let i = 0; i < partNumbers.length; i += CONCURRENCY) {
    chunks.push(partNumbers.slice(i, i + CONCURRENCY));
  }

  for (const chunk of chunks) {
    if (state.cancelled) return;

    const results = await Promise.all(
      chunk.map(async (pn) => {
        const result = await checkPartOnRealoem(pn);
        await sleep(DELAY_MS);
        return result;
      })
    );

    for (const result of results) {
      if (state.cancelled) return;

      state.checkedCount++;
      state.currentPart = result.partNumberClean;

      if (result.found) {
        state.foundCount++;
        for (const code of result.seriesCodes) {
          try {
            await db.execute(sql`
              INSERT INTO part_cross_references (part_number_clean, series_code, source)
              VALUES (${result.partNumberClean}, ${code}, 'realoem')
              ON CONFLICT (part_number_clean, series_code) DO NOTHING
            `);
          } catch (_e) {}
        }
      }

      const codesArray = `{${result.seriesCodes.join(",")}}`;
      await db.execute(sql`
        INSERT INTO realoem_checked_parts (part_number_clean, series_codes, found)
        VALUES (${result.partNumberClean}, ${codesArray}::text[], ${result.found})
        ON CONFLICT (part_number_clean) DO UPDATE SET
          series_codes = EXCLUDED.series_codes,
          found = EXCLUDED.found,
          checked_at = NOW()
      `);

      if (state.checkedCount % 100 === 0 && state.startedAt) {
        const elapsed = (Date.now() - state.startedAt.getTime()) / 1000;
        state.partsPerSecond = state.checkedCount / elapsed;
        const remaining = state.totalParts - state.checkedCount;
        const etaSeconds = remaining / (state.partsPerSecond || 1);
        state.estimatedEndAt = new Date(Date.now() + etaSeconds * 1000);
        console.log(`[RealOEM] Progress: ${state.checkedCount}/${state.totalParts} (${Math.round(state.checkedCount / state.totalParts * 100)}%) - ${state.foundCount} found - ${state.partsPerSecond.toFixed(1)} parts/s`);
      }
    }
  }
}

export async function startCrossRefEnrichment(isResume = false): Promise<void> {
  if (state.running) throw new Error("Cross-reference enrichment already running");

  state.running = true;
  state.cancelled = false;
  state.checkedCount = 0;
  state.foundCount = 0;
  state.errorCount = 0;
  state.startedAt = new Date();
  state.estimatedEndAt = null;
  state.currentPart = "";
  state.partsPerSecond = 0;

  if (!isResume) {
    const job = await createJob("crossref", { status: "starting" });
    crossRefJobId = job.id;
  } else {
    const active = await getActiveJob("crossref");
    crossRefJobId = active?.id ?? null;
  }

  if (crossRefJobId) {
    startPeriodicCheckpoint(crossRefJobId, () => ({ ...state }));
  }

  try {
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM (
        SELECT DISTINCT p.part_number_clean
        FROM parts p
        LEFT JOIN realoem_checked_parts rcp ON rcp.part_number_clean = p.part_number_clean
        WHERE p.part_number_clean IS NOT NULL
        AND p.part_number_clean != ''
        AND rcp.part_number_clean IS NULL
      ) unchecked
    `);
    state.totalParts = Number((totalResult as any).rows[0].cnt);
    console.log(`[RealOEM] ${isResume ? 'Resuming' : 'Starting'} cross-reference enrichment: ${state.totalParts} unchecked parts`);

    if (state.totalParts === 0) {
      console.log(`[RealOEM] All parts already checked`);
      if (crossRefJobId) {
        await completeJob(crossRefJobId, { ...state });
        crossRefJobId = null;
      }
      state.running = false;
      return;
    }

    let offset = 0;
    while (!state.cancelled) {
      const batchResult = await db.execute(sql`
        SELECT DISTINCT p.part_number_clean
        FROM parts p
        LEFT JOIN realoem_checked_parts rcp ON rcp.part_number_clean = p.part_number_clean
        WHERE p.part_number_clean IS NOT NULL
        AND p.part_number_clean != ''
        AND rcp.part_number_clean IS NULL
        ORDER BY p.part_number_clean
        LIMIT ${BATCH_SIZE}
      `);
      const batch = (batchResult as any).rows.map((r: any) => r.part_number_clean);
      if (batch.length === 0) break;

      await processBatch(batch);
      offset += batch.length;
    }

    const wasCancelled = state.cancelled;
    console.log(`[RealOEM] Enrichment ${wasCancelled ? 'cancelled' : 'complete'}: checked=${state.checkedCount}, found=${state.foundCount}`);

    if (crossRefJobId) {
      if (wasCancelled) {
        await cancelJobByType("crossref");
      } else {
        await completeJob(crossRefJobId, { ...state });
      }
      crossRefJobId = null;
    }
  } catch (err: any) {
    console.error(`[RealOEM] Enrichment error: ${err.message}`);
    if (crossRefJobId) {
      await failJob(crossRefJobId, err.message, { ...state }).catch(() => {});
      crossRefJobId = null;
    }
  } finally {
    state.running = false;
    if (crossRefJobId) {
      stopPeriodicCheckpoint(crossRefJobId);
    }
  }
}

export async function checkSinglePart(partNumberClean: string): Promise<{ seriesCodes: string[]; found: boolean }> {
  const existing = await db.execute(sql`
    SELECT series_codes, found FROM realoem_checked_parts
    WHERE part_number_clean = ${partNumberClean}
  `);
  if ((existing as any).rows.length > 0) {
    const row = (existing as any).rows[0];
    return { seriesCodes: row.series_codes || [], found: row.found };
  }

  const result = await checkPartOnRealoem(partNumberClean);

  if (result.found) {
    for (const code of result.seriesCodes) {
      try {
        await db.execute(sql`
          INSERT INTO part_cross_references (part_number_clean, series_code, source)
          VALUES (${partNumberClean}, ${code}, 'realoem')
          ON CONFLICT (part_number_clean, series_code) DO NOTHING
        `);
      } catch (_e) {}
    }
  }

  const codesArr = `{${result.seriesCodes.join(",")}}`;
  await db.execute(sql`
    INSERT INTO realoem_checked_parts (part_number_clean, series_codes, found)
    VALUES (${partNumberClean}, ${codesArr}::text[], ${result.found})
    ON CONFLICT (part_number_clean) DO UPDATE SET
      series_codes = EXCLUDED.series_codes,
      found = EXCLUDED.found,
      checked_at = NOW()
  `);

  return { seriesCodes: result.seriesCodes, found: result.found };
}

export async function getCrossRefsForPart(partNumberClean: string): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT series_code FROM part_cross_references
    WHERE part_number_clean = ${partNumberClean}
    ORDER BY series_code
  `);
  return (result as any).rows.map((r: any) => r.series_code);
}

export async function getCrossRefStats(): Promise<{
  totalUniqueParts: number;
  totalChecked: number;
  totalFound: number;
  totalCrossRefs: number;
  topSeries: { series: string; count: number }[];
}> {
  const uniqueParts = await db.execute(sql`SELECT COUNT(DISTINCT part_number_clean) as cnt FROM parts WHERE part_number_clean IS NOT NULL AND part_number_clean != ''`);
  const checked = await db.execute(sql`SELECT COUNT(*) as cnt FROM realoem_checked_parts`);
  const found = await db.execute(sql`SELECT COUNT(*) as cnt FROM realoem_checked_parts WHERE found = true`);
  const crossRefs = await db.execute(sql`SELECT COUNT(*) as cnt FROM part_cross_references`);
  const topSeries = await db.execute(sql`
    SELECT series_code as series, COUNT(*) as count
    FROM part_cross_references
    GROUP BY series_code
    ORDER BY count DESC
    LIMIT 20
  `);

  return {
    totalUniqueParts: Number((uniqueParts as any).rows[0].cnt),
    totalChecked: Number((checked as any).rows[0].cnt),
    totalFound: Number((found as any).rows[0].cnt),
    totalCrossRefs: Number((crossRefs as any).rows[0].cnt),
    topSeries: (topSeries as any).rows.map((r: any) => ({ series: r.series, count: Number(r.count) })),
  };
}
