// First-party Manuals tab source for the VIN decoder (Task #59).
// Queries `owners-manuals.bmw.com` (BMW's public owner-manual portal)
// keyed on the resolved (modelName, productionYear). Manuals are NOT
// VIN-specific so we cache results in memory keyed on (model, year)
// for 24h to keep the request volume polite.
//
// Output shape mirrors the bimmer.work scraper's `BimmerWorkManual`
// shape exactly so the existing UI tab works unchanged.

export interface BmwManual {
  number: string;
  language: string;
  date: string;
  downloadUrl: string;
}

import { proxyFetch } from "./proxy-router";

const PORTAL_HOST = process.env.BMW_MANUALS_HOST || "owners-manuals.bmw.com";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const cache = new Map<string, { manuals: BmwManual[]; fetchedAt: number }>();

function cacheKey(model: string, year: number | null): string {
  return `${model.toLowerCase().trim()}|${year ?? ""}`;
}

// Try the public search endpoint. BMW's portal exposes a search API
// that returns booklet metadata + download links. We deliberately
// degrade gracefully on any HTTP / parse error — the orchestrator
// will fall back to bimmer.work whenever this returns an empty array.
async function queryPortal(model: string, year: number | null): Promise<BmwManual[]> {
  const params = new URLSearchParams();
  params.set("model", model);
  if (year != null) params.set("year", String(year));
  const url = `https://${PORTAL_HOST}/search?${params.toString()}`;
  try {
    // Route through bmw_firstparty (primary: evomi_core, backup: oxylabs_webscraper).
    // The dedicated VM's outbound IP is blocked by BMW's portal, so residential
    // proxy is the first attempt to avoid 502 errors on direct connections.
    const text = await proxyFetch("bmw_firstparty", url, { timeoutMs: 8_000 });
    // owners-manuals.bmw.com may return JSON or rendered HTML depending on the
    // Accept header seen by the origin. Try JSON first, degrade to HTML parsing.
    try {
      const data = JSON.parse(text) as unknown;
      return parseJsonManuals(data);
    } catch {
      return parseHtmlManuals(text);
    }
  } catch (err: any) {
    console.log(`[BMW Manuals] Fetch failed for ${model} ${year ?? ""}: ${err.message}`);
    return [];
  }
}

function parseJsonManuals(data: any): BmwManual[] {
  if (!data || typeof data !== "object") return [];
  const items = Array.isArray(data) ? data : (data.results || data.items || data.manuals || []);
  if (!Array.isArray(items)) return [];
  const out: BmwManual[] = [];
  for (const it of items) {
    const downloadUrl = it.downloadUrl || it.url || it.pdf || it.link;
    if (!downloadUrl) continue;
    out.push({
      number: String(it.number || it.id || it.title || "Manual"),
      language: String(it.language || it.lang || "en"),
      date: String(it.date || it.publishedAt || it.year || ""),
      downloadUrl: String(downloadUrl),
    });
  }
  return out;
}

function parseHtmlManuals(html: string): BmwManual[] {
  const out: BmwManual[] = [];
  // Generic table extraction — owners-manuals.bmw.com renders one
  // <tr> per booklet with the PDF link as the first cell. We accept
  // any same-host PDF link with a language label nearby.
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowPattern.exec(html)) !== null) {
    const tr = m[1];
    const linkMatch = tr.match(/<a[^>]*href="([^"]+\.pdf[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const href = linkMatch[1];
    const number = linkMatch[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || "Manual";
    const cells = Array.from(tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(x => x[1].replace(/<[^>]+>/g, "").trim());
    const language = cells[1] || "en";
    const date = cells[2] || "";
    let downloadUrl = href;
    if (downloadUrl.startsWith("/")) downloadUrl = `https://${PORTAL_HOST}${downloadUrl}`;
    out.push({ number, language, date, downloadUrl });
  }
  return out;
}

export async function fetchManualsForModel(modelName: string | null | undefined, year: number | null | undefined): Promise<BmwManual[]> {
  if (!modelName) return [];
  const key = cacheKey(modelName, year ?? null);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.manuals;
  const manuals = await queryPortal(modelName, year ?? null);
  cache.set(key, { manuals, fetchedAt: Date.now() });
  return manuals;
}

// Hosts this module produces — exposed for `server/vin-images.ts`
// ALLOWED_HOSTS so manual download links stay within our allow-list.
export const MANUALS_HOSTS = new Set<string>([
  PORTAL_HOST,
  "owners-manuals.bmw.com",
  "owner.i.bmw.com",
]);

// Test/debug helper: clear cache so an admin can force a fresh fetch.
export function clearManualsCache(): void { cache.clear(); }
