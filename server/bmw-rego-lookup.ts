/**
 * bmw-rego-lookup.ts
 *
 * Resolves an Australian rego plate to a VIN via BMW Australia's recall site
 * (https://www.recall.bmw.com.au/).
 *
 * reCAPTCHA v3 strategy: Playwright headless Chromium routed through Evomi
 * residential proxy. BMW's recall page handles reCAPTCHA natively -- we never
 * touch the token. The browser navigates the real recall site, fills the form,
 * and we intercept the API response via network interception.
 *
 * This is the only reliable approach:
 *   - datacenter fetch: BMW API returns 400 ReCaptcha Fail (score too low)
 *   - solving services (CapSolver ProxyLess): same result, confirmed
 *   - browser-side token forwarded from user: domain mismatch, rejected
 *   - Playwright on residential proxy: real Chrome, real residential IP,
 *     reCAPTCHA executes on recall.bmw.com.au -> high score -> accepted
 */

import { db } from "./storage.js";
import { regoVinCache } from "@shared/schema.js";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Supported states
// ---------------------------------------------------------------------------

export const AUS_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const;
export type AusState = typeof AUS_STATES[number];

// State label map used in the BMW recall form dropdown
const STATE_LABELS: Record<AusState, string> = {
  ACT: "Australian Capital Territory",
  NSW: "New South Wales",
  NT:  "Northern Territory",
  QLD: "Queensland",
  SA:  "South Australia",
  TAS: "Tasmania",
  VIC: "Victoria",
  WA:  "Western Australia",
};

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
// Playwright scraper -- navigates BMW's recall page on a residential proxy
// ---------------------------------------------------------------------------

function buildProxyUrl(): string | null {
  const host   = (process.env.EVOMI_PROXY_HOST     || "").trim();
  const port   = (process.env.EVOMI_PROXY_PORT     || "").trim();
  const user   = (process.env.EVOMI_PROXY_USERNAME || "").trim();
  const pass   = (process.env.EVOMI_PROXY_PASSWORD || "").trim();
  if (!host || !port || !user || !pass) return null;
  // Use https:// scheme -- confirmed working for BMW recall site via Evomi
  const scheme = (process.env.EVOMI_PROXY_SCHEME || "https").toLowerCase() === "http" ? "http" : "https";
  return `${scheme}://${host}:${port}`;
}

export async function lookupRegoWithPlaywright(
  rego: string,
  state: AusState,
): Promise<RegoLookupOutcome> {
  const upper = rego.toUpperCase().trim();

  let browser: any = null;
  try {
    const { chromium } = await import("playwright-extra");
    const { default: StealthPlugin } = await import("puppeteer-extra-plugin-stealth");
    chromium.use(StealthPlugin());

    const proxyServer = buildProxyUrl();
    const proxyUser   = (process.env.EVOMI_PROXY_USERNAME || "").trim();
    const proxyPass   = (process.env.EVOMI_PROXY_PASSWORD || "").trim();

    console.log(`[rego-lookup] Launching Chromium via ${proxyServer ? "Evomi residential proxy" : "direct (no proxy)"}`);

    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      ...(proxyServer ? { proxy: { server: proxyServer, username: proxyUser, password: proxyPass } } : {}),
    });

    const ctx = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-AU",
      timezoneId: "Australia/Sydney",
    });

    const page = await ctx.newPage();

    // Intercept the BMW API response
    let apiResponse: any = null;
    let apiError: string | null = null;

    page.on("response", async (response: any) => {
      const url: string = response.url();
      if (url.includes("fg.recall.bmw.com.au/BmwRecall/Rego")) {
        try {
          const status = response.status();
          if (status === 200) {
            apiResponse = await response.json();
          } else {
            const body = await response.text().catch(() => "");
            apiError = `BMW API ${status}: ${body.substring(0, 100)}`;
          }
        } catch (e: any) {
          apiError = `Response parse error: ${e?.message}`;
        }
      }
    });

    // Navigate to BMW recall page
    await page.goto("https://www.recall.bmw.com.au/", { waitUntil: "networkidle", timeout: 30_000 });

    // Fill rego field
    await page.fill('input[name="rego"], input[placeholder*="rego" i], input[placeholder*="registration" i], input[type="text"]:first-of-type', upper);

    // Select state from dropdown
    const stateLabel = STATE_LABELS[state];
    try {
      // Try Angular Material / custom select first
      await page.click(`mat-select, select[name*="state" i], select[id*="state" i]`, { timeout: 3000 });
      await page.click(`mat-option:has-text("${stateLabel}"), option[value="${state}"]`, { timeout: 3000 });
    } catch {
      // Fallback: native select
      await page.selectOption(`select`, { label: stateLabel }).catch(async () => {
        await page.selectOption(`select`, state);
      });
    }

    // Submit the form
    await page.click('button[type="submit"], button:has-text("Search"), button:has-text("Look up")', { timeout: 5000 });

    // Wait for the API call to complete (up to 20s)
    const deadline = Date.now() + 20_000;
    while (!apiResponse && !apiError && Date.now() < deadline) {
      await page.waitForTimeout(500);
    }

    await browser.close();
    browser = null;

    if (apiError) {
      if (apiError.includes("ReCaptcha")) {
        return { found: false, reason: "reCAPTCHA check failed -- retry", rego: upper, state };
      }
      return { found: false, reason: apiError, rego: upper, state };
    }

    if (!apiResponse) {
      return { found: false, reason: "Timeout waiting for BMW API response", rego: upper, state };
    }

    if (!apiResponse.success || !apiResponse.found || !apiResponse.vin) {
      return { found: false, reason: "Registration not found in BMW system", rego: upper, state };
    }

    const vin: string = apiResponse.vin;
    const model:  string | null = apiResponse.model  ?? null;
    const year:   number | null = apiResponse.year   ? parseInt(apiResponse.year) : null;
    const colour: string | null = apiResponse.colour ?? null;

    // Write to cache
    await db
      .insert(regoVinCache)
      .values({ rego: upper, state, vin, model, year, colour, source: "bmw_recall" })
      .onConflictDoUpdate({
        target: [regoVinCache.rego, regoVinCache.state],
        set: { vin, model, year, colour, lookedUpAt: new Date(), source: "bmw_recall" },
      });

    console.log(`[rego-lookup] ${upper}/${state} -> ${vin} (${model ?? "unknown"})`);
    return { found: true, vin, model, year, colour, rego: upper, state, source: "bmw_recall" };

  } catch (err: any) {
    if (browser) { try { await browser.close(); } catch {} }
    console.error(`[rego-lookup] Playwright error: ${err?.message}`);
    return { found: false, reason: err?.message ?? "Scraper error", rego: upper, state };
  }
}

// ---------------------------------------------------------------------------
// Public entry point -- alias kept for routes.ts compatibility
// ---------------------------------------------------------------------------

export async function lookupRegoWithToken(
  rego: string,
  state: AusState,
  _recaptchaToken: string, // ignored -- Playwright handles reCAPTCHA natively
): Promise<RegoLookupOutcome> {
  return lookupRegoWithPlaywright(rego, state);
}
