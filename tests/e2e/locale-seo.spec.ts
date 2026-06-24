/**
 * End-to-end SEO check for locale-prefixed car/chassis pages (Task #45).
 *
 * Boots Playwright Chromium against the running Express+Vite server and
 * asserts, for a sample of locale × {car,chassis} URL combinations:
 *   - <html lang> matches the active locale BCP-47
 *   - <title> and <meta name="description"> are populated from the
 *     localized SEO pack returned by /api/{cars,chassis}/seo
 *   - One <link rel="alternate" hreflang="…"/> tag per supported locale
 *     plus an x-default sentinel
 *   - For chassis pages: the rendered intro paragraph
 *     ([data-testid="text-hub-intro"]) and the first FAQ entry
 *     ([data-testid="faq-question-0"], [data-testid="faq-answer-0"])
 *     match the localized intro / faq[0] strings from the SEO API
 *
 * Usage:
 *   tsx tests/e2e/locale-seo.spec.ts                  # standalone run
 *   import { runLocaleSeoChecks } from "./locale-seo.spec";  # reusable
 *
 * The standalone entry exits non-zero on the first failed assertion.
 * The exported function returns a structured result so it can be invoked
 * from scripts/verify-hub-seo.ts (pre-deploy SEO smoke pipeline).
 */
