// =============================================================================
// SSR Head Validation Script (Task #327)
// =============================================================================
// Fetches representative URLs for every SSR route family on both bmv.vin and
// bmv.parts and checks that the raw HTML response contains:
//   1. A non-empty <h1> element
//   2. A <meta name="description"> with content >= 50 characters
//
// Usage (against local dev server):
//   npx tsx scripts/check-ssr-heads.ts
//   BASE_URL=https://bmv.parts VIN_BASE_URL=https://bmv.vin npx tsx scripts/check-ssr-heads.ts
//
// When BASE_URL and VIN_BASE_URL point to the same host (local dev), bmv.vin
// routes are simulated with a `Host: bmv.vin` header using node:http, which
// allows overriding the Host header (unlike fetch()).
//
// The script exits 0 when all checks pass, or 1 when any check fails.
// =============================================================================

import http from "node:http";
import https from "node:https";
import { URL as NodeURL } from "node:url";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const VIN_BASE_URL = process.env.VIN_BASE_URL ?? BASE_URL;

// ---------------------------------------------------------------------------
// HTML parsing helpers — no deps, pure regex
// ---------------------------------------------------------------------------

function extractH1(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return null;
  return m[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractMetaDescription(html: string): string | null {
  // Handles both attribute orderings (name…content and content…name) and both
  // quote styles independently so an apostrophe in a double-quoted value is not
  // mistaken for a closing delimiter.
  const m =
    html.match(/<meta[^>]+name=["']description["'][^>]+content="([^"]*)"/i) ??
    html.match(/<meta[^>]+name=["']description["'][^>]+content='([^']*)'/i) ??
    html.match(/<meta[^>]+content="([^"]*)"[^>]+name=["']description["']/i) ??
    html.match(/<meta[^>]+content='([^']*)'[^>]+name=["']description["']/i);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// HTTP helpers — using node:http so Host header overrides work
// ---------------------------------------------------------------------------

interface FetchResult {
  status: number;
  html: string;
}

function fetchPage(url: string, hostOverride?: string): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const parsed = new NodeURL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const headers: Record<string, string> = {
      "Accept": "text/html,*/*",
      "User-Agent": "BMVSsrValidator/1.0 (check-ssr-heads.ts)",
    };
    if (hostOverride) headers["Host"] = hostOverride;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + (parsed.search || ""),
      method: "GET",
      headers,
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const html = Buffer.concat(chunks).toString("utf-8");
        resolve({ status: res.statusCode ?? 0, html });
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(new Error("Request timeout")); });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Check definitions
// ---------------------------------------------------------------------------

interface CheckDef {
  label: string;
  url: string;
  /** Override the Host header — used to simulate bmv.vin locally */
  host?: string;
  /** Accept these HTTP status codes as valid (in addition to 2xx) */
  allowStatus?: number[];
  /** Skip H1 check */
  skipH1?: boolean;
  /** Skip meta description check */
  skipMeta?: boolean;
}

// Determine if we're running against local dev (single-host mode) or against
// the real domains separately. In single-host mode, bmv.vin routes are
// simulated via Host override.
const LOCAL_MODE = VIN_BASE_URL === BASE_URL;

function vinUrl(path: string): string {
  return LOCAL_MODE ? `${BASE_URL}${path}` : `${VIN_BASE_URL}${path}`;
}

function vinHost(): string | undefined {
  return LOCAL_MODE ? "bmv.vin" : undefined;
}

const CHECKS: CheckDef[] = [
  // ------------------------------------------------------------------
  // bmv.parts — catalog SSR routes (SSR middleware active for these)
  // ------------------------------------------------------------------
  {
    label: "bmv.parts — chassis page (/chassis/g20)",
    url: `${BASE_URL}/chassis/g20`,
  },
  {
    label: "bmv.parts — chassis page (/chassis/f30)",
    url: `${BASE_URL}/chassis/f30`,
    allowStatus: [200, 404],
  },
  {
    label: "bmv.parts — car detail (/car/g80-m3-comp-m-xdrive-2020-09)",
    url: `${BASE_URL}/car/g80-m3-comp-m-xdrive-2020-09`,
    allowStatus: [200, 404],
  },
  {
    label: "bmv.parts — car detail (/car/g87-m2-2021-09)",
    url: `${BASE_URL}/car/g87-m2-2021-09`,
    allowStatus: [200, 404],
  },
  {
    label: "bmv.parts — part detail (/part/24115A13115)",
    url: `${BASE_URL}/part/24115A13115`,
    allowStatus: [200, 404],
  },
  {
    label: "bmv.parts — part detail (/part/11427583220)",
    url: `${BASE_URL}/part/11427583220`,
    allowStatus: [200, 404],
  },
  // ------------------------------------------------------------------
  // bmv.vin — decoder home
  // ------------------------------------------------------------------
  {
    label: "bmv.vin — decoder home (/)",
    url: vinUrl("/"),
    host: vinHost(),
  },
  // ------------------------------------------------------------------
  // bmv.vin — brand decoder (multi-segment, passes through directly)
  // ------------------------------------------------------------------
  {
    label: "bmv.vin — brand decoder (/decoder/bmw)",
    url: vinUrl("/decoder/bmw"),
    host: vinHost(),
    allowStatus: [200, 404],
  },
  // ------------------------------------------------------------------
  // bmv.vin — facet index (reserved prefixes, pass through directly)
  // ------------------------------------------------------------------
  {
    label: "bmv.vin — facet index (/chassis)",
    url: vinUrl("/chassis"),
    host: vinHost(),
  },
  {
    label: "bmv.vin — facet index (/year)",
    url: vinUrl("/year"),
    host: vinHost(),
  },
  {
    label: "bmv.vin — facet index (/plant)",
    url: vinUrl("/plant"),
    host: vinHost(),
  },
  {
    label: "bmv.vin — facet index (/paint)",
    url: vinUrl("/paint"),
    host: vinHost(),
  },
  // ------------------------------------------------------------------
  // bmv.vin — facet hub (multi-segment, pass through directly)
  // ------------------------------------------------------------------
  {
    label: "bmv.vin — facet hub (/chassis/g20)",
    url: vinUrl("/chassis/g20"),
    host: vinHost(),
    allowStatus: [200, 404],
  },
  {
    label: "bmv.vin — facet hub (/year/2023)",
    url: vinUrl("/year/2023"),
    host: vinHost(),
    allowStatus: [200, 404],
  },
  // ------------------------------------------------------------------
  // bmv.vin — glossary (reserved prefix for /glossary)
  // ------------------------------------------------------------------
  {
    label: "bmv.vin — glossary index (/glossary)",
    url: vinUrl("/glossary"),
    host: vinHost(),
  },
  {
    label: "bmv.vin — glossary term (/glossary/vin)",
    url: vinUrl("/glossary/vin"),
    host: vinHost(),
    allowStatus: [200, 404],
  },
  // ------------------------------------------------------------------
  // bmv.vin — guide (reserved prefix for /guide)
  // ------------------------------------------------------------------
  {
    label: "bmv.vin — guide index (/guide)",
    url: vinUrl("/guide"),
    host: vinHost(),
  },
  // ------------------------------------------------------------------
  // bmv.vin — VIN tool pages (Template A, now passes through via /bmw- rule)
  // ------------------------------------------------------------------
  {
    label: "bmv.vin — VIN tool (/bmw-vin-decoder)",
    url: vinUrl("/bmw-vin-decoder"),
    host: vinHost(),
  },
  {
    label: "bmv.vin — VIN tool (/bmw-build-sheet-lookup)",
    url: vinUrl("/bmw-build-sheet-lookup"),
    host: vinHost(),
  },
  {
    label: "bmv.vin — VIN tool (/bmw-paint-code-lookup)",
    url: vinUrl("/bmw-paint-code-lookup"),
    host: vinHost(),
  },
  // ------------------------------------------------------------------
  // bmv.vin — model-specific VIN pages (Template B)
  // ------------------------------------------------------------------
  {
    label: "bmv.vin — model VIN (/bmw-g20-vin-decoder)",
    url: vinUrl("/bmw-g20-vin-decoder"),
    host: vinHost(),
    allowStatus: [200, 404],
  },
  {
    label: "bmv.vin — model VIN (/bmw-f30-vin-decoder)",
    url: vinUrl("/bmw-f30-vin-decoder"),
    host: vinHost(),
    allowStatus: [200, 404],
  },
  // ------------------------------------------------------------------
  // bmv.vin — comparison pages (Template E, multi-segment pass-through)
  // ------------------------------------------------------------------
  {
    label: "bmv.vin — comparison (/compare/best-bmw-vin-decoders)",
    url: vinUrl("/compare/best-bmw-vin-decoders"),
    host: vinHost(),
  },
  {
    label: "bmv.vin — comparison (/compare/bmv-vin-vs-vindecoderz)",
    url: vinUrl("/compare/bmv-vin-vs-vindecoderz"),
    host: vinHost(),
  },
  // ------------------------------------------------------------------
  // bmv.vin — statistics pages (Template F, multi-segment pass-through)
  // ------------------------------------------------------------------
  {
    label: "bmv.vin — statistics (/data/most-decoded-bmw-chassis)",
    url: vinUrl("/data/most-decoded-bmw-chassis"),
    host: vinHost(),
  },
  {
    label: "bmv.vin — statistics (/data/most-popular-bmw-options)",
    url: vinUrl("/data/most-popular-bmw-options"),
    host: vinHost(),
  },
  // ------------------------------------------------------------------
  // bmv.vin — 404 handler (unknown path should still emit H1 + meta)
  // ------------------------------------------------------------------
  {
    label: "bmv.vin — unknown path 404",
    url: vinUrl("/this-path-does-not-exist-xyz-404"),
    host: vinHost(),
    allowStatus: [200, 404],
  },
];

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

interface CheckResult {
  label: string;
  url: string;
  status: number;
  h1: string | null;
  metaDescription: string | null;
  pass: boolean;
  failures: string[];
}

async function runCheck(def: CheckDef): Promise<CheckResult> {
  const failures: string[] = [];
  let status = 0;
  let h1: string | null = null;
  let metaDescription: string | null = null;

  try {
    const result = await fetchPage(def.url, def.host);
    status = result.status;
    h1 = extractH1(result.html);
    metaDescription = extractMetaDescription(result.html);

    const allowedStatuses = def.allowStatus ?? [200];
    const statusOk = allowedStatuses.includes(status) || (status >= 200 && status < 300);
    if (!statusOk) {
      failures.push(`HTTP ${status} — expected one of ${allowedStatuses.join(", ")}`);
    }

    if (!def.skipH1) {
      if (!h1) {
        failures.push("Missing <h1> element");
      } else if (h1.length === 0) {
        failures.push("<h1> element is empty");
      }
    }

    if (!def.skipMeta) {
      if (!metaDescription) {
        failures.push('Missing <meta name="description">');
      } else if (metaDescription.length < 50) {
        failures.push(`Meta description too short: ${metaDescription.length} chars < 50 minimum ("${metaDescription}")`);
      }
    }
  } catch (err) {
    failures.push(`FETCH_ERROR: ${String(err)}`);
  }

  return { label: def.label, url: def.url, status, h1, metaDescription, pass: failures.length === 0, failures };
}

async function main() {
  console.log("=".repeat(72));
  console.log("SSR Head Validation — bmv.vin + bmv.parts");
  console.log(`Base URL: ${BASE_URL}`);
  if (!LOCAL_MODE) {
    console.log(`VIN Base URL: ${VIN_BASE_URL}`);
  } else {
    console.log("(bmv.vin routes simulated via node:http Host override)");
  }
  console.log("=".repeat(72));
  console.log();

  const results: CheckResult[] = [];

  for (const check of CHECKS) {
    process.stdout.write(`  ${check.label} ... `);
    const result = await runCheck(check);
    results.push(result);
    if (result.pass) {
      console.log("✅ PASS");
    } else {
      console.log("❌ FAIL");
      for (const f of result.failures) {
        console.log(`    → ${f}`);
      }
    }
  }

  console.log();
  console.log("=".repeat(72));

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  if (failed === 0) {
    console.log(`✅  All ${passed} checks passed.`);
  } else {
    console.log(`❌  ${failed} of ${results.length} checks FAILED:`);
    for (const r of results.filter(r => !r.pass)) {
      console.log();
      console.log(`  [FAIL] ${r.label}`);
      console.log(`         URL:    ${r.url}`);
      console.log(`         Status: ${r.status}`);
      console.log(`         H1:     ${r.h1 != null ? `"${r.h1.substring(0, 80)}"` : "(none)"}`);
      console.log(`         Meta:   ${r.metaDescription != null ? `"${r.metaDescription.substring(0, 80)}"` : "(none)"}`);
      for (const f of r.failures) {
        console.log(`         Reason: ${f}`);
      }
    }
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
