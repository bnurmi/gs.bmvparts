/**
 * Centralised per-scraper proxy routing layer (Task #175).
 *
 * Public surface:
 *   proxyFetch(scraper, url, opts?)  → Promise<string>   (HTML body)
 *   getProxyStatus(scraper)          → ProxyRouterStatus
 *   getProxyUsageStats()             → Promise<ProxyUsageStats>
 *   setProxyConfig(scraper, cfg)     → Promise<void>
 *
 * Four provider adapters are implemented here:
 *   evomiCore        — Evomi Core Residential (cheap, high-volume)
 *   evomiPremium     — Evomi Premium Residential (better success rate)
 *   oxylabsResidential — Oxylabs Residential proxy tunnel
 *   oxylabsWebscraper  — Oxylabs Realtime Scraper API (Cloudflare bypass)
 *
 * Routing defaults (overridable via proxy_provider_config DB table):
 *   etk              primary=evomi_core         backup=evomi_premium
 *   realoem          primary=oxylabs_webscraper backup=oxylabs_residential
 *   bimmerwork       primary=oxylabs_webscraper backup=oxylabs_residential
 *   vin_decoders     primary=evomi_core         backup=evomi_premium
 *   hash_discovery   primary=evomi_core         backup=evomi_premium
 *   bmw_firstparty   primary=evomi_core         backup=oxylabs_webscraper
 *   vindecoderz      primary=evomi_premium      backup=evomi_core
 */

import { createHash } from "crypto";
import { db } from "./storage";
import { proxyUsageLogs, proxyProviderConfig } from "@shared/schema";
import type { ProxyScraperName, ProxyProviderName, ProxyRole } from "@shared/schema";
import { eq, gte, sql } from "drizzle-orm";
import { HttpsProxyAgent } from "https-proxy-agent";
import { createRequire } from "module";

// node-fetch v2 (CJS) has no bundled TypeScript declarations.
// process.argv[1] is always a valid absolute path string in both ESM (tsx dev)
// and esbuild CJS prod output, making it a safe createRequire base in both envs.
const _require = createRequire(process.argv[1]);
interface NodeFetchInit {
  method?: string;
  headers?: Record<string, string>;
  agent?: HttpsProxyAgent<string> | (() => HttpsProxyAgent<string>);
  redirect?: "follow" | "manual" | "error";
  signal?: AbortSignal;
}
interface NodeFetchHeaders {
  get(name: string): string | null;
  /** Returns all values for each header name — node-fetch v2 specific. */
  raw(): Record<string, string[]>;
}
interface NodeFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  headers: NodeFetchHeaders;
}
const nodeFetch: (url: string, init?: NodeFetchInit) => Promise<NodeFetchResponse> = _require("node-fetch");

// ---------------------------------------------------------------------------
// Cost per GB in AUD for each provider
// ---------------------------------------------------------------------------
export const PROVIDER_COST_PER_GB: Record<ProxyProviderName, number> = {
  evomi_core: 0.49,
  evomi_premium: 5.00,
  oxylabs_residential: 7.00,
  oxylabs_webscraper: 150 / (220_000 / 100_000), // ~$150 / 220k results, estimated avg 100KB/result
  direct: 0,
};

// ---------------------------------------------------------------------------
// Default routing assignments
// ---------------------------------------------------------------------------
const DEFAULT_ROUTING: Record<ProxyScraperName, { primary: ProxyProviderName; backup: ProxyProviderName }> = {
  etk: { primary: "evomi_core", backup: "evomi_premium" },
  // realoem/bimmerwork are Cloudflare-protected; primary uses the Oxylabs
  // WebScraper API (cloud JS rendering). backup is the Oxylabs Residential
  // CONNECT tunnel — a genuinely different failure domain (different API,
  // different IP pool) so primary+backup do not share infrastructure.
  realoem: { primary: "oxylabs_webscraper", backup: "oxylabs_residential" },
  bimmerwork: { primary: "oxylabs_webscraper", backup: "oxylabs_residential" },
  vin_decoders: { primary: "evomi_core", backup: "evomi_premium" },
  hash_discovery: { primary: "evomi_core", backup: "evomi_premium" },
  // vindecoderz gets 403 through evomi_core; it requires the premium pool.
  // Routed separately from vin_decoders so other VIN sources (bvzine, mdecoder)
  // are not forced through premium when EVOMI_PREMIUM_PROXY_* is absent.
  vindecoderz: { primary: "evomi_premium", backup: "evomi_core" },
  // BMW's portal blocks the dedicated VM's outbound IP; route first-party BMW
  // traffic through evomi_core (residential) and fall back to oxylabs_webscraper.
  bmw_firstparty: { primary: "evomi_core", backup: "oxylabs_webscraper" },
};

