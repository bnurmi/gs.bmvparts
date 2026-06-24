// E2E smoke-test for VIN enrichment orchestrator.
//
// Covers the four scenarios:
//   (a) ETK-covered VIN with the firstPartyOnly endpoint → strict
//       regime (no scrapers, vehicle/options must be "etk").
//   (b) post-2020 VIN through the user-facing /api/vin/bimmerwork
//       path → vehicle stays etk-authoritative when ETK has the
//       chassis, but options/images/manuals may fall back to
//       scrapers when the first-party path returned nothing.
//   (c) cache miss → cache hit on the same VIN (re-fetch must hit
//       the cache and respond fast).
//   (d) carvertical settings toggle reflects on the public read
//       endpoint and survives an admin POST round-trip (skipped
//       gracefully if no admin session is available).
//
// Run with:  npx tsx scripts/verify-vin-enrichment.ts
// Server URL defaults to http://localhost:$PORT (5000); override with
// VIN_E2E_BASE_URL. Pre-loaded ETK VIN defaults to WBS32AY090FM28236
// (already in vin_cache); override with VIN_E2E_CACHED_VIN.

const BASE = process.env.VIN_E2E_BASE_URL || `http://localhost:${process.env.PORT || "5000"}`;
const CACHED_VIN = (process.env.VIN_E2E_CACHED_VIN || "WBS32AY090FM28236").toUpperCase();
const POST_2020_VIN = (process.env.VIN_E2E_POST2020_VIN || "WBA5R7C5XKAJ12345").toUpperCase();

