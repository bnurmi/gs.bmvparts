// Server-side rail enricher for the per-VIN landing (Task #96, T006).
// Reads `vin_cache` only — `user_cars` is never queried. Rail failures
// degrade to an empty rail (logged, not thrown) so SSR stays fast.
// All user/decoded values are passed as bound parameters via Drizzle's
// tagged-template `sql`; column expressions are constants in this module.

import { db } from "../storage";
import { sql } from "drizzle-orm";
import type { VinLandingData } from "./vin-landing";
import type { VinForLanding, VinRelatedItem } from "../../shared/bmv-vin/projection";
import { emptyRails } from "../../shared/bmv-vin/projection";

const RAIL_LIMIT = 6;

interface RelatedRow { vin: unknown; label: unknown; thumb_url?: unknown }
interface CountRow { cnt: unknown }
interface OptionCountRow { value: unknown; cnt: unknown }
interface EnrichmentTabInfo { source?: string }

function rowsToItems(rows: unknown[]): VinRelatedItem[] {
  return (rows as RelatedRow[]).map(r => ({
    vin: String(r.vin ?? "").toUpperCase(),
    label: String(r.label ?? r.vin ?? "").trim(),
    thumbUrl: typeof r.thumb_url === "string" ? r.thumb_url : null,
  }));
}

async function fetchSameChassisOtherYears(base: VinLandingData): Promise<VinRelatedItem[]> {
  if (!base.decodedChassis || !base.decodedModelYear) return [];
  const chassis = base.decodedChassis.toUpperCase();
  const year = String(base.decodedModelYear);
  try {
    const rs = await db.execute(sql`
      SELECT vin,
             CONCAT_WS(' ',
               decoded_data->>'modelYear',
               COALESCE(decoded_data->>'modelName', decoded_data->>'chassis', '')
             ) AS label
      FROM vin_cache
      WHERE UPPER(decoded_data->>'chassis') = ${chassis}
        AND COALESCE(decoded_data->>'modelYear', '') <> ${year}
        AND vin <> ${base.vin}
      ORDER BY updated_at DESC NULLS LAST, decoded_data->>'modelYear' DESC, vin
      LIMIT ${RAIL_LIMIT}
    `);
    return rowsToItems(rs.rows);
  } catch (err) {
    console.warn("[bmv-vin/rails] sameChassisOtherYears failed", { vin: base.vin, err });
    return [];
  }
}

async function fetchSamePlantSameYear(base: VinLandingData): Promise<VinRelatedItem[]> {
  if (!base.decodedPlantCity || !base.decodedModelYear) return [];
  const plant = base.decodedPlantCity;
  const year = String(base.decodedModelYear);
  try {
    const rs = await db.execute(sql`
      SELECT vin,
             CONCAT_WS(' ',
               decoded_data->>'modelYear',
               COALESCE(decoded_data->>'modelName', decoded_data->>'chassis', '')
             ) AS label
      FROM vin_cache
      WHERE LOWER(decoded_data->'plant'->>'city') = LOWER(${plant})
        AND COALESCE(decoded_data->>'modelYear', '') = ${year}
        AND vin <> ${base.vin}
      ORDER BY updated_at DESC NULLS LAST, vin
      LIMIT ${RAIL_LIMIT}
    `);
    return rowsToItems(rs.rows);
  } catch (err) {
    console.warn("[bmv-vin/rails] samePlantSameYear failed", { vin: base.vin, err });
    return [];
  }
}

