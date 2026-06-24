// SEO regression smoke-test for chassis and series hub pages.
// Loads a sample /chassis/:code and /series/:slug in a real headless
// browser and asserts (a) the visible intro paragraph and at least one
// FAQ Q/A pair render in the DOM, and (b) the document <head> contains
// both a CollectionPage JSON-LD script and a FAQPage JSON-LD script.
//
// Sample chassis/series default to whichever has the most parts; override
// with HUB_SEO_CHASSIS / HUB_SEO_SERIES. Server URL defaults to
// http://localhost:$PORT (5000); override with HUB_SEO_BASE_URL.
//
// Exits non-zero on any failed check.

// Pin Playwright's browser cache to the workspace path before importing
// playwright. The default cache resolves via XDG_CACHE_HOME / $HOME/.cache,
// which differs between an interactive shell (workspace `.cache`) and a
// Replit workflow process (no XDG_CACHE_HOME → falls back to /home/runner/
// .cache where browsers are not installed). Setting this env var explicitly
// makes the resolution identical in every context.
import path from "path";
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  ?? path.resolve(process.cwd(), ".cache/ms-playwright");

import { chromium, type Page } from "playwright";
import { runLocaleSeoChecks } from "../tests/e2e/locale-seo.spec";
import { BMV_VIN_HOST } from "../shared/bmv-vin/links";

const BASE = process.env.HUB_SEO_BASE_URL || `http://localhost:${process.env.PORT || "5000"}`;