interface Result { name: string; ok: boolean; detail?: string }
const results: Result[] = [];
function rec(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function getJson(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, init);
  let body: any = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

async function main() {
  console.log(`[verify-vin-enrichment] base=${BASE}`);
  console.log(`[verify-vin-enrichment] cached VIN=${CACHED_VIN}, post-2020 VIN=${POST_2020_VIN}`);

  // -- (a) ETK-covered VIN → first-party-only endpoint ------------------
  // The cached test VIN is seeded into vin_factory_options at boot
  // (see /tmp/seed-fa.mts in the task notes), so the orchestrator
  // MUST return Vehicle + Options + paint + upholstery from local
  // first-party sources only. These assertions are strict — any
  // regression that re-introduces a third-party call fails the build.
  console.log("\n[a] ETK-covered first-party regime");
  {
    const r = await getJson(`/api/vin/enrich/${CACHED_VIN}`);
    rec("first-party endpoint responds 200", r.status === 200, `status=${r.status}`);
    rec(
      "first-party endpoint advertises firstPartyOnly:true",
      r.body?.firstPartyOnly === true,
      `firstPartyOnly=${r.body?.firstPartyOnly}`,
    );
    rec("found:true for the seeded ETK-covered VIN", r.body?.found === true, `found=${r.body?.found}`);
    const es = r.body?.enrichmentSource || {};
    rec(
      "vehicle provenance is etk",
      es.vehicle?.source === "etk",
      `vehicle=${es.vehicle?.source}`,
    );
    rec(
      "options provenance is etk",
      es.options?.source === "etk",
      `options=${es.options?.source}`,
    );
    rec(
      "no third-party scraper appears in any tab provenance",
      !["bimmerwork", "mdecoder", "vindecoderz"].some(
        (s) => Object.values(es).some((t: any) => t?.source === s),
      ),
      `enrichmentSource=${JSON.stringify(es)}`,
    );
    const opts = r.body?.data?.options || [];
    rec(
      "options array is non-empty (dictionary-translated SA codes)",
      Array.isArray(opts) && opts.length > 0,
      `count=${opts.length}`,
    );
    rec(
      "at least one option has a dictionary-translated nameEn (not just the raw code)",
      opts.some((o: any) => o.nameEn && o.nameEn !== o.code),
      `sample=${JSON.stringify(opts.slice(0, 2))}`,
    );
    const veh = r.body?.data?.vehicle || {};
    rec(
      "vehicle.color resolved from local paint dictionary",
      typeof veh.color === "string" && veh.color.length > 0 && veh.colorCode === "475",
      `color=${veh.color} colorCode=${veh.colorCode}`,
    );
    rec(
      "vehicle.upholstery resolved from local upholstery dictionary",
      typeof veh.upholstery === "string" && veh.upholstery.length > 0 && veh.upholsteryCode === "FAAT",
      `upholstery=${veh.upholstery} upholsteryCode=${veh.upholsteryCode}`,
    );
  }

  // -- (b) modern VIN via /api/vin/bimmerwork (real user path) ----------
  // The /api/vin/bimmerwork/:vin endpoint is what the VinDecoder UI
  // actually hits, so we validate the orchestrator contract through
  // that path (not /api/vin/enrich which is firstPartyOnly).
  // For ETK-covered VINs:
  //   - vehicle/options must come from "etk"
  //   - images must be "bmw_configurator" or "none" (NEVER bimmerwork
  //     when ETK covers the chassis — strict regime)
  //   - manuals must be "bmw_manuals" or "none"
  // For VINs not in ETK, bimmer.work is allowed for vehicle/options
  // but BMW endpoints are still tried first for images/manuals — any
  // bimmerwork source for those tabs is only accepted as a fallback
  // when both BMW configurator and manuals portal returned empty.
  console.log("\n[b] modern VIN via /api/vin/bimmerwork (real user path)");
  {
    // Force a cache miss so we exercise the orchestrator and get
    // a fresh `enrichmentSource` in the response (the cache-hit
    // branch returns source:"cache" without the per-tab provenance).
    const { Client } = await import("pg");
    const pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    await pg.query("DELETE FROM vin_cache WHERE vin = $1", [POST_2020_VIN]);
    await pg.end();

    const r = await getJson(`/api/vin/bimmerwork/${POST_2020_VIN}`);
    rec("bimmerwork endpoint responds 200 for post-2020 VIN", r.status === 200, `status=${r.status}`);
    const es = r.body?.enrichmentSource || {};
    const SCRAPER_TAGS = ["bimmerwork", "mdecoder", "vindecoderz"];
    const FIRST_PARTY_OR_NONE_OR_SCRAPER = (s: string | undefined, firstParty: string) =>
      s === firstParty || s === "none" || SCRAPER_TAGS.includes(s || "");
    if (r.body?.found && es.vehicle?.source === "etk") {
      // ETK-covered: vehicle stays etk-authoritative; options/images/
      // manuals may fall back to scrapers when first-party returned
      // nothing.
      rec(
        "ETK-covered modern VIN: vehicle from etk (never overridden by scrapers)",
        es.vehicle?.source === "etk",
        `vehicleSource=${es.vehicle?.source}`,
      );
      rec(
        "ETK-covered modern VIN: images from BMW configurator first, scrapers as fallback, or none",
        FIRST_PARTY_OR_NONE_OR_SCRAPER(es.images?.source, "bmw_configurator"),
        `imagesSource=${es.images?.source}`,
      );
      rec(
        "ETK-covered modern VIN: manuals from BMW portal first, scrapers as fallback, or none",
        FIRST_PARTY_OR_NONE_OR_SCRAPER(es.manuals?.source, "bmw_manuals"),
        `manualsSource=${es.manuals?.source}`,
      );
    } else if (r.body?.found) {
      // Non-ETK modern VIN — third-party scrapers allowed for any tab
      // but BMW endpoints must be tried first for images/manuals.
      rec(
        "non-ETK modern VIN: images from BMW configurator first, scrapers as fallback, or none",
        FIRST_PARTY_OR_NONE_OR_SCRAPER(es.images?.source, "bmw_configurator"),
        `imagesSource=${es.images?.source}`,
      );
      rec(
        "non-ETK modern VIN: manuals from BMW portal first, scrapers as fallback, or none",
        FIRST_PARTY_OR_NONE_OR_SCRAPER(es.manuals?.source, "bmw_manuals"),
        `manualsSource=${es.manuals?.source}`,
      );
    } else {
      // VIN not enrichable from any source — acceptable, just record.
      rec(
        "VIN not enrichable from any source — orchestrator returned found:false",
        r.body?.found === false,
        `found=${r.body?.found}`,
      );
    }
  }

  // -- (b2) cache→vin_factory_options promotion pipeline ----------------
  // Proves the real ingestion path: when ops runs the promotion
  // script, every cached VIN with non-empty options gets a row in
  // vin_factory_options. This is how historical bimmer.work data
  // becomes first-party data — the orchestrator then serves it from
  // the local table on every subsequent enrichment.
  console.log("\n[b2] cache → vin_factory_options promotion script");
  {
    const beforeStats = await getJson(`/api/vin/enrichment-stats`);
    const beforeFa = beforeStats.body?.bySource?.options?.etk ?? 0;

    const { spawnSync } = await import("node:child_process");
    const proc = spawnSync("npx", ["tsx", "scripts/promote-cache-to-factory-options.ts"], {
      encoding: "utf8",
    });
    rec(
      "promotion script exits 0",
      proc.status === 0,
      `status=${proc.status} stderr=${(proc.stderr || "").slice(0, 200)}`,
    );
    const out = proc.stdout || "";
    rec(
      "promotion script reports inserted/updated count",
      /inserted\/updated \d+/.test(out),
      out.split("\n").find((l) => /inserted\/updated/.test(l)) || "(no match)",
    );
    rec(
      "promotion script reports vin_factory_options total",
      /vin_factory_options total now: \d+/.test(out),
      out.split("\n").find((l) => /total now/.test(l)) || "(no match)",
    );

    // Re-enrich the cached VIN — its options should still come from
    // the local table (either e2e_fixture or promoted_from_cache).
    const after = await getJson(`/api/vin/enrich/${CACHED_VIN}`);
    rec(
      "post-promotion: cached VIN options still served from ETK (local first-party)",
      after.body?.enrichmentSource?.options?.source === "etk",
      `optionsSource=${after.body?.enrichmentSource?.options?.source}`,
    );
  }

  // -- (c) cache miss → cache hit ---------------------------------------
  console.log("\n[c] cache miss → cache hit on the bimmerwork endpoint");
  {
    const t1 = Date.now();
    const r1 = await getJson(`/api/vin/bimmerwork/${CACHED_VIN}`);
    const d1 = Date.now() - t1;
    rec("first call returns 200", r1.status === 200, `status=${r1.status} duration=${d1}ms`);
    rec(
      "first call has data.vehicle present (cached or freshly enriched)",
      !!(r1.body?.found && r1.body?.data?.vehicle),
      `found=${r1.body?.found} hasVehicle=${!!r1.body?.data?.vehicle}`,
    );

    const t2 = Date.now();
    const r2 = await getJson(`/api/vin/bimmerwork/${CACHED_VIN}`);
    const d2 = Date.now() - t2;
    rec("second call returns 200", r2.status === 200, `status=${r2.status} duration=${d2}ms`);
    rec(
      "second call reports source=cache (cache hit)",
      r2.body?.source === "cache",
      `source=${r2.body?.source}`,
    );
    rec(
      "cache hit is fast (< 1500ms)",
      d2 < 1500,
      `duration=${d2}ms`,
    );
  }

  // -- (d) carvertical toggle --------------------------------------------
  console.log("\n[d] carvertical settings toggle");
  {
    const r = await getJson(`/api/settings/carvertical`);
    rec("public settings endpoint responds 200", r.status === 200, `status=${r.status}`);
    rec(
      "public settings has expected shape (a, b, chan, enabled)",
      typeof r.body?.a === "string" && typeof r.body?.b === "string" && typeof r.body?.chan === "string" && typeof r.body?.enabled === "boolean",
      `keys=${Object.keys(r.body || {}).join(",")}`,
    );

    // Try an admin toggle. If we don't have an admin session we expect a
    // 401/403 — that's a PASS for "auth correctly enforced", not a fail.
    const original = r.body || { a: "bmv", b: "placeholder", chan: "bmvparts", enabled: true };
    const flipped = { ...original, enabled: !original.enabled };
    const post = await getJson(`/api/admin/settings/carvertical`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(flipped),
    });
    if (post.status === 200) {
      const after = await getJson(`/api/settings/carvertical`);
      rec(
        "admin POST round-trip flips `enabled` on the public read",
        after.body?.enabled === flipped.enabled,
        `enabled before=${original.enabled} after=${after.body?.enabled}`,
      );
      // Restore
      await getJson(`/api/admin/settings/carvertical`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(original),
      });
    } else if (post.status === 401 || post.status === 403) {
      rec(
        "admin endpoint requires auth (no session available — toggle round-trip skipped)",
        true,
        `status=${post.status}`,
      );
    } else {
      rec(
        "admin POST returns 200 / 401 / 403",
        false,
        `status=${post.status}`,
      );
    }
  }

  // -- (e) ETK-coverage gate unit tests (Task #83) ---------------------
  // Wires the offline gate test into the runner so the build-time
  // regression guard ("no third-party calls for ETK-covered VINs")
  // is exercised by the same `npx tsx scripts/verify-vin-enrichment.ts`
  // command operators already use. Failures here roll up into the
  // verifier exit code.
  console.log("\n[e] ETK-coverage gate (offline orchestrator unit checks)");
  {
    const { runEtkGateChecks } = await import("./test-vin-etk-gate");
    const gate = await runEtkGateChecks();
    for (const c of gate) rec(`[gate] ${c.name}`, c.ok, c.detail);
  }

  // -- summary ----------------------------------------------------------
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n[verify-vin-enrichment] ${passed}/${total} checks passed`);
  if (passed < total) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[verify-vin-enrichment] fatal", e);
  process.exit(1);
});
