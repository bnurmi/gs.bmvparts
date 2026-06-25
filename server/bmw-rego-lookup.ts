/**
 * bmw-rego-lookup.ts
 *
 * Resolves an Australian rego plate to a VIN via BMW Australia's recall site
 * (https://www.recall.bmw.com.au/).
 *
 * The recall site uses reCAPTCHA v3 server-side. We obtain a valid token from
 * CapSolver (cheap, fast, ~5s) then POST directly to the BMW recall API --
 * no headless browser required.
 *
 * Flow:
 *   1. Ask CapSolver to solve reCAPTCHA v3 for the recall site key
 *   2. POST /BmwRecall/Rego  -> vin
 *   3. POST /BmwRecall/Vehicle -> model, year, colour
 *   4. Cache result in rego_vin_cache, return to caller
 */

import { db } from "./storage.js";
import { regoVinCache } from "@shared/schema.js";
import { eq, and } from "drizzle-orm";
import { readFileSync } from "fs";
import { homedir } from "os";
import path from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BMW_RECALL_SITE_KEY = "6LfRPsoZAAAAAP-kZo0Sd7aw_89JIx-XUnTod7_R";
const BMW_RECALL_URL      = "https://www.recall.bmw.com.au/";
const BMW_API_BASE        = "https://fg.recall.bmw.com.au/BmwRecall";
const CAPSOLVER_API       = "https://api.capsolver.com";
const CAPSOLVER_ENV_FILE  = path.join(homedir(), ".hermes/profiles/veronica/secrets/capsolver.env");

function getCapsolverKey(): string {
  // In Docker: injected as env var
  const fromEnv = process.env.CAPSOLVER_API_KEY;
  if (fromEnv) return fromEnv;
  // Local dev: read from secrets file
  try {
    const raw = readFileSync(CAPSOLVER_ENV_FILE, "utf-8");
    for (const line of raw.split("\n")) {
      const [k, v] = line.trim().split("=");
      if (k === "CAPSOLVER_API_KEY" && v) return v.trim();
    }
  } catch {}
  throw new Error("CAPSOLVER_API_KEY not found in environment or secrets file");
}

// ---------------------------------------------------------------------------
// Supported states
// ---------------------------------------------------------------------------

export const AUS_STATES = ["NSW"] as const;
export type AusState = typeof AUS_STATES[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegoLookupResult {
  found: true;
  vin: string;
  model: string | null;
  year: number | null;
  colour: string | null;
  rego: string;
  state: AusState;
  source: "cache" | "bmw_recall";
}

export interface RegoLookupMiss {
  found: false;
  reason: string;
  rego: string;
  state: AusState;
}

export type RegoLookupOutcome = RegoLookupResult | RegoLookupMiss;

// ---------------------------------------------------------------------------
// Cache check
// ---------------------------------------------------------------------------

export async function checkRegoCache(
  rego: string,
  state: AusState,
): Promise<RegoLookupResult | null> {
  const upper = rego.toUpperCase().trim();
  const rows = await db
    .select()
    .from(regoVinCache)
    .where(and(eq(regoVinCache.rego, upper), eq(regoVinCache.state, state)))
    .limit(1);

  if (!rows.length) return null;
  const r = rows[0];
  return {
    found: true,
    vin: r.vin,
    model: r.model,
    year: r.year,
    colour: r.colour,
    rego: r.rego,
    state: r.state as AusState,
    source: "cache",
  };
}

// ---------------------------------------------------------------------------
// CapSolver -- obtain reCAPTCHA v3 token
// ---------------------------------------------------------------------------

async function solveRecaptchaV3(action = "rego"): Promise<string> {
  const clientKey = getCapsolverKey();

  // Create task
  const createRes = await fetch(`${CAPSOLVER_API}/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey,
      task: {
        type: "ReCaptchaV3TaskProxyLess",
        websiteURL: BMW_RECALL_URL,
        websiteKey: BMW_RECALL_SITE_KEY,
        pageAction: action,
        minScore: 0.5,
      },
    }),
  });

  const createData: any = await createRes.json();
  if (createData.errorId && createData.errorId !== 0) {
    throw new Error(`CapSolver createTask error: ${createData.errorCode} ${createData.errorDescription}`);
  }
  const taskId: string = createData.taskId;

  // Poll for result (up to 30s, every 2s)
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));

    const pollRes = await fetch(`${CAPSOLVER_API}/getTaskResult`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey, taskId }),
    });
    const pollData: any = await pollRes.json();

    if (pollData.status === "ready") {
      const token: string = pollData.solution?.gRecaptchaResponse;
      if (!token) throw new Error("CapSolver returned ready but no token");
      return token;
    }
    if (pollData.status === "failed" || (pollData.errorId && pollData.errorId !== 0)) {
      throw new Error(`CapSolver task failed: ${pollData.errorCode ?? pollData.status}`);
    }
    // status === "processing" -- keep polling
  }

  throw new Error("CapSolver timed out after 30s");
}

// ---------------------------------------------------------------------------
// BMW recall API calls
// ---------------------------------------------------------------------------

const BMW_HEADERS = {
  "Content-Type": "application/json",
  "Origin":  "https://www.recall.bmw.com.au",
  "Referer": "https://www.recall.bmw.com.au/",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

async function bmwRegoLookup(rego: string, state: string, token: string) {
  const res = await fetch(`${BMW_API_BASE}/Rego`, {
    method: "POST",
    headers: BMW_HEADERS,
    body: JSON.stringify({ rego, regoState: state, brand: "1", token }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BMW /Rego API ${res.status}: ${text.substring(0, 100)}`);
  }
  return res.json() as Promise<{ success: boolean; found: boolean; vin?: string }>;
}