// ---------------------------------------------------------------------------
// Config cache (TTL 5 minutes)
// ---------------------------------------------------------------------------
interface CachedConfig {
  primary: ProxyProviderName;
  backup: ProxyProviderName;
  loadedAt: number;
}
const configCache = new Map<string, CachedConfig>();
const CONFIG_TTL_MS = 5 * 60_000;

async function resolveConfig(scraper: ProxyScraperName): Promise<{ primary: ProxyProviderName; backup: ProxyProviderName }> {
  const cached = configCache.get(scraper);
  if (cached && Date.now() - cached.loadedAt < CONFIG_TTL_MS) {
    return { primary: cached.primary, backup: cached.backup };
  }
  try {
    const [row] = await db.select().from(proxyProviderConfig).where(eq(proxyProviderConfig.scraper, scraper)).limit(1);
    if (row) {
      const cfg = { primary: row.primaryProvider as ProxyProviderName, backup: row.backupProvider as ProxyProviderName };
      configCache.set(scraper, { ...cfg, loadedAt: Date.now() });
      return cfg;
    }
  } catch {
    // DB not available yet (startup) — fall through to defaults
  }
  const def = DEFAULT_ROUTING[scraper];
  configCache.set(scraper, { ...def, loadedAt: Date.now() });
  return def;
}

