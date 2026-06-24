/**
 * Smoke test the Evomi Scraper API against Cloudflare-protected
 * targets that the residential proxy alone couldn't get past.
 *
 * Usage:
 *   npx tsx scripts/test-evomi-scraper-api.ts
 *
 * Exits 0 on full success, non-zero on any check failure.
 */

import {
  fetchViaScraperApi,
  getScraperApiSummary,
  isScraperApiConfigured,
} from "../server/scraper-api";

const TARGETS = [
  {
    // RealOEM's catalog landing page — the canonical entry point. Loaded
    // through Cloudflare; if we see real HTML and the title says "BMW
    // Parts Catalog" we have full anti-bot bypass.
    name: "RealOEM /select catalog entry (CF-protected)",
    url: "https://www.realoem.com/bmw/enUS/select",
    requireTitle: /realoem|bmw\s+parts\s+catalog|select\s+your\s+bmw/i,
  },
  {
    // Real partgrp page — this is the URL shape the production scraper
    // ultimately fetches part diagrams from. Confirms not just bypass but
    // a heavy real page roundtrip.
    name: "RealOEM /partgrp BMW catalog (CF-protected)",
    url: "https://www.realoem.com/bmw/enUS/partgrp?id=WBAWB73529P044864",
    requireTitle: /bmw\s+parts\s+catalog/i,
  },
  {
    name: "Bimmer.work home (anti-bot)",
    url: "https://bimmer.work/",
    requireTitle: /bimmer\.work/i,
  },
];

/**
 * Identify obvious anti-bot interstitials. Important: only match the
 * real challenge HTML, NOT pages that simply load the recaptcha JS SDK
 * (many sites do this for their actual login forms while serving the
 * real homepage to bots).
 */
function classify(html: string): string {
  const l = (html || "").toLowerCase();
  if (l.includes("just a moment") && l.includes("cf-mitigated")) return "CF-JS-CHALLENGE";
  if (l.includes("just a moment") && l.includes("cf-chl")) return "CF-JS-CHALLENGE";
  if (l.includes("checking your browser before accessing")) return "CF-JS-CHALLENGE";
  if (l.includes("attention required! | cloudflare")) return "CF-BLOCK";
  // Real CAPTCHA challenge page (NOT just a script include for site forms).
  if (/<div[^>]+class="h-captcha"/i.test(html)) return "CAPTCHA";
  if (/<div[^>]+class="g-recaptcha"/i.test(html)) return "CAPTCHA";
  return "OK";
}

function preview(html: string, n = 240): string {
  return html.replace(/\s+/g, " ").trim().slice(0, n) + (html.length > n ? "…" : "");
}

async function main() {
  console.log("=== Evomi Scraper API config ===");
  console.log(JSON.stringify(getScraperApiSummary(), null, 2));
  if (!isScraperApiConfigured()) {
    console.error("\nEVOMI_SCRAPER_API_KEY is not set. Aborting.");
    process.exit(2);
  }

  let failed = 0;
  for (const target of TARGETS) {
    console.log(`\n=== ${target.name} ===`);
    console.log(`url: ${target.url}`);
    try {
      const res = await fetchViaScraperApi(target.url, { timeoutMs: 90_000 });
      const cls = classify(res.html);
      console.log(
        `HTTP ${res.status}  bytes=${res.html.length}  duration=${res.durationMs}ms  classify=${cls}`,
      );
      console.log(`preview: ${preview(res.html)}`);

      if (!res.ok) {
        console.error(`  FAIL: API returned non-2xx (${res.status})`);
        failed++;
        continue;
      }
      if (cls !== "OK") {
        console.error(`  FAIL: response looks like a block / challenge (${cls})`);
        failed++;
        continue;
      }
      const title = (res.html.match(/<title[^>]*>([^<]+)/i) || [])[1] || "";
      console.log(`  title: ${title.trim()}`);
      if (!target.requireTitle.test(title)) {
        console.error(
          `  FAIL: <title> did not match ${target.requireTitle} (got "${title.trim()}")`,
        );
        failed++;
        continue;
      }
      console.log("  PASS");
    } catch (e) {
      console.error(`  FAIL: ${(e as Error).message}`);
      failed++;
    }
  }

  console.log(`\n=== Summary: ${TARGETS.length - failed}/${TARGETS.length} passed ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e?.stack || e);
  process.exit(1);
});
