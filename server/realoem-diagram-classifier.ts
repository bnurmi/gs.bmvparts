// Task #101 — RealOEM cross-variant diagram dedup classifier.
//
// Classifies a RealOEM `diagId` (e.g. `41_1234`) as either:
//
//   - "shared"  → the diagram is byte-identical across engine/trim
//                 siblings of the same chassis. Eligible for cloning
//                 from the canonical store, which lets us skip the
//                 Oxylabs proxy fetch on every sibling after the first.
//
//   - "per-car" → the diagram differs per engine/trim/transmission.
//                 Each car must fetch its own copy.
//
//   - "unknown" → the diagId doesn't match either safe-list. Treated
//                 as per-car at the call site (the safe default — never
//                 clone something we're not sure about).
//
// Defaults are derived from RealOEM's main-group numbering (the leading
// two-digit prefix of the `diagId`). The split is conservative: the
// "shared" set is limited to body/trim/glass-type groups whose contents
// don't depend on engine choice; everything drivetrain-adjacent stays
// per-car so we never silently overwrite an engine-specific part list
// with another engine's parts.
//
// Operator override: `REALOEM_DEDUP_DIAGRAM_OVERRIDES` env var, JSON
// shape `{ "<prefix-or-full-diagId>": "shared"|"per-car"|"unknown" }`.
// Full `diagId` matches win over prefix matches.

export type DiagramClass = "shared" | "per-car" | "unknown";

// RealOEM main-group prefixes whose diagrams are typically identical
// across engine/trim siblings of the same chassis. Sourced from
// RealOEM's own grouping — body panels (41), trim/equipment (51),
// seats/interior (52), sliding roof (54), lights (63), audio/nav (65),
// tools/accessories (71), safety equipment (72).
const SHARED_PREFIXES = new Set<string>([
  "41", // Body panels
  "51", // Trim, glass, sound-insulation, equipment, interior
  "52", // Seats
  "54", // Sliding roof / sunroof / convertible top
  "63", // Lighting
  "65", // Audio / navigation / connectivity
  "71", // Tools / accessories
  "72", // Safety equipment
]);

// Main-group prefixes whose diagrams differ per engine/trim/transmission.
// Drivetrain-adjacent groups stay here; mis-cloning these would silently
// substitute one engine's bill of materials for another's. When in doubt,
// add the prefix here (or to neither set, which makes the call site
// treat it per-car as well).
const PER_CAR_PREFIXES = new Set<string>([
  "11", // Engine
  "12", // Engine electrical
  "13", // Fuel preparation
  "16", // Fuel tank / lines
  "17", // Cooling
  "18", // Exhaust
  "21", // Clutch
  "22", // Engine mounts
  "23", // Manual transmission
  "24", // Automatic transmission
  "25", // Transmission control
  "26", // Drive shaft
  "27", // Transfer case
  "28", // Shift control
  "31", // Front axle
  "32", // Steering
  "33", // Rear axle
  "34", // Brakes
  "35", // Pedals
  "36", // Wheels
]);

interface OverrideMap {
  byDiagId: Map<string, DiagramClass>;
  byPrefix: Map<string, DiagramClass>;
}

let cachedOverrides: OverrideMap | null = null;

function loadOverrides(): OverrideMap {
  if (cachedOverrides) return cachedOverrides;
  const raw = process.env.REALOEM_DEDUP_DIAGRAM_OVERRIDES;
  const out: OverrideMap = { byDiagId: new Map(), byPrefix: new Map() };
  if (!raw) {
    cachedOverrides = out;
    return out;
  }
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) {
        if (v !== "shared" && v !== "per-car" && v !== "unknown") continue;
        const key = String(k);
        if (/^\d{2}$/.test(key)) out.byPrefix.set(key, v);
        else out.byDiagId.set(key, v);
      }
    }
  } catch (e) {
    console.warn(`[RealoemDedup] ignoring malformed REALOEM_DEDUP_DIAGRAM_OVERRIDES: ${(e as Error).message}`);
  }
  cachedOverrides = out;
  return out;
}

/** For tests: clear the cached env-var override map. */
export function _resetOverridesForTests(): void {
  cachedOverrides = null;
}

/**
 * Classify a RealOEM `diagId` (e.g. `41_1234`) by its leading
 * two-digit main-group prefix.
 *
 * `null` / `undefined` / non-numeric inputs return "unknown" so callers
 * can treat them as per-car (no cloning). Operator overrides
 * (env `REALOEM_DEDUP_DIAGRAM_OVERRIDES`) win over the built-in
 * defaults — full `diagId` overrides win over prefix overrides.
 */
export function classifyDiagId(diagId: string | null | undefined): DiagramClass {
  if (!diagId) return "unknown";
  const id = String(diagId).trim();
  if (!id) return "unknown";

  const overrides = loadOverrides();
  const exact = overrides.byDiagId.get(id);
  if (exact) return exact;

  const m = id.match(/^(\d{2})/);
  if (!m) return "unknown";
  const prefix = m[1];

  const prefixOverride = overrides.byPrefix.get(prefix);
  if (prefixOverride) return prefixOverride;

  if (SHARED_PREFIXES.has(prefix)) return "shared";
  if (PER_CAR_PREFIXES.has(prefix)) return "per-car";
  return "unknown";
}

/**
 * True iff a diagram is eligible for canonical-store cloning. Wraps
 * `classifyDiagId` so the dedup path has a single decision primitive
 * and so "unknown" remains per-car (the safe default).
 */
export function isClonableShared(diagId: string | null | undefined): boolean {
  return classifyDiagId(diagId) === "shared";
}
