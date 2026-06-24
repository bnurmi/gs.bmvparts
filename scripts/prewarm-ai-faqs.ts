// Pre-warm script for AI FAQ cache (Task #228).
//
// Generates and caches GPT-4o FAQ pairs for chassis codes and series slugs
// (the two largest page-type populations worth pre-warming).
//
// Parts are intentionally excluded — 5.97M SKUs × 11 locales would be
// cost-prohibitive. FAQ for parts is generated on first SSR hit and cached.
//
// VIN FAQs are keyed by the last-7 VIN digits, which are unique per vehicle.
// They are also excluded from pre-warming for the same reason.
//
// Usage:
//   npx tsx scripts/prewarm-ai-faqs.ts                 # all locales
//   npx tsx scripts/prewarm-ai-faqs.ts --locale en     # single locale
//   npx tsx scripts/prewarm-ai-faqs.ts --type series   # series only

import { storage } from "../server/storage";
import { generateAiFaq } from "../server/seo/ai-faq";
import { SUPPORTED_LOCALES } from "../shared/i18n/types";

const args = process.argv.slice(2);
const localeArg = args.find((a, i) => args[i - 1] === "--locale") ?? null;
const typeArg = args.find((a, i) => args[i - 1] === "--type") ?? null;

const BATCH_SIZE = 10;       // parallel OpenAI calls per locale (spec: 10)
const INTER_BATCH_MS = 500;  // ms between batches to stay under rate limits (spec: 500ms)

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function processInBatches<T>(items: T[], batchSize: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(fn));
    if (i + batchSize < items.length) await sleep(INTER_BATCH_MS);
  }
}

async function main() {
  // Default to English only — pre-warming all 11 locales is a separate deliberate step.
  const locales = (localeArg ? [localeArg] : ["en"]) as string[];
  const runTypes = typeArg ? [typeArg] : ["chassis", "series"];

  console.log(`[prewarm] Starting AI FAQ pre-warm`);
  console.log(`[prewarm] Locales: ${locales.join(", ")}`);
  console.log(`[prewarm] Page types: ${runTypes.join(", ")}`);

  // --- Chassis ---
  if (runTypes.includes("chassis")) {
    const allCars = await storage.getCars();
    const chassisCodes = [...new Set(
      allCars.map(c => c.chassis).filter((ch): ch is string => !!ch)
    )].sort();
    console.log(`[prewarm] ${chassisCodes.length} chassis codes × ${locales.length} locales`);

    for (const locale of locales) {
      console.log(`[prewarm] chassis / ${locale}`);
      let ok = 0, skip = 0, fail = 0;
      await processInBatches(chassisCodes, BATCH_SIZE, async (code) => {
        // Skip if already cached.
        const existing = await storage.getAiFaq("chassis", code.toUpperCase(), locale).catch(() => null);
        if (existing) { skip++; return; }

        const cars = allCars.filter(c => c.chassis?.toLowerCase() === code.toLowerCase());
        const years = cars.flatMap(c => [c.yearStart, c.yearEnd]).filter((y): y is number => typeof y === "number");
        const yearRange = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "";
        const series = cars[0]?.series ?? undefined;

        const items = await generateAiFaq("chassis", code.toUpperCase(), locale, {
          chassisCode: code.toUpperCase(),
          series,
          yearRange,
          carCount: cars.length,
        }).catch(() => null);

        if (items) ok++; else fail++;
      });
      console.log(`[prewarm]   chassis/${locale}: ${ok} generated, ${skip} cached, ${fail} failed`);
    }
  }

  // --- Series ---
  if (runTypes.includes("series")) {
    const allCars = await storage.getCars();
    const seriesMap = new Map<string, typeof allCars>();
    for (const car of allCars) {
      const slug = (car.series || "Other").toLowerCase().replace(/\s+/g, "-");
      if (!seriesMap.has(slug)) seriesMap.set(slug, []);
      seriesMap.get(slug)!.push(car);
    }
    const slugs = [...seriesMap.keys()].sort();
    console.log(`[prewarm] ${slugs.length} series slugs × ${locales.length} locales`);

    for (const locale of locales) {
      console.log(`[prewarm] series / ${locale}`);
      let ok = 0, skip = 0, fail = 0;
      await processInBatches(slugs, BATCH_SIZE, async (slug) => {
        const existing = await storage.getAiFaq("series", slug, locale).catch(() => null);
        if (existing) { skip++; return; }

        const cars = seriesMap.get(slug) ?? [];
        const seriesName = cars[0]?.series || "Other";
        const chassisCodes = [...new Set(cars.map(c => c.chassis).filter((ch): ch is string => !!ch))];

        const items = await generateAiFaq("series", slug, locale, {
          seriesName,
          chassisCodes,
          seriesChassisCount: chassisCodes.length,
        }).catch(() => null);

        if (items) ok++; else fail++;
      });
      console.log(`[prewarm]   series/${locale}: ${ok} generated, ${skip} cached, ${fail} failed`);
    }
  }

  console.log("[prewarm] Done.");
  process.exit(0);
}

main().catch(err => {
  console.error("[prewarm] Fatal error:", err);
  process.exit(1);
});
