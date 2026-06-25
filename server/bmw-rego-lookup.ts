/**
 * bmw-rego-lookup.ts
 *
 * Resolves an Australian rego plate → VIN via BMW Australia's recall site.
 *
 * reCAPTCHA v3 strategy: Browserbase cloud browser (real residential IP,
 * real Chromium session) navigates recall.bmw.com.au, fills the form,
 * and intercepts the fg.recall.bmw.com.au API response directly.
 * No token forwarding, no solving service -- reCAPTCHA runs natively in
 * a real browser on a real residential IP and BMW's score threshold is met.
 *
 * Flow:
 *   1. Cache check (rego_vin_cache table) -- instant return if known
 *   2. Create Browserbase session (residential AU context)
 *   3. Connect Playwright via CDP
 *   4. Navigate BMW recall page, fill rego + state, click Next
 *   5. Intercept /BmwRecall/Rego network response
 *   6. Parse VIN, fetch vehicle details, cache result, return
 */

import { db } from "./storage.js";
import { regoVinCache } from "@shared/schema.js";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Supported states
// ---------------------------------------------------------------------------

export const AUS_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const;
export type AusState = typeof AUS_STATES[number];

// State code -> display value used in BMW's select dropdown
const STATE_DISPLAY: Record<AusState, string> = {
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
// Browserbase + Playwright scraper
// ---------------------------------------------------------------------------

const BMW_RECALL_URL   = "https://www.recall.bmw.com.au/";
const BMW_REGO_API_URL = "https://fg.recall.bmw.com.au/BmwRecall/Rego";

export async function lookupRegoWithToken(
  rego: string,
  state: AusState,
  _recaptchaToken?: string, // kept for API compat -- not used; Browserbase handles reCAPTCHA
): Promise<RegoLookupOutcome> {
  const upper = rego.toUpperCase().trim();

  const bbApiKey    = (process.env.BROWSERBASE_API_KEY    || "").trim();
  const bbProjectId = (process.env.BROWSERBASE_PROJECT_ID || "").trim();

  if (!bbApiKey || !bbProjectId) {
    console.error("[rego-lookup] Browserbase not configured (BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID)");
    return { found: false, reason: "Rego lookup service not configured", rego: upper, state };
  }

  console.log(`[rego-lookup] ${upper}/${state} -- starting Browserbase session`);

  let sessionId: string | null = null;

  try {
    // 1. Create Browserbase session
    const sessionRes = await fetch("https://www.browserbase.com/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": bbApiKey,
      },
      body: JSON.stringify({
        projectId: bbProjectId,
        browserSettings: {
          context: { persist: false },
          // Request an Australian geolocation for best reCAPTCHA score
          geolocation: { country: "AU" },
        },
      }),
    });

    if (!sessionRes.ok) {
      const err = await sessionRes.text();
      console.error(`[rego-lookup] Browserbase session creation failed ${sessionRes.status}: ${err.substring(0, 120)}`);
      return { found: false, reason: "Browser session unavailable", rego: upper, state };
    }

    const session: any = await sessionRes.json();
    sessionId = session.id;
    const wsUrl = session.connectUrl ?? `wss://connect.browserbase.com?apiKey=${bbApiKey}&sessionId=${sessionId}`;

    console.log(`[rego-lookup] Session ${sessionId} created`);

    // 2. Connect Playwright via CDP
    const { chromium } = await import("playwright");
    const browser = await chromium.connectOverCDP(wsUrl);
    const pages   = browser.contexts()[0]?.pages() ?? [];
    const page    = pages[0] ?? await browser.contexts()[0]?.newPage();

    if (!page) throw new Error("No page available in Browserbase session");

    // 3. Intercept the BMW API response before it's processed
    let apiResponse: { status: number; body: string } | null = null;
    page.on("response", async (res) => {
      if (res.url().includes("fg.recall.bmw.com.au/BmwRecall/Rego")) {
        try {
          apiResponse = { status: res.status(), body: await res.text() };
        } catch { /* ignore */ }
      }
    });

    // 4. Navigate to BMW recall page
    await page.goto(BMW_RECALL_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("#rego", { timeout: 15_000 });

    // Dismiss cookie/privacy modal if present
    await page.click("button.close", { timeout: 2000 }).catch(() => {});

    // 5. Fill the form using native value setters (required for Angular reactive forms)
    await page.evaluate(({ regoVal, stateVal }) => {
      const inp = document.querySelector<HTMLInputElement>("#rego");
      if (inp) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        setter.call(inp, regoVal);
        inp.dispatchEvent(new Event("input",  { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const sel = document.querySelector<HTMLSelectElement>("select[formcontrolname='regoState']");
      if (sel) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
        setter.call(sel, stateVal);
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, { regoVal: upper, stateVal: state });

    // 6. Wait for reCAPTCHA to observe the session (improves score)
    await page.waitForTimeout(3000);

    // 7. Click Next (confirmed: <a class="btn btn-primary left">Next …</a>)
    const clicked = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll("a"))
        .find((el) => el.textContent?.includes("Next"));
      if (a) { (a as HTMLElement).click(); return true; }
      return false;
    });

    if (!clicked) {
      await browser.close();
      return { found: false, reason: "Could not submit rego form", rego: upper, state };
    }

    // 8. Wait for the BMW API response (up to 15s)
    let waited = 0;
    while (!apiResponse && waited < 15_000) {
      await page.waitForTimeout(500);
      waited += 500;
    }

    await browser.close();

    // 9. Parse result
    if (!apiResponse) {
      console.log(`[rego-lookup] ${upper}/${state} -- no API response after form submit`);
      return { found: false, reason: "No response from BMW recall API", rego: upper, state };
    }

    console.log(`[rego-lookup] BMW API ${apiResponse.status} for ${upper}/${state}: ${apiResponse.body.substring(0, 80)}`);

    if (apiResponse.status !== 200) {
      const reason = apiResponse.body.includes("ReCaptcha")
        ? "reCAPTCHA check failed"
        : `BMW API error ${apiResponse.status}`;
      return { found: false, reason, rego: upper, state };
    }

    const regoData: any = JSON.parse(apiResponse.body);
    console.log(`[rego-lookup] BMW 200: success=${regoData.success} found=${regoData.found} vin=${regoData.vin ?? "none"}`);

    if (!regoData.success || !regoData.found || !regoData.vin) {
      return { found: false, reason: "Registration not found in BMW system", rego: upper, state };
    }

    const vin: string = regoData.vin;

    // 10. Cache the result
    await db
      .insert(regoVinCache)
      .values({ rego: upper, state, vin, model: null, year: null, colour: null, source: "bmw_recall" })
      .onConflictDoUpdate({
        target: [regoVinCache.rego, regoVinCache.state],
        set: { vin, model: null, year: null, colour: null, lookedUpAt: new Date(), source: "bmw_recall" },
      });

    console.log(`[rego-lookup] ${upper}/${state} -> ${vin}`);
    return { found: true, vin, model: null, year: null, colour: null, rego: upper, state, source: "bmw_recall" };

  } catch (err: any) {
    console.error(`[rego-lookup] Error: ${err?.message}`);
    return { found: false, reason: err?.message ?? "Unknown error", rego: upper, state };
  } finally {
    // Always terminate the Browserbase session to avoid billing leaks
    if (sessionId && (process.env.BROWSERBASE_API_KEY || "").trim()) {
      fetch(`https://www.browserbase.com/v1/sessions/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-BB-API-Key": process.env.BROWSERBASE_API_KEY! },
        body: JSON.stringify({ status: "REQUEST_RELEASE" }),
      }).catch(() => {});
    }
  }
}
