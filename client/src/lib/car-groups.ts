import type { Car } from "@shared/schema";

// Structural subset of `Car` that the grouping functions actually
// inspect. Both the full `Car` row and the slim `HomepageCar` payload
// (Task #162) satisfy this shape, so callers don't have to cast.
export type CarLike = Pick<Car, "chassis" | "modelName" | "displayName">;

export type CarGroupKey = "m" | "mlite" | "classic" | "exx" | "fxx" | "gxx" | "x" | "mini";

export interface CarGroupDef {
  key: CarGroupKey;
  title: string;
  badge: string;
  /**
   * Legacy header strip color used by the pre-BMV CarCard. Kept around
   * because the Search page and a couple of admin tables still reference
   * it (`getGroupDef(group).color`). New BMV cards do NOT use this.
   */
  color: string;
  /**
   * BMV brand mark — a 6×6 px square placed next to the eyebrow label
   * on car cards / sidebar group headers. The accent square is the one
   * BMV brand blue everywhere except the heritage `classic` group which
   * uses ink-tertiary as a deliberate de-emphasis.
   */
  dotClass: string;
}

export const CAR_GROUPS: CarGroupDef[] = [
  { key: "m", title: "M Models", badge: "Performance", color: "bg-blue-700", dotClass: "bg-bmv-accent" },
  { key: "mlite", title: "M-Lite Models", badge: "M-Lite", color: "bg-indigo-700", dotClass: "bg-bmv-accent" },
  { key: "classic", title: "Classic Models", badge: "Heritage", color: "bg-stone-700", dotClass: "bg-ink-tertiary" },
  { key: "exx", title: "Exx Models", badge: "Inc SUVs", color: "bg-orange-700", dotClass: "bg-ink-tertiary" },
  { key: "fxx", title: "Fxx Models", badge: "Inc SUVs", color: "bg-sky-700", dotClass: "bg-ink-tertiary" },
  { key: "gxx", title: "Gxx Models", badge: "Inc SUVs", color: "bg-emerald-700", dotClass: "bg-ink-tertiary" },
  { key: "x", title: "X Models", badge: "SUVs", color: "bg-amber-700", dotClass: "bg-ink-tertiary" },
  { key: "mini", title: "Mini Models", badge: "Mini Cooper", color: "bg-rose-700", dotClass: "bg-ink-tertiary" },
];

export const GROUP_ORDER: CarGroupKey[] = ["m", "mlite", "classic", "exx", "fxx", "gxx", "x", "mini"];

const CLASSIC_CHASSIS = new Set([
  "E3", "E9", "E12", "E21", "E23", "E24", "E26", "E28",
  "E30", "E31", "E32", "E34", "E36", "E38", "E39",
  "E46", "E52", "E53",
]);

const M_LITE_PREFIXES = ["M135", "M140", "M235", "M240", "M340", "M440", "M550", "M760"];

function isMLiteModel(car: CarLike): boolean {
  const m = car.modelName || "";
  return M_LITE_PREFIXES.some(prefix => m.startsWith(prefix));
}

function isFullMModel(car: CarLike): boolean {
  const m = car.modelName || "";
  if (isMLiteModel(car)) return false;
  if (/^M[0-9]/.test(m)) return true;
  if (m === "1M" || m === "M Coupé" || m === "M Roadster") return true;
  if (/^3\.0 CSL/.test(m)) return true;
  return false;
}

function isXModel(car: CarLike): boolean {
  const m = car.modelName || "";
  if (/^X[0-9]/.test(m) || /^iX/.test(m)) return true;
  if (car.chassis?.startsWith("X")) return true;
  return false;
}

function isMini(car: CarLike): boolean {
  const name = (car.displayName || "").toLowerCase();
  const chassis = (car.chassis || "").toLowerCase();
  return name.includes("mini") || chassis.includes("mini") || chassis.startsWith("r") && /cooper/i.test(name);
}

function isClassic(car: CarLike): boolean {
  return CLASSIC_CHASSIS.has(car.chassis || "");
}

