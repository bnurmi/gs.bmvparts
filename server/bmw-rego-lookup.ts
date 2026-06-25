/**
 * bmw-rego-lookup.ts
 *
 * Resolves an Australian rego plate → VIN via BMW Australia's recall site.
 *
 * reCAPTCHA strategy: Browserbase cloud browser with solveCaptchas:true.
 * Browserbase handles reCAPTCHA v3 natively on a real residential IP -- no
 * solving service, no token forwarding, no datacenter IP issues.
 *
 * Flow:
 *   1. Cache check (rego_vin_cache table) -- instant return if known
 *   2. Create Browserbase session (residential AU, captcha solving on)
 *   3. Connect Playwright via CDP
 *   4. Navigate BMW recall page, fill rego + state, click Next
 *   5. Intercept /BmwRecall/Rego network response
 *   6. Parse VIN, cache result, return
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
    found:  true,
    vin:    r.vin,
    model:  r.model,
    year:   r.year,
    colour: r.colour,
    rego:   r.rego,
    state:  r.state as AusState,
    source: "cache",
  };
}

// ---------------------------------------------------------------------------
// Browserbase + Playwright scraper
// ---------------------------------------------------------------------------

const BMW_RECALL_URL = "https://www.recall.bmw.com.au/";

export async function lookupRegoWithToken(
  rego: string,
  state: AusState,
  _recaptchaToken?: string, // API compat -- Browserbase handles reCAPTCHA natively
): Promise<RegoLookupOutcome> {
  const upper = rego.toUpperCase().trim();

  const bbApiKey    = (process.env.BROWSERBASE_API_KEY    || "").trim();
  const bbProjectId = (process.env.BROWSERBASE_PROJECT_ID || "").trim();

  if (!bbApiKey || !bbProjectId) {
    console.error("[rego-lookup] Browserbase not configured (BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID)");
    return { found: false, reason: "Rego lookup service not configured", rego: upper, state };
  }

  console.log(`[rego-lookup] ${upper}/${state} -- creating Browserbase session`);

  let sessionId: string | null = null;

  try {
    // 1. Create Browserbase session with CAPTCHA solving enabled
    const sessionRes = await fetch("https://www.browserbase.com/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BB-API-Key": bbApiKey,
      },
      body: JSON.stringify({
        projectId: bbProjectId,
        browserSettings: {
          solveCaptchas: true,           // Browserbase handles reCAPTCHA natively
          geolocation: { country: "AU" }, // AU exit node -- helps reCAPTCHA score
        },
      }),
    });

    if (!sessionRes.ok) {
      const err = await sessionRes.text();
      console.error(`[rego-lookup] Session create failed ${sessionRes.status}: ${err.substring(0, 120)}`);
      return { found: false, reason: "Browser session unavailable", rego: upper, state };
    }

    const session: any = await sessionRes.json();
    sessionId = session.id as string;
    const wsUrl: string = session.connectUrl
      ?? `wss://connect.browserbase.com?apiKey=${bbApiKey}&sessionId=${sessionId}`;

    console.log(`[rego-lookup] Session ${sessionId} ready`);

    // 2. Connect Playwright via CDP
    const { chromium } = await import("playwright");
    const browser = await chromium.connectOverCDP(wsUrl);
    const ctx     = browser.contexts()[0];
    const page    = ctx?.pages()[0] ?? await ctx?.newPage();

    if (!page) throw new Error("No page in Browserbase session");

    // 3. Intercept BMW API response
    type ApiCapture = { status: number; body: string };
    const capture: { value: ApiCapture | null } = { value: null };

    page.on("response", async (res) => {
      if (res.url().includes("fg.recall.bmw.com.au/BmwRecall/Rego")) {
        try {
          const body = await res.text();
          capture.value = { status: res.status(), body };
        } catch { /* response already consumed */ }
      }
    });

    // 4. Navigate BMW recall page
    await page.goto(BMW_RECALL_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("#rego", { timeout: 15_000 });

    // Dismiss cookie modal if present
    await page.click("button.close", { timeout: 2000 }).catch(() => {});

    // 5. Fill form -- Angular reactive forms need native value setters
    await page.evaluate(({ regoVal, stateVal }: { regoVal: string; stateVal: string }) => {
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

    // 6. Wait for reCAPTCHA to run (Browserbase solves it automatically)
    await page.waitForTimeout(3000);

    // 7. Click Next (<a class="btn btn-primary left">)
    const clicked = await page.evaluate((): boolean => {
      const a = Array.from(document.querySelectorAll("a"))
        .find((el) => el.textContent?.includes("Next")) as HTMLElement | undefined;
      if (a) { a.click(); return true; }
      return false;
    });

    if (!clicked) {
      await browser.close();
      return { found: false, reason: "Could not submit rego form", rego: upper, state };
    }

    // 8. Wait for BMW API response (up to 15s)
    for (let i = 0; i < 30 && !capture.value; i++) {
      await page.waitForTimeout(500);
    }

    await browser.close();

    // 9. Parse
    if (!capture.value) {
      console.log(`[rego-lookup] ${upper}/${state} -- no BMW API response captured`);
      return { found: false, reason: "No response from BMW recall API", rego: upper, state };
    }

    const { status, body } = capture.value;
    console.log(`[rego-lookup] BMW API ${status} for ${upper}/${state}: ${body.substring(0, 80)}`);

    if (status !== 200) {
      return {
        found: false,
        reason: body.includes("ReCaptcha") ? "reCAPTCHA check failed" : `BMW API error ${status}`,
        rego: upper, state,
      };
    }

    const regoData = JSON.parse(body) as { success: boolean; found: boolean; vin?: string };
    console.log(`[rego-lookup] BMW 200: success=${regoData.success} found=${regoData.found} vin=${regoData.vin ?? "none"}`);

    if (!regoData.success || !regoData.found || !regoData.vin) {
      return { found: false, reason: "Registration not found in BMW system", rego: upper, state };
    }

    const vin = regoData.vin;

    // 10. Cache
    await db
      .insert(regoVinCache)
      .values({ rego: upper, state, vin, model: null, year: null, colour: null, source: "bmw_recall" })
      .onConflictDoUpdate({
        target: [regoVinCache.rego, regoVinCache.state],
        set: { vin, model: null, year: null, colour: null, lookedUpAt: new Date(), source: "bmw_recall" },
      });

    console.log(`[rego-lookup] ${upper}/${state} -> ${vin} (cached)`);
    return { found: true, vin, model: null, year: null, colour: null, rego: upper, state, source: "bmw_recall" };

  } catch (err: any) {
    console.error(`[rego-lookup] Error: ${err?.message}`);
    return { found: false, reason: err?.message ?? "Unknown error", rego: upper, state };
  } finally {
    // Release session to avoid billing leaks
    if (sessionId) {
      fetch(`https://www.browserbase.com/v1/sessions/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-BB-API-Key": bbApiKey },
        body: JSON.stringify({ status: "REQUEST_RELEASE" }),
      }).catch(() => {});
    }
  }
}
