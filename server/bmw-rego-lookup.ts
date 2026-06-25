/**
 * bmw-rego-lookup.ts
 *
 * Resolves an Australian rego plate to a VIN via BMW Australia's recall site
 * (https://www.recall.bmw.com.au/).
 *
 * reCAPTCHA v3 strategy: Playwright headless Chromium + stealth mode + Evomi
 * residential proxy (https:// scheme). BMW's recall page handles reCAPTCHA
 * natively -- we never touch the token. The browser fills the Angular form and
 * we intercept the BmwRecall/Rego API response via network interception.
 *
 * Form structure (confirmed via DOM inspection 2026-06-25):
 *   - Input: #rego (type=text, formcontrolname=rego)
 *   - State: select[formcontrolname=regoState] (native select, values: ACT/NSW/etc)
 *   - Submit: <a class="btn btn-primary left"> containing "Next" text
 *             (NOT a <button> -- Angular Material anchor tag)
 *
 * Known limitation: Evomi residential IP pool scores below BMW's reCAPTCHA
 * threshold when running headless. Result is 400 ReCaptcha Fail from BMW API.
 * Fix: upgrade to Oxylabs residential (set OXYLABS_RESIDENTIAL_* env vars).
 */

import { db } from "./storage.js";
import { regoVinCache } from "@shared/schema.js";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Supported states
// ---------------------------------------------------------------------------

export const AUS_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const;
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
// Proxy config
// ---------------------------------------------------------------------------

function buildProxyConfig(): { server: string; username: string; password: string } | null {
  // Prefer Oxylabs residential (better reCAPTCHA scores than Evomi)
  const oxyHost = (process.env.OXYLABS_PROXY_HOST || "").trim();
  const oxyPort = (process.env.OXYLABS_PROXY_PORT || "7777").trim();
  const oxyUser = (process.env.OXYLABS_USERNAME || "").trim();
  const oxyPass = (process.env.OXYLABS_PASSWORD || "").trim();
  if (oxyHost && oxyUser && oxyPass) {
    return { server: `https://${oxyHost}:${oxyPort}`, username: oxyUser, password: oxyPass };
  }

  // Fallback: Evomi residential (https:// scheme confirmed working for BMW recall)
  const host = (process.env.EVOMI_PROXY_HOST || "").trim();
  const port = (process.env.EVOMI_PROXY_PORT || "").trim();
  const user = (process.env.EVOMI_PROXY_USERNAME || "").trim();
  const pass = (process.env.EVOMI_PROXY_PASSWORD || "").trim();
  if (!host || !port || !user || !pass) return null;
  const scheme = (process.env.EVOMI_PROXY_SCHEME || "https").toLowerCase() === "http" ? "http" : "https";
  return { server: `${scheme}://${host}:${port}`, username: user, password: pass };
}

// ---------------------------------------------------------------------------
// Playwright scraper
// ---------------------------------------------------------------------------

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

    const proxy = buildProxyConfig();
    const proxyLabel = proxy
      ? (proxy.server.includes("oxylabs") ? "Oxylabs residential" : "Evomi residential")
      : "no proxy (datacenter)";
    console.log(`[rego-lookup] Launching Chromium via ${proxyLabel}`);

    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      ...(proxy ? { proxy } : {}),
    });

    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
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
            console.log(`[rego-lookup] BMW API ${status}: ${body.substring(0, 80)}`);
          }
        } catch (e: any) {
          apiError = `Response parse error: ${e?.message}`;
        }
      }
    });

    // Navigate -- use domcontentloaded then wait for the Angular #rego input
    await page.goto("https://www.recall.bmw.com.au/", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForSelector("#rego", { timeout: 20_000 });

    // Dismiss cookie/privacy modal if present (best-effort)
    await page.click("button.close", { timeout: 2000 }).catch(() => {});

    // Let reCAPTCHA observe the session
    await page.waitForTimeout(4000);

    // Fill rego -- click first then type to trigger Angular's reactive form
    await page.click("#rego");
    await page.keyboard.type(upper, { delay: 100 });

    // Dispatch Angular input/change events
    await page.evaluate(() => {
      const el = document.querySelector("#rego") as HTMLInputElement | null;
      if (el) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    // Select state
    await page.selectOption("select[formcontrolname=\"regoState\"]", state).catch(async () => {
      // Fallback if formcontrolname doesn't match
      await page.selectOption("select", state);
    });
    await page.evaluate(() => {
      const el = document.querySelector("select[formcontrolname=\"regoState\"]") as HTMLSelectElement | null;
      if (el) el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await page.waitForTimeout(1500);

    // Click the Next anchor (confirmed: <a class="btn btn-primary left">Next…</a>)
    const clicked = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a"));
      const next = anchors.find((a: HTMLAnchorElement) => a.textContent?.includes("Next"));
      if (next) { (next as HTMLElement).click(); return true; }
      return false;
    });

    if (!clicked) {
      await browser.close();
      browser = null;
      return { found: false, reason: "Could not locate form submit button", rego: upper, state };
    }

    // Wait for API response (up to 25s)
    const deadline = Date.now() + 25_000;
    while (!apiResponse && !apiError && Date.now() < deadline) {
      await page.waitForTimeout(500);
    }

    await browser.close();
    browser = null;

    if (apiError) {
      // Log internally but don't surface reCAPTCHA detail to user
      console.log(`[rego-lookup] API error for ${upper}/${state}: ${apiError}`);
      return { found: false, reason: apiError, rego: upper, state };
    }

    if (!apiResponse) {
      return { found: false, reason: "Timeout -- no response from BMW system", rego: upper, state };
    }

    if (!apiResponse.success || !apiResponse.found || !apiResponse.vin) {
      return { found: false, reason: "Registration not found in BMW system", rego: upper, state };
    }

    const vin: string = apiResponse.vin;
    const model: string | null = apiResponse.model ?? null;
    const year: number | null = apiResponse.year ? parseInt(apiResponse.year) : null;
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
// Public entry point -- routes.ts calls this
// ---------------------------------------------------------------------------

export async function lookupRegoWithToken(
  rego: string,
  state: AusState,
  _recaptchaToken: string, // unused -- Playwright handles reCAPTCHA natively
): Promise<RegoLookupOutcome> {
  return lookupRegoWithPlaywright(rego, state);
}
