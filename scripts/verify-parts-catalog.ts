import { lookupPart, searchByModel, listParts } from "../server/parts-catalog-client";

async function main() {
  const baseUrl = process.env.PARTS_CATALOG_API_URL || "https://engineroom.gearswap.ai";
  const tokenName = process.env.PARTS_CATALOG_API_TOKEN
    ? "PARTS_CATALOG_API_TOKEN"
    : process.env.SCRAPER_API_KEY
      ? "SCRAPER_API_KEY"
      : null;
  console.log(`[verify] base=${baseUrl}  auth=${tokenName ? `bearer (${tokenName})` : "none"}`);

  // 1. Generic listing — first page
  console.log("\n[verify] listParts({ limit: 3 })");
  try {
    const some = await listParts({ limit: 3 });
    console.log(`  -> got ${some.length} parts`);
    if (some[0]) {
      const p = some[0];
      console.log(`     first: pn=${p.partNumber} model=${p.model} desc=${(p.description || "").slice(0, 60)}`);
    }
  } catch (err: any) {
    console.error(`  ERROR: ${err.message}`);
  }

  // 2. Search by model
  const model = process.argv[2] || "G20";
  console.log(`\n[verify] searchByModel("${model}", { limit: 3 })`);
  try {
    const byModel = await searchByModel(model, { limit: 3 });
    console.log(`  -> got ${byModel.length} parts for ${model}`);
    for (const p of byModel.slice(0, 3)) {
      console.log(`     ${p.partNumber}  ${(p.description || "").slice(0, 60)}`);
    }
  } catch (err: any) {
    console.error(`  ERROR: ${err.message}`);
  }

  // 3. Lookup single part (try one we just listed if available, else a known BMW PN)
  const pn = process.argv[3] || "11127634315";
  console.log(`\n[verify] lookupPart("${pn}")`);
  try {
    const one = await lookupPart(pn);
    if (!one) {
      console.log(`  -> not found (null)`);
    } else {
      console.log(`  -> ${one.partNumber} model=${one.model} group=${one.partGroup}`);
      console.log(`     supersession: ${one.supersessionPartNumber ?? "—"}`);
    }
  } catch (err: any) {
    console.error(`  ERROR: ${err.message}`);
  }

  // 4. Explicit 404-style miss
  console.log(`\n[verify] lookupPart("DEFINITELY-NOT-A-REAL-PART")`);
  try {
    const miss = await lookupPart("DEFINITELY-NOT-A-REAL-PART");
    console.log(`  -> ${miss === null ? "null (expected)" : "unexpected hit"}`);
  } catch (err: any) {
    console.error(`  ERROR: ${err.message}`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
