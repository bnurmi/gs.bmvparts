// First-party VIN enrichment orchestrator (Task #59).
//
// Replaces direct calls to bimmer.work with a per-tab resolution
// pipeline:
//   - Vehicle + Options : ETK first  → bimmer.work fallback
//   - Images            : BMW configurator first → bimmer.work fallback
//   - Manuals           : BMW manuals portal first → bimmer.work fallback
//
// Output is byte-compatible with the existing `BimmerWorkData` shape
// so the VIN decoder UI keeps working unchanged. We additionally
// surface per-tab provenance via `enrichmentSource` so admins can see
// which sources fired for each cached VIN.
import { decodeVin } from "./vin-decoder";
import {
  ensureEtkLoaded,
  getEtkVehicleByTypeCode,
  expandDrivetrain,
  expandTransmission,
  expandBody,
  buildEtkModelName,
  type EtkVehicle,
} from "./etk-vehicle";
import { fetchConfiguratorImages } from "./bmw-configurator-images";
import { fetchManualsForModel, type BmwManual } from "./bmw-manuals";
import {
  fetchBimmerWorkData,
  fetchMdecoderData,
  fetchVindecoderzData,
  type BimmerWorkData,
  type BimmerWorkVehicle,
  type BimmerWorkOption,
} from "./bimmer-work-scraper";
import { db } from "./storage";
import { saCodes, vinFactoryOptions, paintCodes, upholsteryCodes } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";
import type { EnrichmentSourceMap, EnrichmentTabSource, EnrichmentCoverage } from "@shared/schema";

export type { EnrichmentCoverage } from "@shared/schema";

const FA_IMPORT_PATHS = [
  "POST /api/admin/vin-factory-options/import (PartsLink24 FA dump)",
  "data/etk/exports/vin_fa.psv (on-disk loader)",
  "scripts/promote-cache-to-factory-options.ts (cache promotion)",
] as const;

// ---------------------------------------------------------------------------
// vindecoderz requires EVOMI_PREMIUM_PROXY_* credentials to succeed
// (evomi_core gets 403 from vindecoderz). If credentials are absent we skip
// the source entirely so it never double-fails or spams logs.
// ---------------------------------------------------------------------------
export const VINDECODERZ_ENABLED = !!(process.env.EVOMI_PREMIUM_PROXY_HOST || "").trim();
if (!VINDECODERZ_ENABLED) {
  console.warn("[VIN] vindecoderz disabled: EVOMI_PREMIUM_PROXY_* not configured");
}

export interface EnrichmentResult {
  data: BimmerWorkData;
  enrichmentSource: EnrichmentSourceMap;
  coverage: EnrichmentCoverage;
}

// Year cutoff above which the ETK dump is unlikely to know the VIN.
// Mirrors `ETK_DATA_CUTOFF_YEAR` from `vin-decoder.ts` so the two
// agree on what counts as "modern".
const ETK_CUTOFF_YEAR = 2020;

function nowIso(): string { return new Date().toISOString(); }

function source(s: EnrichmentTabSource): { source: EnrichmentTabSource; fetchedAt: string } {
  return { source: s, fetchedAt: nowIso() };
}

// Build a `BimmerWorkVehicle`-shaped object from an ETK row + the VIN
// decoder's hint data. The shape is intentionally identical to what
// `scrapeVehicleFromHtml` in `server/bimmer-work-scraper.ts` produces.
function vehicleFromEtk(vin: string, etk: EtkVehicle, modelYear: number | null) {
  return {
    vin,
    codeType: etk.typeCode || null,
    chassis: etk.seriesId || null,
    market: null,
    engine: etk.engineCode || null,
    drivetrain: expandDrivetrain(etk.drivetrain),
    transmission: expandTransmission(etk.transmission),
    color: null,        // Paint code is per-VIN, not in fztyp.psv
    colorCode: null,
    upholstery: null,
    upholsteryCode: null,
    startOfProduction: modelYear ? `01/${modelYear}` : null,
    manufacturer: "BMW",
    modelName: buildEtkModelName(etk),
  };
}

