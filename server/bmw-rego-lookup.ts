/**
 * bmw-rego-lookup.ts
 *
 * Looks up a VIN from BMW Australia's recall site using a real browser session
 * (Playwright + Chromium) so that reCAPTCHA v3 executes naturally.
 *
 * The lookup is intentionally slow (~4-8s) — callers should treat it as async
 * and use the rego_vin_cache table as a write-through cache so repeat lookups
 * are instant.
 *
 * Supported states: NSW only for now. Extend AUS_STATES to add more.
 */

import { chromium } from "playwright";
import { db } from "./storage.js";
import { regoVinCache } from "@shared/schema.js";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AUS_STATES = ["NSW"] as const;
export type AusState = typeof AUS_STATES[number];

const BMW_RECALL_URL = "https://www.recall.bmw.com.au/";
const LOOKUP_TIMEOUT_MS = 30_000;

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
// Live scrape via Playwright
// ---------------------------------------------------------------------------

export async function scrapeRegoVin(
  rego: string,
  state: AusState,
): Promise<RegoLookupOutcome> {
  const upper = rego.toUpperCase().trim();

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-AU",
    });

    // Intercept the Rego and Vehicle API responses
    let regoResponse: any = null;
    let vehicleResponse: any = null;

    context.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/BmwRecall/Rego")) {
        try { regoResponse = await response.json(); } catch {}
      }
      if (url.includes("/BmwRecall/Vehicle")) {
        try { vehicleResponse = await response.json(); } catch {}
      }
    });

    const page = await context.newPage();

    await page.goto(BMW_RECALL_URL, { waitUntil: "networkidle", timeout: LOOKUP_TIMEOUT_MS });

    // Wait for the Angular app to mount and render the rego input
    await page.waitForSelector("input#rego", { timeout: 15_000 });

    // Fill the rego field — use Angular-compatible input events
    const regoInput = page.locator("input#rego");
    await regoInput.click();
    await regoInput.fill(upper);
    await regoInput.dispatchEvent("input");
    await regoInput.dispatchEvent("change");

    // Select the state — the <select> doesn't have an id, grab by tag within the form area
    await page.selectOption("select", state);
    await page.locator("select").dispatchEvent("change");

    // Allow reCAPTCHA v3 to run (it fires in the background automatically)
    await page.waitForTimeout(1500);

    // Click Next — it's an <a> containing the text "Next"
    await page.locator("a:has-text('Next')").click();

    // Wait for both API responses — the Rego call fires on click, Vehicle fires after
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (regoResponse !== null) break;
      await page.waitForTimeout(300);
    }

    if (!regoResponse) {
      return { found: false, reason: "No response from BMW recall API", rego: upper, state };
    }

    if (!regoResponse.success || !regoResponse.found) {
      return { found: false, reason: "Rego not found in BMW recall system", rego: upper, state };
    }

    const vin: string = regoResponse.vin;

    // Wait briefly for Vehicle response (fires automatically after Rego)
    const vehicleDeadline = Date.now() + 5_000;
    while (Date.now() < vehicleDeadline) {
      if (vehicleResponse !== null) break;
      await page.waitForTimeout(200);
    }

    const model: string | null = vehicleResponse?.model ?? null;
    const year: number | null = vehicleResponse?.year ? parseInt(vehicleResponse.year) : null;
    const colour: string | null = vehicleResponse?.colour ?? null;

    // Write to cache
    await db
      .insert(regoVinCache)
      .values({
        rego: upper,
        state,
        vin,
        model,
        year,
        colour,
        source: "bmw_recall",
      })
      .onConflictDoUpdate({
        target: [regoVinCache.rego, regoVinCache.state],
        set: { vin, model, year, colour, lookedUpAt: new Date(), source: "bmw_recall" },
      });

    return { found: true, vin, model, year, colour, rego: upper, state, source: "bmw_recall" };
  } catch (err: any) {
    console.error("[rego-lookup] Scrape error:", err?.message);
    return { found: false, reason: `Scrape failed: ${err?.message ?? "unknown error"}`, rego: upper, state };
  } finally {
    await browser.close();
  }
}
