// Quick Servicing Info (Task #106) — service layer
//
// Resolves a VIN to a (chassis, engine) pair, returns a normalised payload
// of fluid capacities + filter part numbers with per-field trust badges.
// Sources, in order of priority for each field:
//   1. Admin-verified row in `servicing_specs` / `servicing_filter_pins`.
//   2. Admin AI-draft row (same tables, status='ai_draft').
//   3. (Filters only) auto-derivation from the local parts catalog.
// AI drafts are generated on-demand by admins via /api/admin/servicing/ai-draft.

import OpenAI from "openai";
import { loggedChatCompletion } from "./openai-logger";
import { db } from "./storage";
import { sql } from "drizzle-orm";
import {
  SERVICING_FLUID_KEYS,
  SERVICING_FILTER_KEYS,
  type ServicingFluidKey,
  type ServicingFilterKey,
  type ServicingFluidValue,
  type ServicingFluidsMap,
  type ServicingTrustStatus,
} from "@shared/schema";

export interface ServicingFilterEntry {
  filterKey: ServicingFilterKey;
  partNumber: string | null;
  note: string | null;
  status: ServicingTrustStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  source: "admin_pin" | "catalog_match" | "none";
  catalogDescription?: string | null;
}

export interface ServicingResolved {
  vin: string | null;
  chassis: string | null;
  engine: string | null;
  modelName: string | null;
  modelYear: number | null;
  fluids: Array<{ key: ServicingFluidKey; value: ServicingFluidValue }>;
  filters: ServicingFilterEntry[];
  hasAnyAiDraft: boolean;
  hasAnyData: boolean;
  coverageRequested: boolean;
}

const FLUID_LABELS: Record<ServicingFluidKey, string> = {
  engineOil: "Engine oil",
  gearbox: "Gearbox / transmission",
  frontDiff: "Front differential",
  rearDiff: "Rear differential",
  transferCase: "Transfer case",
  cooling: "Cooling system",
};

export function fluidLabel(k: ServicingFluidKey) {
  return FLUID_LABELS[k];
}

const FILTER_LABELS: Record<ServicingFilterKey, string> = {
  engine_oil: "Engine oil filter",
  cabin: "Cabin / micro filter",
  air: "Air filter",
  fuel: "Fuel filter",
  transmission: "Transmission filter",
};

export function filterLabel(k: ServicingFilterKey) {
  return FILTER_LABELS[k];
}

// Description-keyword heuristics used to auto-derive filter part numbers
// from the local parts catalog. Order matters within a category — first
// match wins. Negative keywords prevent obvious cross-category bleed.
const FILTER_KEYWORDS: Record<ServicingFilterKey, { positive: string[]; negative: string[] }> = {
  engine_oil: { positive: ["oil filter element", "oil-filter element", "oil filter"], negative: ["transmission", "gearbox", "rear axle", "differential", "fuel"] },
  cabin: { positive: ["microfilter", "micro filter", "cabin filter", "activated carbon"], negative: [] },
  air: { positive: ["air filter element", "intake silencer with filter", "air filter"], negative: ["cabin", "micro"] },
  fuel: { positive: ["fuel filter"], negative: ["fuel filter cover", "fuel filter cap"] },
  transmission: { positive: ["transmission oil filter", "automatic transmission filter", "gearbox oil filter"], negative: [] },
};

function emptyFluid(): ServicingFluidValue {
  return { capacityMl: null, grade: null, notes: null, status: "empty", verifiedBy: null, verifiedAt: null };
}

interface SpecsDbRow { fluids: unknown }
interface FilterPinDbRow {
  filter_key: string; part_number: string; note: string | null;
  status: string; verified_by: string | null; verified_at: string | Date | null;
}

export async function loadSpecsRow(chassis: string, engine: string): Promise<ServicingFluidsMap> {
  const r = await db.execute(sql`SELECT fluids FROM servicing_specs WHERE chassis=${chassis} AND engine=${engine} LIMIT 1`);
  const row = (r.rows as unknown as SpecsDbRow[])[0];
  if (!row) return {};
  const fluids = row.fluids;
  if (!fluids || typeof fluids !== "object") return {};
  return fluids as ServicingFluidsMap;
}