// Per-VIN factory order lookup. Returns the SA list, paint code,
// upholstery code and production date if any local row exists for
// this VIN. Populated either by an admin import (e.g. PartsLink24
// FA dump) or by a previously-promoted third-party fallback.
async function getLocalFactoryOptions(vin: string): Promise<{
  saCodes: string[];
  paintCode: string | null;
  upholsteryCode: string | null;
  productionDate: string | null;
  source: string;
} | null> {
  try {
    const [row] = await db.select().from(vinFactoryOptions).where(eq(vinFactoryOptions.vin, vin));
    if (!row) return null;
    return {
      saCodes: (row.saCodes as string[]) || [],
      paintCode: row.paintCode || null,
      upholsteryCode: row.upholsteryCode || null,
      productionDate: row.productionDate || null,
      source: row.source || "unknown",
    };
  } catch (err: any) {
    console.log(`[Enrichment] FA lookup failed for ${vin}: ${err.message}`);
    return null;
  }
}

// Promote a successful third-party SA fetch into the local FA table
// so future requests for the same VIN don't have to leave the building.
// Best-effort — failures are logged but never block the response.
// Exported so the bulk-discover pipeline can call it directly.
export async function promoteFactoryOptions(vin: string, sas: string[], paintCode: string | null, upholsteryCode: string | null, source: string): Promise<void> {
  if (!sas || sas.length === 0) return;
  try {
    await db.insert(vinFactoryOptions).values({
      vin,
      saCodes: sas,
      paintCode,
      upholsteryCode,
      productionDate: null,
      source,
    }).onConflictDoUpdate({
      target: vinFactoryOptions.vin,
      set: {
        saCodes: sas,
        paintCode: paintCode ?? null,
        upholsteryCode: upholsteryCode ?? null,
        source,
        updatedAt: new Date(),
      },
    });
  } catch (err: any) {
    console.log(`[Enrichment] FA promote failed for ${vin}: ${err.message}`);
  }
}

// Look up paint / upholstery names from the dictionary tables. Returns
// the localized display name + an optional rgb swatch for paints.
async function getPaintName(code: string | null): Promise<{ name: string | null; rgb: string | null }> {
  if (!code) return { name: null, rgb: null };
  try {
    const [row] = await db.select().from(paintCodes).where(eq(paintCodes.code, code.toUpperCase()));
    if (!row) return { name: null, rgb: null };
    const names = (row.names || {}) as Record<string, string>;
    return { name: names.en || names.EN || code, rgb: row.rgb || null };
  } catch { return { name: null, rgb: null }; }
}
async function getUpholsteryName(code: string | null): Promise<string | null> {
  if (!code) return null;
  try {
    const [row] = await db.select().from(upholsteryCodes).where(eq(upholsteryCodes.code, code.toUpperCase()));
    if (!row) return null;
    const names = (row.names || {}) as Record<string, string>;
    return names.en || names.EN || code;
  } catch { return null; }
}

// Resolve SA option codes → display names from the dictionary table.
// We always emit `nameEn` because that's what the UI's `OptionsTab`
// component reads (see `client/src/pages/VinDecoder.tsx`). Locale
// negotiation lives client-side; this server just persists EN+DE.
async function expandSaCodes(codes: string[]): Promise<{ code: string; nameEn: string; nameDe: string; imageUrl: string | null }[]> {
  if (codes.length === 0) return [];
  const upper = codes.map(c => c.toUpperCase());
  const rows = await db.select().from(saCodes).where(inArray(saCodes.code, upper));
  const byCode = new Map<string, { nameEn: string; nameDe: string }>();
  for (const r of rows) {
    const names = (r.names || {}) as Record<string, string>;
    byCode.set(r.code, { nameEn: names.en || names.EN || "", nameDe: names.de || names.DE || "" });
  }
  return upper.map(code => {
    const hit = byCode.get(code);
    return { code, nameEn: hit?.nameEn || code, nameDe: hit?.nameDe || "", imageUrl: null };
  });
}

