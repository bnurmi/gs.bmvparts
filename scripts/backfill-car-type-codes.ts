import { runTypeCodeBackfill } from "../server/type-code-backfill";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Running type_code backfill (apply=${apply})`);
  const report = await runTypeCodeBackfill({ apply, onlyNull: true });
  console.log("");
  console.log("== Summary ==");
  console.log(`Total cars:               ${report.totalCars}`);
  console.log(`Already tagged (skipped): ${report.alreadyTagged}`);
  console.log(`Newly tagged:             ${report.tagged}`);
  console.log(`Ambiguous (left null):    ${report.ambiguous}`);
  console.log(`No model match:           ${report.noModelMatch}`);
  console.log(`Chassis missing in bmw_models: ${report.chassisNotInBmwModels}`);
  console.log("");
  console.log("== Per-chassis ==");
  console.log(
    "chassis  total  alreadyTagged  newlyTagged  ambiguous  noModelMatch  chassisMissing",
  );
  for (const b of report.perChassis) {
    console.log(
      `${b.chassis.padEnd(7)}  ${String(b.total).padStart(5)}  ${String(b.alreadyTagged).padStart(13)}  ${String(b.newlyTagged).padStart(11)}  ${String(b.ambiguous).padStart(9)}  ${String(b.noModelMatch).padStart(12)}  ${String(b.chassisMissing).padStart(14)}`,
    );
  }
  if (report.ambiguousSample.length) {
    console.log("");
    console.log("Sample ambiguous (first 10):");
    for (const a of report.ambiguousSample.slice(0, 10)) {
      console.log(
        `  [${a.chassis}] ${a.modelName}  →  ${(a.candidateTypeCodes || []).join(", ")}`,
      );
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
