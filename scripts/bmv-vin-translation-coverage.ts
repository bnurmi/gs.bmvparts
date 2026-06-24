// Translation coverage audit for the bmv.vin SEO surfaces (Task #98).
//
// Walks two sources:
//   1. Page-chrome strings in `shared/i18n/vin-host-locales.ts` — by
//      attaching to every LocalePack we expect 100% structural coverage.
//   2. Editorial seed data in `server/seo/bmv-vin-seed.ts` — counts
//      per-locale string coverage across home copy, brand decoders,
//      glossary, guides, and facet blurbs.
//
// Exits non-zero if any locale falls below the COVERAGE_THRESHOLD (default
// 0.95). Designed to be safe to run in CI:
//
//   npx tsx scripts/bmv-vin-translation-coverage.ts
//
// Override the threshold with COVERAGE_THRESHOLD=0.9 or pass --threshold=0.9.

import { SUPPORTED_LOCALES, type LocaleCode, type VinHostStrings } from "../shared/i18n/types";
import { PACKS } from "../shared/i18n";
import { SEED_DATA_FOR_COVERAGE, SEED_LOCALE_ORDER } from "../server/seo/bmv-vin-seed";

const COVERAGE_THRESHOLD = (() => {
  const env = process.env.COVERAGE_THRESHOLD;
  const flag = process.argv.find(a => a.startsWith("--threshold="));
  const raw = flag ? flag.slice("--threshold=".length) : env;
  const v = raw ? Number(raw) : 0.95;
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.95;
})();

type Counter = { total: number; present: number };
function newCounter(): Counter { return { total: 0, present: 0 }; }
function bump(c: Counter, present: boolean) { c.total++; if (present) c.present++; }

// -----------------------------------------------------------------------------
// 1. Page-chrome (vinHost) coverage. We sample every callable/string field
//    in the English template and ensure each locale pack provides its own
//    authored value.
// -----------------------------------------------------------------------------
function probeVinHost(strings: VinHostStrings): string[] {
  // Render every field with sample inputs so we can compare textually.
  const out: string[] = [];
  out.push(strings.homeMetaTitle, strings.homeMetaDescription, strings.homeH1, strings.homeIntro);
  out.push(strings.homeBrandsHeading, strings.homeFacetsHeading, strings.homeGuidesHeading, strings.homeGlossaryHeading);
  out.push(strings.brandHubMetaTitle("BMW"), strings.brandHubMetaDescription("BMW"), strings.brandHubH1("BMW"), strings.brandHubIntro("BMW"));
  out.push(strings.brandHubWmiHeading, strings.brandHubRelatedHeading);
  out.push(strings.facetIndexMetaTitle("chassis"), strings.facetIndexMetaDescription("chassis"), strings.facetIndexH1("chassis"));
  out.push(strings.facetHubMetaTitle({ kind: "chassis", value: "G20" }));
  out.push(strings.facetHubMetaDescription({ kind: "chassis", value: "G20", cohort: 5 }));
  out.push(strings.facetHubH1({ kind: "chassis", value: "G20" }));
  out.push(strings.facetHubExamplesHeading(3), strings.facetHubEmpty);
  out.push(strings.guideIndexMetaTitle, strings.guideIndexMetaDescription, strings.guideIndexH1);
  out.push(strings.guideMetaTitle("Demo"), strings.guideRelatedHeading);
  out.push(strings.glossaryIndexMetaTitle, strings.glossaryIndexMetaDescription, strings.glossaryIndexH1);
  out.push(strings.glossaryMetaTitle("WMI"), strings.glossaryRelatedHeading);
  out.push(strings.breadcrumbHome, strings.decodeAnotherCta, strings.shopOemPartsCta, strings.vinInputLabel, strings.vinInputPlaceholder, strings.vinInputSubmit);
  out.push(strings.faqHeading, strings.notFoundH1, strings.notFoundBody);
  out.push(strings.homeRecentlyDecodedHeading, strings.brandRecentlyDecodedHeading("BMW"), strings.brandTopChassisHeading("BMW"));
  out.push(strings.homeHowToTitle, strings.homeHowToDescription);
  for (const step of strings.homeHowToSteps) { out.push(step.name, step.text); }
  out.push(strings.facetPaginationLabel({ page: 1, total: 4 }), strings.facetPaginationPrev, strings.facetPaginationNext);
  out.push(strings.facetCrossRailHeading("chassis"), strings.facetThinCohortNote(2));
  out.push(strings.vinTokenHeading, strings.vinTokenIntro);
  out.push(strings.vinTokenWmiLabel, strings.vinTokenWmiHint, strings.vinTokenVdsLabel, strings.vinTokenVdsHint);
  out.push(strings.vinTokenCheckLabel, strings.vinTokenCheckHint);
  out.push(strings.vinTokenMyLetterLabel, strings.vinTokenMyLetterHint(2024), strings.vinTokenMyLetterHint(null));
  out.push(strings.vinTokenPlantLabel, strings.vinTokenPlantHint("Munich"), strings.vinTokenPlantHint(null));
  out.push(strings.vinTokenSerialLabel, strings.vinTokenSerialHint);
  return out;
}