export async function setProxyConfig(scraper: ProxyScraperName, primary: ProxyProviderName, backup: ProxyProviderName): Promise<void> {
  await db.insert(proxyProviderConfig)
    .values({ scraper, primaryProvider: primary, backupProvider: backup })
    .onConflictDoUpdate({
      target: proxyProviderConfig.scraper,
      set: { primaryProvider: primary, backupProvider: backup, updatedAt: new Date() },
    });
  configCache.set(scraper, { primary, backup, loadedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// In-memory per-scraper status (which provider is currently succeeding)
// ---------------------------------------------------------------------------
type ActiveRole = "primary" | "fallback" | "down";
const scraperStatus = new Map<string, { role: ActiveRole; provider: ProxyProviderName; since: number }>();

export interface ProxyRouterStatus {
  scraper: string;
  primaryProvider: ProxyProviderName;
  backupProvider: ProxyProviderName;
  activeRole: ActiveRole;
  activeProvider: ProxyProviderName;
  since: number;
}

export async function getProxyStatus(scraper: ProxyScraperName): Promise<ProxyRouterStatus> {
  const cfg = await resolveConfig(scraper);
  const st = scraperStatus.get(scraper);
  return {
    scraper,
    primaryProvider: cfg.primary,
    backupProvider: cfg.backup,
    activeRole: st?.role ?? "primary",
    activeProvider: st?.provider ?? cfg.primary,
    since: st?.since ?? Date.now(),
  };
}

export async function getAllProxyStatuses(): Promise<ProxyRouterStatus[]> {
  const scrapers: ProxyScraperName[] = ["etk", "realoem", "bimmerwork", "vin_decoders", "hash_discovery", "bmw_firstparty", "vindecoderz"];
  return Promise.all(scrapers.map(s => getProxyStatus(s)));
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

async function logRequest(
  scraper: string,
  provider: ProxyProviderName,
  role: ProxyRole,
  url: string,
  bytes: number,
  success: boolean,
  durationMs: number,
): Promise<void> {
  try {
    await db.insert(proxyUsageLogs).values({
      scraper,
      provider,
      role,
      urlHash: hashUrl(url),
      bytes,
      success,
      durationMs,
    });
  } catch (err) {
    console.warn(`[ProxyRouter] Failed to log request: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Provider adapters
// ---------------------------------------------------------------------------

const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Shared proxy-tunnel fetch (used by evomiCore, evomiPremium, oxylabsResidential)
let _evomiCoreAgent: HttpsProxyAgent<string> | null = null;
let _evomiCoreKey = "";
let _evomiPremiumAgent: HttpsProxyAgent<string> | null = null;
let _evomiPremiumKey = "";
let _oxylabsResAgent: HttpsProxyAgent<string> | null = null;
let _oxylabsResKey = "";

function buildTunnelAgent(url: string): HttpsProxyAgent<string> {
  return new HttpsProxyAgent(url, { keepAlive: true });
}

function getEvomiCoreAgent(): HttpsProxyAgent<string> {
  const host = (process.env.EVOMI_PROXY_HOST || "").trim();
  const port = (process.env.EVOMI_PROXY_PORT || "").trim();
  const user = (process.env.EVOMI_PROXY_USERNAME || "").trim();
  const pass = process.env.EVOMI_PROXY_PASSWORD || "";
  if (!host || !port || !user || !pass) throw new Error("Evomi Core proxy not configured (EVOMI_PROXY_HOST / EVOMI_PROXY_PORT / EVOMI_PROXY_USERNAME / EVOMI_PROXY_PASSWORD)");
  const scheme = (process.env.EVOMI_PROXY_SCHEME || "https").toLowerCase() === "http" ? "http" : "https";
  const key = `${scheme}://${host}:${port}:${user}`;
  if (key !== _evomiCoreKey || !_evomiCoreAgent) {
    _evomiCoreAgent = buildTunnelAgent(`${scheme}://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`);
    _evomiCoreKey = key;
  }
  return _evomiCoreAgent!;
}

function getEvomiPremiumAgent(): HttpsProxyAgent<string> {
  const host = (process.env.EVOMI_PREMIUM_PROXY_HOST || "").trim();
  const port = (process.env.EVOMI_PREMIUM_PROXY_PORT || "").trim();
  const user = (process.env.EVOMI_PREMIUM_PROXY_USERNAME || "").trim();
  const pass = process.env.EVOMI_PREMIUM_PROXY_PASSWORD || "";
  if (!host || !port || !user || !pass) throw new Error("Evomi Premium proxy not configured (EVOMI_PREMIUM_PROXY_HOST / EVOMI_PREMIUM_PROXY_PORT / EVOMI_PREMIUM_PROXY_USERNAME / EVOMI_PREMIUM_PROXY_PASSWORD)");
  const scheme = "https";
  const key = `${scheme}://${host}:${port}:${user}`;
  if (key !== _evomiPremiumKey || !_evomiPremiumAgent) {
    _evomiPremiumAgent = buildTunnelAgent(`${scheme}://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`);
    _evomiPremiumKey = key;
  }
  return _evomiPremiumAgent!;
}

function getOxylabsResidentialAgent(): HttpsProxyAgent<string> {
  const host = (process.env.OXYLABS_PROXY_HOST || "").trim();
  const port = (process.env.OXYLABS_PROXY_PORT || "1000").trim();
  const user = (process.env.OXYLABS_USERNAME || "").trim();
  const pass = process.env.OXYLABS_PASSWORD || "";
  if (!host || !user || !pass) throw new Error("Oxylabs Residential proxy not configured (OXYLABS_PROXY_HOST / OXYLABS_USERNAME / OXYLABS_PASSWORD)");
  const key = `https://${host}:${port}:${user}`;
  if (key !== _oxylabsResKey || !_oxylabsResAgent) {
    _oxylabsResAgent = buildTunnelAgent(`https://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`);
    _oxylabsResKey = key;
  }
  return _oxylabsResAgent!;
}

interface TunnelResult { body: string; setCookies: string[] }

async function fetchViaTunnel(
  agent: HttpsProxyAgent<string>,
  url: string,
  timeoutMs: number,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  return (await fetchViaTunnelFull(agent, url, timeoutMs, extraHeaders)).body;
}

async function fetchViaTunnelFull(
  agent: HttpsProxyAgent<string>,
  url: string,
  timeoutMs: number,
  extraHeaders?: Record<string, string>,
): Promise<TunnelResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const init: NodeFetchInit = {
      method: "GET",
      headers: {
        "User-Agent": DEFAULT_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        ...extraHeaders,
      },
      agent: () => agent,
      redirect: "follow",
      signal: ctrl.signal,
    };
    const res = await nodeFetch(url, init);
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    // Collect Set-Cookie response headers (node-fetch v2 Headers.raw() returns string[])
    const setCookies: string[] = res.headers.raw()["set-cookie"] || [];
    return { body, setCookies };
  } finally {
    clearTimeout(t);
  }
}

async function adapterEvomiCore(url: string, timeoutMs: number, extraHeaders?: Record<string, string>): Promise<string> {
  return fetchViaTunnel(getEvomiCoreAgent(), url, timeoutMs, extraHeaders);
}
async function adapterEvomiCoreFull(url: string, timeoutMs: number, extraHeaders?: Record<string, string>): Promise<TunnelResult> {
  return fetchViaTunnelFull(getEvomiCoreAgent(), url, timeoutMs, extraHeaders);
}

async function adapterEvomiPremium(url: string, timeoutMs: number, extraHeaders?: Record<string, string>): Promise<string> {
  return fetchViaTunnel(getEvomiPremiumAgent(), url, timeoutMs, extraHeaders);
}
async function adapterEvomiPremiumFull(url: string, timeoutMs: number, extraHeaders?: Record<string, string>): Promise<TunnelResult> {
  return fetchViaTunnelFull(getEvomiPremiumAgent(), url, timeoutMs, extraHeaders);
}

// Oxylabs Residential is a genuine proxy tunnel — always a plain CONNECT tunnel,
// distinct from the Webscraper API used as primary for CF-protected scrapers.
// Provides a different failure domain: when the Webscraper API endpoint is down,
// the residential pool still routes independently. Does not render JS.
async function adapterOxylabsResidential(url: string, timeoutMs: number, extraHeaders?: Record<string, string>): Promise<string> {
  return fetchViaTunnel(getOxylabsResidentialAgent(), url, timeoutMs, extraHeaders);
}

const OXYLABS_ENDPOINT = "https://realtime.oxylabs.io/v1/queries";

async function adapterOxylabsWebscraper(url: string, timeoutMs: number): Promise<string> {
  const user = (process.env.OXYLABS_USERNAME || "").trim();
  const pass = process.env.OXYLABS_PASSWORD || "";
  if (!user || !pass) throw new Error("Oxylabs Webscraper API not configured (OXYLABS_USERNAME / OXYLABS_PASSWORD)");
  const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  const res = await fetch(OXYLABS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": auth },
    body: JSON.stringify({ source: "universal", url, user_agent_type: "desktop_chrome" }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Oxylabs HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  interface OxylabsResponse { results?: Array<{ content?: string; status_code?: number }> }
  const data = await res.json() as OxylabsResponse;
  const result = data?.results?.[0];
  if (!result?.content) throw new Error("Oxylabs returned no content");
  if (result.status_code && result.status_code >= 400) throw new Error(`Oxylabs target returned HTTP ${result.status_code}`);
  return String(result.content);
}

async function adapterDirect(url: string, timeoutMs: number, method: "GET" | "HEAD" = "GET"): Promise<string> {
  const res = await fetch(url, {
    method,
    headers: {
      "User-Agent": DEFAULT_UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Direct HTTP ${res.status}`);
  return method === "HEAD" ? "" : res.text();
}

async function runProvider(provider: ProxyProviderName, url: string, opts: ProxyFetchOpts): Promise<string> {
  const to = opts.timeoutMs ?? 60_000;
  const h = opts.extraHeaders;
  switch (provider) {
    case "evomi_core": return adapterEvomiCore(url, to, h);
    case "evomi_premium": return adapterEvomiPremium(url, to, h);
    case "oxylabs_residential": return adapterOxylabsResidential(url, to, h);
    case "oxylabs_webscraper": return adapterOxylabsWebscraper(url, to);
    case "direct": return adapterDirect(url, to, opts.method);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}

async function runProviderFull(provider: ProxyProviderName, url: string, opts: ProxyFetchOpts): Promise<TunnelResult> {
  const to = opts.timeoutMs ?? 60_000;
  const h = opts.extraHeaders;
  switch (provider) {
    case "evomi_core": return adapterEvomiCoreFull(url, to, h);
    case "evomi_premium": return adapterEvomiPremiumFull(url, to, h);
    // Residential is a plain CONNECT tunnel — different failure domain from the primary
    // WebScraper API endpoint. Does not render JS; used for provider diversity.
    case "oxylabs_residential": return { body: await adapterOxylabsResidential(url, to, h), setCookies: [] };
    case "oxylabs_webscraper": return { body: await adapterOxylabsWebscraper(url, to), setCookies: [] };
    case "direct": return { body: await adapterDirect(url, to), setCookies: [] };
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}

// ---------------------------------------------------------------------------
// Public proxyFetch / proxyFetchFull
// ---------------------------------------------------------------------------

export interface ProxyFetchOpts {
  timeoutMs?: number;
  /**
   * HTTP method for the `direct` adapter (primary for bmw_firstparty).
   * Defaults to "GET". Use "HEAD" for existence probes (e.g. CDN image checks).
   * Tunnel adapters always use GET internally.
   */
  method?: "GET" | "HEAD";
  /**
   * Signals that the target is Cloudflare-protected and JS rendering is needed.
   * For realoem/bimmerwork, the primary oxylabs_webscraper always renders.
   * The backup oxylabs_residential is a plain tunnel (distinct failure domain)
   * and does not render — this is intentional for provider diversity. render is
   * kept in opts for caller documentation; it does not change adapter selection.
   */
  render?: boolean;
  /** Additional request headers forwarded to tunnel providers (evomi/oxylabs-residential). */
  extraHeaders?: Record<string, string>;
}

export interface ProxyFetchFullResult {
  body: string;
  /** Set-Cookie response headers (tunnel providers only; empty for Webscraper API). */
  setCookies: string[];
}

export async function proxyFetch(scraper: ProxyScraperName, url: string, opts: ProxyFetchOpts = {}): Promise<string> {
  const cfg = await resolveConfig(scraper);
  const start = Date.now();
  let html: string | null = null;
  let usedProvider: ProxyProviderName = cfg.primary;
  let usedRole: ProxyRole = "primary";
  let success = false;

  try {
    html = await runProvider(cfg.primary, url, opts);
    success = true;
    usedProvider = cfg.primary;
    usedRole = "primary";
    scraperStatus.set(scraper, { role: "primary", provider: cfg.primary, since: Date.now() });
  } catch (primaryErr: any) {
    console.warn(`[ProxyRouter] ${scraper} primary (${cfg.primary}) failed for ${url}: ${primaryErr.message}. Trying backup (${cfg.backup})...`);
    await logRequest(scraper, cfg.primary, "primary", url, 0, false, Date.now() - start);
    const backupStart = Date.now();
    try {
      html = await runProvider(cfg.backup, url, opts);
      success = true;
      usedProvider = cfg.backup;
      usedRole = "backup";
      scraperStatus.set(scraper, { role: "fallback", provider: cfg.backup, since: Date.now() });
      await logRequest(scraper, cfg.backup, "backup", url, Buffer.byteLength(html, "utf8"), true, Date.now() - backupStart);
    } catch (backupErr: any) {
      scraperStatus.set(scraper, { role: "down", provider: cfg.backup, since: Date.now() });
      await logRequest(scraper, cfg.backup, "backup", url, 0, false, Date.now() - backupStart);
      throw new Error(`[ProxyRouter] ${scraper}: both providers failed. Primary (${cfg.primary}): ${primaryErr.message}. Backup (${cfg.backup}): ${backupErr.message}`);
    }
    return html!;
  }

  const bytes = html ? Buffer.byteLength(html, "utf8") : 0;
  await logRequest(scraper, usedProvider, usedRole, url, bytes, success, Date.now() - start);
  return html!;
}

/**
 * Like proxyFetch but also returns Set-Cookie response headers (evomi/residential
 * tunnel providers only). Used by scrapers that need cookie-jar tracking (e.g.
 * fetchMdecoderPage's "Please Wait" challenge flow).
 */
export async function proxyFetchFull(
  scraper: ProxyScraperName,
  url: string,
  opts: ProxyFetchOpts = {},
): Promise<ProxyFetchFullResult> {
  const cfg = await resolveConfig(scraper);
  const start = Date.now();
  let result: TunnelResult | null = null;
  let usedProvider: ProxyProviderName = cfg.primary;
  let usedRole: ProxyRole = "primary";
  let success = false;

  try {
    result = await runProviderFull(cfg.primary, url, opts);
    success = true;
    scraperStatus.set(scraper, { role: "primary", provider: cfg.primary, since: Date.now() });
  } catch (primaryErr: any) {
    console.warn(`[ProxyRouter] ${scraper} primary (${cfg.primary}) failed: ${primaryErr.message}. Trying backup (${cfg.backup})...`);
    await logRequest(scraper, cfg.primary, "primary", url, 0, false, Date.now() - start);
    const backupStart = Date.now();
    try {
      result = await runProviderFull(cfg.backup, url, opts);
      success = true;
      usedProvider = cfg.backup;
      usedRole = "backup";
      scraperStatus.set(scraper, { role: "fallback", provider: cfg.backup, since: Date.now() });
      await logRequest(scraper, cfg.backup, "backup", url, Buffer.byteLength(result.body, "utf8"), true, Date.now() - backupStart);
    } catch (backupErr: any) {
      scraperStatus.set(scraper, { role: "down", provider: cfg.backup, since: Date.now() });
      await logRequest(scraper, cfg.backup, "backup", url, 0, false, Date.now() - backupStart);
      throw new Error(`[ProxyRouter] ${scraper}: both providers failed. Primary: ${primaryErr.message}. Backup: ${backupErr.message}`);
    }
    return { body: result!.body, setCookies: result!.setCookies };
  }

  const bytes = result ? Buffer.byteLength(result.body, "utf8") : 0;
  await logRequest(scraper, usedProvider, usedRole, url, bytes, success, Date.now() - start);
  return { body: result!.body, setCookies: result!.setCookies };
}

// ---------------------------------------------------------------------------
// Usage stats (aggregated from proxy_usage_logs)
// ---------------------------------------------------------------------------

export interface ProxyWindowStats {
  requests: number;
  bytes: number;
  successRate: number;
  estimatedAud: number;
  byProvider: Record<string, { requests: number; bytes: number; estimatedAud: number }>;
}

export interface ProxyScraperUsage {
  scraper: string;
  primaryProvider: ProxyProviderName;
  backupProvider: ProxyProviderName;
  windows: {
    "1h": ProxyWindowStats;
    "12h": ProxyWindowStats;
    "24h": ProxyWindowStats;
    "7d": ProxyWindowStats;
    "30d": ProxyWindowStats;
  };
}

const WINDOWS = [
  { key: "1h", ms: 60 * 60_000 },
  { key: "12h", ms: 12 * 60 * 60_000 },
  { key: "24h", ms: 24 * 60 * 60_000 },
  { key: "7d", ms: 7 * 24 * 60 * 60_000 },
  { key: "30d", ms: 30 * 24 * 60 * 60_000 },
] as const;

export async function getProxyUsageStats(): Promise<ProxyScraperUsage[]> {
  const scrapers: ProxyScraperName[] = ["etk", "realoem", "bimmerwork", "vin_decoders", "hash_discovery", "bmw_firstparty"];
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60_000);

  let rows: Array<{
    scraper: string;
    provider: string;
    success: boolean;
    bytes: number;
    created_at: Date;
  }> = [];
  try {
    const result = await db.execute(sql`
      SELECT scraper, provider, success, bytes, created_at
      FROM proxy_usage_logs
      WHERE created_at >= ${cutoff30d}
      ORDER BY created_at
    `);
    type LogRow = { scraper: string; provider: string; success: boolean; bytes: number; created_at: Date };
    rows = ((result as unknown as { rows?: LogRow[] }).rows ?? []);
  } catch {
    // Table may not exist yet on first boot
  }

  const now = Date.now();
  const result: ProxyScraperUsage[] = [];

  for (const scraper of scrapers) {
    const cfg = await resolveConfig(scraper);
    const scraperRows = rows.filter(r => r.scraper === scraper);

    const windows: Record<string, ProxyWindowStats> = {};
    for (const w of WINDOWS) {
      const cutoff = now - w.ms;
      const wRows = scraperRows.filter(r => new Date(r.created_at).getTime() >= cutoff);
      const totalRequests = wRows.length;
      const successRows = wRows.filter(r => r.success);
      const totalBytes = wRows.reduce((s, r) => s + (r.bytes || 0), 0);
      const successRate = totalRequests > 0 ? successRows.length / totalRequests : 1;

      // Per-provider breakdown: requests, bytes, estimated cost
      const provMap = new Map<string, { requests: number; bytes: number }>();
      for (const r of wRows) {
        const existing = provMap.get(r.provider) ?? { requests: 0, bytes: 0 };
        provMap.set(r.provider, { requests: existing.requests + 1, bytes: existing.bytes + (r.bytes || 0) });
      }
      let estimatedAud = 0;
      const byProvider: Record<string, { requests: number; bytes: number; estimatedAud: number }> = {};
      for (const [prov, stats] of Array.from(provMap.entries())) {
        const costPerGb = PROVIDER_COST_PER_GB[prov as ProxyProviderName] ?? 0;
        const provAud = (stats.bytes / 1_073_741_824) * costPerGb;
        estimatedAud += provAud;
        byProvider[prov] = { requests: stats.requests, bytes: stats.bytes, estimatedAud: provAud };
      }
      windows[w.key] = { requests: totalRequests, bytes: totalBytes, successRate, estimatedAud, byProvider };
    }

    result.push({ scraper, primaryProvider: cfg.primary, backupProvider: cfg.backup, windows: windows as ProxyScraperUsage["windows"] });
  }

  return result;
}