// Try BMW configurator first for images; this is best-effort and
// returns null when the CDN doesn't have an image for these codes.
async function tryConfiguratorImages(typeCode: string | null, paintCode: string | null, upholsteryCode: string | null) {
  if (!typeCode || !paintCode) return null;
  try {
    return await fetchConfiguratorImages({
      modelTypeCode: typeCode,
      paintCode,
      upholsteryCode,
    });
  } catch (err: any) {
    console.log(`[Enrichment] Configurator images failed: ${err.message}`);
    return null;
  }
}

async function tryBmwManuals(modelName: string | null, year: number | null): Promise<BmwManual[]> {
  if (!modelName) return [];
  try {
    return await fetchManualsForModel(modelName, year);
  } catch (err: any) {
    console.log(`[Enrichment] BMW manuals failed: ${err.message}`);
    return [];
  }
}

// Discover an ETK type code for a VIN. We trust the existing
// `decodeVin()` resolver — it already consults the curated VDS
// patterns + the `bmw_models` table populated from the same ETK
// dump. Falls back to null when there is no match (orchestrator will
// then route to bimmer.work).
async function discoverTypeCode(vin: string): Promise<{ typeCode: string | null; modelYear: number | null }> {
  try {
    const decoded = await decodeVin(vin);
    return { typeCode: decoded.typeCode, modelYear: decoded.modelYear ?? null };
  } catch (err: any) {
    console.log(`[Enrichment] decodeVin failed: ${err.message}`);
    return { typeCode: null, modelYear: null };
  }
}

// Pure decision helper for the cache-hit path (Task #83 review v2).
// Returns true when a cached vin_cache row should be discarded and
// re-enriched first-party-only because:
//   - the VIN is now ETK-covered, AND
//   - the cached enrichmentSource lists a third-party scraper for any
//     tab (i.e. the row was written before the gate landed).
// Exposed as a pure function so the gate test can assert it without
// HTTP / DB.
const SCRAPER_PROVENANCE_TAGS: ReadonlySet<EnrichmentTabSource> = new Set([
  "bimmerwork",
  "mdecoder",
  "vindecoderz",
] as EnrichmentTabSource[]);
export function shouldSanitizeStaleCache(
  coverage: EnrichmentCoverage | null,
  cachedSource: EnrichmentSourceMap | null | undefined,
): boolean {
  if (!coverage?.etkCovered) return false;
  if (!cachedSource) return false;
  for (const tab of ["vehicle", "options", "images", "manuals"] as const) {
    const s = cachedSource[tab]?.source;
    if (s && SCRAPER_PROVENANCE_TAGS.has(s)) return true;
  }
  return false;
}

// Lightweight coverage computation for cache-hit paths. Avoids running
// the full first-party orchestrator (which would re-fetch BMW
// configurator/manuals) — just inspects what we know locally so the
// `/api/vin/bimmerwork/:vin` cache-hit response can still surface the
// honest "not in our dataset" state for ETK-covered VINs.
export async function computeCoverageForVin(vin: string): Promise<EnrichmentCoverage | null> {
  const cleanVin = vin.toUpperCase().replace(/[\s\-]/g, "");
  if (cleanVin.length !== 17) return null;
  await ensureEtkLoaded();
  const { typeCode, modelYear } = await discoverTypeCode(cleanVin);
  const etkRow = !shouldShortcutToBimmerWork(modelYear) ? await getEtkVehicleByTypeCode(typeCode) : null;
  const factory = await getLocalFactoryOptions(cleanVin);
  const isEtkCovered = !!etkRow || (modelYear !== null && modelYear <= ETK_CUTOFF_YEAR);
  const missing: EnrichmentCoverage["missing"] = [];
  if (!factory || factory.saCodes.length === 0) missing.push("options");
  if (!factory?.paintCode) missing.push("paint");
  if (!factory?.upholsteryCode) missing.push("upholstery");
  if (!factory?.productionDate) missing.push("productionDate");
  return {
    etkCovered: isEtkCovered,
    firstPartyOnly: isEtkCovered,
    missing,
    importPaths: missing.length > 0 ? [...FA_IMPORT_PATHS] : undefined,
  };
}

