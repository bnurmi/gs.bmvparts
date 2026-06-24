#!/usr/bin/env tsx
/**
 * Crawl RealOEM's /bmw/enUS/vehicles index and persist every partgrp id
 * (with parsed metadata) into `realoem_vehicles`. The `partgrpId` is the
 * canonical chassis-landing key (e.g. `CW82-EUR-11-2019-G07-BMW-X7_30dX`)
 * — the only key that produces a non-welcome RealOEM landing URL. Without
 * this table populated, the backfill silently burns Oxylabs budget hitting
 * `/showparts?id=<slug>&mospid=<n>`, which always returns the welcome page.
 *
 * Resolution order matches `fetchRealoemHtml`: per-URL fixture → on-disk
 * runtime cache → Oxylabs (only on cache miss). Re-runs are idempotent;
 * pages whose row hashes match what's already stored are skipped without
 * re-parsing. Throttle defaults to 250ms between page fetches.
 *
 * Usage:
 *   npx tsx scripts/crawl-realoem-vehicles.ts [--max-pages=N] [--throttle=MS] [--force]
 */
import { db } from "../server/storage";
import { realoemVehicles, type InsertRealoemVehicle } from "../shared/schema";
import { fetchRealoemHtml } from "../server/realoem-audit";
import { sql, inArray } from "drizzle-orm";

const BASE = "https://www.realoem.com/bmw/enUS/vehicles";
const DEFAULT_THROTTLE_MS = 250;

interface ParsedRow {
  partgrpId: string;
  series: string | null;
  modelName: string;
  typeCode: string | null;
  body: string | null;
  prodRange: string | null;
  market: string;
  chassis: string;
  prodMonth: number | null;
  prodYear: number | null;
}

const decodeEntities = (s: string): string =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const stripTags = (s: string): string => decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/**
 * Decompose a partgrpId of the form `<TYPE>-<MARKET>-<MM>-<YYYY>-<CHASSIS>-BMW-<MODEL_SLUG>`.
 * Some legacy ids have non-numeric month/year segments — we tolerate that
 * by leaving the affected fields null rather than rejecting the row.
 */
function decomposePartgrpId(id: string): { typeCode: string | null; market: string; chassis: string; prodMonth: number | null; prodYear: number | null } {
  const segs = id.split("-");
  if (segs.length < 7) {
    return { typeCode: null, market: "?", chassis: "?", prodMonth: null, prodYear: null };
  }
  const monthN = parseInt(segs[2], 10);
  const yearN = parseInt(segs[3], 10);
  return {
    typeCode: segs[0] || null,
    market: segs[1] || "?",
    prodMonth: Number.isFinite(monthN) && monthN >= 1 && monthN <= 12 ? monthN : null,
    prodYear: Number.isFinite(yearN) && yearN > 1900 && yearN < 2100 ? yearN : null,
    chassis: segs[4] || "?",
  };
}

function parseVehiclesPage(html: string): { rows: ParsedRow[]; lastPage: number } {
  const rows: ParsedRow[] = [];
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return { rows, lastPage: 1 };
  const tbody = tbodyMatch[1];
  const trMatches = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  for (const tr of trMatches) {
    const inner = tr[1];
    const seriesMatch = inner.match(/<td[^>]*class="[^"]*\bvi-col-series\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const modelMatch = inner.match(/<td[^>]*class="[^"]*\bvi-col-model\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const typeMatch = inner.match(/<td[^>]*class="[^"]*\bvi-col-type\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const bodyMatch = inner.match(/<td[^>]*class="[^"]*\bvi-col-body\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const prodMatch = inner.match(/<td[^>]*class="[^"]*\bvi-col-prod\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const marketMatch = inner.match(/<td[^>]*class="[^"]*\bvi-col-market\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const hrefMatch = inner.match(/href="\/bmw\/enUS\/partgrp\?id=([^"#&]+)"/i);
    if (!hrefMatch || !modelMatch) continue;

    const partgrpId = decodeEntities(hrefMatch[1]);
    const decomposed = decomposePartgrpId(partgrpId);
    rows.push({
      partgrpId,
      series: seriesMatch ? stripTags(seriesMatch[1]) || null : null,
      modelName: stripTags(modelMatch[1]),
      typeCode: typeMatch ? stripTags(typeMatch[1]) || decomposed.typeCode : decomposed.typeCode,
      body: bodyMatch ? stripTags(bodyMatch[1]) || null : null,
      prodRange: prodMatch ? stripTags(prodMatch[1]) || null : null,
      market: marketMatch ? stripTags(marketMatch[1]) || decomposed.market : decomposed.market,
      chassis: decomposed.chassis,
      prodMonth: decomposed.prodMonth,
      prodYear: decomposed.prodYear,
    });
  }

  // Pagination: links look like `?page=N`. Last page = max N seen.
  const pageNums = [...html.matchAll(/[?&]page=(\d+)/g)].map(m => parseInt(m[1], 10)).filter(Number.isFinite);
  const lastPage = pageNums.length > 0 ? Math.max(...pageNums, 1) : 1;
  return { rows, lastPage };
}

async function existingHashesByPartgrpIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  // Fingerprint a page by hashing its set of partgrp ids and comparing
  // to the same set of ids in the DB (presence = covered). For our
  // idempotency check we just need to know which ids already exist.
  const existing = await db
    .select({ id: realoemVehicles.partgrpId })
    .from(realoemVehicles)
    .where(inArray(realoemVehicles.partgrpId, ids));
  return new Set(existing.map(r => r.id));
}

