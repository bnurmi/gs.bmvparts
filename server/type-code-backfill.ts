import { db } from "./storage";
import { cars as carsTable, bmwModels as bmwModelsTable } from "@shared/schema";
import { eq, isNull, sql } from "drizzle-orm";

export type BackfillReason =
  | "tagged"
  | "already_tagged"
  | "chassis_not_in_bmw_models"
  | "no_model_match"
  | "ambiguous_multiple_type_codes";

export interface BackfillCarResult {
  carId: number;
  chassis: string;
  modelName: string;
  reason: BackfillReason;
  typeCode?: string;
  candidateTypeCodes?: string[];
}

export interface BackfillReport {
  totalCars: number;
  alreadyTagged: number;
  tagged: number;
  ambiguous: number;
  noModelMatch: number;
  chassisNotInBmwModels: number;
  applied: boolean;
  perChassis: Array<{
    chassis: string;
    total: number;
    alreadyTagged: number;
    newlyTagged: number;
    ambiguous: number;
    noModelMatch: number;
    chassisMissing: number;
  }>;
  ambiguousSample: BackfillCarResult[];
  noModelMatchSample: BackfillCarResult[];
}

export function normalizeVariant(name: string | null | undefined): {
  variant: string;
  modifiers: string;
} {
  if (!name) return { variant: "", modifiers: "" };
  let s = String(name).trim().replace(/[\u2013\u2014]/g, "-");
  s = s.replace(/\bxDrive\s*(\d+[a-zA-Z]*)/gi, "$1X");
  s = s.replace(/\bsDrive\s*(\d+[a-zA-Z]*)/gi, "$1");
  s = s.replace(/\b(xDrive|sDrive)\b/gi, "");
  s = s.replace(/\s+/g, " ").trim();

  const tokens = [...s.matchAll(/\b(M?\d{2,4}[a-zA-Z]*)\b/g)].map((m) => m[1]);
  let variant = tokens.length ? tokens[tokens.length - 1] : "";
  if (!variant) {
    const m = s.match(/\bM\d+[a-zA-Z]*\b/);
    if (m) variant = m[0];
  }

  const modifierWords = [
    "CSL",
    "CS",
    "Competition",
    "ti",
    "Hybrid",
    "GT",
    "GC",
    "Touring",
    "Convertible",
    "ALPINA",
  ];
  const found = new Set<string>();
  for (const w of modifierWords) {
    const re = new RegExp(`\\b${w}\\b`, "i");
    if (re.test(name)) found.add(w.toLowerCase());
  }
  return {
    variant: variant.toLowerCase(),
    modifiers: [...found].sort().join("|"),
  };
}

export function engineFamily(engine: string | null | undefined): string | null {
  if (!engine) return null;
  const m = String(engine).match(/^([A-Za-z]\d{2})/);
  return m ? m[1].toUpperCase() : null;
}

interface CarRow {
  id: number;
  chassis: string;
  modelName: string;
  engine: string | null;
  typeCode: string | null;
}

interface BmwRow {
  chassis: string;
  typeCode: string;
  modelName: string;
  engineCode: string | null;
}

export function computeTypeCode(
  car: CarRow,
  bmwForChassis: BmwRow[],
):
  | { kind: "tagged"; typeCode: string }
  | { kind: "chassis_not_in_bmw_models" }
  | { kind: "no_model_match" }
  | { kind: "ambiguous"; typeCodes: string[] } {
  if (!bmwForChassis || bmwForChassis.length === 0) {
    return { kind: "chassis_not_in_bmw_models" };
  }
  const cn = normalizeVariant(car.modelName);
  if (!cn.variant) return { kind: "no_model_match" };

  const byModel = bmwForChassis.filter((b) => {
    const bn = normalizeVariant(b.modelName);
    return bn.variant === cn.variant && bn.modifiers === cn.modifiers;
  });
  if (byModel.length === 0) return { kind: "no_model_match" };

  let distinct = new Set(byModel.map((b) => b.typeCode));
  if (distinct.size === 1) {
    return { kind: "tagged", typeCode: [...distinct][0] };
  }

  const fam = engineFamily(car.engine);
  if (fam) {
    const filtered = byModel.filter(
      (b) => b.engineCode && b.engineCode.toUpperCase().startsWith(fam),
    );
    if (filtered.length > 0) {
      const d2 = new Set(filtered.map((b) => b.typeCode));
      if (d2.size === 1) return { kind: "tagged", typeCode: [...d2][0] };
      return { kind: "ambiguous", typeCodes: [...d2] };
    }
  }
  return { kind: "ambiguous", typeCodes: [...distinct] };
}

