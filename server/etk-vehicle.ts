// First-party vehicle data from the leaked ETK Transbase dump
// (`data/etk/exports/fztyp.psv`). Loaded once at startup into a
// type-code-keyed lookup, used by VinEnrichmentService to resolve
// the Vehicle tab without scraping bimmer.work.
//
// fztyp.psv schema (pipe-delimited, no header):
//   typeCode | seriesId | model | engine | body | drivetrain | transmission | ccm
// Sample row: `2528|114|1600|M10|Cab|L|M|1600`
//
// Coverage: roughly model years 1981–2020 (anything in the leaked dump).
// Per-VIN factory order (FA + SA codes) is NOT in this type-code dump
// — the per-VIN FA payload (SA list, paint, upholstery, production
// date) is loaded from a separate file `data/etk/exports/vin_fa.psv`
// by `server/etk-vin-fa.ts` (see Task #62) into `vin_factory_options`.
// SA code → display-name expansion is handled by VinEnrichmentService
// via the dictionary tables seeded from `data/dictionaries/sa_codes.json`.
import { readFile } from "fs/promises";
import path from "path";

export interface EtkVehicle {
  typeCode: string;
  seriesId: string | null;
  modelDesignation: string | null;  // e.g. "1600", "M3", "330i"
  engineCode: string | null;        // e.g. "M10", "M50", "S55"
  bodyCode: string | null;          // e.g. "Cab", "Lim", "Tou"
  drivetrain: string | null;        // L=LHD, R=RHD (BMW historical convention)
  transmission: string | null;      // M=manual, A=auto
  ccm: string | null;               // engine displacement
}

const FZTYP_PATH = path.join(process.cwd(), "data", "etk", "exports", "fztyp.psv");
let cache: Map<string, EtkVehicle> | null = null;
let loadingPromise: Promise<Map<string, EtkVehicle>> | null = null;

async function loadFztypFile(): Promise<Map<string, EtkVehicle>> {
  const map = new Map<string, EtkVehicle>();
  let raw: string;
  try {
    raw = await readFile(FZTYP_PATH, "utf-8");
  } catch (err: any) {
    console.warn(`[ETK] fztyp.psv not readable (${err.message}); ETK vehicle lookup disabled`);
    return map;
  }
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#")) continue;
    const cols = line.split("|");
    if (cols.length < 4) continue;
    const typeCode = cols[0]?.trim();
    if (!typeCode) continue;
    map.set(typeCode.toUpperCase(), {
      typeCode: typeCode.toUpperCase(),
      seriesId: cols[1]?.trim() || null,
      modelDesignation: cols[2]?.trim() || null,
      engineCode: cols[3]?.trim() || null,
      bodyCode: cols[4]?.trim() || null,
      drivetrain: cols[5]?.trim() || null,
      transmission: cols[6]?.trim() || null,
      ccm: cols[7]?.trim() || null,
    });
  }
  console.log(`[ETK] Loaded ${map.size} type codes from fztyp.psv`);
  return map;
}

export async function ensureEtkLoaded(): Promise<Map<string, EtkVehicle>> {
  if (cache) return cache;
  if (loadingPromise) return loadingPromise;
  loadingPromise = loadFztypFile().then(m => { cache = m; loadingPromise = null; return m; });
  return loadingPromise;
}

export async function getEtkVehicleByTypeCode(typeCode: string | null | undefined): Promise<EtkVehicle | null> {
  if (!typeCode) return null;
  const map = await ensureEtkLoaded();
  const exact = map.get(typeCode.toUpperCase());
  if (exact) return exact;
  // The VIN decoder emits 3-character VDS codes (e.g. "AB1") while
  // fztyp.psv stores 4-character TypeKeys (e.g. "AB11", "AB12"). Fall
  // back to a deterministic prefix match so modern VINs still resolve
  // to an ETK row. We pick the alphabetically-first prefix-match — all
  // variants in the same family share the chassis/engine fields the
  // orchestrator surfaces, so the choice is safe.
  const probe = typeCode.toUpperCase();
  if (probe.length >= 3 && probe.length <= 4) {
    const matches: EtkVehicle[] = [];
    for (const [key, val] of map.entries()) {
      if (key.startsWith(probe)) matches.push(val);
    }
    if (matches.length > 0) {
      matches.sort((a, b) => a.typeCode.localeCompare(b.typeCode));
      return matches[0];
    }
  }
  return null;
}

// Friendly drivetrain expansion: BMW historically marks LHD as "L",
// RHD as "R". For modern UI we surface AWD/RWD when known; otherwise
// preserve raw value so we don't lie.
export function expandDrivetrain(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase();
  if (t === "L") return "Left-hand drive";
  if (t === "R") return "Right-hand drive";
  return raw;
}

export function expandTransmission(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase();
  if (t === "M") return "Manual";
  if (t === "A") return "Automatic";
  return raw;
}

// Expand BMW body code abbreviations into the same English labels the
// existing scraper-fed UI uses.
const BODY_LABELS: Record<string, string> = {
  CAB: "Convertible",
  LIM: "Sedan",
  TOU: "Touring",
  COU: "Coupe",
  COMP: "Compact",
  SAV: "SAV",
  SAC: "SAC",
  GT: "Gran Turismo",
  GC: "Gran Coupe",
};
export function expandBody(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toUpperCase();
  return BODY_LABELS[key] ?? raw;
}

// Human-friendly model name composed from the raw ETK row.
// We always prefix "BMW" so the UI matches the bimmer.work scrape's
// label ("BMW 330i", "BMW M3 Sedan").
export function buildEtkModelName(v: EtkVehicle): string {
  const parts: string[] = ["BMW"];
  if (v.modelDesignation) parts.push(v.modelDesignation);
  const body = expandBody(v.bodyCode);
  if (body && body !== "Sedan") parts.push(body);
  return parts.join(" ").trim();
}
