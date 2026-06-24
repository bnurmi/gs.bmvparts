import { proxyFetch, proxyFetchFull } from "./proxy-router";

export interface BimmerWorkVehicle {
  vin: string;
  codeType: string | null;
  chassis: string | null;
  market: string | null;
  engine: string | null;
  drivetrain: string | null;
  transmission: string | null;
  color: string | null;
  colorCode: string | null;
  upholstery: string | null;
  upholsteryCode: string | null;
  startOfProduction: string | null;
  manufacturer: string | null;
  modelName: string | null;
}

export interface BimmerWorkOption {
  code: string;
  nameEn: string;
  nameDe: string;
  imageUrl: string | null;
}

export interface BimmerWorkImages {
  exteriorUrl: string | null;
  interiorUrl: string | null;
  exterior360Urls: string[];
}

export interface BimmerWorkManual {
  number: string;
  language: string;
  date: string;
  downloadUrl: string;
}

export interface BimmerWorkData {
  hash: string;
  vehicle: BimmerWorkVehicle | null;
  options: BimmerWorkOption[];
  images: BimmerWorkImages | null;
  manuals: BimmerWorkManual[];
  sourceUrl: string;
  fetchedAt: string;
}

const cache = new Map<string, { data: BimmerWorkData; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

const BATCH_INTERVAL = 60_000;
interface QueueEntry {
  vin: string;
  addedAt: number;
  status: "pending" | "processing" | "found" | "not_found";
  attempts: number;
}
const vinQueue = new Map<string, QueueEntry>();
let batchTimer: ReturnType<typeof setInterval> | null = null;
let lastBatchRun = Date.now();
let batchRunning = false;

export function queueVinForBatch(vin: string): QueueEntry {
  const clean = vin.toUpperCase().replace(/[\s\-]/g, "");
  const existing = vinQueue.get(clean);
  if (existing && (existing.status === "pending" || existing.status === "processing")) {
    return existing;
  }
  if (cache.has(clean) && Date.now() - cache.get(clean)!.timestamp < CACHE_TTL) {
    return { vin: clean, addedAt: Date.now(), status: "found", attempts: 0 };
  }
  const entry: QueueEntry = { vin: clean, addedAt: Date.now(), status: "pending", attempts: 0 };
  vinQueue.set(clean, entry);
  return entry;
}

export function getVinQueueStatus(vin: string): { status: string; nextBatchIn: number; attempts: number } {
  const clean = vin.toUpperCase().replace(/[\s\-]/g, "");
  const entry = vinQueue.get(clean);
  const elapsed = Date.now() - lastBatchRun;
  const nextBatchIn = Math.max(0, BATCH_INTERVAL - elapsed);
  if (!entry) return { status: "not_queued", nextBatchIn, attempts: 0 };
  return { status: entry.status, nextBatchIn, attempts: entry.attempts };
}

async function processBatch() {
  if (batchRunning) return;
  batchRunning = true;
  lastBatchRun = Date.now();

  try {
    const pending = [...vinQueue.entries()]
      .filter(([, e]) => e.status === "pending" && e.attempts < 3)
      .slice(0, 5);

    for (const [vin, entry] of pending) {
      entry.status = "processing";
      entry.attempts++;
      try {
        // Route through the first-party orchestrator. ETK-covered VINs
        // never touch bimmer.work; modern VINs fall through to the
        // legacy scraper here. Dynamic import avoids a circular ref
        // (the orchestrator imports this module).
        const { enrichVin } = await import("./vin-enrichment-service");
        const result = await enrichVin(vin);
        if (result?.data) {
          entry.status = "found";
          console.log(`[VIN Batch] Enriched ${vin} via ${JSON.stringify(result.enrichmentSource)}`);
        } else {
          entry.status = entry.attempts >= 3 ? "not_found" : "pending";
          console.log(`[VIN Batch] No data for ${vin} (attempt ${entry.attempts}/3)`);
        }
      } catch (err) {
        entry.status = entry.attempts >= 3 ? "not_found" : "pending";
        console.error(`[VIN Batch] Error processing ${vin}:`, err);
      }
      await delay(2000);
    }

    for (const [vin, entry] of vinQueue.entries()) {
      if (entry.status === "found" || entry.status === "not_found") {
        if (Date.now() - entry.addedAt > 10 * 60_000) {
          vinQueue.delete(vin);
        }
      }
    }
  } finally {
    batchRunning = false;
  }
}

export function startBatchProcessor() {
  if (batchTimer) return;
  lastBatchRun = Date.now();
  batchTimer = setInterval(processBatch, BATCH_INTERVAL);
  console.log("[VIN Batch] Processor started (interval: 60s)");
}

export function stopBatchProcessor() {
  if (batchTimer) {
    clearInterval(batchTimer);
    batchTimer = null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&#8239;/g, " ").trim();
}

function extractCode(text: string): string | null {
  const m = text.match(/\(([A-Z0-9]+)\)\s*$/);
  return m ? m[1] : null;
}

function scrapeVehicleFromHtml(html: string, vin: string): BimmerWorkVehicle {
  const rows: Record<string, string> = {};

  const trBlocks = html.split(/<tr>/g);
  for (const block of trBlocks) {
    const thMatch = block.match(/<th[^>]*>([\s\S]*?)<\/th>/);
    const tdMatch = block.match(/<td[^>]*>([\s\S]*?)<\/td>/);
    if (thMatch && tdMatch) {
      const key = stripHtml(thMatch[1]);
      const rawVal = tdMatch[1];
      const codeMatch = rawVal.match(/<code>([^<]+)<\/code>/);
      let val = stripHtml(rawVal);
      if (key && val && !val.includes("car report") && !val.includes("carvertical") && !val.includes("Donate") && !val.includes("mileage")) {
        rows[key] = val;
      }
    }
  }

  const modelMatch = html.match(/<h2[^>]*>(?:<a[^>]*>)?((?:BMW|MINI|Rolls[\s-]Royce|ALPINA)\s*(?:&nbsp;)*[^<]+)/i);
  const modelName = modelMatch ? modelMatch[1].replace(/&nbsp;/g, " ").trim() : null;

  const colorRaw = rows["Color"] || null;
  const upholsteryRaw = rows["Upholstery"] || null;

  return {
    vin,
    codeType: rows["Code / Type"] || null,
    chassis: rows["Chassis"] || null,
    market: rows["Market"] || null,
    engine: rows["Engine"] || null,
    drivetrain: rows["Drivetrain"] || null,
    transmission: rows["Transmission"] || null,
    color: colorRaw ? colorRaw.replace(/\s*\([A-Z0-9]+\)\s*$/, "").trim() : null,
    colorCode: colorRaw ? extractCode(colorRaw) : null,
    upholstery: upholsteryRaw ? upholsteryRaw.replace(/\s*\([A-Z0-9]+\)\s*$/, "").trim() : null,
    upholsteryCode: upholsteryRaw ? extractCode(upholsteryRaw) : null,
    startOfProduction: rows["Start of Production"] || null,
    manufacturer: rows["Manufacturer"] || null,
    modelName,
  };
}

function scrapeOptionsFromHtml(html: string): BimmerWorkOption[] {
  const options: BimmerWorkOption[] = [];

  const pattern = /<img\s+src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>\s*(?:<\/td>)?\s*<td><b>([^<]+)<\/b><br>\s*\n?(.*?)<br>\s*\n?(.*?)<\/td>/gs;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const imageUrl = match[1];
    const code = match[3].trim();
    const nameEn = stripHtml(match[4]);
    const nameDe = stripHtml(match[5]);

    if (code.includes("carvertical") || code.includes("report")) continue;

    options.push({
      code,
      nameEn,
      nameDe,
      imageUrl: imageUrl.includes("000.png") ? null : `https://bimmer.work${imageUrl}`,
    });
  }
  return options;
}

function scrapeImagesFromHtml(html: string, hash: string): BimmerWorkImages {
  let exteriorUrl: string | null = null;
  const extMatch = html.match(/src="([^"]*exterior\.png)"/);
  if (extMatch) {
    exteriorUrl = extMatch[1].startsWith("http") ? extMatch[1] : `https://bimmer.work${extMatch[1]}`;
  }

  let interiorUrl: string | null = null;
  const intMatch = html.match(/src="([^"]*interior\.png)"/);
  if (intMatch) {
    interiorUrl = intMatch[1].startsWith("http") ? intMatch[1] : `https://bimmer.work${intMatch[1]}`;
  }

  const exterior360Urls: string[] = [];
  const frame360Match = html.match(/data-images="([^"]+)"/);
  if (frame360Match) {
    const dataImages = frame360Match[1];
    const pipeIdx = dataImages.indexOf("|");
    if (pipeIdx !== -1) {
      const urlTemplate = dataImages.substring(0, pipeIdx);
      const rangeStr = dataImages.substring(pipeIdx + 1);
      const rangeMatch = rangeStr.match(/(\d+)\.\.(\d+)/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1]);
        const end = parseInt(rangeMatch[2]);
        for (let i = start; i <= end; i++) {
          const frame = String(i).padStart(2, "0");
          const url = urlTemplate.replace(/##/, frame);
          exterior360Urls.push(url.startsWith("http") ? url : `https://bimmer.work${url}`);
        }
      }
    }
  }

  return { exteriorUrl, interiorUrl, exterior360Urls };
}