// Modern-VIN fallback: if the VIN's model year is post the ETK cutoff
// we don't even attempt ETK first — we go straight to bimmer.work for
// Vehicle+Options and use BMW endpoints for Images+Manuals.
function shouldShortcutToBimmerWork(modelYear: number | null): boolean {
  if (modelYear == null) return false;
  return modelYear > ETK_CUTOFF_YEAR;
}

function prefer<T>(primary: T | null | undefined, fallback: T | null | undefined): T | null {
  return (primary !== null && primary !== undefined && primary !== "" ? primary : fallback) ?? null;
}

function mergeVehicle(primary: BimmerWorkVehicle | null, fallback: BimmerWorkVehicle | null): BimmerWorkVehicle | null {
  if (!primary) return fallback;
  if (!fallback) return primary;
  return {
    vin: primary.vin || fallback.vin,
    codeType: prefer(primary.codeType, fallback.codeType),
    chassis: prefer(primary.chassis, fallback.chassis),
    market: prefer(primary.market, fallback.market),
    engine: prefer(primary.engine, fallback.engine),
    drivetrain: prefer(primary.drivetrain, fallback.drivetrain),
    transmission: prefer(primary.transmission, fallback.transmission),
    // bimmer.work usually has BMW paint/upholstery codes; mdecoder often only has names.
    color: prefer(primary.color, fallback.color),
    colorCode: prefer(primary.colorCode, fallback.colorCode),
    upholstery: prefer(primary.upholstery, fallback.upholstery),
    upholsteryCode: prefer(primary.upholsteryCode, fallback.upholsteryCode),
    startOfProduction: prefer(primary.startOfProduction, fallback.startOfProduction),
    manufacturer: prefer(primary.manufacturer, fallback.manufacturer),
    modelName: prefer(primary.modelName, fallback.modelName),
  };
}

function mergeOptions(primary: BimmerWorkOption[] = [], fallback: BimmerWorkOption[] = []): BimmerWorkOption[] {
  const byCode = new Map<string, BimmerWorkOption>();
  for (const o of fallback) if (o?.code) byCode.set(o.code, o);
  for (const o of primary) {
    if (!o?.code) continue;
    const prev = byCode.get(o.code);
    byCode.set(o.code, {
      code: o.code,
      nameEn: prefer(o.nameEn, prev?.nameEn) || "",
      nameDe: prefer(o.nameDe, prev?.nameDe) || "",
      imageUrl: prefer(o.imageUrl, prev?.imageUrl),
    });
  }
  return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
}

function mergeThirdPartyData(sources: BimmerWorkData[]): BimmerWorkData | null {
  if (sources.length === 0) return null;
  const bimmer = sources.find(s => s.hash !== "mdecoder" && s.hash !== "vindecoderz") || null;
  const mdecoder = sources.find(s => s.hash === "mdecoder") || null;
  const vindecoderz = sources.find(s => s.hash === "vindecoderz") || null;
  const ordered = [bimmer, mdecoder, vindecoderz].filter(Boolean) as BimmerWorkData[];
  let vehicle: BimmerWorkVehicle | null = null;
  let options: BimmerWorkOption[] = [];
  for (const src of ordered) {
    vehicle = mergeVehicle(vehicle, src.vehicle);
    options = mergeOptions(options, src.options || []);
  }
  const imageSource = ordered.find(s => s.images)?.images || null;
  const manualSource = ordered.find(s => (s.manuals || []).length > 0)?.manuals || [];
  return {
    hash: ordered.map(s => s.hash).join("+") || "merged",
    vehicle,
    options,
    images: imageSource,
    manuals: manualSource,
    sourceUrl: ordered.map(s => s.sourceUrl).filter(Boolean).join(" | "),
    fetchedAt: nowIso(),
  };
}

