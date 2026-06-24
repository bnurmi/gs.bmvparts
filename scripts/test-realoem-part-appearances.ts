// Task #105 regression test — chassis label normalizer + per-part-page
// cross-ref parser + parser-drift sentinels. Hand-crafted fixtures
// based on the URL examples shipped with Task #105:
//   /bmw/enUS/part?id=BD52-EUR-11-2004-E46-BMW-330Ci&q=83222339219
//   /bmw/enUS/part?id=2U73-USA-06-2021-F87N-BMW-M2_Competition&q=33318097478
// Run with:  npx tsx scripts/test-realoem-part-appearances.ts

import { normalizeChassisLabel, chassisFromLabel } from "../server/realoem-chassis-normalizer";
import { extractPartPageAppearances, PartPageDriftError } from "../server/realoem-part-page-parser";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
    failures.push(label);
    fail++;
  }
}

function eq<T>(label: string, actual: T, expected: T) {
  ok(label, actual === expected, `expected=${JSON.stringify(expected)} got=${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------- chassis normalizer

console.log("[part-appearances-test] normalizeChassisLabel — display labels from RealOEM");
eq("'1' E81' → E81", chassisFromLabel("1' E81"), "E81");
eq("'1' E87 LCI' → E87LCI", chassisFromLabel("1' E87 LCI"), "E87LCI");
eq("'3' E36' → E36", chassisFromLabel("3' E36"), "E36");
eq("'3' E46' → E46", chassisFromLabel("3' E46"), "E46");
eq("'3' E90 LCI' → E90LCI", chassisFromLabel("3' E90 LCI"), "E90LCI");
eq("'5' F10 LCI' → F10LCI", chassisFromLabel("5' F10 LCI"), "F10LCI");
eq("'6' F06 Gran Coupé LCI' → F06LCI", chassisFromLabel("6' F06 Gran Coupé LCI"), "F06LCI");
eq("'6' F12' → F12", chassisFromLabel("6' F12"), "F12");
eq("'7' E38' → E38", chassisFromLabel("7' E38"), "E38");
eq("'X1 E84' → E84", chassisFromLabel("X1 E84"), "E84");
eq("'X3 E83 LCI' → E83LCI", chassisFromLabel("X3 E83 LCI"), "E83LCI");
eq("'X5 E53' → E53", chassisFromLabel("X5 E53"), "E53");
eq("'Z3 E36' → E36", chassisFromLabel("Z3 E36"), "E36");
eq("'Z4 E85' → E85", chassisFromLabel("Z4 E85"), "E85");
eq("'Z4 E86' → E86", chassisFromLabel("Z4 E86"), "E86");

console.log("[part-appearances-test] normalizeChassisLabel — N-suffix and M-prefix");
eq("'F87N' → F87N", chassisFromLabel("F87N"), "F87N");
eq("'M2 G87' → G87", chassisFromLabel("M2 G87"), "G87");
eq("'M2 G87 Competition' → G87", chassisFromLabel("M2 G87 Competition"), "G87");
eq("'M2 F87 Competition LCI' → F87LCI", chassisFromLabel("M2 F87 Competition LCI"), "F87LCI");
eq("'G80N' → G80N", chassisFromLabel("G80N"), "G80N");
eq("'M3 G80' → G80", chassisFromLabel("M3 G80"), "G80");
eq("'G80 LCI' → G80LCI", chassisFromLabel("G80 LCI"), "G80LCI");

console.log("[part-appearances-test] normalizeChassisLabel — isLci semantics");
const lciExplicit = normalizeChassisLabel("3' E90 LCI");
ok("explicit LCI suffix sets isLci=true", lciExplicit.isLci === true, JSON.stringify(lciExplicit));
const lciNform = normalizeChassisLabel("F87N");
ok("N-suffix token sets isLci=true", lciNform.isLci === true, JSON.stringify(lciNform));
const noLci = normalizeChassisLabel("3' E46");
ok("no LCI marker → isLci=false", noLci.isLci === false, JSON.stringify(noLci));

console.log("[part-appearances-test] normalizeChassisLabel — unparseable / empty");
eq("empty string → null", chassisFromLabel(""), null);
eq("'BMW' alone → null", chassisFromLabel("BMW"), null);
eq("garbage → null", chassisFromLabel("...not a chassis..."), null);

// ---------------------------------------------------------------- part-page parser

// Synthetic HTML modeled on the real RealOEM per-part page structure.
// We only need the three things the parser cares about:
//   - the part number rendered near the top
//   - the "was found on the following vehicles:" heading
//   - one entry per chassis (label + production date range)
function buildFixturePartPage(opts: {
  partNumber: string;
  vehicles: string[];          // each entry like "1' E81 (02/2006 — 12/2011)"
  supersededBy?: string;
}): string {
  return [
    "<html><head><title>BMW Part</title></head><body>",
    `<h1>BMW ${opts.partNumber} Description goes here</h1>`,
    opts.supersededBy ? `<p>Replaced by ${opts.supersededBy}</p>` : "",
    "<h2>Part " + opts.partNumber + " was found on the following vehicles:</h2>",
    "<ul>",
    ...opts.vehicles.map((v) => `<li>${v}</li>`),
    "</ul>",
    "<p>Quantity: 2  Illustration available.</p>",
    "</body></html>",
  ].join("\n");
}

console.log("[part-appearances-test] extractPartPageAppearances — E46 example (Task #105 spec)");
const e46Html = buildFixturePartPage({
  partNumber: "83222339219",
  vehicles: [
    "1' E81 (02/2006 — 12/2011)",
    "1' E87 (02/2003 — 02/2007)",
    "1' E87 LCI (02/2006 — 06/2011)",
    "3' E36 (11/1989 — 08/2000)",
    "3' E46 (04/1997 — 03/2023)",
    "3' E90 (02/2004 — 09/2008)",
    "3' E90 LCI (07/2007 — 10/2011)",
    "5' F10 (01/2009 — 10/2016)",
    "5' F10 LCI (10/2012 — 10/2016)",
    "X1 E84 (09/2008 — 06/2012)",
    "X5 E53 (08/1999 — 09/2006)",
    "Z3 E36 (12/1994 — 06/2002)",
  ],
});
const e46Url = "https://www.realoem.com/bmw/enUS/part?id=BD52-EUR-11-2004-E46-BMW-330Ci&mg=23&sg=05&diagId=23_0121&q=83222339219";
const e46Result = extractPartPageAppearances(e46Html, { sourceUrl: e46Url, partNumberHint: "83222339219" });

eq("E46 → partNumberClean", e46Result.partNumberClean, "83222339219");
eq("E46 → 12 appearance entries", e46Result.appearances.length, 12);

const e46Chassis = e46Result.appearances.map((a) => a.chassis).sort();
const expectedE46Chassis = ["E81", "E87", "E87LCI", "E36", "E46", "E90", "E90LCI", "F10", "F10LCI", "E84", "E53", "E36"].sort();
ok("E46 → chassis tokens normalized correctly", JSON.stringify(e46Chassis) === JSON.stringify(expectedE46Chassis), `got=${JSON.stringify(e46Chassis)} expected=${JSON.stringify(expectedE46Chassis)}`);

const e46First = e46Result.appearances.find((a) => a.chassis === "E81");
ok("E46 → E81 productionFrom=02/2006", e46First?.productionFrom === "02/2006");
ok("E46 → E81 productionTo=12/2011", e46First?.productionTo === "12/2011");
ok("E46 → E81 chassisLabelRaw preserves '1' E81'", e46First?.chassisLabelRaw === "1' E81");

const e46E90lci = e46Result.appearances.find((a) => a.chassis === "E90LCI");
ok("E46 → E90LCI isLci=true", e46E90lci?.isLci === true);

console.log("[part-appearances-test] extractPartPageAppearances — F87N M2 Competition example");
const f87nHtml = buildFixturePartPage({
  partNumber: "33318097478",
  vehicles: [
    "M2 F87 (11/2014 — 12/2018)",
    "M2 F87 Competition LCI (07/2018 — 06/2021)",
    "M2 G87 (07/2022 — present)",
    "M3 F80 (07/2013 — 05/2018)",
    "M3 G80 (06/2020 — present)",
  ],
});
const f87nUrl = "https://www.realoem.com/bmw/enUS/part?id=2U73-USA-06-2021-F87N-BMW-M2_Competition&mg=33&sg=30&diagId=33_1817&q=33318097478";
const f87nResult = extractPartPageAppearances(f87nHtml, { sourceUrl: f87nUrl, partNumberHint: "33318097478" });

eq("F87N → partNumberClean", f87nResult.partNumberClean, "33318097478");
eq("F87N → 5 appearance entries", f87nResult.appearances.length, 5);

const ongoingEntry = f87nResult.appearances.find((a) => a.chassis === "G87");
ok("F87N → G87 productionTo=null when 'present'", ongoingEntry?.productionTo === null);
ok("F87N → G87 productionFrom=07/2022", ongoingEntry?.productionFrom === "07/2022");

const f87LciEntry = f87nResult.appearances.find((a) => a.chassis === "F87LCI");
ok("F87N → F87LCI parsed from 'M2 F87 Competition LCI'", f87LciEntry !== undefined);

console.log("[part-appearances-test] extractPartPageAppearances — supersession capture");
const supersededHtml = buildFixturePartPage({
  partNumber: "11427508969",
  vehicles: ["3' E46 (04/1997 — 03/2023)", "3' E90 (02/2004 — 09/2008)"],
  supersededBy: "11428507683",
});
const supersededResult = extractPartPageAppearances(supersededHtml, { sourceUrl: "x", partNumberHint: "11427508969" });
ok("supersession candidate captured", supersededResult.supersessions.includes("11428507683"));

console.log("[part-appearances-test] extractPartPageAppearances — drift sentinels");
const noBlockHtml = "<html><body><h1>BMW 83222339219 Description</h1><p>Some other content with no cross-ref block.</p></body></html>";
let driftThrown = false;
try {
  extractPartPageAppearances(noBlockHtml, { sourceUrl: "x", partNumberHint: "83222339219" });
} catch (e) {
  driftThrown = e instanceof PartPageDriftError && e.kind === "missing-block";
}
ok("missing cross-ref block → PartPageDriftError(kind=missing-block)", driftThrown);

const emptyBlockHtml = "<html><body><h1>BMW 83222339219</h1><h2>Part 83222339219 was found on the following vehicles:</h2><ul></ul></body></html>";
let emptyThrown = false;
try {
  extractPartPageAppearances(emptyBlockHtml, { sourceUrl: "x", partNumberHint: "83222339219" });
} catch (e) {
  emptyThrown = e instanceof PartPageDriftError && e.kind === "block-empty";
}
ok("empty cross-ref block → PartPageDriftError(kind=block-empty)", emptyThrown);

const noPartHtml = "<html><body><h2>was found on the following vehicles:</h2><ul><li>3' E46 (04/1997 — 03/2023)</li></ul></body></html>";
let noPartThrown = false;
try {
  extractPartPageAppearances(noPartHtml, { sourceUrl: "x" });
} catch (e) {
  noPartThrown = e instanceof PartPageDriftError && e.kind === "no-part-number";
}
ok("no part number anywhere → PartPageDriftError(kind=no-part-number)", noPartThrown);

console.log("[part-appearances-test] extractPartPageAppearances — date-range edge cases");
const dashVariantsHtml = buildFixturePartPage({
  partNumber: "11111111111",
  vehicles: [
    "3' E46 (04/1997 - 03/2023)",   // hyphen
    "3' E90 (02/2004 – 09/2008)",   // en-dash
    "3' E91 (02/2004 — 08/2008)",   // em-dash
    "3' G20 (06/2018 — present)",   // ongoing keyword
  ],
});
const dashResult = extractPartPageAppearances(dashVariantsHtml, { sourceUrl: "x", partNumberHint: "11111111111" });
eq("4 dash-variant entries parsed", dashResult.appearances.length, 4);
eq("hyphen separator → E46 to=03/2023", dashResult.appearances.find((a) => a.chassis === "E46")?.productionTo, "03/2023");
eq("en-dash separator → E90 to=09/2008", dashResult.appearances.find((a) => a.chassis === "E90")?.productionTo, "09/2008");
eq("em-dash separator → E91 to=08/2008", dashResult.appearances.find((a) => a.chassis === "E91")?.productionTo, "08/2008");
eq("'present' sentinel → G20 to=null", dashResult.appearances.find((a) => a.chassis === "G20")?.productionTo, null);

console.log("[part-appearances-test] extractPartPageAppearances — dedup within block");
const dupHtml = buildFixturePartPage({
  partNumber: "22222222222",
  vehicles: [
    "3' E46 (04/1997 — 03/2023)",
    "3' E46 (04/1997 — 03/2023)",   // exact dup
    "3' E46 (05/2000 — 03/2023)",   // same chassis, different from-date → new row
  ],
});
const dupResult = extractPartPageAppearances(dupHtml, { sourceUrl: "x", partNumberHint: "22222222222" });
eq("exact-dup collapsed, but distinct date-range kept", dupResult.appearances.length, 2);

// ----------------------------------------------------------------

console.log("");
console.log(`[part-appearances-test] ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("FAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("[part-appearances-test] ALL ASSERTIONS PASSED");