async function upsertRows(rows: ParsedRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: InsertRealoemVehicle[] = rows.map(r => ({
    partgrpId: r.partgrpId,
    series: r.series,
    modelName: r.modelName,
    typeCode: r.typeCode,
    body: r.body,
    chassis: r.chassis,
    market: r.market,
    prodMonth: r.prodMonth,
    prodYear: r.prodYear,
    prodRange: r.prodRange,
  }));
  await db
    .insert(realoemVehicles)
    .values(values)
    .onConflictDoUpdate({
      target: realoemVehicles.partgrpId,
      set: {
        series: sql`excluded.series`,
        modelName: sql`excluded.model_name`,
        typeCode: sql`excluded.type_code`,
        body: sql`excluded.body`,
        chassis: sql`excluded.chassis`,
        market: sql`excluded.market`,
        prodMonth: sql`excluded.prod_month`,
        prodYear: sql`excluded.prod_year`,
        prodRange: sql`excluded.prod_range`,
        fetchedAt: sql`NOW()`,
      },
    });
  return values.length;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function parseFlag(name: string, fallback?: string): string | undefined {
  for (const a of process.argv.slice(2)) {
    if (a === `--${name}`) return "true";
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return fallback;
}

/**
 * Crawl options. `onProgress` is invoked after every page so external
 * callers (e.g. an admin endpoint or another script) can stream live
 * status.
 */
export interface CrawlVehiclesOptions {
  maxPages?: number;            // default: derived from page-1 pagination
  throttleMs?: number;          // default: DEFAULT_THROTTLE_MS
  force?: boolean;              // default: false (skip if table looks full)
  onProgress?: (p: CrawlVehiclesProgress) => void;
}

export interface CrawlVehiclesProgress {
  page: number;
  lastPage: number;
  source: "fixture" | "cache" | "oxylabs";
  pageRows: number;
  pageNew: number;
  totalNew: number;
  pagesFetched: number;
  pagesSkipped: number;
  skippedAll?: boolean;
  error?: string;
}

export interface CrawlVehiclesResult {
  parsedRows: number;
  upserted: number;
  pagesFetched: number;
  pagesSkipped: number;
  tableRowsTotal: number;
  skippedAll: boolean; // true when the table was already fully populated
}

/**
 * Pure function form of the crawler — used by the CLI entrypoint and
 * importable by other modules. Honors the documented idempotency
 * rules: page-1 pagination probe, per-page hash-skip, and the
 * 8,000-row "table already full" short-circuit.
 */
export async function crawlRealoemVehicles(opts: CrawlVehiclesOptions = {}): Promise<CrawlVehiclesResult> {
  const throttleMs = opts.throttleMs ?? DEFAULT_THROTTLE_MS;
  const force = !!opts.force;
  const onProgress = opts.onProgress ?? (() => {});

  // Cheap upfront idempotency: if the table already looks fully
  // populated (>= EXPECTED_MIN_ROWS) and force isn't set, skip the
  // whole crawl. RealOEM publishes ~8,218 vehicles; 8,000 is a
  // conservative floor to avoid burning Oxylabs on a re-run.
  const EXPECTED_MIN_ROWS = 8000;
  if (!force) {
    const c0 = await db.select({ c: sql<number>`count(*)::int` }).from(realoemVehicles);
    if (c0[0].c >= EXPECTED_MIN_ROWS) {
      console.log(`[crawl-vehicles] table already has ${c0[0].c} rows (>= ${EXPECTED_MIN_ROWS}), skipping crawl. Use force=true to refresh.`);
      return {
        parsedRows: 0,
        upserted: 0,
        pagesFetched: 0,
        pagesSkipped: 0,
        tableRowsTotal: c0[0].c,
        skippedAll: true,
      };
    }
    console.log(`[crawl-vehicles] table has ${c0[0].c} rows, proceeding with crawl.`);
  }

  // Page 1: discover total page count.
  const page1Url = `${BASE}?page=1`;
  const page1 = await fetchRealoemHtml(page1Url);
  const parsedPage1 = parseVehiclesPage(page1.html);
  if (parsedPage1.rows.length === 0) {
    throw new Error("Page 1 produced 0 rows — selector may be stale");
  }
  const lastPage = opts.maxPages != null && opts.maxPages > 0
    ? Math.min(parsedPage1.lastPage, opts.maxPages)
    : parsedPage1.lastPage;
  console.log(`[crawl-vehicles] page 1: ${parsedPage1.rows.length} rows, total pages = ${parsedPage1.lastPage}${opts.maxPages ? ` (capped at ${lastPage})` : ""}`);

  let totalNew = 0;
  let totalRows = 0;
  let pagesSkipped = 0;
  let pagesFetched = 0;

  for (let page = 1; page <= lastPage; page++) {
    let pageRows: ParsedRow[];
    let source: "fixture" | "cache" | "oxylabs";

    if (page === 1) {
      pageRows = parsedPage1.rows;
      source = page1.source;
    } else {
      const url = `${BASE}?page=${page}`;
      let html: string;
      try {
        const r = await fetchRealoemHtml(url);
        html = r.html;
        source = r.source;
        if (source === "oxylabs") await sleep(throttleMs);
      } catch (e) {
        // Throw rather than `break` so callers can't mistake a partial
        // crawl for a successful one (the CLI exits non-zero and any
        // importing caller sees the rejection). Pre-refactor this
        // would silently exit 0 on the first per-page failure.
        const msg = (e as Error).message;
        console.error(`[crawl-vehicles] page ${page} fetch failed: ${msg}`);
        onProgress({
          page, lastPage, source: "oxylabs", pageRows: 0, pageNew: 0,
          totalNew, pagesFetched, pagesSkipped, error: msg,
        });
        throw new Error(`page ${page}/${lastPage} fetch failed: ${msg}`);
      }
      pageRows = parseVehiclesPage(html).rows;
    }

    totalRows += pageRows.length;

    if (!force) {
      const existing = await existingHashesByPartgrpIds(pageRows.map(r => r.partgrpId));
      const newRows = pageRows.filter(r => !existing.has(r.partgrpId));
      if (newRows.length === 0) {
        pagesSkipped++;
        if (page % 25 === 0 || page === lastPage) {
          console.log(`[crawl-vehicles] page ${page}/${lastPage} (${source}, all ${pageRows.length} rows already stored, skipped)`);
        }
        onProgress({ page, lastPage, source, pageRows: pageRows.length, pageNew: 0, totalNew, pagesFetched, pagesSkipped, skippedAll: true });
        continue;
      }
      const inserted = await upsertRows(newRows);
      totalNew += inserted;
      pagesFetched++;
      console.log(`[crawl-vehicles] page ${page}/${lastPage} (${source}): ${pageRows.length} rows, ${inserted} new`);
      onProgress({ page, lastPage, source, pageRows: pageRows.length, pageNew: inserted, totalNew, pagesFetched, pagesSkipped });
    } else {
      const inserted = await upsertRows(pageRows);
      totalNew += inserted;
      pagesFetched++;
      console.log(`[crawl-vehicles] page ${page}/${lastPage} (${source}, force): ${pageRows.length} rows upserted`);
      onProgress({ page, lastPage, source, pageRows: pageRows.length, pageNew: inserted, totalNew, pagesFetched, pagesSkipped });
    }
  }

  const finalCount = await db.select({ c: sql<number>`count(*)::int` }).from(realoemVehicles);
  console.log(
    `[crawl-vehicles] done. parsed_rows=${totalRows} upserted=${totalNew} pages_fetched=${pagesFetched} pages_skipped=${pagesSkipped} table_rows_total=${finalCount[0].c}`,
  );
  return {
    parsedRows: totalRows,
    upserted: totalNew,
    pagesFetched,
    pagesSkipped,
    tableRowsTotal: finalCount[0].c,
    skippedAll: false,
  };
}

async function main(): Promise<void> {
  const maxPagesOverride = parseInt(parseFlag("max-pages") ?? "", 10);
  const throttleMs = parseInt(parseFlag("throttle") ?? `${DEFAULT_THROTTLE_MS}`, 10);
  const force = !!parseFlag("force");

  console.log(`[crawl-vehicles] starting (throttle=${throttleMs}ms, force=${force})`);

  await crawlRealoemVehicles({
    maxPages: Number.isFinite(maxPagesOverride) && maxPagesOverride > 0 ? maxPagesOverride : undefined,
    throttleMs,
    force,
  });
  process.exit(0);
}

// Only run main() when invoked directly via tsx, not when imported by
// another module. import.meta.url ends in this file's path when
// called directly; the conditional avoids accidental double-runs.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error(`[crawl-vehicles] fatal: ${(e as Error).stack ?? e}`);
    process.exit(1);
  });
}
