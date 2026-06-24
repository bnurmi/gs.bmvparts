/**
 * Smoke test the Evomi residential proxy before we wire it into the
 * RealOEM scraper code paths.
 *
 * Usage:
 *   npx tsx scripts/test-evomi-proxy.ts
 *
 * What it does:
 *   1. Reports whether the EVOMI_* secrets are configured.
 *   2. Hits https://api.ipify.org?format=json through the proxy and
 *      confirms the egress IP is NOT this Replit container's IP.
 *   3. Hits the RealOEM home page and confirms an HTTP 200 with HTML.
 *   4. Hits a known-good RealOEM VIN lookup URL and reports the
 *      response length + a short HTML preview so we can eyeball that
 *      the proxy isn't being blocked / served a captcha.
 *
 * Exits with code 0 on success, non-zero on any failure.
 */

import { fetchViaProxy, getEvomiSummary, isEvomiConfigured } from "../server/scraper-proxy";

const VIN_TEST_URL =
  "https://www.realoem.com/bmw/enUS/vinlookup?vin=WBS32AY090FM28236";
const HOME_TEST_URL = "https://www.realoem.com/bmw/enUS";
const IP_TEST_URL = "https://api.ipify.org?format=json";

function preview(html: string, n = 240): string {
  const compact = html.replace(/\s+/g, " ").trim();
  return compact.length > n ? compact.slice(0, n) + "…" : compact;
}

async function getDirectIp(): Promise<string | null> {
  try {
    const res = await fetch(IP_TEST_URL, { signal: AbortSignal.timeout(15_000) });
    const j = (await res.json()) as { ip?: string };
    return j.ip ?? null;
  } catch (e) {
    console.warn(`[direct-ip] failed: ${(e as Error).message}`);
    return null;
  }
}

async function main() {
  const summary = getEvomiSummary();
  console.log("=== Evomi proxy config ===");
  console.log(JSON.stringify(summary, null, 2));
  if (!isEvomiConfigured()) {
    console.error(
      "\nEVOMI_PROXY_HOST / PORT / USERNAME / PASSWORD are not all set as secrets. Aborting."
    );
    process.exit(2);
  }

  // --- Step 1: container egress IP (no proxy) ---
  console.log("\n=== Step 1: container egress IP (no proxy) ===");
  const directIp = await getDirectIp();
  console.log(`direct IP: ${directIp ?? "<unknown>"}`);

  // --- Step 2: egress IP through proxy ---
  console.log("\n=== Step 2: egress IP through Evomi proxy ===");
  const ipRes = await fetchViaProxy(IP_TEST_URL, { timeoutMs: 30_000 });
  console.log(`HTTP ${ipRes.status} ${ipRes.statusText}`);
  console.log(`body: ${ipRes.html.slice(0, 200)}`);
  let proxiedIp: string | null = null;
  try {
    proxiedIp = (JSON.parse(ipRes.html) as { ip?: string }).ip ?? null;
  } catch {
    /* ignore */
  }
  if (!ipRes.ok || !proxiedIp) {
    console.error("Proxy IP check failed.");
    process.exit(3);
  }
  if (directIp && proxiedIp === directIp) {
    console.error(
      `Proxy egress IP equals direct IP (${proxiedIp}) — proxy is NOT being used.`
    );
    process.exit(4);
  }
  console.log(`proxied IP: ${proxiedIp}  (differs from direct: ${directIp})`);

  // --- Step 3: realoem home page through proxy ---
  console.log("\n=== Step 3: RealOEM home page through Evomi proxy ===");
  const homeRes = await fetchViaProxy(HOME_TEST_URL, { timeoutMs: 60_000 });
  console.log(`HTTP ${homeRes.status} ${homeRes.statusText}  bytes=${homeRes.html.length}`);
  console.log(`content-type: ${homeRes.contentType ?? "<none>"}`);
  console.log(`preview: ${preview(homeRes.html)}`);
  if (!homeRes.ok) {
    console.error("RealOEM home page returned non-2xx.");
    process.exit(5);
  }
  if (!/realoem|bmw/i.test(homeRes.html)) {
    console.error("RealOEM home page response does not look like the real page (possible block).");
    process.exit(6);
  }

  // --- Step 4: realoem VIN lookup through proxy ---
  console.log("\n=== Step 4: RealOEM VIN lookup through Evomi proxy ===");
  const vinRes = await fetchViaProxy(VIN_TEST_URL, { timeoutMs: 60_000 });
  console.log(`HTTP ${vinRes.status} ${vinRes.statusText}  bytes=${vinRes.html.length}`);
  console.log(`final URL: ${vinRes.url}`);
  console.log(`preview: ${preview(vinRes.html)}`);

  const looksLikeCaptcha = /captcha|cf-challenge|attention required|access denied/i.test(vinRes.html);
  const looksLikeRealoem = /realoem|series=|partgrp|vin lookup|not a valid bmw vin/i.test(vinRes.html);
  if (!vinRes.ok) {
    console.error("RealOEM VIN lookup returned non-2xx through the proxy.");
    process.exit(7);
  }
  if (looksLikeCaptcha) {
    console.error("RealOEM VIN lookup looks like it served a CAPTCHA / block page.");
    process.exit(8);
  }
  if (!looksLikeRealoem) {
    console.error("RealOEM VIN lookup response doesn't match the expected RealOEM page shape.");
    process.exit(9);
  }

  console.log("\nAll proxy checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err?.stack || err);
  process.exit(1);
});