import { chromium, type Browser, type Page } from "playwright";

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || "5000"}`;

// Mirrors CLIENT_LOCALES in client/src/lib/locale.ts. Kept inline to keep
// the spec dependency-free (Playwright + Node only).
const LOCALES = [
  { prefix: "",      bcp47: "en" },
  { prefix: "de",    bcp47: "de-DE" },
  { prefix: "fr",    bcp47: "fr-FR" },
  { prefix: "es",    bcp47: "es-ES" },
  { prefix: "it",    bcp47: "it-IT" },
  { prefix: "zh",    bcp47: "zh-CN" },
  { prefix: "ko",    bcp47: "ko-KR" },
  { prefix: "es-mx", bcp47: "es-MX" },
  { prefix: "en-za", bcp47: "en-ZA" },
  { prefix: "pt-br", bcp47: "pt-BR" },
  { prefix: "ru",    bcp47: "ru-RU" },
];
const ALL_BCP47 = new Set(LOCALES.map(l => l.bcp47));

interface Case {
  kind: "car" | "chassis";
  prefix: string;
  bcp47: string;
  /** Path relative to the locale prefix, e.g. "/car/g80-…" or "/chassis/G80". */
  subpath: string;
}

const SAMPLE_SLUG = "g80-m3-comp-m-xdrive-2020-09";
const SAMPLE_CHASSIS = "G80";

const CASES: Case[] = [
  { kind: "car",     prefix: "de", bcp47: "de-DE", subpath: `/car/${SAMPLE_SLUG}` },
  { kind: "car",     prefix: "zh", bcp47: "zh-CN", subpath: `/car/${SAMPLE_SLUG}` },
  { kind: "car",     prefix: "fr", bcp47: "fr-FR", subpath: `/car/${SAMPLE_SLUG}` },
  { kind: "chassis", prefix: "de", bcp47: "de-DE", subpath: `/chassis/${SAMPLE_CHASSIS}` },
  { kind: "chassis", prefix: "zh", bcp47: "zh-CN", subpath: `/chassis/${SAMPLE_CHASSIS}` },
  { kind: "chassis", prefix: "ko", bcp47: "ko-KR", subpath: `/chassis/${SAMPLE_CHASSIS}` },
];

class AssertionError extends Error {}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new AssertionError(msg);
}

interface SeoPack {
  metaTitle: string;
  metaDescription: string;
  intro?: string;
  faq?: { question: string; answer: string }[];
}

async function fetchSeoPack(c: Case): Promise<SeoPack> {
  const url =
    c.kind === "car"
      ? `${BASE_URL}/api/cars/seo/${encodeURIComponent(SAMPLE_SLUG)}?locale=${encodeURIComponent(c.bcp47)}`
      : `${BASE_URL}/api/chassis/seo/${encodeURIComponent(SAMPLE_CHASSIS)}?locale=${encodeURIComponent(c.bcp47)}`;
  const res = await fetch(url);
  assert(res.ok, `SEO API ${url} returned ${res.status}`);
  const body: any = await res.json();
  return {
    metaTitle: body.content.metaTitle,
    metaDescription: body.content.metaDescription,
    intro: body.content.intro,
    faq: body.content.faq,
  };
}

async function readHead(page: Page, expectedBcp47: string) {
  // Task #48: the car/chassis pages now compute the localized <title>,
  // meta description, and <html lang> synchronously from the shared i18n
  // pack on the first React render, so we no longer need to wait for the
  // async /api/{cars,chassis}/seo query to resolve before snapshotting the
  // head. We only need to wait until React has mounted and the SEO helmet
  // has applied its tags — the locale-correct <html lang> is the cheapest
  // proxy for that.
  await page.waitForFunction(
    (bcp) => document.documentElement.getAttribute("lang") === bcp,
    expectedBcp47,
    { timeout: 20_000 },
  );
  return page.evaluate(() => {
    const lang = document.documentElement.getAttribute("lang");
    const title = document.title;
    const descs = Array.from(
      document.querySelectorAll('meta[name="description"]'),
    ).map(el => el.getAttribute("content") || "");
    const alternates = Array.from(
      document.querySelectorAll('link[rel="alternate"][hreflang]'),
    ).map(el => ({
      hreflang: el.getAttribute("hreflang") || "",
      href: el.getAttribute("href") || "",
    }));
    return { lang, title, descs, alternates };
  });
}

async function runCase(page: Page, c: Case): Promise<void> {
  const url = `${BASE_URL}/${c.prefix}${c.subpath}`.replace(/([^:])\/{2,}/g, "$1/");
  const expected = await fetchSeoPack(c);

  const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert(resp && resp.status() < 400, `${url} returned HTTP ${resp?.status()}`);

  const head = await readHead(page, c.bcp47);

  assert(head.lang === c.bcp47, `${url}: expected <html lang="${c.bcp47}">, got "${head.lang}"`);
  assert(
    head.title.includes(expected.metaTitle),
    `${url}: <title> "${head.title}" missing localized metaTitle "${expected.metaTitle}"`,
  );
  assert(
    head.descs.length === 1,
    `${url}: expected exactly one <meta name="description"> tag, found ${head.descs.length}`,
  );
  assert(
    head.descs[0] === expected.metaDescription,
    `${url}: meta description mismatch.\n  expected: ${expected.metaDescription}\n  got:      ${head.descs[0]}`,
  );

  const seenHreflangs = new Set(head.alternates.map(a => a.hreflang));
  for (const bcp of ALL_BCP47) {
    assert(seenHreflangs.has(bcp), `${url}: missing hreflang="${bcp}" alternate`);
  }
  assert(seenHreflangs.has("x-default"), `${url}: missing hreflang="x-default" alternate`);
  assert(
    head.alternates.length >= ALL_BCP47.size + 1,
    `${url}: expected ≥${ALL_BCP47.size + 1} alternate links, got ${head.alternates.length}`,
  );

  if (c.kind === "chassis") {
    // Chassis hub page renders the localized intro + FAQ block via
    // ChassisLanding.tsx using [data-testid="text-hub-intro"] and
    // [data-testid="faq-question-0" / "faq-answer-0"]. Wait for them
    // to settle before snapshotting (same async query as the head SEO).
    await page.waitForSelector('[data-testid="text-hub-intro"]', { timeout: 15_000 });
    await page.waitForSelector('[data-testid="faq-question-0"]', { timeout: 15_000 });

    const renderedIntro = (await page.locator('[data-testid="text-hub-intro"]').first().textContent() || "").trim();
    const expectedIntro = (expected.intro || "").trim();
    assert(
      expectedIntro.length > 0,
      `${url}: SEO API returned empty intro for ${c.bcp47}; cannot verify rendered intro`,
    );
    assert(
      renderedIntro === expectedIntro,
      `${url}: rendered intro does not match SEO pack.\n  expected: ${expectedIntro}\n  got:      ${renderedIntro}`,
    );

    const faq0 = (expected.faq && expected.faq[0]) || null;
    assert(faq0, `${url}: SEO API returned no FAQ entries for ${c.bcp47}`);
    const renderedQ = (await page.locator('[data-testid="faq-question-0"]').first().textContent() || "").trim();
    const renderedA = (await page.locator('[data-testid="faq-answer-0"]').first().textContent() || "").trim();
    assert(
      renderedQ === faq0!.question.trim(),
      `${url}: rendered FAQ question mismatch.\n  expected: ${faq0!.question}\n  got:      ${renderedQ}`,
    );
    assert(
      renderedA === faq0!.answer.trim(),
      `${url}: rendered FAQ answer mismatch.\n  expected: ${faq0!.answer}\n  got:      ${renderedA}`,
    );
  }
}

export interface LocaleSeoResult {
  total: number;
  failures: { label: string; message: string }[];
}

/**
 * Run the locale SEO checks against a Playwright page. Used by the
 * standalone CLI below and by scripts/verify-hub-seo.ts so the same
 * assertions guard pre-deploy regressions.
 */
export async function runLocaleSeoChecks(page: Page): Promise<LocaleSeoResult> {
  const failures: LocaleSeoResult["failures"] = [];
  for (const c of CASES) {
    const label = `[${c.kind}] /${c.prefix}${c.subpath}`;
    try {
      await runCase(page, c);
      console.log(`  ok  ${label}`);
    } catch (err) {
      const message = (err as Error).message;
      failures.push({ label, message });
      console.error(`  FAIL ${label}`);
      console.error(`       ${message}`);
    }
  }
  return { total: CASES.length, failures };
}

async function main() {
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    const result = await runLocaleSeoChecks(page);
    if (result.failures.length > 0) {
      console.error(`\n${result.failures.length}/${result.total} cases failed`);
      process.exit(1);
    }
    console.log(`\nAll ${result.total} cases passed`);
  } finally {
    await browser?.close();
  }
}

// `import.meta.url === `file://${process.argv[1]}`` is true when invoked
// directly via `tsx tests/e2e/locale-seo.spec.ts` and false when imported
// from another module (e.g. scripts/verify-hub-seo.ts).
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