async function fetchSimilarBuilds(base: VinLandingData): Promise<VinRelatedItem[]> {
  const paint = base.vehicle?.colorCode;
  const optionCodes = base.options.slice(0, 8).map(o => o.code).filter(Boolean);
  if (!paint || optionCodes.length < 2) return [];
  // Pass option codes as a parameterized text[] — Drizzle's pg driver
  // serializes JS arrays to PG arrays for `= ANY($n)` overlap tests.
  try {
    const rs = await db.execute(sql`
      SELECT vc.vin,
             CONCAT_WS(' ',
               vc.decoded_data->>'modelYear',
               COALESCE(vc.decoded_data->>'modelName', vc.decoded_data->>'chassis', '')
             ) AS label
      FROM vin_cache vc
      WHERE LOWER(vc.enriched_data->'vehicle'->>'colorCode') = LOWER(${paint})
        AND vc.vin <> ${base.vin}
        AND (
          SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(vc.enriched_data->'options', '[]'::jsonb)) opt
          WHERE opt->>'code' = ANY(ARRAY[${sql.join(optionCodes.map(c => sql`${c}`), sql`, `)}]::text[])
        ) >= 2
      ORDER BY vc.updated_at DESC NULLS LAST, vc.vin
      LIMIT ${RAIL_LIMIT}
    `);
    return rowsToItems(rs.rows);
  } catch (err) {
    console.warn("[bmv-vin/rails] similarBuilds failed", { vin: base.vin, err });
    return [];
  }
}

async function fetchTopPaint(base: VinLandingData): Promise<VinForLanding["topPaint"]> {
  if (!base.vehicle?.colorCode) return null;
  const code = base.vehicle.colorCode;
  try {
    const rs = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM vin_cache
      WHERE LOWER(enriched_data->'vehicle'->>'colorCode') = LOWER(${code})
    `);
    const cnt = Number(((rs.rows as unknown as CountRow[])[0])?.cnt ?? 0);
    if (cnt < 2) return null;
    return {
      code,
      label: base.vehicle.color || code,
      cohortSize: cnt,
    };
  } catch (err) {
    console.warn("[bmv-vin/rails] topPaint failed", { vin: base.vin, err });
    return null;
  }
}

async function fetchTopOptions(base: VinLandingData): Promise<VinForLanding["topOptions"]> {
  const codes = base.options.slice(0, 30).map(o => o.code).filter(Boolean);
  if (codes.length === 0) return [];
  const labelMap = new Map(base.options.map(o => [o.code, o.nameEn || o.code]));
  try {
    const rs = await db.execute(sql`
      SELECT opt->>'code' AS value, COUNT(DISTINCT vc.vin)::int AS cnt
      FROM vin_cache vc, jsonb_array_elements(COALESCE(vc.enriched_data->'options', '[]'::jsonb)) opt
      WHERE opt->>'code' = ANY(${codes})
      GROUP BY value
      ORDER BY cnt DESC
      LIMIT 4
    `);
    return (rs.rows as unknown as OptionCountRow[])
      .filter(r => Number(r.cnt) >= 2)
      .map(r => {
        const code = String(r.value ?? "");
        return {
          code,
          label: labelMap.get(code) || code,
          cohortSize: Number(r.cnt ?? 0),
        };
      });
  } catch (err) {
    console.warn("[bmv-vin/rails] topOptions failed", { vin: base.vin, err });
    return [];
  }
}

function composeProvenance(base: VinLandingData): string | null {
  const src = base.enrichmentSource;
  if (!src) return null;
  const tabs = src as Record<string, EnrichmentTabInfo | undefined>;
  const parts: string[] = [];
  const fmt = (label: string, tab: string) => {
    const info = tabs[tab];
    if (info?.source && info.source !== "none") parts.push(`${label}: ${info.source}`);
  };
  fmt("Vehicle", "vehicle");
  fmt("Options", "options");
  fmt("Images", "images");
  fmt("Manuals", "manuals");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Async enricher — call after `projectVinCacheRow` to add the rails.
 * Each rail is fetched in parallel and any failure yields an empty rail.
 */
export async function projectVinForLanding(base: VinLandingData): Promise<VinForLanding> {
  const empty = emptyRails();
  const [sameChassis, samePlant, similar, topPaint, topOptions] = await Promise.all([
    fetchSameChassisOtherYears(base).catch(() => empty.sameChassisOtherYears),
    fetchSamePlantSameYear(base).catch(() => empty.samePlantSameYear),
    fetchSimilarBuilds(base).catch(() => empty.similarBuilds),
    fetchTopPaint(base).catch(() => empty.topPaint),
    fetchTopOptions(base).catch(() => empty.topOptions),
  ]);
  return {
    ...base,
    sameChassisOtherYears: sameChassis,
    samePlantSameYear: samePlant,
    similarBuilds: similar,
    topPaint,
    topOptions,
    provenanceLine: composeProvenance(base),
  };
}