export async function enrichVin(vin: string, opts?: { providedHash?: string; allowThirdParty?: boolean; _forceBypassEtkGate?: boolean }): Promise<EnrichmentResult | null> {
  const cleanVin = vin.toUpperCase().replace(/[\s\-]/g, "");
  if (cleanVin.length !== 17) return null;

  // Caller's intent. The `/api/vin/enrich/:vin` route always flips
  // this to false (strict first-party regime). The `/api/vin/bimmerwork/:vin`
  // route leaves it true (allow scrapers as fallback) — but the
  // ETK-coverage gate below may still force it to false for any
  // pre-2020 / chassis-in-ETK VIN.
  const callerAllowedThirdParty = opts?.allowThirdParty !== false;

  await ensureEtkLoaded();
  const enrichmentSource: EnrichmentSourceMap = {};

  const { typeCode, modelYear } = await discoverTypeCode(cleanVin);
  const etkRow = !shouldShortcutToBimmerWork(modelYear) ? await getEtkVehicleByTypeCode(typeCode) : null;
  const factory = await getLocalFactoryOptions(cleanVin);

  // ETK-coverage gate (Task #83). A VIN is "ETK-covered" when *either*:
  //   - its chassis resolves in fztyp.psv (etkRow present), or
  //   - its decoded model year is at-or-before the ETK cutoff year.
  // For ETK-covered VINs we never call third-party scrapers regardless
  // of `allowThirdParty` — the audit in `docs/etk-per-vin-coverage.md`
  // confirms the dump has no per-VIN FA, so the honest behaviour for a
  // missing FA row is "not in our dataset", not a network call.
  const isEtkCovered = !!etkRow || (modelYear !== null && modelYear <= ETK_CUTOFF_YEAR);
  // `_forceBypassEtkGate` is the admin-only escape hatch wired up by
  // `GET /api/vin/bimmerwork/:vin?force=thirdparty` so ops can verify
  // a scrape end-to-end. It is the only way to call third-party
  // scrapers for an ETK-covered VIN.
  const allowThirdParty = callerAllowedThirdParty && (!isEtkCovered || opts?._forceBypassEtkGate === true);

  let vehicle: BimmerWorkData["vehicle"] = null;
  let options: BimmerWorkData["options"] = [];
  let bimmerData: BimmerWorkData | null = null;
  let bimmerFetched = false;

  // Lazy fetch of third-party sources. When enabled, query bimmer.work and
  // mdecoder, then merge. bimmer.work is preferred for paint/upholstery codes;
  // mdecoder fills missing vehicle fields/options when bimmer.work is absent or incomplete.
  async function ensureBimmerData(): Promise<BimmerWorkData | null> {
    if (bimmerFetched) return bimmerData;
    bimmerFetched = true;
    if (!allowThirdParty) return null;

    const sources: BimmerWorkData[] = [];

    const bw = await fetchBimmerWorkData(cleanVin, opts?.providedHash);
    if (bw && !(bw as any).vinMismatch) sources.push(bw);

    const m = await fetchMdecoderData(cleanVin);
    if (m) sources.push(m);

    // Vindecoderz remains tertiary/optional. Only call it if the merged bimmer+mdecoder
    // result still has no vehicle and no options.
    let merged = mergeThirdPartyData(sources);
    if ((!merged?.vehicle && (merged?.options || []).length === 0) && VINDECODERZ_ENABLED) {
      const v = await fetchVindecoderzData(cleanVin);
      if (v) sources.push(v);
      merged = mergeThirdPartyData(sources);
    }

    bimmerData = merged;
    if (bimmerData) {
      console.log(`[Enrichment] merged third-party for ${cleanVin}: ${sources.map(s => s.hash).join("+")}`);
    }
    return bimmerData;
  }

  function bimmerTag(bw: BimmerWorkData): EnrichmentTabSource {
    const h = bw.hash || "";
    if (h.includes("bimmer") || (!h.includes("mdecoder") && !h.includes("vindecoderz"))) return "bimmerwork";
    if (h.includes("mdecoder")) return "mdecoder";
    if (h.includes("vindecoderz")) return "vindecoderz";
    return "bimmerwork";
  }

  // Step 1 — Vehicle (ETK first; populate paint+upholstery+SOP from
  // local FA when available). Vehicle stays etk-authoritative — when
  // ETK has the chassis we never overwrite it with scraper data.
  if (etkRow) {
    vehicle = vehicleFromEtk(cleanVin, etkRow, modelYear);
    if (factory) {
      const paint = await getPaintName(factory.paintCode);
      const uph = await getUpholsteryName(factory.upholsteryCode);
      vehicle = {
        ...vehicle,
        color: paint.name,
        colorCode: factory.paintCode,
        upholstery: uph,
        upholsteryCode: factory.upholsteryCode,
        startOfProduction: factory.productionDate || vehicle.startOfProduction,
      };
    }
    enrichmentSource.vehicle = source("etk");
  }

  // Step 2 — Options from local FA + dictionary expansion (first-party).
  if (factory && factory.saCodes.length > 0) {
    const dict = await expandSaCodes(factory.saCodes);
    options = dict.map(d => ({
      code: d.code,
      nameEn: d.nameEn,
      nameDe: d.nameDe,
      imageUrl: d.imageUrl,
    }));
    enrichmentSource.options = source("etk");
  }

  // Fallback chain — if ETK didn't yield vehicle OR options are still
  // empty, ask the scrapers. Vehicle is only filled from a scraper
  // when ETK had no row for the chassis (preserves the "ETK is
  // authoritative for vehicle" rule). Options/Images/Manuals are
  // filled from scrapers whenever the first-party path returned
  // nothing — this is what makes per-VIN landing pages useful for
  // VINs whose chassis is in ETK but whose factory order isn't.
  if (allowThirdParty && (!vehicle || options.length === 0)) {
    const bw = await ensureBimmerData();
    if (bw) {
      const tag = bimmerTag(bw);
      if (!vehicle && bw.vehicle) {
        vehicle = bw.vehicle;
        enrichmentSource.vehicle = source(tag);
      }
      if (options.length === 0 && (bw.options || []).length > 0) {
        options = bw.options || [];
        enrichmentSource.options = source(tag);
        // Promote SA codes into the local FA table so the next call
        // for this VIN goes 100% first-party (and unlocks the BMW
        // configurator for images via the promoted paint/upholstery).
        const sas = options.map(o => o.code).filter(Boolean);
        const promotePaint = (bw.vehicle as any)?.colorCode || null;
        const promoteUph = (bw.vehicle as any)?.upholsteryCode || null;
        await promoteFactoryOptions(cleanVin, sas, promotePaint, promoteUph, tag);
      }
    }
  }

  if (!vehicle && !enrichmentSource.vehicle) enrichmentSource.vehicle = source("none");
  if (options.length === 0 && !enrichmentSource.options) enrichmentSource.options = source("none");

  // Step 3 — Images. Configurator first; scraper fallback whenever
  // the configurator missed AND third-party is allowed (regardless
  // of whether ETK covered the chassis). The previous "skip scrapers
  // for ETK-covered VINs" gate left every ETK-stub VIN with no
  // imagery; relaxed so the user-facing page actually has photos.
  const paintCode = (vehicle?.colorCode || null) as string | null;
  const upholsteryCode = (vehicle?.upholsteryCode || null) as string | null;
  let images: BimmerWorkData["images"] = null;

  const cfgImages = await tryConfiguratorImages(typeCode, paintCode, upholsteryCode);
  if (cfgImages) {
    images = cfgImages;
    enrichmentSource.images = source("bmw_configurator");
  } else if (allowThirdParty) {
    const bw = await ensureBimmerData();
    if (bw?.images) {
      images = bw.images;
      enrichmentSource.images = source(bimmerTag(bw));
    } else {
      enrichmentSource.images = source("none");
    }
  } else {
    enrichmentSource.images = source("none");
  }

  // Step 4 — Manuals. BMW portal first; scraper fallback whenever
  // the portal returned nothing AND third-party is allowed.
  let manuals: BimmerWorkData["manuals"] = [];
  const portalManuals = await tryBmwManuals(vehicle?.modelName || null, modelYear);
  if (portalManuals.length) {
    manuals = portalManuals;
    enrichmentSource.manuals = source("bmw_manuals");
  } else if (allowThirdParty) {
    const bw = await ensureBimmerData();
    if (bw?.manuals?.length) {
      manuals = bw.manuals;
      enrichmentSource.manuals = source(bimmerTag(bw));
    } else {
      enrichmentSource.manuals = source("none");
    }
  } else {
    enrichmentSource.manuals = source("none");
  }

  // Build the coverage block — what FA pieces we have vs. what's
  // genuinely missing for this VIN. ETK-covered VINs always get a
  // coverage report (even when nothing was found) so the UI can
  // render an honest "not in our dataset" state instead of pretending
  // we tried to scrape.
  const missing: EnrichmentCoverage["missing"] = [];
  if (!factory || factory.saCodes.length === 0) missing.push("options");
  if (!factory?.paintCode) missing.push("paint");
  if (!factory?.upholsteryCode) missing.push("upholstery");
  if (!factory?.productionDate) missing.push("productionDate");
  const coverage: EnrichmentCoverage = {
    etkCovered: isEtkCovered,
    firstPartyOnly: !allowThirdParty,
    missing,
    importPaths: missing.length > 0 ? [...FA_IMPORT_PATHS] : undefined,
  };

  // Strict first-party mode may return an ETK coverage placeholder so admins can see
  // what first-party data is missing. User-facing bmv.vin fallback mode should not
  // cache or return an empty placeholder as enrichment.
  if (!vehicle && options.length === 0 && !images && manuals.length === 0 && (allowThirdParty || !isEtkCovered)) {
    return null;
  }

  const data: BimmerWorkData = {
    hash: (bimmerData as BimmerWorkData | null)?.hash || "etk",
    vehicle,
    options,
    images,
    manuals,
    sourceUrl: (bimmerData as BimmerWorkData | null)?.sourceUrl || "etk://local",
    fetchedAt: nowIso(),
  };

  return { data, enrichmentSource, coverage };
}