async function bmwVehicleLookup(rego: string, state: string, vin: string, token: string) {
  const res = await fetch(`${BMW_API_BASE}/Vehicle`, {
    method: "POST",
    headers: BMW_HEADERS,
    body: JSON.stringify({ rego, regoState: state, brand: "1", token, vin }),
  });
  if (!res.ok) return null; // Vehicle lookup is best-effort
  return res.json() as Promise<{ model?: string; year?: string; colour?: string } | null>;
}

// ---------------------------------------------------------------------------
// Public scrape function
// ---------------------------------------------------------------------------

export async function scrapeRegoVin(
  rego: string,
  state: AusState,
): Promise<RegoLookupOutcome> {
  const upper = rego.toUpperCase().trim();

  try {
    console.log(`[rego-lookup] Solving reCAPTCHA for ${upper}/${state}...`);
    const token = await solveRecaptchaV3();

    console.log(`[rego-lookup] Token obtained. Querying BMW Rego API...`);
    const regoData = await bmwRegoLookup(upper, state, token);

    if (!regoData.success || !regoData.found || !regoData.vin) {
      return { found: false, reason: "Registration not found in BMW recall system", rego: upper, state };
    }

    const vin = regoData.vin;
    console.log(`[rego-lookup] VIN resolved: ${vin}. Fetching vehicle details...`);

    // Vehicle lookup uses a fresh token (BMW may validate it again)
    let vehicleData: any = null;
    try {
      const vehicleToken = await solveRecaptchaV3();
      vehicleData = await bmwVehicleLookup(upper, state, vin, vehicleToken);
    } catch (e) {
      console.warn(`[rego-lookup] Vehicle details fetch failed (non-fatal): ${e}`);
    }

    const model:  string | null = vehicleData?.model  ?? null;
    const year:   number | null = vehicleData?.year   ? parseInt(vehicleData.year) : null;
    const colour: string | null = vehicleData?.colour ?? null;

    // Write to cache
    await db
      .insert(regoVinCache)
      .values({ rego: upper, state, vin, model, year, colour, source: "bmw_recall" })
      .onConflictDoUpdate({
        target: [regoVinCache.rego, regoVinCache.state],
        set: { vin, model, year, colour, lookedUpAt: new Date(), source: "bmw_recall" },
      });

    console.log(`[rego-lookup] Cached ${upper}/${state} -> ${vin}`);
    return { found: true, vin, model, year, colour, rego: upper, state, source: "bmw_recall" };

  } catch (err: any) {
    console.error(`[rego-lookup] Error: ${err?.message}`);
    return { found: false, reason: err?.message ?? "Unknown error", rego: upper, state };
  }
}
