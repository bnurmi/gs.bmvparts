import { storage } from "./storage";
import type { Car } from "@shared/schema";
import { proxyFetch } from "./proxy-router";

const BASE_URL = "https://www.bmw-etk.info";

interface DiscoveredVariant {
  chassis: string;
  bodyCode: string;
  bodyType: string;
  modelName: string;
  catalogId: string;
  catalogUrl: string;
  group: string;
  generation: string;
  series: string;
}

const BODY_CODE_MAP: Record<string, string> = {
  Lim: "Saloon",
  Cou: "Coupé",
  Cab: "Convertible",
  Tou: "Touring",
  SH: "Hatchback",
  GT: "Gran Turismo",
  SAV: "SAV",
  SAC: "SAC",
};

const CHASSIS_SERIES_MAP: Record<string, string> = {
  E82: "1", E88: "1",
  F20: "1", F40: "1",
  F22: "2", G42: "2",
  E83: "X3", E84: "X1",
  E53: "X5", E70: "X5", E71: "X6",
  E90: "3", E91: "3", E92: "3", E93: "3",
  F30: "3", G20: "3",
  F32: "4", G22: "4",
  F10: "5", G30: "5",
  F13: "6", G32: "6",
  F01: "7", G70: "7",
  F15: "X5", F16: "X6", F25: "X3", F26: "X4",
  F39: "X2", F48: "X1",
  F85: "X5", F86: "X6", F95: "X5", F96: "X6",
  F97: "X3", F98: "X4",
  G01: "X3", G02: "X4", G05: "X5", G06: "X6",
  G07: "X7", G08: "X3", G09: "XM",
  G80: "M", G81: "M", G82: "M", G83: "M", G87: "M",
  F80: "M", F82: "M", F83: "M", F87: "M",
};

const ENGINE_MAP: Record<string, string> = {
  "N54": "N54", "N55": "N55", "N52": "N52", "N52N": "N52", "N53": "N53",
  "N46": "N46", "N46N": "N46", "N43": "N43", "N45": "N45", "N45N": "N45",
  "N47": "N47", "N47N": "N47", "N47S1": "N47",
  "N57": "N57", "N57S": "N57", "N57N": "N57", "N57Z": "N57",
  "N63": "N63", "N63N": "N63", "N63R": "N63", "N63B": "N63",
  "N20": "N20", "N26": "N26", "N51": "N51",
  "S55": "S55", "S58": "S58",
  "B46": "B46", "B46D": "B46", "B46X": "B46",
  "B47": "B47", "B47D": "B47",
  "B48": "B48", "B48C": "B48", "B48D": "B48", "B48E": "B48", "B48X": "B48",
  "B57": "B57", "B57P": "B57",
  "B58": "B58", "B58C": "B58", "B58D": "B58",
  "B42D": "B42",
  "M47N2": "M47",
  "M57N2": "M57",
  "XD5O": "XD5O",
};

function extractEngine(modelName: string): string | null {
  const parts = modelName.split(" ");
  if (parts.length > 1) {
    const suffix = parts[parts.length - 1];
    if (ENGINE_MAP[suffix]) return ENGINE_MAP[suffix];
    return suffix;
  }
  const m = modelName.match(/(N\d+|S\d+|B\d+|M\d+)/);
  if (m) return m[1];
  return null;
}

function getGeneration(chassis: string): string {
  if (chassis.startsWith("E")) return "E";
  if (chassis.startsWith("F")) return "F";
  if (chassis.startsWith("G")) return "G";
  return "Unknown";
}

function getSeries(chassis: string, modelName: string): string {
  const m = modelName.match(/^M\d|^M\s|^M$/);
  if (m) return "M";
  if (modelName.includes("ALPINA")) return "ALPINA";
  if (modelName.startsWith("i7")) return "7";
  if (modelName.startsWith("Hybrid")) {
    const hm = modelName.match(/Hybrid\s+(\d)/);
    return hm ? hm[1] : CHASSIS_SERIES_MAP[chassis] || "Other";
  }
  return CHASSIS_SERIES_MAP[chassis] || "Other";
}

function generateDisplayName(chassis: string, modelName: string): string {
  return `${chassis} ${modelName}`;
}

