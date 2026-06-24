/**
 * Regression guard for Task #97 — "No parts groups" on car detail pages.
 *
 * The bug: on bmv.vin the SSR catch-all dispatcher in
 * server/seo/bmv-vin-ssr-middleware.ts was hijacking browser fetch()
 * calls to /api/* and returning the SPA's noindex 404 HTML shell with
 * status 200. React Query's default fetcher (then) didn't throw on the
 * 200, but res.json() crashed on HTML, the destructuring default
 * `data: subcategories = []` swallowed the error, and the car detail
 * page rendered "No parts groups" / "0 groups available" for every
 * visitor on every fresh visit.
 *
 * This spec runs against the local Express+Vite server. It exercises
 * the user-visible path twice:
 *   1. With the default Host header (mirrors bmv.parts behaviour).
 *   2. With Host: bmv.vin (mirrors the production bmv.vin host that
 *      the original bug report reproduces on).
 * For each host it loads the car page, clicks a populated category,
 * and asserts at least one subcategory button renders with a non-zero
 * partCount badge — i.e. the API contract the page depends on actually
 * makes it into the React tree.
 *
 * Also smoke-tests the JSON contract directly so a future regression
 * that re-introduces the SSR catch-all on /api/* fails loudly here
 * before it can ship.
 *
 * Usage:
 *   tsx tests/e2e/car-detail-subcategories.spec.ts
 */
import { chromium, type Browser, type Page } from "playwright";

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || "5000"}`;
const CAR_SLUG = process.env.CAR_SLUG || "g05-x5-30dx-b57-60024";
const HOSTS = ["", "bmv.vin"]; // "" = whatever Express sees by default.

interface CheckResult { label: string; ok: boolean; detail?: string }

async function fetchJson(url: string, host: string): Promise<{ status: number; contentType: string; body: string }> {
  const res = await fetch(url, { headers: host ? { Host: host, Accept: "*/*" } : { Accept: "*/*" } });
  return { status: res.status, contentType: res.headers.get("content-type") || "", body: await res.text() };
}

async function checkApiReturnsJson(host: string, path: string): Promise<CheckResult> {
  const label = `${host || "default"} ${path}: returns application/json`;
  try {
    const r = await fetchJson(`${BASE_URL}${path}`, host);
    if (r.status !== 200) return { label, ok: false, detail: `status=${r.status}` };
    if (!r.contentType.includes("application/json")) {
      return { label, ok: false, detail: `content-type=${r.contentType} body[0..100]=${r.body.slice(0, 100)}` };
    }
    try { JSON.parse(r.body); }
    catch { return { label, ok: false, detail: `body not parseable as JSON: ${r.body.slice(0, 100)}` }; }
    return { label, ok: true };
  } catch (err) { return { label, ok: false, detail: (err as Error).message }; }
}

async function checkCarPageRendersSubcategories(page: Page): Promise<CheckResult> {
  const label = `default /car/${CAR_SLUG}: clicks a category and renders subcategories`;
  try {
    await page.goto(`${BASE_URL}/car/${CAR_SLUG}`, { waitUntil: "networkidle", timeout: 30000 });

    // Wait for the category list to render. The categoryPanel uses
    // data-testid="button-category-<id>" for each entry.
    await page.waitForSelector('[data-testid^="button-category-"]', { timeout: 15000 });
    const categoryButtons = await page.$$('[data-testid^="button-category-"]');
    if (categoryButtons.length === 0) return { label, ok: false, detail: "no category buttons rendered" };

    // Click the first non-Technical-Literature category — pick one that's
    // likely to have many subcategories (e.g. Engine, Scopes of service…).
    // We just click the second category button, since the first is usually
    // the small "Technical Literature" group.
    const target = categoryButtons[Math.min(1, categoryButtons.length - 1)];
    await target.click();

    // Subcategory buttons should appear. Wait up to 10s.
    await page.waitForSelector('[data-testid^="button-subcategory-"]', { timeout: 10000 });
    const subButtons = await page.$$('[data-testid^="button-subcategory-"]');
    if (subButtons.length === 0) {
      return { label, ok: false, detail: "no subcategory buttons after clicking category" };
    }

    // Assert "No parts groups" placeholder is NOT visible.
    const emptyText = await page.locator('text=No parts groups').count();
    if (emptyText > 0) return { label, ok: false, detail: '"No parts groups" placeholder is visible' };

    // Assert at least one badge has a non-zero partCount.
    const badges = await page.$$('[data-testid^="badge-partcount-"]');
    let sawNonZero = false;
    for (const b of badges) {
      const t = (await b.textContent())?.trim() || "";
      if (t && t !== "0") { sawNonZero = true; break; }
    }
    if (!sawNonZero) return { label, ok: false, detail: `${badges.length} badges, none non-zero` };

    return { label, ok: true, detail: `${subButtons.length} subcategories, ${badges.length} badges` };
  } catch (err) { return { label, ok: false, detail: (err as Error).message }; }
}

export async function runCarDetailSubcategoryChecks(): Promise<{ total: number; failures: CheckResult[] }> {
  const results: CheckResult[] = [];

  // 1) Direct JSON contract check on the API endpoints the page depends on.
  for (const host of HOSTS) {
    results.push(await checkApiReturnsJson(host, `/api/cars/${CAR_SLUG}`));
    // Resolve carId once so we can hit /api/cars/:id/categories.
    try {
      const carRes = await fetchJson(`${BASE_URL}/api/cars/${CAR_SLUG}`, host);
      const car = JSON.parse(carRes.body);
      const carId = car?.id;
      if (carId) {
        const catsRes = await fetchJson(`${BASE_URL}/api/cars/${carId}/categories`, host);
        results.push({
          label: `${host || "default"} /api/cars/${carId}/categories: returns application/json`,
          ok: catsRes.status === 200 && catsRes.contentType.includes("application/json"),
          detail: `status=${catsRes.status} content-type=${catsRes.contentType}`,
        });
        const cats = JSON.parse(catsRes.body);
        const firstCatId = cats?.[Math.min(1, cats.length - 1)]?.id;
        if (firstCatId) {
          results.push(await checkApiReturnsJson(host, `/api/categories/${firstCatId}/subcategories`));
        }
      }
    } catch (err) {
      results.push({ label: `${host || "default"} resolve carId for category check`, ok: false, detail: (err as Error).message });
    }
  }

  // 2) Browser-driven UX check. Playwright forbids overriding the Host
  // header, so the browser case runs against the default host only — the
  // direct API checks above already cover the bmv.vin contract that the
  // page depends on.
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    results.push(await checkCarPageRendersSubcategories(page));
    await context.close();
  } finally {
    await browser?.close();
  }

  const failures = results.filter(r => !r.ok);
  for (const r of results) {
    if (r.ok) console.log(`  ok  ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
    else { console.error(`  FAIL ${r.label}`); if (r.detail) console.error(`       ${r.detail}`); }
  }
  return { total: results.length, failures };
}

const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  runCarDetailSubcategoryChecks()
    .then(r => {
      if (r.failures.length > 0) {
        console.error(`\n${r.failures.length}/${r.total} checks failed`);
        process.exit(1);
      }
      console.log(`\nAll ${r.total} checks passed`);
    })
    .catch(err => { console.error(err); process.exit(1); });
}