function vinHostCoverage(): Map<LocaleCode, Counter> {
  const enStrings = PACKS.en.vinHost;
  if (!enStrings) throw new Error("English vinHost strings missing — bug?");
  const enRendered = probeVinHost(enStrings);
  const result = new Map<LocaleCode, Counter>();
  for (const code of SUPPORTED_LOCALES) {
    const c = newCounter();
    const pack = PACKS[code];
    if (!pack.vinHost) {
      // Treat missing pack.vinHost as 0% — every position is a fallback.
      enRendered.forEach(() => bump(c, false));
    } else {
      const rendered = probeVinHost(pack.vinHost);
      for (let i = 0; i < enRendered.length; i++) {
        const v = rendered[i];
        const en = enRendered[i];
        // Authored when the string is non-empty AND (locale is English OR
        // the string differs from English). Acronym-only strings like
        // "WMI"/"VDS" are intentionally identical, so we also accept any
        // string of length <= 4 as authored.
        const authored = !!v && (code === "en" || v !== en || v.length <= 4 || /^[A-Z0-9\s\-]{1,8}$/.test(v));
        bump(c, authored);
      }
    }
    result.set(code, c);
  }
  return result;
}

// -----------------------------------------------------------------------------
// 2. Seed data coverage. Walks every multi-locale jsonb-bound field and
//    counts how many locales have a non-empty entry.
// -----------------------------------------------------------------------------
type LocText = Record<string, string>;

function isLocText(v: unknown): v is LocText {
  return !!v && typeof v === "object" && !Array.isArray(v) &&
    Object.values(v as Record<string, unknown>).every(x => typeof x === "string");
}

function walk(node: unknown, hits: Map<LocaleCode, Counter>) {
  if (Array.isArray(node)) { for (const n of node) walk(n, hits); return; }
  if (!node || typeof node !== "object") return;
  if (isLocText(node)) {
    for (const code of SUPPORTED_LOCALES) {
      const c = hits.get(code) ?? newCounter();
      const v = (node as LocText)[code];
      bump(c, !!v && v.trim().length > 0);
      hits.set(code, c);
    }
    return;
  }
  for (const v of Object.values(node)) walk(v, hits);
}

function seedCoverage(): Map<LocaleCode, Counter> {
  const hits = new Map<LocaleCode, Counter>();
  for (const code of SUPPORTED_LOCALES) hits.set(code, newCounter());
  walk(SEED_DATA_FOR_COVERAGE, hits);
  return hits;
}

// -----------------------------------------------------------------------------
// Report + exit code.
// -----------------------------------------------------------------------------
function pct(c: Counter): number {
  return c.total === 0 ? 1 : c.present / c.total;
}
function fmt(c: Counter): string {
  return `${(pct(c) * 100).toFixed(1)}%  (${c.present}/${c.total})`;
}

function main() {
  console.log(`[bmv-vin-coverage] threshold = ${(COVERAGE_THRESHOLD * 100).toFixed(0)}%`);
  console.log(`[bmv-vin-coverage] seed locale order: ${SEED_LOCALE_ORDER.join(", ")}`);
  console.log("");

  const hostCov = vinHostCoverage();
  const seedCov = seedCoverage();

  console.log("Locale     vinHost (page chrome)        seed data (DB content)");
  console.log("------     ----------------------       ----------------------");
  let failures: { code: LocaleCode; surface: string; pct: number }[] = [];
  for (const code of SUPPORTED_LOCALES) {
    const h = hostCov.get(code)!;
    const s = seedCov.get(code)!;
    const pad = (code + "          ").slice(0, 10);
    console.log(`${pad} ${fmt(h).padEnd(28)} ${fmt(s)}`);
    if (pct(h) < COVERAGE_THRESHOLD) failures.push({ code, surface: "vinHost", pct: pct(h) });
    if (pct(s) < COVERAGE_THRESHOLD) failures.push({ code, surface: "seed", pct: pct(s) });
  }
  console.log("");

  if (failures.length === 0) {
    console.log(`[bmv-vin-coverage] OK — every locale meets the ${(COVERAGE_THRESHOLD * 100).toFixed(0)}% threshold.`);
    process.exit(0);
  }
  console.error(`[bmv-vin-coverage] ${failures.length} regression(s):`);
  for (const f of failures) {
    console.error(`  - ${f.code}/${f.surface}: ${(f.pct * 100).toFixed(1)}% (< ${(COVERAGE_THRESHOLD * 100).toFixed(0)}%)`);
  }
  process.exit(1);
}

main();