function generateSlugFromParts(chassis: string, modelName: string, catalogId: string): string {
  const cleanModel = modelName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${chassis.toLowerCase()}-${cleanModel}-${catalogId}`;
}

async function fetchPage(url: string): Promise<string> {
  const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;
  return proxyFetch("etk", fullUrl, { timeoutMs: 60_000 });
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// bmw-etk.info has separate top-level catalogs per brand. The previous
// discovery only walked BMW/A and BMW/M-Models, missing every MINI and
// Rolls-Royce chassis. This helper returns the {brand, group} pairs to
// probe for a given chassis code.
function getCatalogPathsForChassis(chassis: string): Array<{ brand: string; group: string }> {
  const c = chassis.toUpperCase();
  // Rolls-Royce chassis all start with "RR"
  if (c.startsWith("RR")) {
    return [{ brand: "Rolls-Royce", group: "A" }];
  }
  // MINI chassis: classic R-series 50–61 and modern F5x/F6x
  const isMiniR = /^R(5\d|6\d)N?$/.test(c);
  const isMiniF = /^F(5\d|6\d)[A-Z]?$/.test(c);
  if (isMiniR || isMiniF) {
    return [{ brand: "Mini", group: "A" }];
  }
  // Everything else lives under BMW (A for normal cars, M-Models for M cars)
  return [
    { brand: "BMW", group: "A" },
    { brand: "BMW", group: "M-Models" },
  ];
}

export async function discoverVariants(): Promise<{
  discovered: DiscoveredVariant[];
  existingCatalogIds: Set<string>;
  newVariants: DiscoveredVariant[];
}> {
  const existingCars = await storage.getCars();
  const existingCatalogIds = new Set(existingCars.map(c => c.catalogId).filter(Boolean) as string[]);

  const chassisBodyCombos = new Map<string, { chassis: string; bodyCode: string; groups: string[] }>();

  for (const car of existingCars) {
    if (!car.catalogUrl.includes("bmw-etk.info")) continue;
    const url = new URL(car.catalogUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    // parts-catalog/BMW/A/cat/VT/{chassis}/{bodyCode}/{model}/...
    // indices:  0       1   2  3   4    5          6        7
    const chassis = parts[5];
    const bodyCode = parts[6];
    const group = car.catalogUrl.includes("M-Models") ? "M-Models" : "A";
    const key = `${chassis}`;

    if (!chassisBodyCombos.has(key)) {
      chassisBodyCombos.set(key, { chassis, bodyCode, groups: [group] });
    } else {
      const existing = chassisBodyCombos.get(key)!;
      if (!existing.groups.includes(group)) existing.groups.push(group);
    }
  }

  const discovered: DiscoveredVariant[] = [];

  for (const [key, { chassis, bodyCode, groups }] of chassisBodyCombos) {
    for (const { brand, group } of getCatalogPathsForChassis(chassis)) {
      const smUrl = `${BASE_URL}/parts-catalog/${brand}/${group}/sm/VT/${chassis}/`;
      console.log(`[Discovery] Checking ${chassis} (${brand}/${group})...`);

      try {
        const html = await fetchPage(smUrl);
        const linkRegex = /href='(\/parts-catalog\/[^']+\/(\d{4})\/(\d{2})\/(\d+)\/)'/g;
        let match;
        const seenCatalogIds = new Set<string>();

        while ((match = linkRegex.exec(html)) !== null) {
          const catalogUrl = match[1];
          const catalogId = match[4];
          if (seenCatalogIds.has(catalogId)) continue;
          seenCatalogIds.add(catalogId);

          const urlParts = catalogUrl.split("/").filter(Boolean);
          // parts-catalog/BMW/A/cat/VT/{chassis}/{bodyCode}/{model}/{market}/{steering}/{trans}/{year}/{month}/{catalogId}
          const urlBodyCode = urlParts[6];
          const modelName = decodeURIComponent(urlParts[7]);
          const urlBodyType = BODY_CODE_MAP[urlBodyCode] || urlBodyCode;

          discovered.push({
            chassis,
            bodyCode: urlBodyCode,
            bodyType: urlBodyType,
            modelName,
            catalogId,
            catalogUrl: `${BASE_URL}${catalogUrl}`,
            group,
            generation: getGeneration(chassis),
            series: getSeries(chassis, modelName),
          });
        }

        await sleep(300);
      } catch (err: any) {
        console.log(`[Discovery] Failed for ${chassis} (${group}): ${err.message}`);
      }
    }
  }

  const seenNewIds = new Set<string>();
  const newVariants = discovered.filter(v => {
    if (existingCatalogIds.has(v.catalogId)) return false;
    if (seenNewIds.has(v.catalogId)) return false;
    seenNewIds.add(v.catalogId);
    return true;
  });

  console.log(`[Discovery] Found ${discovered.length} total variants, ${newVariants.length} new (not in DB, deduped)`);

  return { discovered, existingCatalogIds, newVariants };
}

/**
 * Optional progress / cancellation hooks for long-running discovery
 * sweeps. The realoem-backfill pre-step uses these to (a) surface
 * chassis-by-chassis progress in the admin UI while the
 * (Evomi-bound) sweep is in flight and (b) honor an operator cancel
 * BEFORE the sweep grinds through all ~296 chassis. Both are
 * optional; passing none preserves the original ad-hoc behavior.
 */
export interface DiscoveryProgressHooks {
  /** Called once before the sweep starts, with the total chassis count. */
  onStart?: (totalChassis: number) => void;
  /** Called at the START of each chassis (before any catalog-group fetches). */
  onChassis?: (chassis: string, indexZeroBased: number, total: number) => void;
  /** Called after a chassis finishes ALL its catalog-group probes; `variantsFoundSoFar` is the running total. */
  onChassisComplete?: (chassis: string, indexZeroBased: number, total: number, variantsFoundSoFar: number) => void;
  /** Polled between chassis iterations; returning true terminates the sweep early and returns whatever was found. */
  shouldCancel?: () => boolean;
}

export async function discoverVariantsForChassisList(
  chassisCodes: string[],
  hooks: DiscoveryProgressHooks = {},
): Promise<{
  discovered: DiscoveredVariant[];
  existingCatalogIds: Set<string>;
  newVariants: DiscoveredVariant[];
}> {
  const existingCars = await storage.getCars();
  const existingCatalogIds = new Set(existingCars.map(c => c.catalogId).filter(Boolean) as string[]);

  const discovered: DiscoveredVariant[] = [];
  hooks.onStart?.(chassisCodes.length);

  for (let i = 0; i < chassisCodes.length; i++) {
    if (hooks.shouldCancel?.()) {
      console.log(`[Discovery] Cancelled at chassis ${i}/${chassisCodes.length} (${chassisCodes[i]}); returning ${discovered.length} variants found so far`);
      break;
    }
    const chassis = chassisCodes[i];
    hooks.onChassis?.(chassis, i, chassisCodes.length);
    for (const { brand, group } of getCatalogPathsForChassis(chassis)) {
      const smUrl = `${BASE_URL}/parts-catalog/${brand}/${group}/sm/VT/${chassis}/`;
      console.log(`[Discovery] Checking ${chassis} (${brand}/${group})...`);

      try {
        const html = await fetchPage(smUrl);
        const linkRegex = /href='(\/parts-catalog\/[^']+\/(\d{4})\/(\d{2})\/(\d+)\/)'/g;
        let match;
        const seenCatalogIds = new Set<string>();

        while ((match = linkRegex.exec(html)) !== null) {
          const catalogUrl = match[1];
          const catalogId = match[4];
          if (seenCatalogIds.has(catalogId)) continue;
          seenCatalogIds.add(catalogId);

          const urlParts = catalogUrl.split("/").filter(Boolean);
          const urlBodyCode = urlParts[6];
          const modelName = decodeURIComponent(urlParts[7]);
          const urlBodyType = BODY_CODE_MAP[urlBodyCode] || urlBodyCode;

          discovered.push({
            chassis,
            bodyCode: urlBodyCode,
            bodyType: urlBodyType,
            modelName,
            catalogId,
            catalogUrl: `${BASE_URL}${catalogUrl}`,
            group,
            generation: getGeneration(chassis),
            series: getSeries(chassis, modelName),
          });
        }

        await sleep(300);
      } catch (err: any) {
        console.log(`[Discovery] Failed for ${chassis} (${group}): ${err.message}`);
      }
    }
    // Chassis finished all its catalog-group probes — fire the
    // completion hook so the caller can advance its "checked" counter
    // and refresh the running variants-found total. Without this the
    // admin UI counter would stay at 0 throughout the entire sweep,
    // exactly the silent-pre-step problem this patch is meant to fix.
    hooks.onChassisComplete?.(chassis, i, chassisCodes.length, discovered.length);
  }

  const seenNewIds = new Set<string>();
  const newVariants = discovered.filter(v => {
    if (existingCatalogIds.has(v.catalogId)) return false;
    if (seenNewIds.has(v.catalogId)) return false;
    seenNewIds.add(v.catalogId);
    return true;
  });

  console.log(`[Discovery] Found ${discovered.length} total variants, ${newVariants.length} new for chassis: ${chassisCodes.join(", ")}`);
  return { discovered, existingCatalogIds, newVariants };
}

export async function insertDiscoveredVariants(variants: DiscoveredVariant[]): Promise<Car[]> {
  const createdCars: Car[] = [];

  for (const v of variants) {
    const engine = extractEngine(v.modelName);
    const displayName = generateDisplayName(v.chassis, v.modelName);
    const slug = generateSlugFromParts(v.chassis, v.modelName, v.catalogId);

    const car = await storage.createCar({
      chassis: v.chassis,
      generation: v.generation,
      series: v.series,
      bodyType: v.bodyType,
      modelName: v.modelName,
      displayName,
      engine,
      yearStart: null as any,
      yearEnd: null,
      catalogUrl: v.catalogUrl,
      catalogId: v.catalogId,
      imageUrl: null,
      scrapeStatus: "idle",
      scrapeProgress: 0,
      totalCategories: 0,
      totalSubcategories: 0,
      totalParts: 0,
      lastScrapedAt: null,
      scrapeError: null,
      slug,
    });

    createdCars.push(car);
    console.log(`[Discovery] Created car: ${displayName} (catalog ${v.catalogId})`);
  }

  return createdCars;
}