function scrapeManualsFromHtml(html: string): BimmerWorkManual[] {
  const manuals: BimmerWorkManual[] = [];

  const pattern = /<td><a\s+href="([^"]*)"[^>]*>([^<]+)<\/a><\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const downloadUrl = match[1].trim();
    const filename = match[2].trim();
    const language = match[3].trim();
    const date = match[4].trim();

    if (!downloadUrl || downloadUrl.includes("carvertical")) continue;

    manuals.push({
      downloadUrl,
      number: filename,
      language,
      date,
    });
  }
  return manuals;
}

async function searchEngineForHash(name: string, url: string): Promise<string | null> {
  try {
    const html = await proxyFetch("hash_discovery", url, { timeoutMs: 10_000 });
    const hashMatch = html.match(/bimmer\.work\/vin\/([a-z0-9]{20,50})/);
    if (hashMatch) {
      console.log(`[BW Hash] Found via ${name}: ${hashMatch[1]}`);
      return hashMatch[1];
    }
  } catch {
    console.log(`[BW Hash] ${name} search failed`);
  }
  return null;
}

async function tryMdecoderFallback(vin: string): Promise<string | null> {
  try {
    const html = await proxyFetch("vin_decoders", `https://www.mdecoder.com/decode/${vin}`, { timeoutMs: 10_000 });
    const hashMatch = html.match(/bimmer\.work\/vin\/([a-z0-9]{20,50})/);
    if (hashMatch) {
      console.log(`[BW Hash] Found via mdecoder: ${hashMatch[1]}`);
      return hashMatch[1];
    }
  } catch {
    console.log("[BW Hash] mdecoder fallback failed");
  }
  return null;
}