export async function loadFilterPins(chassis: string, engine: string) {
  const r = await db.execute(sql`SELECT filter_key, part_number, note, status, verified_by, verified_at FROM servicing_filter_pins WHERE chassis=${chassis} AND engine=${engine}`);
  return (r.rows as unknown as FilterPinDbRow[]).map(row => ({
    filterKey: row.filter_key as ServicingFilterKey,
    partNumber: row.part_number,
    note: row.note ?? null,
    status: row.status as ServicingTrustStatus,
    verifiedBy: row.verified_by ?? null,
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
  }));
}

async function autoDeriveFilter(chassis: string, engine: string, filterKey: ServicingFilterKey): Promise<{ partNumber: string; description: string } | null> {
  const kw = FILTER_KEYWORDS[filterKey];
  if (kw.positive.length === 0) return null;
  const posPatterns = kw.positive.map(s => `%${s.toLowerCase()}%`);
  const negPatterns = kw.negative.map(s => `%${s.toLowerCase()}%`);
  try {
    // Match parts on cars sharing both chassis AND engine for the VIN, so
    // engine-specific filters (e.g. N55 vs B58 oil filter) don't bleed
    // across siblings. Falls back to chassis-only when no engine-keyed
    // catalog cars exist for the combo.
    const result = await db.execute(sql`
      SELECT p.part_number AS part_number, p.description AS description, COUNT(*)::int AS hits,
             CASE WHEN c.engine = ${engine} THEN 1 ELSE 0 END AS engine_match
      FROM parts p
      JOIN cars c ON c.id = p.car_id
      WHERE c.chassis = ${chassis}
        AND p.part_number IS NOT NULL
        AND p.description IS NOT NULL
        AND lower(p.description) LIKE ANY(${posPatterns}::text[])
        AND (${negPatterns.length === 0} OR NOT (lower(p.description) LIKE ANY(${negPatterns}::text[])))
      GROUP BY p.part_number, p.description, engine_match
      ORDER BY engine_match DESC, hits DESC
      LIMIT 1
    `);
    const row = (result.rows as unknown as Array<{ part_number: string; description: string }>)[0];
    if (!row) return null;
    return { partNumber: String(row.part_number), description: String(row.description) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[servicing] auto-derive failed:", msg);
    return null;
  }
}

export async function resolveServicingForCarKey(opts: {
  vin: string | null;
  chassis: string;
  engine: string;
  modelName?: string | null;
  modelYear?: number | null;
}): Promise<ServicingResolved> {
  const { vin, chassis, engine } = opts;
  const [specsMap, pins] = await Promise.all([
    loadSpecsRow(chassis, engine),
    loadFilterPins(chassis, engine),
  ]);

  const fluids = SERVICING_FLUID_KEYS.map(key => {
    const v = specsMap[key];
    return { key, value: v ?? emptyFluid() };
  });

  const pinByKey = new Map(pins.map(p => [p.filterKey, p]));
  const filterEntries: ServicingFilterEntry[] = [];
  for (const fk of SERVICING_FILTER_KEYS) {
    const pin = pinByKey.get(fk);
    if (pin) {
      filterEntries.push({
        filterKey: fk,
        partNumber: pin.partNumber,
        note: pin.note,
        status: pin.status,
        verifiedBy: pin.verifiedBy,
        verifiedAt: pin.verifiedAt,
        source: "admin_pin",
      });
      continue;
    }
    const auto = await autoDeriveFilter(chassis, engine, fk);
    if (auto) {
      filterEntries.push({
        filterKey: fk,
        partNumber: auto.partNumber,
        note: null,
        status: "ai_draft",
        verifiedBy: null,
        verifiedAt: null,
        source: "catalog_match",
        catalogDescription: auto.description,
      });
    } else {
      filterEntries.push({
        filterKey: fk,
        partNumber: null,
        note: null,
        status: "empty",
        verifiedBy: null,
        verifiedAt: null,
        source: "none",
      });
    }
  }

  const hasAnyAiDraft =
    fluids.some(f => f.value.status === "ai_draft") ||
    filterEntries.some(f => f.status === "ai_draft");
  const hasAnyData =
    fluids.some(f => f.value.status !== "empty") ||
    filterEntries.some(f => f.status !== "empty" && f.partNumber);

  return {
    vin,
    chassis,
    engine,
    modelName: opts.modelName ?? null,
    modelYear: opts.modelYear ?? null,
    fluids,
    filters: filterEntries,
    hasAnyAiDraft,
    hasAnyData,
    coverageRequested: false,
  };
}

// AI draft generator. Asks GPT-5 for typical BMW-published service capacities
// and filter part numbers for the (chassis, engine) pair, expecting a strict
// JSON shape. Caller is responsible for marking the row as ai_draft and
// surfacing the disclaimer banner.
export async function generateAiDraft(chassis: string, engine: string, modelName: string | null) {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error("OpenAI integration not configured");
  }
  const ai = new OpenAI({ apiKey, baseURL });
  const prompt = `You are a senior BMW service technician. Provide typical factory-published service capacities and OEM filter part numbers for this BMW:

Chassis: ${chassis}
Engine: ${engine}
${modelName ? `Model: ${modelName}` : ""}

Return STRICT JSON in this exact shape (use null when unknown — do NOT invent):
{
  "fluids": {
    "engineOil":   { "capacityMl": number|null, "grade": string|null, "notes": string|null },
    "gearbox":     { "capacityMl": number|null, "grade": string|null, "notes": string|null },
    "frontDiff":   { "capacityMl": number|null, "grade": string|null, "notes": string|null },
    "rearDiff":    { "capacityMl": number|null, "grade": string|null, "notes": string|null },
    "transferCase":{ "capacityMl": number|null, "grade": string|null, "notes": string|null },
    "cooling":     { "capacityMl": number|null, "grade": string|null, "notes": string|null }
  },
  "filters": {
    "engine_oil":   { "partNumber": string|null, "note": string|null },
    "cabin":        { "partNumber": string|null, "note": string|null },
    "air":          { "partNumber": string|null, "note": string|null },
    "fuel":         { "partNumber": string|null, "note": string|null },
    "transmission": { "partNumber": string|null, "note": string|null }
  }
}

Capacities must be in millilitres (1L = 1000). Use OEM (BMW) part numbers only — never aftermarket. If a category does not apply (e.g. RWD car has no front differential), set its values to null and put a one-line reason in "notes".`;
  const completion = await loggedChatCompletion(ai, "servicing-ai-draft", {
    model: "gpt-5",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1200,
  });
  const text = completion.choices[0]?.message?.content || "{}";
  type AiDraftResult = {
    fluids?: Partial<Record<ServicingFluidKey, { capacityMl: number | null; grade: string | null; notes: string | null }>>;
    filters?: Partial<Record<ServicingFilterKey, { partNumber: string | null; note: string | null }>>;
  };
  let parsed: AiDraftResult;
  try { parsed = JSON.parse(text) as AiDraftResult; } catch { parsed = {}; }
  return parsed;
}