export function getCarGroup(car: CarLike): CarGroupKey {
  if (isMini(car)) return "mini";
  if (isFullMModel(car)) return "m";
  if (isMLiteModel(car)) return "mlite";
  if (isXModel(car)) return "x";
  if (isClassic(car)) return "classic";
  const ch = (car.chassis || "")[0];
  if (ch === "E") return "exx";
  if (ch === "F") return "fxx";
  if (ch === "G") return "gxx";
  return "exx";
}

export function getChassisGroup(car: CarLike): CarGroupKey | null {
  const ch = (car.chassis || "")[0];
  if (ch === "E") return "exx";
  if (ch === "F") return "fxx";
  if (ch === "G") return "gxx";
  return null;
}

export function groupCars<T extends CarLike>(cars: T[]): Record<CarGroupKey, T[]> {
  const groups: Record<CarGroupKey, T[]> = {
    m: [], mlite: [], classic: [], exx: [], fxx: [], gxx: [], x: [], mini: [],
  };
  for (const car of cars) {
    const primary = getCarGroup(car);
    groups[primary].push(car);
    // Each car lands in exactly one group — no secondary push.
  }
  for (const key of GROUP_ORDER) {
    groups[key].sort((a, b) => {
      const ca = a.chassis || "";
      const cb = b.chassis || "";
      if (ca !== cb) return ca.localeCompare(cb);
      return (a.displayName || "").localeCompare(b.displayName || "");
    });
  }
  return groups;
}

export function getGroupDef(key: CarGroupKey): CarGroupDef {
  return CAR_GROUPS.find(g => g.key === key)!;
}

/**
 * Returns a human-readable suffix for LCI chassis codes.
 * E.g. "E90N" → "LCI", "F30N" → "LCI", "E90" → ""
 */
export function getLciSuffix(chassis: string): string {
  return chassis.endsWith("N") ? "LCI" : "";
}

/**
 * Returns a display label for a chassis code:
 * "E90" → "E90", "E90N" → "E90N — LCI"
 */
export function chassisLabel(chassis: string): string {
  const lci = getLciSuffix(chassis);
  return lci ? `${chassis} — ${lci}` : chassis;
}

export interface ChassisVariantGroup<T extends CarLike> {
  chassis: string;
  label: string;
  cars: T[];
  /** Present when this chassis has a corresponding LCI variant (chassis + "N"). */
  lciGroup?: ChassisVariantGroup<T>;
}

/**
 * Groups a flat list of cars (already filtered to one sidebar section)
 * into one entry per chassis code, each entry holding all variants of
 * that chassis. The cars within each entry are sorted by displayName.
 * The resulting entries are sorted by chassis code.
 *
 * LCI chassis codes (ending in "N", e.g. E90N) are detached from the
 * top-level list and attached as `lciGroup` on their base chassis entry
 * (e.g. E90N → entries["E90"].lciGroup). If no matching base exists the
 * LCI chassis is kept at the top level as a fallback.
 */
export function groupByChassisVariants<T extends CarLike>(cars: T[]): ChassisVariantGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const car of cars) {
    const ch = car.chassis || "unknown";
    if (!map.has(ch)) map.set(ch, []);
    map.get(ch)!.push(car);
  }

  const allEntries = new Map<string, ChassisVariantGroup<T>>();
  for (const [chassis, variants] of map) {
    variants.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
    allEntries.set(chassis, { chassis, label: chassisLabel(chassis), cars: variants });
  }

  const topLevel: ChassisVariantGroup<T>[] = [];
  for (const [chassis, entry] of allEntries) {
    if (chassis.endsWith("N")) {
      const baseChassis = chassis.slice(0, -1);
      const baseEntry = allEntries.get(baseChassis);
      if (baseEntry) {
        baseEntry.lciGroup = { ...entry, label: "— LCI" };
        continue;
      }
    }
    topLevel.push(entry);
  }

  topLevel.sort((a, b) => a.chassis.localeCompare(b.chassis));
  return topLevel;
}
