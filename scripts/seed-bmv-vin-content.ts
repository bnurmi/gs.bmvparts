// Idempotent seed runner for the bmv.vin content tables (Task #96, T009).
//
// Usage:  npx tsx scripts/seed-bmv-vin-content.ts
//
// Re-running is safe — every row is keyed and upserted; admin-edited
// content is only overwritten when the seed source changes.

import { seedBmvVinContent } from "../server/seo/bmv-vin-seed";

async function main() {
  console.log("[seed-bmv-vin] starting…");
  const t0 = Date.now();
  const report = await seedBmvVinContent();
  const elapsed = Date.now() - t0;
  console.log(`[seed-bmv-vin] done in ${elapsed}ms`);
  console.log(`  home copy:           ${report.homeCopy}`);
  console.log(`  brand decoder copy:  ${report.brandDecoderCopy}`);
  console.log(`  glossary terms:      ${report.glossary}`);
  console.log(`  guides:              ${report.guides}`);
  console.log(`  facet blurbs:        ${report.facetBlurbs}`);
}

main().catch(err => {
  console.error("[seed-bmv-vin] FAILED:", err);
  process.exit(1);
});