export async function upsertSpecsRow(chassis: string, engine: string, fluids: ServicingFluidsMap) {
  await db.execute(sql`
    INSERT INTO servicing_specs (chassis, engine, fluids, updated_at)
    VALUES (${chassis}, ${engine}, ${JSON.stringify(fluids)}::jsonb, NOW())
    ON CONFLICT (chassis, engine) DO UPDATE SET fluids = EXCLUDED.fluids, updated_at = NOW()
  `);
}

export async function upsertFilterPin(opts: {
  chassis: string; engine: string; filterKey: ServicingFilterKey;
  partNumber: string; note: string | null; status: "verified" | "ai_draft";
  verifiedBy: string | null;
}) {
  const { chassis, engine, filterKey, partNumber, note, status, verifiedBy } = opts;
  await db.execute(sql`
    INSERT INTO servicing_filter_pins (chassis, engine, filter_key, part_number, note, status, verified_by, verified_at, updated_at)
    VALUES (${chassis}, ${engine}, ${filterKey}, ${partNumber}, ${note}, ${status}, ${verifiedBy}, ${status === "verified" ? sql`NOW()` : null}, NOW())
    ON CONFLICT (chassis, engine, filter_key) DO UPDATE SET
      part_number = EXCLUDED.part_number,
      note = EXCLUDED.note,
      status = EXCLUDED.status,
      verified_by = EXCLUDED.verified_by,
      verified_at = EXCLUDED.verified_at,
      updated_at = NOW()
  `);
}

export async function deleteFilterPin(chassis: string, engine: string, filterKey: ServicingFilterKey) {
  await db.execute(sql`DELETE FROM servicing_filter_pins WHERE chassis=${chassis} AND engine=${engine} AND filter_key=${filterKey}`);
}

export async function recordCoverageRequest(opts: { chassis: string; engine: string; vin: string | null; email: string | null }) {
  await db.execute(sql`
    INSERT INTO servicing_coverage_requests (chassis, engine, vin, email)
    VALUES (${opts.chassis}, ${opts.engine}, ${opts.vin}, ${opts.email})
  `);
}