// Aggregate provenance counters for the admin dashboard. Returns
// per-tab buckets keyed by source (matches the UI's
// `VinEnrichmentStatsPanel` contract) plus the cross-tab `bySource`
// view kept around for any programmatic consumers. `totalCached`
// counts every cached VIN, not just those with an enrichmentSource.
// Exposed via GET /api/admin/vin-enrichment-stats.
export interface EnrichmentSourceStats {
  totalCached: number;
  vehicle: Record<string, number>;
  options: Record<string, number>;
  images: Record<string, number>;
  manuals: Record<string, number>;
  bySource: Record<string, { vehicle: number; options: number; images: number; manuals: number }>;
}
export async function getEnrichmentSourceStats(): Promise<EnrichmentSourceStats> {
  const rows = await db.execute(sql`SELECT enrichment_source FROM vin_cache WHERE enrichment_source IS NOT NULL`);
  const totalRow = await db.execute(sql`SELECT COUNT(*)::int AS c FROM vin_cache`);
  const totalCached = ((totalRow.rows?.[0] as any)?.c) ?? 0;
  const out: EnrichmentSourceStats = {
    totalCached,
    vehicle: {},
    options: {},
    images: {},
    manuals: {},
    bySource: {},
  };
  for (const row of (rows.rows || [])) {
    const es = (row as any).enrichment_source as EnrichmentSourceMap | null;
    if (!es) continue;
    for (const tab of ["vehicle", "options", "images", "manuals"] as const) {
      const s = es[tab]?.source;
      if (!s) continue;
      out[tab][s] = (out[tab][s] || 0) + 1;
      if (!out.bySource[s]) out.bySource[s] = { vehicle: 0, options: 0, images: 0, manuals: 0 };
      out.bySource[s][tab]++;
    }
  }
  return out;
}
