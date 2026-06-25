/**
 * bmw-rego-lookup.ts
 *
 * Resolves an Australian rego plate → VIN via BMW Australia's recall site.
 *
 * reCAPTCHA v3 strategy:
 *   - Browserbase cloud browser with AU residential proxy (geolocation: AU)
 *   - Human-like behaviour: mouse movements, scroll, natural typing delays
 *   - reCAPTCHA v3 scores on behaviour + IP + browser fingerprint -- all three
 *     need to look genuine. Headless + instant typing = low score. Human
 *     simulation on a real residential IP = passing score.
 *   - Retries up to 3x (fresh IP each time) if score fails.
 *
 * Cost: ~$0.01-0.05/session (Browserbase paid plan). Cached results are free.
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
// Browserbase scraper -- AU residential proxy + human behaviour
// ---------------------------------------------------------------------------

const BMW_RECALL_URL = "https://www.recall.bmw.com.au/";
const MAX_ATTEMPTS   = 3; // fresh IP each retry

export async function lookupRegoWithToken(
  rego: string,
  state: AusState,
  _recaptchaToken?: string,
): Promise<RegoLookupOutcome> {
  const upper = rego.toUpperCase().trim();

  const bbApiKey    = (process.env.BROWSERBASE_API_KEY    || "").trim();
  const bbProjectId = (process.env.BROWSERBASE_PROJECT_ID || "").trim();

  if (!bbApiKey || !bbProjectId) {
    console.error("[rego-lookup] Browserbase not configured");
    return { found: false, reason: "Rego lookup service not configured", rego: upper, state };
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`[rego-lookup] ${upper}/${state} -- attempt ${attempt}/${MAX_ATTEMPTS}`);
    const outcome = await attemptLookup(upper, state, bbApiKey, bbProjectId);
    if (outcome.found) return outcome;
    if (outcome.reason?.includes("reCAPTCHA") && attempt < MAX_ATTEMPTS) {
      console.log(`[rego-lookup] reCAPTCHA failed -- retrying with fresh AU IP`);
      continue;
    }
    return outcome;
  }
  return { found: false, reason: "reCAPTCHA check failed after retries", rego: upper, state };
}

async function attemptLookup(
  upper: string,
  state: AusState,
  bbApiKey: string,
  bbProjectId: string,
): Promise<RegoLookupOutcome> {
  let sessionId: string | null = null;

  try {
    // 1. Create Browserbase session -- AU residential proxy + CAPTCHA solving
    const sessionRes = await fetch("https://www.browserbase.com/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BB-API-Key": bbApiKey },
      body: JSON.stringify({
        projectId: bbProjectId,
        proxies: [{ type: "browserbase", geolocation: { country: "AU" } }],
        browserSettings: { solveCaptchas: true },
      }),
    });

    if (!sessionRes.ok) {
      const err = await sessionRes.text();
      console.error(`[rego-lookup] Session create failed ${sessionRes.status}: ${err.substring(0, 120)}`);
      return { found: false, reason: "Browser session unavailable", rego: upper, state };
    }

    const session: any = await sessionRes.json();
    sessionId = session.id as string;
    console.log(`[rego-lookup] Session ${sessionId} (AU residential)`);

    // 2. Connect Playwright via CDP
    const { chromium } = await import("playwright");
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const ctx     = browser.contexts()[0];
    const page    = ctx.pages()[0] ?? await ctx.newPage();

    if (!page) throw new Error("No page in Browserbase session");

    // 3. Realistic viewport
    await page.setViewportSize({ width: 1366, height: 768 });

    // 4. Intercept BMW API response
    type ApiCapture = { status: number; body: string };
    const capture: { value: ApiCapture | null } = { value: null };
    page.on("response", async (res) => {
      if (res.url().includes("fg.recall.bmw.com.au/BmwRecall/Rego")) {
        try {
          const body = await res.text();
          capture.value = { status: res.status(), body };
        } catch { /* already consumed */ }
      }
    });

    // 5. Navigate -- domcontentloaded is enough; reCAPTCHA loads async after
    await page.goto(BMW_RECALL_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("#rego", { timeout: 15_000 });

    // 6. Brief human preamble -- enough for reCAPTCHA to register session signals
    await page.mouse.move(300, 350, { steps: 8 });
    await page.waitForTimeout(300 + Math.random() * 200);
    await page.mouse.wheel(0, 150);
    await page.waitForTimeout(400 + Math.random() * 200);
    await page.mouse.wheel(0, -50);
    await page.waitForTimeout(300);

    // 7. Dismiss cookie modal
    try {
      const closeBtn = await page.$("button.close");
      if (closeBtn) {
        const box = await closeBtn.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
          await page.waitForTimeout(150);
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await page.waitForTimeout(300);
        }
      }
    } catch { /* no modal */ }

    // 8. Click rego input naturally
    const regoEl  = await page.$("#rego");
    const regoBox = await regoEl?.boundingBox();
    if (regoBox) {
      await page.mouse.move(regoBox.x + 15, regoBox.y + regoBox.height / 2, { steps: 8 });
      await page.waitForTimeout(200);
      await page.mouse.click(regoBox.x + 15, regoBox.y + regoBox.height / 2);
      await page.waitForTimeout(200);
    }

    // 9. Natural typing
    for (const char of upper) {
      await page.keyboard.type(char, { delay: 60 + Math.random() * 100 });
    }
    await page.waitForTimeout(300 + Math.random() * 200);

    // 10. Set state
    await page.evaluate((stateVal: string) => {
      const sel = document.querySelector<HTMLSelectElement>("select[formcontrolname='regoState']");
      if (sel) {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sel, stateVal);
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, state);
    await page.waitForTimeout(400 + Math.random() * 200);

    // 11. Brief idle movement then let reCAPTCHA score -- 6s minimum
    await page.mouse.move(500, 400, { steps: 6 });
    await page.waitForTimeout(6000);

    // 12. Click Next
    const nextHandle = await page.evaluateHandle((): HTMLElement | null => {
      const a = Array.from(document.querySelectorAll("a"))
        .find((el) => el.textContent?.includes("Next")) as HTMLElement | undefined;
      return a ?? null;
    });
    const nextEl  = nextHandle.asElement();
    const nextBox = nextEl ? await nextEl.boundingBox() : null;

    if (!nextBox) {
      await browser.close();
      return { found: false, reason: "Could not find Next button on BMW recall form", rego: upper, state };
    }

    await page.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2, { steps: 8 });
    await page.waitForTimeout(200 + Math.random() * 200);
    await page.mouse.click(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2);

    // 13. Wait up to 20s for BMW API response
    for (let i = 0; i < 40 && !capture.value; i++) {
      await page.waitForTimeout(500);
    }

    await browser.close();

    // 14. Parse
    if (!capture.value) {
      console.log(`[rego-lookup] ${upper}/${state} -- no BMW API response`);
      return { found: false, reason: "No response from BMW recall API", rego: upper, state };
    }

    const { status, body } = capture.value;
    console.log(`[rego-lookup] BMW ${status} for ${upper}/${state}: ${body.substring(0, 80)}`);

    if (status !== 200) {
      return {
        found:  false,
        reason: body.includes("ReCaptcha") ? "reCAPTCHA check failed" : `BMW API error ${status}`,
        rego:   upper,
        state,
      };
    }

    const regoData = JSON.parse(body) as { success: boolean; found: boolean; vin?: string };
    if (!regoData.success || !regoData.found || !regoData.vin) {
      return { found: false, reason: "Registration not found in BMW system", rego: upper, state };
    }

    const vin = regoData.vin;

    // 15. Cache
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
    if (sessionId) {
      fetch(`https://www.browserbase.com/v1/sessions/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-BB-API-Key": bbApiKey },
        body: JSON.stringify({ status: "REQUEST_RELEASE" }),
      }).catch(() => {});
    }
  }
}