export async function listCoverageRequests(limit = 200) {
  const r = await db.execute(sql`
    SELECT id, chassis, engine, vin, email, created_at,
      COUNT(*) OVER (PARTITION BY chassis, engine) AS hits
    FROM servicing_coverage_requests
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  interface CoverageRow {
    id: number; chassis: string; engine: string; vin: string | null;
    email: string | null; created_at: string | Date; hits: number | string;
  }
  return (r.rows as unknown as CoverageRow[]).map(row => ({
    id: row.id,
    chassis: row.chassis,
    engine: row.engine,
    vin: row.vin,
    email: row.email,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    hits: Number(row.hits),
  }));
}

export async function listAdminCoverage(limit = 100) {
  // Aggregate which chassis+engine pairs have specs/pins. Used for the admin
  // dashboard to see at-a-glance which combos are still ai_draft / empty.
  const r = await db.execute(sql`
    SELECT chassis, engine,
           MAX(updated_at) AS updated_at,
           SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END)::int AS verified_filters,
           SUM(CASE WHEN status='ai_draft' THEN 1 ELSE 0 END)::int AS ai_draft_filters,
           COUNT(*)::int AS total_filters
    FROM servicing_filter_pins
    GROUP BY chassis, engine
    ORDER BY updated_at DESC NULLS LAST
    LIMIT ${limit}
  `);
  interface AdminCoverageRow {
    chassis: string; engine: string;
    fluidsVerified: number; fluidsAiDraft: number;
    filtersVerified: number; filtersAiDraft: number; totalFilters: number;
    updatedAt: string | null;
  }
  interface FilterAggRow { chassis: string; engine: string; updated_at: string | Date | null;
    verified_filters: number; ai_draft_filters: number; total_filters: number; }
  interface SpecsAggRow { chassis: string; engine: string; updated_at: string | Date | null; fluids: unknown }
  const filterRows = r.rows as unknown as FilterAggRow[];
  const specsR = await db.execute(sql`SELECT chassis, engine, fluids, updated_at FROM servicing_specs ORDER BY updated_at DESC LIMIT ${limit}`);
  const specRows = specsR.rows as unknown as SpecsAggRow[];
  // Include chassis+engine combos that only have outstanding coverage
  // requests (no specs/pins yet) so the dashboard surfaces them as a
  // "No data" row admins can click into.
  const requestsR = await db.execute(sql`
    SELECT chassis, engine, COUNT(*)::int AS hits, MAX(created_at) AS last_requested
    FROM servicing_coverage_requests
    GROUP BY chassis, engine
    ORDER BY hits DESC
    LIMIT ${limit}
  `);
  interface CoverageReqAggRow { chassis: string; engine: string; hits: number; last_requested: string | Date | null }
  const requestRows = requestsR.rows as unknown as CoverageReqAggRow[];
  const map = new Map<string, AdminCoverageRow>();
  for (const row of filterRows) {
    map.set(`${row.chassis}|${row.engine}`, {
      chassis: row.chassis, engine: row.engine,
      filtersVerified: row.verified_filters, filtersAiDraft: row.ai_draft_filters, totalFilters: row.total_filters,
      fluidsVerified: 0, fluidsAiDraft: 0,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    });
  }
  for (const row of specRows) {
    const key = `${row.chassis}|${row.engine}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        chassis: row.chassis, engine: row.engine,
        filtersVerified: 0, filtersAiDraft: 0, totalFilters: 0,
        fluidsVerified: 0, fluidsAiDraft: 0,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      };
      map.set(key, entry);
    }
    const fluids = ((row.fluids ?? {}) as ServicingFluidsMap);
    for (const k of SERVICING_FLUID_KEYS) {
      const v = fluids[k];
      if (v?.status === "verified") entry.fluidsVerified += 1;
      else if (v?.status === "ai_draft") entry.fluidsAiDraft += 1;
    }
  }
  for (const row of requestRows) {
    const key = `${row.chassis}|${row.engine}`;
    if (!map.has(key)) {
      map.set(key, {
        chassis: row.chassis, engine: row.engine,
        filtersVerified: 0, filtersAiDraft: 0, totalFilters: 0,
        fluidsVerified: 0, fluidsAiDraft: 0,
        updatedAt: row.last_requested ? new Date(row.last_requested).toISOString() : null,
      });
    }
  }
  return Array.from(map.values());
}