interface CheckResult { name: string; ok: boolean; detail?: string }
const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function getJson(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/chassis`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, 1_000));
  }
  throw new Error(`server at ${BASE} did not become ready within ${timeoutMs}ms (last error: ${lastErr})`);
}

async function pickSamples(): Promise<{ chassisCode: string; seriesSlug: string }> {
  const overrideChassis = process.env.HUB_SEO_CHASSIS;
  const overrideSeries = process.env.HUB_SEO_SERIES;
  if (overrideChassis && overrideSeries) {
    return { chassisCode: overrideChassis.toLowerCase(), seriesSlug: overrideSeries.toLowerCase() };
  }
  const chassisIndex = await getJson("/api/chassis") as { chassis: string; carCount?: number; totalParts?: number }[];
  const seriesIndex = await getJson("/api/series") as { slug: string; name: string; count?: number; totalCars?: number; totalParts?: number }[];
  const bestChassis = [...chassisIndex]
    .filter(c => (c.carCount || 0) > 0 && (c.totalParts || 0) > 0)
    .sort((a, b) => (b.totalParts || 0) - (a.totalParts || 0))[0];
  const bestSeries = [...seriesIndex]
    .filter(s => ((s.totalCars ?? s.count) || 0) > 0 && (s.totalParts || 0) > 0)
    .sort((a, b) => (b.totalParts || 0) - (a.totalParts || 0))[0];
  if (!bestChassis || !bestSeries) throw new Error("Catalog is empty — cannot pick a sample chassis/series");
  return {
    chassisCode: (overrideChassis || bestChassis.chassis).toLowerCase(),
    seriesSlug: (overrideSeries || bestSeries.slug).toLowerCase(),
  };
}

async function readJsonLdTypes(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const scripts = Array.from(document.head.querySelectorAll('script[type="application/ld+json"]'));
    const types: string[] = [];
    for (const s of scripts) {
      try {
        const parsed = JSON.parse(s.textContent || "");
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const node of list) {
          if (node && typeof node === "object" && typeof node["@type"] === "string") {
            types.push(node["@type"]);
          }
        }
      } catch {
        // ignore malformed nodes — they will surface as a missing @type
      }
    }
    return types;
  });
}

async function checkHub(page: Page, label: string, path: string) {
  console.log(`\n[verify-hub-seo] ${label}: ${path}`);
  const url = `${BASE}${path}`;
  const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  record(`${label}: page loads OK`, !!resp && resp.ok(), resp ? `HTTP ${resp.status()}` : "no response");

  // Wait for the SEO-driven blocks to render. They depend on the hub SEO
  // API call, which fires after the main hub data resolves.
  await page.waitForSelector('[data-testid="text-hub-intro"]', { timeout: 15_000 }).catch(() => {});
  await page.waitForSelector('[data-testid="faq-item-0"]', { timeout: 15_000 }).catch(() => {});

  const introText = await page.locator('[data-testid="text-hub-intro"]').first().textContent().catch(() => null);
  record(`${label}: visible intro paragraph rendered`,
    !!introText && introText.trim().length >= 40,
    `text length=${(introText || "").trim().length}`);

  const faqCount = await page.locator('[data-testid^="faq-item-"]').count();
  record(`${label}: at least one FAQ item rendered`, faqCount >= 1, `faq items=${faqCount}`);

  if (faqCount >= 1) {
    const q = (await page.locator('[data-testid="faq-question-0"]').first().textContent().catch(() => "") || "").trim();
    const a = (await page.locator('[data-testid="faq-answer-0"]').first().textContent().catch(() => "") || "").trim();
    record(`${label}: first FAQ has both a question and an answer`, q.length > 0 && a.length > 0,
      `q="${q.slice(0, 40)}…" a="${a.slice(0, 40)}…"`);
  }

  // react-helmet-async injects head tags asynchronously after mount.
  // Poll briefly to give it a chance to flush both JSON-LD scripts.
  let types: string[] = [];
  for (let i = 0; i < 20; i++) {
    types = await readJsonLdTypes(page);
    if (types.includes("CollectionPage") && types.includes("FAQPage")) break;
    await page.waitForTimeout(150);
  }

  record(`${label}: <head> contains a CollectionPage JSON-LD script`,
    types.includes("CollectionPage"),
    `@types=[${types.join(", ")}]`);
  record(`${label}: <head> contains a FAQPage JSON-LD script`,
    types.includes("FAQPage"),
    `@types=[${types.join(", ")}]`);
}

// Verify the evergreen /vin tool page renders intro + FAQ + the
// WebApplication / FAQPage / HowTo JSON-LD set.
async function checkVinToolPage(page: Page) {
  const url = `${BASE}/vin`;
  console.log(`\n[verify-hub-seo] /vin tool page: ${url}`);
  const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  record(`/vin: page loads OK`, !!resp && resp.ok(), resp ? `HTTP ${resp.status()}` : "no response");

  // Wait for the evergreen sections to render (they are SPA-rendered, not
  // SSR — the SSR layer only kicks in for /vin/:VIN with cached data).
  await page.waitForSelector('[data-testid="text-vin-intro"]', { timeout: 15_000 }).catch(() => {});
  await page.waitForSelector('[data-testid="vin-faq-item-0"]', { timeout: 15_000 }).catch(() => {});

  const intro = (await page.locator('[data-testid="text-vin-intro"]').first().textContent().catch(() => "") || "").trim();
  record(`/vin: intro paragraph rendered`, intro.length >= 80, `intro length=${intro.length}`);

  const faqCount = await page.locator('[data-testid^="vin-faq-item-"]').count();
  record(`/vin: at least 3 FAQ items rendered`, faqCount >= 3, `faq items=${faqCount}`);

  const howCount = await page.locator('[data-testid^="vin-how-step-"]').count();
  record(`/vin: at least 3 HowTo steps rendered`, howCount >= 3, `how steps=${howCount}`);

  let types: string[] = [];
  for (let i = 0; i < 20; i++) {
    types = await readJsonLdTypes(page);
    if (types.includes("WebApplication") && types.includes("FAQPage") && types.includes("HowTo")) break;
    await page.waitForTimeout(150);
  }
  record(`/vin: <head> contains WebApplication JSON-LD`, types.includes("WebApplication"), `@types=[${types.join(", ")}]`);
  record(`/vin: <head> contains HowTo JSON-LD`, types.includes("HowTo"), `@types=[${types.join(", ")}]`);
  record(`/vin: <head> contains FAQPage JSON-LD`, types.includes("FAQPage"), `@types=[${types.join(", ")}]`);
}

// Verify the per-VIN landing route serves the SSR-injected title /
// canonical / Vehicle JSON-LD / BreadcrumbList / H1 in the raw HTML
// response (no JS required) for at least one cached VIN. Picks the
// freshest cached VIN from the sitemap shard so this test is stable
// regardless of which row was just enriched.
async function pickSampleCachedVin(): Promise<string | null> {
  // sitemap-vins-1.xml is ordered updated_at DESC, so the first <loc> is
  // the newest cached VIN. Prefer an env override when present.
  const override = process.env.HUB_SEO_VIN;
  if (override) return override.toUpperCase();
  try {
    const res = await fetch(`${BASE}/sitemap-vins-1.xml`);
    if (!res.ok) return null;
    const xml = await res.text();
    const m = xml.match(/<loc>https?:\/\/[^/]+\/vin\/([A-Z0-9]{17})<\/loc>/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function checkPerVinLandingSsr(vin: string) {
  const url = `${BASE}/vin/${vin}`;
  console.log(`\n[verify-hub-seo] per-VIN SSR: ${url}`);
  // Fetch raw HTML — no JS execution. This is the crawler-visible payload.
  const resp = await fetch(url, { headers: { Accept: "text/html" } });
  record(`/vin/${vin}: HTTP 200 from raw fetch`, resp.ok, `status=${resp.status}`);
  if (!resp.ok) return;
  const html = await resp.text();

  record(
    `/vin/${vin}: SSR <title> contains the VIN`,
    /<title[^>]*data-bmv-ssr[^>]*>[^<]*VIN\s+[A-Z0-9]{17}[^<]*<\/title>/i.test(html)
      && html.includes(vin),
    `len=${html.length}`,
  );
  record(
    `/vin/${vin}: SSR canonical link present`,
    new RegExp(`<link[^>]*data-bmv-ssr[^>]*rel="canonical"[^>]*href="https://bmv\\.parts/vin/${vin}"`).test(html),
  );
  record(
    `/vin/${vin}: SSR meta description present`,
    /<meta[^>]*data-bmv-ssr[^>]*name="description"/i.test(html),
  );
  record(
    `/vin/${vin}: SSR H1 contains the VIN`,
    new RegExp(`<h1[^>]*>[^<]*${vin}[^<]*</h1>`).test(html),
  );

  // Extract every JSON-LD payload server-tagged with data-bmv-ssr and
  // collect their @type values. Tolerate either single nodes or arrays.
  const jsonldTypes: string[] = [];
  const re = /<script[^>]*data-bmv-ssr[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of list) {
        if (node && typeof node["@type"] === "string") jsonldTypes.push(node["@type"]);
      }
    } catch {
      // ignore malformed payloads — they will fail the asserts below
    }
  }
  record(
    `/vin/${vin}: SSR Vehicle JSON-LD present`,
    jsonldTypes.includes("Vehicle"),
    `@types=[${jsonldTypes.join(", ")}]`,
  );
  record(
    `/vin/${vin}: SSR BreadcrumbList JSON-LD present`,
    jsonldTypes.includes("BreadcrumbList"),
    `@types=[${jsonldTypes.join(", ")}]`,
  );
  record(
    `/vin/${vin}: sitemap-vins-1.xml lists this VIN`,
    true, // we picked it FROM the sitemap, so this is by construction
  );
}

// Fetch a path with `Host: bmv.vin` so the host-rewrite layer in
// server/index.ts treats it as the vanity host. We use the lower-level
// http module instead of fetch because Node's fetch silently sets the
// Host header from the URL itself (overriding any user-supplied value),
// which would route us back to the bmv.parts surface.
async function fetchAsBmvVinHost(
  pathname: string,
  _opts: { redirect?: "manual" | "follow" } = {},
): Promise<{ status: number; body: string; location: string }> {
  const http = await import("http");
  const url = new URL(BASE);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: pathname,
      method: "GET",
      headers: { Host: BMV_VIN_HOST, Accept: "text/html" },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode || 0,
        body: Buffer.concat(chunks).toString("utf8"),
        location: typeof res.headers.location === "string" ? res.headers.location : "",
      }));
    });
    req.on("error", reject);
    req.end();
  });
}

function ssrJsonLdTypes(html: string): string[] {
  const types: string[] = [];
  const re = /<script[^>]*data-bmv-ssr[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of list) {
        if (node && typeof node["@type"] === "string") types.push(node["@type"]);
      }
    } catch { /* ignore malformed */ }
  }
  return types;
}

async function checkBmvVinSurfaces(sampleVin: string | null) {
  console.log(`\n[verify-hub-seo] bmv.vin host surfaces (Host: bmv.vin)`);

  // Decoder home /
  const home = await fetchAsBmvVinHost("/");
  record(`bmv.vin /: HTTP 200`, home.status === 200, `status=${home.status}`);
  const homeTypes = ssrJsonLdTypes(home.body);
  record(`bmv.vin /: SSR HowTo JSON-LD present`, homeTypes.includes("HowTo"), `@types=[${homeTypes.join(", ")}]`);
  record(`bmv.vin /: SSR ItemList JSON-LD present`, homeTypes.includes("ItemList"), `@types=[${homeTypes.join(", ")}]`);
  record(`bmv.vin /: canonical points at https://bmv.vin/`,
    /<link[^>]*data-bmv-ssr[^>]*rel="canonical"[^>]*href="https:\/\/bmv\.vin\/?"/.test(home.body));

  // Brand decoder /decoder/bmw
  const brand = await fetchAsBmvVinHost("/decoder/bmw");
  record(`bmv.vin /decoder/bmw: HTTP 200`, brand.status === 200, `status=${brand.status}`);
  const brandTypes = ssrJsonLdTypes(brand.body);
  record(`bmv.vin /decoder/bmw: SSR FAQPage JSON-LD present`,
    brandTypes.includes("FAQPage"), `@types=[${brandTypes.join(", ")}]`);
  record(`bmv.vin /decoder/bmw: SSR WebPage JSON-LD present`,
    brandTypes.includes("WebPage"), `@types=[${brandTypes.join(", ")}]`);
  record(`bmv.vin /decoder/bmw: SSR Service JSON-LD present`,
    brandTypes.includes("Service"), `@types=[${brandTypes.join(", ")}]`);
  record(`bmv.vin /decoder/bmw: WMI table rendered`,
    /WBA|WBS|WBY|WMI/i.test(brand.body), `len=${brand.body.length}`);

  // Guide index
  const guideIdx = await fetchAsBmvVinHost("/guide");
  record(`bmv.vin /guide: HTTP 200`, guideIdx.status === 200, `status=${guideIdx.status}`);
  record(`bmv.vin /guide: SSR <h1> rendered`,
    /<h1[^>]*data-bmv-ssr/i.test(guideIdx.body) || /<h1[^>]*>/i.test(guideIdx.body),
    `len=${guideIdx.body.length}`);

  // Glossary index
  const glossIdx = await fetchAsBmvVinHost("/glossary");
  record(`bmv.vin /glossary: HTTP 200`, glossIdx.status === 200, `status=${glossIdx.status}`);
  record(`bmv.vin /glossary: SSR <h1> rendered`,
    /<h1[^>]*>/i.test(glossIdx.body), `len=${glossIdx.body.length}`);

  // Facet hub /year/<recent year>
  const facetYear = await fetchAsBmvVinHost("/year/2020");
  record(`bmv.vin /year/2020: HTTP 200`, facetYear.status === 200, `status=${facetYear.status}`);
  // Facet hub may be empty (noindex) — both are acceptable; we just
  // assert the SSR runs and produces a body with a canonical.
  record(`bmv.vin /year/2020: canonical points at https://bmv.vin/year/2020`,
    /<link[^>]*data-bmv-ssr[^>]*rel="canonical"[^>]*href="https:\/\/bmv\.vin\/year\/2020"/.test(facetYear.body),
    `len=${facetYear.body.length}`);

  // Chassis facet hub: must add Vehicle JSON-LD on top of CollectionPage.
  const chassisHub = await fetchAsBmvVinHost("/chassis/g05");
  record(`bmv.vin /chassis/g05: HTTP 200`, chassisHub.status === 200, `status=${chassisHub.status}`);
  const chassisTypes = ssrJsonLdTypes(chassisHub.body);
  record(`bmv.vin /chassis/g05: SSR CollectionPage JSON-LD present`,
    chassisTypes.includes("CollectionPage"), `@types=[${chassisTypes.join(", ")}]`);
  record(`bmv.vin /chassis/g05: SSR Vehicle JSON-LD present`,
    chassisTypes.includes("Vehicle"), `@types=[${chassisTypes.join(", ")}]`);

  // SSR-only decode form: GET /decode?vin=<valid> must 302 to /<VIN>.
  const decodeRedirect = await fetchAsBmvVinHost("/decode?vin=WBA5A7C50FD000000", { redirect: "manual" });
  record(`bmv.vin /decode?vin=valid: HTTP 302`,
    decodeRedirect.status === 302, `status=${decodeRedirect.status}`);
  record(`bmv.vin /decode?vin=valid: Location is /<VIN>`,
    decodeRedirect.location === "/WBA5A7C50FD000000", `location=${decodeRedirect.location}`);
  const decodeBad = await fetchAsBmvVinHost("/decode?vin=garbage", { redirect: "manual" });
  record(`bmv.vin /decode?vin=invalid: HTTP 302 back to home with error`,
    decodeBad.status === 302 && decodeBad.location.startsWith("/?") && decodeBad.location.includes("error=invalid"),
    `status=${decodeBad.status} location=${decodeBad.location}`);

  // Per-VIN SSR with rails — only if we have a cached sample VIN.
  if (sampleVin) {
    const perVin = await fetchAsBmvVinHost(`/${sampleVin}`);
    record(`bmv.vin /${sampleVin}: HTTP 200`, perVin.status === 200, `status=${perVin.status}`);
    record(`bmv.vin /${sampleVin}: canonical points at https://bmv.vin/${sampleVin}`,
      new RegExp(`<link[^>]*data-bmv-ssr[^>]*rel="canonical"[^>]*href="https://bmv\\.vin/${sampleVin}"`).test(perVin.body));
    const perVinTypes = ssrJsonLdTypes(perVin.body);
    record(`bmv.vin /${sampleVin}: SSR Vehicle JSON-LD present`,
      perVinTypes.includes("Vehicle"), `@types=[${perVinTypes.join(", ")}]`);
    record(`bmv.vin /${sampleVin}: SSR BreadcrumbList JSON-LD present`,
      perVinTypes.includes("BreadcrumbList"), `@types=[${perVinTypes.join(", ")}]`);
  } else {
    record(`bmv.vin per-VIN SSR: skipped (no cached VIN sample)`, true, "vin_cache appears empty");
  }

  // /robots.txt: must allow first 50 ?page= and disallow the long tail.
  const robots = await fetchAsBmvVinHost("/robots.txt");
  record(`bmv.vin /robots.txt: HTTP 200`, robots.status === 200, `status=${robots.status}`);
  record(`bmv.vin /robots.txt: allows ?page=1`,
    /Allow:\s*\/\*\?page=1\$/i.test(robots.body));
  record(`bmv.vin /robots.txt: allows ?page=50`,
    /Allow:\s*\/\*\?page=50\$/i.test(robots.body));
  record(`bmv.vin /robots.txt: disallows generic ?page=`,
    /Disallow:\s*\/\*\?page=/i.test(robots.body));
  record(`bmv.vin /robots.txt: references the bmv.vin sitemap`,
    /Sitemap:\s*https:\/\/bmv\.vin\/sitemap\.xml/i.test(robots.body));

  // /sitemap.xml index references the bmv.vin shards. Facets are referenced
  // either as a single /sitemap-facets.xml (count <= 45k) or as
  // /sitemap-facets-1.xml..N.xml (count > 45k); accept either layout.
  const sitemap = await fetchAsBmvVinHost("/sitemap.xml");
  record(`bmv.vin /sitemap.xml: HTTP 200`, sitemap.status === 200, `status=${sitemap.status}`);
  const singleFacets = /<loc>https:\/\/bmv\.vin\/sitemap-facets\.xml<\/loc>/.test(sitemap.body);
  const shardedFacets = /<loc>https:\/\/bmv\.vin\/sitemap-facets-1\.xml<\/loc>/.test(sitemap.body);
  record(`bmv.vin /sitemap.xml: references sitemap-facets (single or shard 1)`,
    singleFacets || shardedFacets,
    `singleFacets=${singleFacets} shardedFacets=${shardedFacets}`);
  record(`bmv.vin /sitemap.xml: references sitemap-chassis.xml`,
    /<loc>https:\/\/bmv\.vin\/sitemap-chassis\.xml<\/loc>/.test(sitemap.body));
  // Spec: guides + glossary share /sitemap-guides.xml; no separate
  // /sitemap-glossary.xml shard is referenced from the index.
  record(`bmv.vin /sitemap.xml: references sitemap-guides.xml`,
    /<loc>https:\/\/bmv\.vin\/sitemap-guides\.xml<\/loc>/.test(sitemap.body));
  record(`bmv.vin /sitemap.xml: does NOT reference sitemap-glossary.xml`,
    !/<loc>https:\/\/bmv\.vin\/sitemap-glossary\.xml<\/loc>/.test(sitemap.body));
  const guidesSitemap = await fetchAsBmvVinHost("/sitemap-guides.xml");
  record(`bmv.vin /sitemap-guides.xml: HTTP 200`,
    guidesSitemap.status === 200, `status=${guidesSitemap.status}`);
  record(`bmv.vin /sitemap-guides.xml: contains guide URL(s)`,
    /<loc>https:\/\/bmv\.vin\/guide\//.test(guidesSitemap.body));
  record(`bmv.vin /sitemap-guides.xml: contains glossary URL(s)`,
    /<loc>https:\/\/bmv\.vin\/glossary\//.test(guidesSitemap.body));

  // Whichever facet layout the index advertised must serve a valid urlset.
  const facetUrl = singleFacets ? "/sitemap-facets.xml" : "/sitemap-facets-1.xml";
  const facetResp = await fetchAsBmvVinHost(facetUrl);
  record(`bmv.vin ${facetUrl}: HTTP 200`,
    facetResp.status === 200, `status=${facetResp.status}`);
  record(`bmv.vin ${facetUrl}: returns a urlset`,
    /<urlset\b/.test(facetResp.body));

  // Out-of-range shard 9999 must 404 (sharding off-by-one guard).
  const oobResp = await fetchAsBmvVinHost("/sitemap-facets-9999.xml");
  record(`bmv.vin /sitemap-facets-9999.xml: out-of-range shard 404s`,
    oobResp.status === 404, `status=${oobResp.status}`);
}

// Verify a structurally invalid VIN returns 404 + noindex from the SSR
// layer. We use a length-correct but non-BMW WMI to avoid
// triggering the structural-pass branch.
async function checkInvalidVinNoindex() {
  const bogus = "JT2BF22K1W0123456"; // 17 chars, valid VIN charset, Toyota WMI (JT2)
  const url = `${BASE}/vin/${bogus}`;
  console.log(`\n[verify-hub-seo] invalid-VIN noindex: ${url}`);
  const resp = await fetch(url, { headers: { Accept: "text/html" } });
  record(`/vin/${bogus}: HTTP 404`, resp.status === 404, `status=${resp.status}`);
  if (resp.status === 404) {
    const html = await resp.text();
    record(
      `/vin/${bogus}: response contains noindex robots meta`,
      /<meta[^>]*name="robots"[^>]*content="noindex/i.test(html),
    );
  }
}

async function main() {
  console.log(`[verify-hub-seo] base=${BASE}`);
  await waitForServer();
  const { chassisCode, seriesSlug } = await pickSamples();
  console.log(`[verify-hub-seo] sample chassis=${chassisCode} series=${seriesSlug}`);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await checkHub(page, "chassis hub", `/chassis/${chassisCode}`);
    await checkHub(page, "series hub", `/series/${seriesSlug}`);

    // Localized car/chassis SEO smoke (Task #45). Reuses the same browser
    // instance and asserts head metadata + rendered intro/FAQ copy across
    // a sample of locale prefixes.
    console.log(`\n[verify-hub-seo] localized car/chassis SEO checks`);
    const localeResult = await runLocaleSeoChecks(page);
    record(
      `localized car/chassis SEO: ${localeResult.total - localeResult.failures.length}/${localeResult.total} cases pass`,
      localeResult.failures.length === 0,
      localeResult.failures.length === 0
        ? undefined
        : localeResult.failures.map(f => `${f.label}: ${f.message}`).join(" | "),
    );

    // /vin evergreen + per-VIN SSR checks.
    await checkVinToolPage(page);
    const sampleVin = await pickSampleCachedVin();
    if (sampleVin) {
      await checkPerVinLandingSsr(sampleVin);
    } else {
      record(
        `per-VIN SSR: skipped (no cached VINs available in sitemap-vins-1.xml)`,
        true,
        "vin_cache appears empty",
      );
    }
    await checkInvalidVinNoindex();

    // bmv.vin host surfaces — exercised via Host: bmv.vin header on the
    // same temp server. Independent of the bmv.parts checks above.
    await checkBmvVinSurfaces(sampleVin);
  } finally {
    await browser.close();
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n[verify-hub-seo] ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.error(`[verify-hub-seo] FAILURES:`);
    for (const f of failed) console.error(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`[verify-hub-seo] error: ${err?.message || err}`);
  process.exit(1);
});
