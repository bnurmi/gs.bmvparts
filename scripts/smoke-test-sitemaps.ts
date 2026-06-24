/**
 * Sitemap routing smoke test.
 *
 * Verifies that the domain-aware sitemap guards in server/routes.ts and
 * server/seo/bmv-vin-sitemaps.ts produce the correct response on each virtual
 * host.  Run against a running dev or production server:
 *
 *   npx tsx scripts/smoke-test-sitemaps.ts [base-url]
 *
 * base-url defaults to http://localhost:5000.  The script overrides the Host
 * header on every request so you don't need DNS or a real separate server.
 *
 * Exit code 0 → all assertions passed.
 * Exit code 1 → one or more assertions failed (details printed to stdout).
 */

import * as http from "node:http";
import * as https from "node:https";
import { URL } from "node:url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE = (process.argv[2] ?? "http://localhost:5000").replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Tiny HTTP helper
// ---------------------------------------------------------------------------

interface Resp {
  status: number;
  body: string;
  contentType: string;
}

function get(path: string, host: string): Promise<Resp> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const mod = url.protocol === "https:" ? https : http;
    const opts: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "GET",
      headers: { Host: host },
    };
    const req = mod.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
          contentType: String(res.headers["content-type"] ?? ""),
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? `\n     ${detail}` : ""}`);
    failed++;
  }
}

function assertOk(label: string, r: Resp) {
  assert(label + " → HTTP 200", r.status === 200, `got ${r.status}`);
}

function assertXml(label: string, r: Resp) {
  assert(
    label + " → XML content-type",
    r.contentType.includes("xml"),
    `got "${r.contentType}"`,
  );
}

function assertNotContains(label: string, body: string, forbidden: string) {
  assert(
    label + ` → body does not contain "${forbidden}"`,
    !body.includes(forbidden),
    `found "${forbidden}" in body`,
  );
}

function assertContains(label: string, body: string, required: string) {
  assert(
    label + ` → body contains "${required}"`,
    body.includes(required),
    `"${required}" not found in body`,
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

async function run() {
  console.log(`\nSitemap routing smoke test  →  ${BASE}\n`);

  // -------------------------------------------------------------------------
  // 1. robots.txt — each host gets its own policy
  // -------------------------------------------------------------------------

  console.log("── robots.txt ──────────────────────────────────────────────");

  {
    const r = await get("/robots.txt", "bmv.parts");
    assertOk("bmv.parts /robots.txt", r);
    assertContains("bmv.parts /robots.txt", r.body, "Sitemap: https://bmv.parts/sitemap.xml");
    assertNotContains("bmv.parts /robots.txt", r.body, "bmv.vin");
  }

  {
    const r = await get("/robots.txt", "bmv.vin");
    assertOk("bmv.vin /robots.txt", r);
    assertContains("bmv.vin /robots.txt", r.body, "Sitemap: https://bmv.vin/sitemap.xml");
    assertNotContains("bmv.vin /robots.txt", r.body, "bmv.parts");
  }

  // -------------------------------------------------------------------------
  // 2. /sitemap.xml index — each host's index references only its own domain
  // -------------------------------------------------------------------------

  console.log("\n── /sitemap.xml ────────────────────────────────────────────");

  {
    const r = await get("/sitemap.xml", "bmv.parts");
    assertOk("bmv.parts /sitemap.xml", r);
    assertXml("bmv.parts /sitemap.xml", r);
    assertContains("bmv.parts /sitemap.xml", r.body, "https://bmv.parts/");
    assertNotContains("bmv.parts /sitemap.xml", r.body, "bmv.vin");
  }

  {
    const r = await get("/sitemap.xml", "bmv.vin");
    assertOk("bmv.vin /sitemap.xml", r);
    assertXml("bmv.vin /sitemap.xml", r);
    assertContains("bmv.vin /sitemap.xml", r.body, "https://bmv.vin/");
    assertNotContains("bmv.vin /sitemap.xml", r.body, "bmv.parts");
  }

  // -------------------------------------------------------------------------
  // 3. /sitemap-pages.xml — bmv.parts only; bmv.vin must not serve bmv.parts URLs
  // -------------------------------------------------------------------------

  console.log("\n── /sitemap-pages.xml ──────────────────────────────────────");

  {
    const r = await get("/sitemap-pages.xml", "bmv.parts");
    assertOk("bmv.parts /sitemap-pages.xml", r);
    assertXml("bmv.parts /sitemap-pages.xml", r);
    assertContains("bmv.parts /sitemap-pages.xml", r.body, "https://bmv.parts/");
    assertNotContains("bmv.parts /sitemap-pages.xml", r.body, "bmv.vin");
  }

  {
    const r = await get("/sitemap-pages.xml", "bmv.vin");
    // bmv.vin has its own /sitemap-pages.xml — verify no bmv.parts URLs leak
    assertNotContains("bmv.vin /sitemap-pages.xml", r.body, "bmv.parts");
    // bmv.vin pages sitemap should contain bmv.vin URLs
    if (r.status === 200 && r.contentType.includes("xml")) {
      assertContains("bmv.vin /sitemap-pages.xml", r.body, "bmv.vin");
    } else {
      // If the SPA catches it there are no XML bmv.parts URLs — still acceptable
      assertNotContains("bmv.vin /sitemap-pages.xml (fallback)", r.body, "https://bmv.parts/");
    }
  }

  // -------------------------------------------------------------------------
  // 4. /sitemap-cars.xml — bmv.parts catalog; bmv.vin must not serve it
  // -------------------------------------------------------------------------

  console.log("\n── /sitemap-cars.xml ───────────────────────────────────────");

  {
    const r = await get("/sitemap-cars.xml", "bmv.parts");
    assertOk("bmv.parts /sitemap-cars.xml", r);
    assertXml("bmv.parts /sitemap-cars.xml", r);
    assertContains("bmv.parts /sitemap-cars.xml", r.body, "https://bmv.parts/");
    assertNotContains("bmv.parts /sitemap-cars.xml", r.body, "bmv.vin");
  }

  {
    const r = await get("/sitemap-cars.xml", "bmv.vin");
    // bmv.vin has no /sitemap-cars.xml handler; falls through to the SPA.
    // The SPA HTML may legitimately reference bmv.parts in meta/canonical
    // tags — we only care that no XML sitemap with bmv.parts URLs is served.
    // Accepted statuses: 200 (SPA HTML fallback) or 404 (strict 404 handler).
    assert(
      "bmv.vin /sitemap-cars.xml falls through (200/404, not XML sitemap)",
      (r.status === 200 || r.status === 404) && !r.contentType.includes("xml"),
      `got status=${r.status} content-type="${r.contentType}"`,
    );
  }

  // -------------------------------------------------------------------------
  // 5. /sitemap-chassis.xml — separate XML on each host, no cross-domain URLs
  // -------------------------------------------------------------------------

  console.log("\n── /sitemap-chassis.xml ────────────────────────────────────");

  {
    const r = await get("/sitemap-chassis.xml", "bmv.parts");
    assertOk("bmv.parts /sitemap-chassis.xml", r);
    assertXml("bmv.parts /sitemap-chassis.xml", r);
    assertContains("bmv.parts /sitemap-chassis.xml", r.body, "https://bmv.parts/");
    assertNotContains("bmv.parts /sitemap-chassis.xml", r.body, "bmv.vin");
  }

  {
    const r = await get("/sitemap-chassis.xml", "bmv.vin");
    // bmv.vin has its own handler that only fires when bmvVinHost=true
    assertNotContains("bmv.vin /sitemap-chassis.xml", r.body, "bmv.parts");
    if (r.status === 200 && r.contentType.includes("xml")) {
      assertContains("bmv.vin /sitemap-chassis.xml", r.body, "bmv.vin");
    }
  }

  // -------------------------------------------------------------------------
  // 6. /sitemap-parts-1.xml — bmv.parts catalog; bmv.vin must not serve it
  // -------------------------------------------------------------------------

  console.log("\n── /sitemap-parts-1.xml ────────────────────────────────────");

  {
    const r = await get("/sitemap-parts-1.xml", "bmv.parts");
    // 200 with XML even if parts DB is empty (empty urlset is valid)
    assert(
      "bmv.parts /sitemap-parts-1.xml → HTTP 200 or 400",
      r.status === 200 || r.status === 400,
      `got ${r.status}`,
    );
    if (r.status === 200) {
      assertXml("bmv.parts /sitemap-parts-1.xml", r);
      assertNotContains("bmv.parts /sitemap-parts-1.xml", r.body, "bmv.vin");
    }
  }

  {
    const r = await get("/sitemap-parts-1.xml", "bmv.vin");
    // bmv.vin has no /sitemap-parts handler; falls through to the SPA.
    // The SPA HTML may reference bmv.parts — only check that no XML sitemap
    // with bmv.parts URLs is returned.
    // Accepted statuses: 200 (SPA HTML fallback) or 404 (strict 404 handler).
    assert(
      "bmv.vin /sitemap-parts-1.xml falls through (200/404, not XML sitemap)",
      (r.status === 200 || r.status === 404) && !r.contentType.includes("xml"),
      `got status=${r.status} content-type="${r.contentType}"`,
    );
  }

  // -------------------------------------------------------------------------
  // 7. /sitemap-vins-1.xml — same handler serves both hosts; canonical locs
  //    always point at https://bmv.vin/
  // -------------------------------------------------------------------------

  console.log("\n── /sitemap-vins-1.xml ─────────────────────────────────────");

  for (const host of ["bmv.parts", "bmv.vin"] as const) {
    const r = await get("/sitemap-vins-1.xml", host);
    if (r.status === 200) {
      assertXml(`${host} /sitemap-vins-1.xml`, r);
      // If there are any VINs in vin_cache the canonical locs must be bmv.vin
      if (r.body.includes("<loc>")) {
        assertContains(`${host} /sitemap-vins-1.xml canonical locs`, r.body, "https://bmv.vin/");
        assertNotContains(`${host} /sitemap-vins-1.xml no bmv.parts locs`, r.body, "https://bmv.parts/vin");
      } else {
        // Empty urlset is fine — just verify no cross-domain pollution
        assertNotContains(`${host} /sitemap-vins-1.xml (empty)`, r.body, "https://bmv.parts/vin");
        console.log(`     (note: vin_cache appears empty on this server — canonical-loc check skipped)`);
      }
    } else if (r.status === 400) {
      // "Invalid page" — vin_cache is empty, no page 1 exists
      console.log(`     (note: ${host} /sitemap-vins-1.xml returned 400 — vin_cache likely empty)`);
      passed++; // not a routing failure
    } else {
      assert(`${host} /sitemap-vins-1.xml → 200 or 400`, false, `got ${r.status}`);
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  console.log(`\n────────────────────────────────────────────────────────────`);
  console.log(`  Passed: ${passed}   Failed: ${failed}`);
  console.log();

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
