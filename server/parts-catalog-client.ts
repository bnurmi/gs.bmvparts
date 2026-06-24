/**
 * Read-only client for the external BMW parts catalog API
 * (a separate scraping service hosted at PARTS_CATALOG_API_URL,
 * defaulting to https://engineroom.gearswap.ai).
 *
 * Endpoint contract (as documented by the upstream service):
 *   GET /api/catalog-parts
 *     ?brand=BMW           (default BMW)
 *     &model=G20           (optional, exact match)
 *     &partNumber=...      (optional, exact match)
 *     &limit=100           (default 100, max 1000)
 *     &offset=0
 *
 * Returns { brand, total, offset, limit, parts: CatalogPart[] }.
 *
 * No data is mirrored locally; queries are live with a small in-memory
 * cache (5 minute TTL) keyed by the full query string.
 */

const DEFAULT_BASE_URL = "https://engineroom.gearswap.ai";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_AUTO_PAGES = 50; // safety bound for listParts auto-pagination

export interface CatalogPart {
  id: number;
  brand: string;
  modelSeries: string | null;
  model: string | null;
  partGroup: string | null;
  subgroup: string | null;
  partNumber: string;
  description: string | null;
  price: string | null;
  currency: string | null;
  supersessionPartNumber: string | null;
  supersessionInfo: string | null;
  quantity: number | null;
  diagramImagePath: string | null;
  diagramRefNumber: string | null;
  compatibility: Record<string, unknown> | null;
  hierarchyPath: string | null;
  sourceUrl: string | null;
  lastScrapedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CatalogListResponse {
  brand: string;
  total: number;
  offset: number;
  limit: number;
  parts: CatalogPart[];
}

export interface ListPartsOptions {
  brand?: string;
  model?: string;
  partNumber?: string;
  description?: string;
  limit?: number;
  offset?: number;
  /** Maximum total parts to return when auto-paginating (default: limit). */
  maxResults?: number;
}

export interface SearchByModelOptions {
  brand?: string;
  limit?: number;
  maxResults?: number;
}

function getBaseUrl(): string {
  return (process.env.PARTS_CATALOG_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function getAuthHeader(): Record<string, string> {
  const token = process.env.PARTS_CATALOG_API_TOKEN || process.env.SCRAPER_API_KEY;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface CacheEntry {
  expires: number;
  body: unknown;
}
const cache = new Map<string, CacheEntry>();

function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.body as T;
}

function cacheSet(key: string, body: unknown): void {
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, body });
}

export function clearPartsCatalogCache(): void {
  cache.clear();
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    usp.set(k, String(v));
  }
  return usp.toString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FetchResult {
  status: number;
  body: unknown;
}

async function rawFetch(path: string, query: string): Promise<FetchResult> {
  const url = `${getBaseUrl()}${path}${query ? `?${query}` : ""}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...getAuthHeader(),
      },
      signal: controller.signal,
    });
    if (res.status === 404) return { status: 404, body: null };
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    if (!res.ok) {
      const err = new Error(`Parts catalog HTTP ${res.status}: ${typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`);
      (err as any).status = res.status;
      throw err;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(path: string, query: string): Promise<FetchResult> {
  const cacheKey = `${path}?${query}`;
  const cached = cacheGet<FetchResult>(cacheKey);
  if (cached) return cached;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await rawFetch(path, query);
      cacheSet(cacheKey, result);
      return result;
    } catch (err: any) {
      lastErr = err;
      const status = err?.status as number | undefined;
      const transient = status === undefined || status >= 500;
      if (!transient || attempt === 1) break;
      await delay(500);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function fetchPage(opts: ListPartsOptions): Promise<CatalogListResponse | null> {
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = opts.offset ?? 0;
  const query = buildQuery({
    brand: opts.brand ?? "BMW",
    model: opts.model,
    partNumber: opts.partNumber,
    description: opts.description,
    limit,
    offset,
  });
  const result = await fetchWithRetry("/api/catalog-parts", query);
  if (result.status === 404 || result.body === null) return null;
  return result.body as CatalogListResponse;
}

/**
 * Look up a single part by exact part number. Returns null if not found.
 */
export async function lookupPart(partNumber: string, brand = "BMW"): Promise<CatalogPart | null> {
  if (!partNumber) return null;
  const page = await fetchPage({ brand, partNumber, limit: 1, offset: 0 });
  if (!page || !page.parts || page.parts.length === 0) return null;
  return page.parts[0];
}

/**
 * Search parts by exact model code (e.g. "G20"). Auto-paginates up to
 * `maxResults` (default: a single page, i.e. opts.limit ?? 100).
 */
export async function searchByModel(model: string, opts: SearchByModelOptions = {}): Promise<CatalogPart[]> {
  if (!model) return [];
  return listParts({
    brand: opts.brand ?? "BMW",
    model,
    limit: opts.limit,
    maxResults: opts.maxResults,
  });
}

/**
 * Generic paginated listing. Auto-paginates up to `maxResults`
 * (default: a single page). Returns [] when nothing matches.
 */
export async function listParts(opts: ListPartsOptions = {}): Promise<CatalogPart[]> {
  const pageSize = Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const cap = opts.maxResults ?? pageSize;
  const startOffset = opts.offset ?? 0;
  const out: CatalogPart[] = [];

  for (let page = 0; page < MAX_AUTO_PAGES; page++) {
    const offset = startOffset + page * pageSize;
    const remaining = cap - out.length;
    if (remaining <= 0) break;
    const limit = Math.min(pageSize, remaining);
    const resp = await fetchPage({
      brand: opts.brand,
      model: opts.model,
      partNumber: opts.partNumber,
      description: opts.description,
      limit,
      offset,
    });
    if (!resp) break;
    const parts = resp.parts ?? [];
    if (parts.length === 0) break;
    out.push(...parts);
    if (parts.length < limit) break;
    if (out.length >= resp.total) break;
  }
  return out;
}

export const __test = { buildQuery, cache };
