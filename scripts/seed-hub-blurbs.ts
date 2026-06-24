// Idempotently upsert the curated chassis & series hub blurbs from
// `server/seo/hub-blurbs.seed.ts` into the `hub_editorial` table.
//
// Run with:  tsx scripts/seed-hub-blurbs.ts
//
// Safe to run repeatedly: existing rows for the same (hub_type, hub_key)
// pair are updated in place; new pairs are inserted.

import { storage } from "../server/storage";
import { ALL_HUB_BLURBS, CHASSIS_HUB_BLURBS, SERIES_HUB_BLURBS } from "../server/seo/hub-blurbs.seed";

async function main() {
  let upserted = 0;
  for (const b of ALL_HUB_BLURBS) {
    await storage.upsertHubEditorial({
      hubType: b.hubType,
      hubKey: b.hubKey,
      blurb: b.blurb,
    });
    upserted++;
  }
  console.log(
    `Upserted ${upserted} hub blurbs (${CHASSIS_HUB_BLURBS.length} chassis, ${SERIES_HUB_BLURBS.length} series).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