export async function runTypeCodeBackfill(opts: {
  apply: boolean;
  onlyNull?: boolean;
}): Promise<BackfillReport> {
  const onlyNull = opts.onlyNull !== false;

  const allCarsRaw = await db
    .select({
      id: carsTable.id,
      chassis: carsTable.chassis,
      modelName: carsTable.modelName,
      engine: carsTable.engine,
      typeCode: carsTable.typeCode,
    })
    .from(carsTable);

  const allBmw = await db
    .select({
      chassis: bmwModelsTable.chassis,
      typeCode: bmwModelsTable.typeCode,
      modelName: bmwModelsTable.modelName,
      engineCode: bmwModelsTable.engineCode,
    })
    .from(bmwModelsTable);

  const bmwByChassis = new Map<string, BmwRow[]>();
  for (const b of allBmw) {
    const key = b.chassis.toUpperCase();
    const arr = bmwByChassis.get(key) || [];
    arr.push(b);
    bmwByChassis.set(key, arr);
  }

  const perChassis = new Map<
    string,
    {
      chassis: string;
      total: number;
      alreadyTagged: number;
      newlyTagged: number;
      ambiguous: number;
      noModelMatch: number;
      chassisMissing: number;
    }
  >();

  const updates: Array<{ id: number; typeCode: string }> = [];
  const ambiguousSample: BackfillCarResult[] = [];
  const noModelMatchSample: BackfillCarResult[] = [];
  let alreadyTagged = 0;

  for (const c of allCarsRaw) {
    const chassisKey = c.chassis.toUpperCase();
    const bucket = perChassis.get(chassisKey) || {
      chassis: c.chassis,
      total: 0,
      alreadyTagged: 0,
      newlyTagged: 0,
      ambiguous: 0,
      noModelMatch: 0,
      chassisMissing: 0,
    };
    bucket.total++;
    perChassis.set(chassisKey, bucket);

    if (onlyNull && c.typeCode) {
      alreadyTagged++;
      bucket.alreadyTagged++;
      continue;
    }

    const result = computeTypeCode(c, bmwByChassis.get(chassisKey) || []);
    if (result.kind === "tagged") {
      bucket.newlyTagged++;
      updates.push({ id: c.id, typeCode: result.typeCode });
    } else if (result.kind === "ambiguous") {
      bucket.ambiguous++;
      if (ambiguousSample.length < 25) {
        ambiguousSample.push({
          carId: c.id,
          chassis: c.chassis,
          modelName: c.modelName,
          reason: "ambiguous_multiple_type_codes",
          candidateTypeCodes: result.typeCodes,
        });
      }
    } else if (result.kind === "chassis_not_in_bmw_models") {
      bucket.chassisMissing++;
    } else {
      bucket.noModelMatch++;
      if (noModelMatchSample.length < 25) {
        noModelMatchSample.push({
          carId: c.id,
          chassis: c.chassis,
          modelName: c.modelName,
          reason: "no_model_match",
        });
      }
    }
  }

  if (opts.apply && updates.length > 0) {
    const BATCH = 500;
    for (let i = 0; i < updates.length; i += BATCH) {
      const chunk = updates.slice(i, i + BATCH);
      const cases = chunk
        .map(
          (u) =>
            sql`WHEN ${u.id} THEN ${u.typeCode}`,
        );
      const ids = chunk.map((u) => u.id);
      await db.execute(sql`
        UPDATE cars
        SET type_code = CASE id
          ${sql.join(cases, sql.raw(" "))}
        END
        WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql.raw(", "))})
      `);
    }
  }

  let tagged = 0;
  let ambiguous = 0;
  let noModelMatch = 0;
  let chassisMissing = 0;
  for (const b of perChassis.values()) {
    ambiguous += b.ambiguous;
    noModelMatch += b.noModelMatch;
    chassisMissing += b.chassisMissing;
  }
  tagged = updates.length;

  const perChassisArr = [...perChassis.values()].sort((a, b) =>
    a.chassis.localeCompare(b.chassis),
  );

  return {
    totalCars: allCarsRaw.length,
    alreadyTagged,
    tagged,
    ambiguous,
    noModelMatch,
    chassisNotInBmwModels: chassisMissing,
    applied: opts.apply,
    perChassis: perChassisArr,
    ambiguousSample,
    noModelMatchSample,
  };
}
