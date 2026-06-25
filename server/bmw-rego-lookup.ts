/**
 * bmw-rego-lookup.ts
 *
 * Resolves an Australian rego plate to a VIN via BMW Australia's recall API
 * (https://fg.recall.bmw.com.au/BmwRecall/Rego).
 *
 * reCAPTCHA v3 strategy: the token is solved IN THE USER'S BROWSER (high score,
 * real residential IP) and forwarded here. The frontend loads the BMW recall
 * site key via the Google reCAPTCHA v3 script, executes it with action "bmwrecall",
 * and sends the resulting token in the POST body alongside rego + state.
 *
 * This is the only reliable approach -- datacenter-based solving services score
 * below BMW's threshold and are rejected with 400 ReCaptcha Fail.
 */

import { db } from "./storage.js";
import { regoVinCache } from "@shared/schema.js";
import { eq, and } from "drizzle-orm";

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
// BMW recall API -- called with a token obtained from the user's browser
// ---------------------------------------------------------------------------

const BMW_API_BASE = "https://fg.recall.bmw.com.au/BmwRecall";

const BMW_HEADERS = {
  "Content-Type": "application/json",
  "Origin":  "https://www.recall.bmw.com.au",
  "Referer": "https://www.recall.bmw.com.au/",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export async function lookupRegoWithToken(
  rego: string,
  state: AusState,
  recaptchaToken: string,
): Promise<RegoLookupOutcome> {
  const upper = rego.toUpperCase().trim();

  try {
    // Step 1: Rego -> VIN
    const regoRes = await fetch(`${BMW_API_BASE}/Rego`, {
      method: "POST",
      headers: BMW_HEADERS,
      body: JSON.stringify({ rego: upper, regoState: state, brand: "1", token: recaptchaToken }),
    });

    if (!regoRes.ok) {
      const text = await regoRes.text();
      if (text.includes("ReCaptcha")) {
        return { found: false, reason: "reCAPTCHA token rejected -- please try again", rego: upper, state };
      }
      return { found: false, reason: `BMW API error ${regoRes.status}`, rego: upper, state };
    }

    const regoData: any = await regoRes.json();
    if (!regoData.success || !regoData.found || !regoData.vin) {
      return { found: false, reason: "Registration not found in BMW recall system", rego: upper, state };
    }

    const vin: string = regoData.vin;

    // Step 2: VIN -> vehicle details (best-effort, reuse same token)
    let model: string | null = null;
    let year: number | null = null;
    let colour: string | null = null;
    try {
      const vehicleRes = await fetch(`${BMW_API_BASE}/Vehicle`, {
        method: "POST",
        headers: BMW_HEADERS,
        body: JSON.stringify({ rego: upper, regoState: state, brand: "1", token: recaptchaToken, vin }),
      });
      if (vehicleRes.ok) {
        const v: any = await vehicleRes.json();
        model  = v.model  ?? null;
        year   = v.year   ? parseInt(v.year) : null;
        colour = v.colour ?? null;
      }
    } catch {}

    // Step 3: Write to cache
    await db
      .insert(regoVinCache)
      .values({ rego: upper, state, vin, model, year, colour, source: "bmw_recall" })
      .onConflictDoUpdate({
        target: [regoVinCache.rego, regoVinCache.state],
        set: { vin, model, year, colour, lookedUpAt: new Date(), source: "bmw_recall" },
      });

    console.log(`[rego-lookup] ${upper}/${state} -> ${vin} (${model ?? "unknown model"})`);
    return { found: true, vin, model, year, colour, rego: upper, state, source: "bmw_recall" };

  } catch (err: any) {
    console.error(`[rego-lookup] Error: ${err?.message}`);
    return { found: false, reason: err?.message ?? "Unknown error", rego: upper, state };
  }
}
