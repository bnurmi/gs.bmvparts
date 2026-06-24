// Unit-style test for the ETK-coverage gate added in Task #83.
//
// Asserts directly against the orchestrator (no HTTP, no real network)
// that:
//   - A pre-2020 ETK-covered VIN never produces a "bimmerwork" /
//     "mdecoder" / "vindecoderz" tab provenance, even with the default
//     `allowThirdParty: true` caller intent.
//   - The orchestrator returns a non-null result for an ETK-covered
//     VIN even when FA is missing, with `coverage.etkCovered === true`
//     and an actionable `coverage.importPaths` block.
//   - A modern (post-cutoff) VIN is allowed to fall through to a
//     scraper attempt — we don't assert what the scraper returns
//     (network), only that the gate did not block the call.
//
// Run with:  npx tsx scripts/test-vin-etk-gate.ts

import { enrichVin, type EnrichmentResult, computeCoverageForVin, shouldSanitizeStaleCache } from "../server/vin-enrichment-service";
import type { EnrichmentCoverage } from "../shared/schema";

const SCRAPER_TAGS = new Set(["bimmerwork", "mdecoder", "vindecoderz"]);

export interface Check { name: string; ok: boolean; detail?: string }
let checks: Check[] = [];
function rec(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

import type { EnrichmentSourceMap } from "@shared/schema";

function assertNoScraperSources(es: EnrichmentSourceMap | null | undefined): string | null {
  if (!es) return null;
  for (const tab of ["vehicle", "options", "images", "manuals"] as const) {
    const s = es[tab]?.source;
    if (s && SCRAPER_TAGS.has(s)) {
      return `tab=${tab} source=${s}`;
    }
  }
  return null;
}

export async function runEtkGateChecks(): Promise<Check[]> {
  checks = [];
  await main();
  return checks;
}

async function main() {
  console.log("[test-vin-etk-gate]");

  // (a) Seeded ETK fixture VIN — model-year-2020 G-series chassis.
  // Caller asks for third-party fallback; the gate must still force
  // first-party-only because the chassis resolves in fztyp.psv.
  console.log("\n[a] ETK-covered VIN with allowThirdParty:true → gate must force first-party");
  {
    const r: EnrichmentResult | null = await enrichVin("WBS32AY090FM28236", { allowThirdParty: true });
    rec("orchestrator returns a result (never null for ETK-covered)", r !== null);
    if (r) {
      rec("coverage.etkCovered is true", r.coverage.etkCovered === true, `etkCovered=${r.coverage.etkCovered}`);
      rec("coverage.firstPartyOnly is true (gate forced it)", r.coverage.firstPartyOnly === true, `firstPartyOnly=${r.coverage.firstPartyOnly}`);
      const violation = assertNoScraperSources(r.enrichmentSource);
      rec("no scraper appears in any tab provenance", violation === null, violation || "clean");
      rec("vehicle source is etk", r.enrichmentSource.vehicle?.source === "etk", `vehicle=${r.enrichmentSource.vehicle?.source}`);
    }
  }

  // (b) Same VIN via the strict first-party endpoint — provenance and
  // coverage must agree.
  console.log("\n[b] Same VIN with allowThirdParty:false");
  {
    const r = await enrichVin("WBS32AY090FM28236", { allowThirdParty: false });
    rec("orchestrator returns a result", r !== null);
    if (r) {
      rec("coverage.firstPartyOnly is true", r.coverage.firstPartyOnly === true);
      rec("no scraper appears in any tab provenance", assertNoScraperSources(r.enrichmentSource) === null);
    }
  }

  // (c) An obviously-pre-2020 ETK VIN that has no FA row (random
  // production sequence — not in vin_factory_options). The gate must
  // still keep us first-party-only and the coverage block must list
  // every missing field.
  console.log("\n[c] Pre-2020 ETK-covered VIN with no FA row → reports missing pieces, no scrapers");
  {
    // E60 5-Series chassis, model-year 2007 (year code 7, plant N).
    const r = await enrichVin("WBANB33597CN12345", { allowThirdParty: true });
    rec("orchestrator returns a result for ETK-covered no-FA VIN", r !== null);
    if (r) {
      rec("coverage.etkCovered is true", r.coverage.etkCovered === true);
      rec("coverage.firstPartyOnly is true (gate forced it)", r.coverage.firstPartyOnly === true);
      rec("coverage.missing contains 'options'", r.coverage.missing.includes("options"));
      rec("coverage.missing contains 'paint'", r.coverage.missing.includes("paint"));
      rec("coverage.importPaths is populated", Array.isArray(r.coverage.importPaths) && r.coverage.importPaths.length > 0);
      rec("no scraper appears in any tab provenance", assertNoScraperSources(r.enrichmentSource) === null);
    }
  }

  // (d-pre) Explicit post-2020 fallback assertion. A modern VIN must
  // NOT be gated to first-party-only — `coverage.firstPartyOnly` is
  // false, `coverage.etkCovered` is false, and the orchestrator is
  // structurally allowed to call third-party scrapers. We validate
  // this via the local coverage probe so the test stays offline.
  console.log("\n[d-pre] Post-2020 VIN must NOT be ETK-gated (regression guard for Task #83)");
  {
    // 2024 G05 X5 sequence — well past the ETK 2020 cutoff. Year
    // code R = 2024 in the VIN year-character table.
    const post2020Vin = "5UXCR6C09R9X12345";
    const cov = await computeCoverageForVin(post2020Vin);
    rec("coverage probe returned a result for post-2020 VIN", cov !== null);
    if (cov) {
      rec("post-2020: coverage.etkCovered is false", cov.etkCovered === false, `etkCovered=${cov.etkCovered}`);
      rec("post-2020: coverage.firstPartyOnly is false (gate inactive)", cov.firstPartyOnly === false, `firstPartyOnly=${cov.firstPartyOnly}`);
    }
  }

  // (d-cache) Stale-cache sanitization helper (Task #83 review v2).
  // The /api/vin/bimmerwork cache-hit branch must drop legacy rows
  // whose enrichmentSource lists a third-party scraper for an
  // ETK-covered VIN. Verify the pure helper directly so the policy
  // is asserted without DB / HTTP.
  console.log("\n[d-cache] shouldSanitizeStaleCache: ETK-covered + scraper provenance → re-enrich");
  {
    const cov: EnrichmentCoverage = { etkCovered: true, firstPartyOnly: true, missing: [] };
    const stale = {
      vehicle: { source: "etk" as const, fetchedAt: "" },
      options: { source: "bimmerwork" as const, fetchedAt: "" },
    };
    rec("ETK-covered + cached options=bimmerwork → sanitize", shouldSanitizeStaleCache(cov, stale) === true);
    rec("ETK-covered + clean cache (etk only) → keep cache", shouldSanitizeStaleCache(cov, {
      vehicle: { source: "etk", fetchedAt: "" },
      options: { source: "etk", fetchedAt: "" },
    }) === false);
    rec("post-2020 (not ETK-covered) + scraper cache → keep cache (no policy)", shouldSanitizeStaleCache(
      { etkCovered: false, firstPartyOnly: false, missing: [] },
      stale,
    ) === false);
    rec("null coverage → keep cache (defensive)", shouldSanitizeStaleCache(null, stale) === false);
    rec("null cachedSource → no sanitization", shouldSanitizeStaleCache(cov, null) === false);
    rec("ETK-covered + manuals=mdecoder → sanitize (any tab counts)", shouldSanitizeStaleCache(cov, {
      manuals: { source: "mdecoder", fetchedAt: "" },
    }) === true);
  }

  // (d) Sanity check: the admin override option re-allows third-party.
  // We don't assert the network outcome — only that the orchestrator
  // didn't structurally refuse to call out (i.e. coverage.firstPartyOnly
  // is false when the bypass flag is set).
  console.log("\n[d] Admin override `_forceBypassEtkGate` re-enables scrapers");
  {
    const r = await enrichVin("WBS32AY090FM28236", { allowThirdParty: true, _forceBypassEtkGate: true });
    if (r) {
      rec("with override: coverage.firstPartyOnly is false", r.coverage.firstPartyOnly === false, `firstPartyOnly=${r.coverage.firstPartyOnly}`);
    } else {
      rec("with override: orchestrator returned a result", false, "got null");
    }
  }

  const pass = checks.filter((c) => c.ok).length;
  const total = checks.length;
  console.log(`\n[test-vin-etk-gate] ${pass}/${total} passed`);
}

// Auto-run only when invoked directly (not when imported by the
// verifier in scripts/verify-vin-enrichment.ts).
const invokedDirectly = (() => {
  try {
    const argv1 = process.argv[1] || "";
    return argv1.endsWith("test-vin-etk-gate.ts") || argv1.endsWith("test-vin-etk-gate.js");
  } catch { return false; }
})();
if (invokedDirectly) {
  main().then(() => {
    const failed = checks.filter((c) => !c.ok).length;
    if (failed > 0) process.exit(1);
  }).catch((e) => {
    console.error("[test-vin-etk-gate] fatal", e);
    process.exit(1);
  });
}