async function tryBvzineFallback(vin: string): Promise<string | null> {
  try {
    const html = await proxyFetch("vin_decoders", `https://decoder.bvzine.com/decode/${vin}`, { timeoutMs: 10_000 });
    const hashMatch = html.match(/bimmer\.work\/vin\/([a-z0-9]{20,50})/);
    if (hashMatch) {
      console.log(`[BW Hash] Found via bvzine: ${hashMatch[1]}`);
      return hashMatch[1];
    }
    console.log(`[BW Hash] bvzine returned no hash for ${vin} (body length: ${html.length})`);
  } catch (err: any) {
    console.log(`[BW Hash] bvzine fallback failed for ${vin}: ${err.message}`);
  }
  return null;
}

export async function discoverBimmerWorkHash(vin: string): Promise<string | null> {
  const cleanVin = vin.toUpperCase().replace(/[\s\-]/g, "");
  if (cleanVin.length !== 17) return null;

  const googleUrl = `https://www.google.com/search?q=site:bimmer.work+${encodeURIComponent(cleanVin)}`;
  const result1 = await searchEngineForHash("Google", googleUrl);
  if (result1) return result1;

  const bingUrl = `https://www.bing.com/search?q=site:bimmer.work+${encodeURIComponent(cleanVin)}`;
  const result2 = await searchEngineForHash("Bing", bingUrl);
  if (result2) return result2;

  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanVin)}+site%3Abimmer.work`;
  const result3 = await searchEngineForHash("DuckDuckGo", ddgUrl);
  if (result3) return result3;

  const [mdecoderResult, bvzineResult] = await Promise.all([
    tryMdecoderFallback(cleanVin),
    tryBvzineFallback(cleanVin),
  ]);
  if (mdecoderResult) return mdecoderResult;
  if (bvzineResult) return bvzineResult;

  console.log(`[BW Hash] All discovery methods failed for ${cleanVin}`);
  return null;
}

// Routes through proxy-router (vin_decoders → evomi tunnel).
// Cookie-jar tracking is restored via proxyFetchFull: we send the accumulated
// session cookies in the Cookie request header and extract new Set-Cookie headers
// from the response, maintaining the "Please Wait" challenge session across hops.
async function fetchMdecoderPage(url: string, cookieJar: string[]): Promise<{ html: string; cookies: string[] } | null> {
  try {
    const extraHeaders: Record<string, string> = {};
    if (cookieJar.length) extraHeaders["Cookie"] = cookieJar.join("; ");
    const { body: html, setCookies } = await proxyFetchFull("vin_decoders", url, {
      timeoutMs: 20_000,
      extraHeaders,
    });
    // Merge new Set-Cookie values into the jar (name=value portion only)
    const updatedJar = [...cookieJar];
    for (const c of setCookies) {
      const pair = c.split(";")[0];
      if (pair) {
        const name = pair.split("=")[0];
        const idx = updatedJar.findIndex(e => e.startsWith(name + "="));
        if (idx >= 0) updatedJar[idx] = pair;
        else updatedJar.push(pair);
      }
    }
    return { html, cookies: updatedJar };
  } catch {
    return null;
  }
}

async function fetchMdecoderData(vin: string): Promise<BimmerWorkData | null> {
  const cleanVin = vin.toUpperCase().replace(/[\s\-]/g, "");
  console.log(`[mdecoder] Fetching data for ${cleanVin}`);

  const url = `https://www.mdecoder.com/decode/${cleanVin.toLowerCase()}`;

  try {
    const r1 = await fetchMdecoderPage(url, []);
    if (!r1) { console.log("[mdecoder] Initial request failed"); return null; }

    if (!r1.html.includes("Please Wait")) {
      return parseMdecoderHtml(r1.html, cleanVin, url);
    }

    console.log(`[mdecoder] Waiting 18s for data to be ready...`);
    await delay(18000);

    const r2 = await fetchMdecoderPage(url, r1.cookies);
    if (!r2) { console.log("[mdecoder] Second request failed"); return null; }

    if (!r2.html.includes("Please Wait")) {
      return parseMdecoderHtml(r2.html, cleanVin, url);
    }

    console.log(`[mdecoder] Still waiting, retrying in 15s...`);
    await delay(15000);

    const r3 = await fetchMdecoderPage(url, r2.cookies);
    if (!r3) { console.log("[mdecoder] Third request failed"); return null; }

    if (r3.html.includes("Please Wait")) {
      console.log(`[mdecoder] Timed out waiting for data`);
      return null;
    }
    return parseMdecoderHtml(r3.html, cleanVin, url);
  } catch (err) {
    console.error(`[mdecoder] Error fetching data:`, err);
    return null;
  }
}

function parseMdecoderHtml(html: string, vin: string, sourceUrl: string): BimmerWorkData | null {
  const fields: Record<string, string> = {};

  const tdPattern1 = /<td\s+class="strong"[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/gi;
  let m;
  while ((m = tdPattern1.exec(html)) !== null) {
    fields[m[1].trim()] = m[2].trim();
  }

  const tdPattern2 = /<td\s+class=["']strong["'][^>]*>\s*([^<]+?)\s*<\/td>[^<]*<td[^>]*>\s*([^<]+?)\s*<\/td>/gi;
  while ((m = tdPattern2.exec(html)) !== null) {
    const key = m[1].trim();
    if (!fields[key]) fields[key] = m[2].trim();
  }

  if (!fields["Type"] && !fields["Series"]) {
    console.log(`[mdecoder] No vehicle data found in response (${Object.keys(fields).length} fields parsed)`);
    return null;
  }

  const seriesRaw = fields["Series"] || "";
  const chassisMatch = seriesRaw.match(/([A-Z]\d{2})/);
  const chassis = chassisMatch ? chassisMatch[1] : null;

  const modelType = fields["Type"] || null;

  const vehicle: BimmerWorkVehicle = {
    vin,
    codeType: null,
    chassis,
    market: null,
    engine: fields["Engine"] || null,
    drivetrain: fields["Drive"] || null,
    transmission: fields["Transmission"] || null,
    color: fields["Colour"] || fields["Color"] || null,
    colorCode: null,
    upholstery: fields["Upholstery"] || null,
    upholsteryCode: null,
    startOfProduction: fields["Prod. Date"] || fields["Production Date"] || null,
    manufacturer: "BMW",
    modelName: modelType ? `BMW ${modelType}` : null,
  };

  const options: BimmerWorkOption[] = [];

  const optPattern1 = /<td\s+align=['"]center['"]\s+width=['"]20%['"]>([^<]+)<\/td>\s*<td\s+align=['"]left['"]>([^<]+)<\/td>/gi;
  while ((m = optPattern1.exec(html)) !== null) {
    const code = m[1].trim();
    const name = m[2].trim().replace(/&amp;/g, "&");
    if (code && name) {
      options.push({ code, nameEn: name, nameDe: "", imageUrl: null });
    }
  }

  if (options.length === 0) {
    const optPattern2 = /<td[^>]*>\s*(S\d{3}[A-Z]?)\s*<\/td>\s*<td[^>]*>\s*([^<]+?)\s*<\/td>/gi;
    while ((m = optPattern2.exec(html)) !== null) {
      const code = m[1].trim();
      const name = m[2].trim().replace(/&amp;/g, "&");
      if (code && name && name.length > 2) {
        options.push({ code, nameEn: name, nameDe: "", imageUrl: null });
      }
    }
  }

  console.log(`[mdecoder] Parsed: ${vehicle.modelName}, ${options.length} options, chassis: ${chassis}`);

  return {
    hash: "mdecoder",
    vehicle,
    options,
    images: null,
    manuals: [],
    sourceUrl,
    fetchedAt: new Date().toISOString(),
  };
}

export { fetchMdecoderData };

export async function fetchVindecoderzData(vin: string): Promise<BimmerWorkData | null> {
  const sourceUrl = `https://www.vindecoderz.com/EN/check-lookup/${vin}`;
  console.log(`[vindecoderz] Fetching data for ${vin}`);

  try {
    const html = await proxyFetch("vindecoderz", sourceUrl, { timeoutMs: 8_000 });

    if (/Just a moment|cf-browser-verification|challenge-platform|cf-challenge/i.test(html)) {
      console.log(`[vindecoderz] Cloudflare challenge encountered; skipping`);
      return null;
    }

    return parseVindecoderzHtml(html, vin, sourceUrl);
  } catch (err: any) {
    console.log(`[vindecoderz] Fetch failed: ${err.message}`);
    return null;
  }
}

function parseVindecoderzHtml(html: string, vin: string, sourceUrl: string): BimmerWorkData | null {
  const fields: Record<string, string> = {};

  const rowPattern = /<t[hd][^>]*>\s*<(?:b|strong)[^>]*>\s*([^<]+?)\s*<\/(?:b|strong)>\s*<\/t[hd]>\s*<t[hd][^>]*>\s*([^<]+?)\s*<\/t[hd]>/gi;
  let m;
  while ((m = rowPattern.exec(html)) !== null) {
    const k = m[1].trim().replace(/:$/, "");
    const v = m[2].trim().replace(/&amp;/g, "&");
    if (k && v && !fields[k]) fields[k] = v;
  }

  const knownKeys = ["Make", "Model", "Year", "Model Year", "Body", "Engine", "Transmission", "Plant", "Series", "Production", "Production Date", "Manufactured", "Drive", "Drivetrain"];
  const knownKeysAlt = knownKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const rowPattern2 = new RegExp(`<th[^>]*>\\s*(?:<[^>]+>\\s*)*(${knownKeysAlt})\\s*:?\\s*(?:<\\/[^>]+>\\s*)*<\\/th>\\s*<td[^>]*>\\s*([^<]{1,100}?)\\s*<\\/td>`, "gi");
  while ((m = rowPattern2.exec(html)) !== null) {
    const k = m[1].trim().replace(/:$/, "");
    const v = m[2].trim().replace(/&amp;/g, "&");
    if (k && v && !fields[k]) fields[k] = v;
  }

  const hasUseful = knownKeys.some(k => fields[k]);
  if (!hasUseful) {
    console.log(`[vindecoderz] No useful fields parsed (${Object.keys(fields).length} fields)`);
    return null;
  }

  const modelRaw = fields["Model"] || fields["Series"] || "";
  const chassisMatch = modelRaw.match(/\b([EFG]\d{2})\b/);
  const chassis = chassisMatch ? chassisMatch[1] : null;

  const yearStr = fields["Year"] || fields["Model Year"] || "";
  const yearMatch = yearStr.match(/(\d{4})/);
  const year = yearMatch ? yearMatch[1] : null;

  const prodStr = fields["Production"] || fields["Manufactured"] || fields["Production Date"] || null;

  const vehicle: BimmerWorkVehicle = {
    vin,
    codeType: null,
    chassis,
    market: null,
    engine: fields["Engine"] || null,
    drivetrain: fields["Drive"] || fields["Drivetrain"] || null,
    transmission: fields["Transmission"] || null,
    color: null,
    colorCode: null,
    upholstery: null,
    upholsteryCode: null,
    startOfProduction: prodStr || (year ? `01/${year}` : null),
    manufacturer: fields["Make"] || "BMW",
    modelName: modelRaw ? `${fields["Make"] || "BMW"} ${modelRaw}`.trim() : null,
  };

  console.log(`[vindecoderz] Parsed: ${vehicle.modelName}, chassis: ${chassis}, year: ${year}`);

  return {
    hash: "vindecoderz",
    vehicle,
    options: [],
    images: null,
    manuals: [],
    sourceUrl,
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Bulk-discovery helpers (Task #166)
// ---------------------------------------------------------------------------

const HASH_RE = /bimmer\.work\/vin\/([a-z0-9]{20,64})/g;
const VIN_TITLE_RE = /Data for\s+([A-Z0-9]{17})/i;
const BIMMERWORK_BASE = "https://bimmer.work";

/**
 * Fetch a bimmer.work URL through the proxy router (bimmerwork scraper).
 * render: true is required because bimmer.work is Cloudflare-protected.
 * Returns null if both primary and backup providers fail.
 */
async function fetchViaProxyOrDirect(url: string, timeoutMs = 20_000): Promise<string | null> {
  try {
    return await proxyFetch("bimmerwork", url, { timeoutMs, render: true });
  } catch {
    return null;
  }
}

/**
 * Proxy-enforced fetch — used for bulk-discover where direct-IP requests
 * are not acceptable. Routes through the bimmerwork scraper config with
 * render: true for Cloudflare bypass. Throws on failure (no direct escape).
 */
export async function fetchViaProxyStrictly(url: string, timeoutMs = 20_000): Promise<string | null> {
  return proxyFetch("bimmerwork", url, { timeoutMs, render: true });
}

/**
 * Query one search engine for `site:bimmer.work/vin` and return every
 * unique hash found on that results page.
 */
async function fetchHashesFromResultPage(url: string, seen: Set<string>, _strict = false): Promise<string[]> {
  // Always route search-engine discovery through the hash_discovery scraper config.
  let html: string | null = null;
  try {
    html = await proxyFetch("hash_discovery", url, { timeoutMs: 15_000 });
  } catch {
    return [];
  }
  if (!html) return [];
  const found: string[] = [];
  let m: RegExpExecArray | null;
  HASH_RE.lastIndex = 0;
  while ((m = HASH_RE.exec(html)) !== null) {
    const h = m[1];
    if (!seen.has(h)) {
      seen.add(h);
      found.push(h);
    }
  }
  return found;
}

export interface DiscoverHashesOpts {
  /** Max result pages to fetch per engine (default 50). */
  maxPagesPerEngine?: number;
  /** Called after each batch of hashes from a page. */
  onPageDone?: (engine: string, page: number, newHashes: string[]) => void;
  /**
   * When true all search-engine requests go through the Evomi proxy
   * (throws if proxy not configured). Always set to true in the bulk-discover
   * pipeline to guarantee no direct-origin leakage.
   */
  strict?: boolean;
}

/**
 * Search Google, Bing, and DuckDuckGo for `site:bimmer.work/vin` and
 * yield every unique bimmer.work hash URL found across all pages.
 *
 * Pagination:
 *   - Google: ?start=0,10,20,…
 *   - Bing:   ?first=1,11,21,…
 *   - DDG:    ?q=…&s=0,30,60,… (html endpoint; 30 results per page)
 *
 * Stops early for an engine when a page returns no new hashes or when
 * `maxPagesPerEngine` is reached.
 */
export async function* discoverAllBimmerWorkHashes(
  opts: DiscoverHashesOpts = {},
): AsyncGenerator<string> {
  const maxPages = opts.maxPagesPerEngine ?? 50;
  const strict = opts.strict ?? false;
  const seen = new Set<string>();

  // -- Google --
  for (let page = 0; page < maxPages; page++) {
    const start = page * 10;
    const url = `https://www.google.com/search?q=site:bimmer.work/vin&start=${start}&num=10`;
    const hashes = await fetchHashesFromResultPage(url, seen, strict);
    opts.onPageDone?.("google", page, hashes);
    for (const h of hashes) yield h;
    if (hashes.length === 0) break;
    await delay(1500);
  }

  // -- Bing --
  for (let page = 0; page < maxPages; page++) {
    const first = page * 10 + 1;
    const url = `https://www.bing.com/search?q=site:bimmer.work/vin&first=${first}&count=10`;
    const hashes = await fetchHashesFromResultPage(url, seen, strict);
    opts.onPageDone?.("bing", page, hashes);
    for (const h of hashes) yield h;
    if (hashes.length === 0) break;
    await delay(1500);
  }

  // -- DuckDuckGo (HTML endpoint, ~30 results/page) --
  // html.duckduckgo.com/html/ uses numeric `s=` offsets (0, 30, 60, …) with
  // ~30 results per page. This is the exhaustive pagination strategy for the
  // non-JS HTML endpoint; token-based "next" links used by the DDG JSON API
  // do not apply here. We stop when a page returns zero new hashes (DDG stops
  // returning results once the index is exhausted) or maxPagesPerEngine is hit.
  for (let page = 0; page < maxPages; page++) {
    const s = page * 30;
    const url = `https://html.duckduckgo.com/html/?q=site%3Abimmer.work%2Fvin&s=${s}`;
    const hashes = await fetchHashesFromResultPage(url, seen, strict);
    opts.onPageDone?.("ddg", page, hashes);
    for (const h of hashes) yield h;
    if (hashes.length === 0) break;
    await delay(1500);
  }
}

/**
 * Given a bimmer.work hash, fetch the vehicle page and extract the VIN
 * from the "Data for {VIN}" title pattern. Returns `null` when the page
 * is not available or no VIN can be extracted.
 *
 * Returns both the VIN and the raw HTML so the caller can pass the HTML
 * directly into `bulkFetchBimmerWorkFromHtml` without a second fetch.
 *
 * @param strict When `true`, uses proxy-only fetch (throws if proxy absent).
 *               Set to `true` in the bulk-discover pipeline.
 */
export async function resolveVinFromBimmerWorkHash(
  hash: string,
  { strict = false }: { strict?: boolean } = {},
): Promise<{ vin: string; html: string } | null> {
  const url = `${BIMMERWORK_BASE}/vin/${hash}/`;
  const html = strict
    ? await fetchViaProxyStrictly(url, 20_000)
    : await fetchViaProxyOrDirect(url, 20_000);
  if (!html) return null;
  if (html.includes("<title>bimmer.work : 404")) return null;

  const m = VIN_TITLE_RE.exec(html);
  if (!m) return null;

  const vin = m[1].toUpperCase();
  if (vin.length !== 17) return null;

  return { vin, html };
}

/**
 * Build a full `BimmerWorkData` result by reusing already-fetched main-page
 * HTML (from `resolveVinFromBimmerWorkHash`) and fetching the remaining
 * sub-pages (options, images, manuals) via the proxy.
 *
 * This avoids double-fetching the main page in bulk-discover pipelines.
 */
export async function bulkFetchBimmerWorkFromHtml(
  vin: string,
  hash: string,
  mainHtml: string,
): Promise<BimmerWorkData> {
  const baseUrl = `${BIMMERWORK_BASE}/vin/${hash}`;

  let vehicle: BimmerWorkVehicle | null = null;
  try {
    vehicle = scrapeVehicleFromHtml(mainHtml, vin);
  } catch (e) {
    console.error(`[BW Bulk] Failed to parse vehicle for ${vin}:`, e);
  }

  await delay(800);

  let options: BimmerWorkOption[] = [];
  try {
    const optHtml = await fetchViaProxyStrictly(`${baseUrl}/options/`, 20_000);
    if (optHtml) options = scrapeOptionsFromHtml(optHtml);
  } catch (e) {
    console.error(`[BW Bulk] Failed to parse options for ${vin}:`, e);
  }

  await delay(800);

  let images: BimmerWorkImages | null = null;
  try {
    const imgHtml = await fetchViaProxyStrictly(`${baseUrl}/images/`, 20_000);
    if (imgHtml) images = scrapeImagesFromHtml(imgHtml, hash);
  } catch (e) {
    console.error(`[BW Bulk] Failed to parse images for ${vin}:`, e);
  }

  await delay(800);

  let manuals: BimmerWorkManual[] = [];
  try {
    const manHtml = await fetchViaProxyStrictly(`${baseUrl}/manuals/`, 20_000);
    if (manHtml) manuals = scrapeManualsFromHtml(manHtml);
  } catch (e) {
    console.error(`[BW Bulk] Failed to parse manuals for ${vin}:`, e);
  }

  return {
    hash,
    vehicle,
    options,
    images,
    manuals,
    sourceUrl: baseUrl,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchBimmerWorkData(vin: string, providedHash?: string): Promise<BimmerWorkData | null> {
  const cleanVin = vin.toUpperCase().replace(/[\s\-]/g, "");

  const cached = cache.get(cleanVin);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  let hash = providedHash || null;

  if (!hash) {
    hash = await discoverBimmerWorkHash(cleanVin);
  }

  if (!hash) {
    return null;
  }

  const baseUrl = `https://bimmer.work/vin/${hash}`;
  console.log(`Scraping bimmer.work: ${baseUrl}`);

  const vehicleHtml = await fetchPage(`${baseUrl}/`);
  if (!vehicleHtml || vehicleHtml.includes("<title>bimmer.work : 404")) {
    return null;
  }

  const titleVin = vehicleHtml.match(/Data for\s+([A-Z0-9]{17})/i);
  if (titleVin && titleVin[1].toUpperCase() !== cleanVin) {
    console.log(`[BW Hash] VIN mismatch: expected ${cleanVin}, page has ${titleVin[1]} — rejecting hash ${hash}`);
    if (providedHash) {
      return { hash, vehicle: null, options: [], images: null, manuals: [], sourceUrl: baseUrl, fetchedAt: new Date().toISOString(), vinMismatch: true } as any;
    }
    return null;
  }

  let vehicle: BimmerWorkVehicle | null = null;
  try {
    vehicle = scrapeVehicleFromHtml(vehicleHtml, cleanVin);
  } catch (e) {
    console.error("Failed to parse vehicle data:", e);
  }

  await delay(800);

  let options: BimmerWorkOption[] = [];
  try {
    const optionsHtml = await fetchPage(`${baseUrl}/options/`);
    if (optionsHtml) {
      options = scrapeOptionsFromHtml(optionsHtml);
    }
  } catch (e) {
    console.error("Failed to parse options:", e);
  }

  await delay(800);

  let images: BimmerWorkImages | null = null;
  try {
    const imagesHtml = await fetchPage(`${baseUrl}/images/`);
    if (imagesHtml) {
      images = scrapeImagesFromHtml(imagesHtml, hash);
    }
  } catch (e) {
    console.error("Failed to parse images:", e);
  }

  await delay(800);

  let manuals: BimmerWorkManual[] = [];
  try {
    const manualsHtml = await fetchPage(`${baseUrl}/manuals/`);
    if (manualsHtml) {
      manuals = scrapeManualsFromHtml(manualsHtml);
    }
  } catch (e) {
    console.error("Failed to parse manuals:", e);
  }

  const result: BimmerWorkData = {
    hash,
    vehicle,
    options,
    images,
    manuals,
    sourceUrl: baseUrl,
    fetchedAt: new Date().toISOString(),
  };

  cache.set(cleanVin, { data: result, timestamp: Date.now() });

  return result;
}
