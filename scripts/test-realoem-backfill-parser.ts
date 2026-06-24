/**
 * Task #87 + #90: fixture-based parser regression test for the RealOEM
 * backfill.
 *
 * Asserts the parser keeps extracting the X7 G07 168AL transmission part
 * 31508487444 from the diagId=31_2091 fixture and that the chassis landing
 * page enumerator finds every diagram link. This is the deterministic guard
 * that prevents a quiet RealOEM markup drift from silently breaking the
 * backfill insertion path.
 *
 * Task #90 adds drift fixtures for the known degraded RealOEM page
 * shapes (JS-only stub, paginated listing, malformed table). Each is
 * required to either parse correctly OR throw a recognizable
 * `ParserDriftError` of the expected kind, so the backfill can write a
 * `status="parser_drift"` ledger row instead of silently inserting
 * nothing.
 *
 * Usage:
 *   npx tsx scripts/test-realoem-backfill-parser.ts
 */
import { readFileSync } from "fs";
import path from "path";
import {
  extractRealoemParts,
  extractRealoemPartsStrict,
  extractDiagramLinks,
  extractDiagramMeta,
  ParserDriftError,
  type ParserDriftKind,
} from "../server/realoem-audit";

const ROOT = path.resolve(process.cwd(), "scripts/fixtures/realoem-audit");
const LANDING = path.join(ROOT, "www.realoem.com_bmw_enUS_showparts_id_g07-x7-m50dx_mospid_60487.html");
const DIAGRAM_168AL = path.join(ROOT, "www.realoem.com_bmw_enUS_showparts_id_g07-x7-m50dx_mospid_60487_diagId_31_2091.html");
const TARGET_PART = "31508487444";

let failed = 0;
function ok(label: string) { console.log(`  ✓ ${label}`); }
function bad(label: string, detail?: any) { console.error(`  ✗ ${label}`, detail ?? ""); failed++; }

console.log("[parser-test] starting...");

// 1) Diagram parser must include the business-example part.
const diagramHtml = readFileSync(DIAGRAM_168AL, "utf-8");
const parts = extractRealoemParts(diagramHtml);
if (parts.length === 0) bad("extractRealoemParts returned 0 parts from 168AL fixture");
else ok(`extractRealoemParts: ${parts.length} parts in 168AL fixture`);

const target = parts.find(p => p.partNumberClean === TARGET_PART);
if (!target) {
  bad(`expected part ${TARGET_PART} in 168AL fixture, got: ${parts.map(p => p.partNumberClean).join(", ")}`);
} else {
  ok(`found target part ${TARGET_PART} (raw="${target.partNumber}", desc="${target.description ?? ""}")`);
  if (target.partNumber.replace(/[\s.-]/g, "") !== TARGET_PART) {
    bad(`raw "${target.partNumber}" does not collapse to ${TARGET_PART}`);
  }
}

// 2) Diagram meta extraction must surface the diagId for ledger writes.
const meta = extractDiagramMeta(diagramHtml, "https://www.realoem.com/bmw/enUS/showparts?id=g07-x7-m50dx&mospid=60487&diagId=31_2091");
if (!meta.diagramId) bad("extractDiagramMeta: no diagramId");
else if (meta.diagramId !== "31_2091") bad(`extractDiagramMeta diagramId=${meta.diagramId}, expected 31_2091`);
else ok(`extractDiagramMeta diagramId=${meta.diagramId}`);

// 3) Landing-page enumerator must find every diagram link, not just the first.
const landingHtml = readFileSync(LANDING, "utf-8");
const links = extractDiagramLinks(landingHtml);
if (links.length < 3) bad(`extractDiagramLinks returned ${links.length} links, expected ≥ 3`);
else ok(`extractDiagramLinks: ${links.length} links from landing fixture`);

const ids = links.map(l => l.diagramId).sort();
const expectedIds = ["31_2091", "33_1010", "99_9999"];
if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
  bad(`diagram ids mismatch`, { got: ids, expected: expectedIds });
} else {
  ok(`diagram ids = [${ids.join(", ")}]`);
}

// Each link must have an absolute URL the fetcher can use as a fixture key.
for (const l of links) {
  if (!l.url.startsWith("https://www.realoem.com/")) bad(`link url not absolute: ${l.url}`);
}
ok("all link urls absolute");

// 4) Drift fixtures (Task #90): each known-degraded RealOEM page shape
// must either parse to ≥1 part OR raise ParserDriftError of the
// expected kind. Anything else (silent 0 rows, generic Error) means the
// backfill would once again insert nothing without alerting admins.
const DRIFT_CASES: Array<{ file: string; expectedKind: ParserDriftKind; label: string }> = [
  {
    file: "www.realoem.com_bmw_enUS_showparts_id_g07-x7-m50dx_mospid_60487_diagId_99_0001.html",
    expectedKind: "js-required",
    label: "JS-required stub",
  },
  {
    file: "www.realoem.com_bmw_enUS_showparts_id_g07-x7-m50dx_mospid_60487_diagId_99_0002.html",
    expectedKind: "paginated",
    label: "paginated parts list",
  },
  {
    file: "www.realoem.com_bmw_enUS_showparts_id_g07-x7-m50dx_mospid_60487_diagId_99_0003.html",
    expectedKind: "malformed-table",
    label: "malformed table",
  },
];

for (const tc of DRIFT_CASES) {
  const html = readFileSync(path.join(ROOT, tc.file), "utf-8");

  // Sanity: lenient parser must yield 0 — if any of these fixtures
  // started producing rows we'd be testing the wrong drift shape.
  const lenient = extractRealoemParts(html);
  if (lenient.length !== 0) {
    bad(`drift fixture "${tc.label}" leaked ${lenient.length} parts via lenient parser; fixture needs adjustment`);
    continue;
  }

  let thrown: unknown = null;
  try {
    const parts = extractRealoemPartsStrict(html);
    // Strict variant accepted the page → only OK if it found real parts.
    if (parts.length > 0) {
      ok(`drift fixture "${tc.label}": parsed ${parts.length} parts (no drift)`);
      continue;
    }
    bad(`drift fixture "${tc.label}": strict parser silently returned 0 parts (must throw ParserDriftError)`);
    continue;
  } catch (e) {
    thrown = e;
  }

  if (!(thrown instanceof ParserDriftError)) {
    bad(`drift fixture "${tc.label}": expected ParserDriftError, got ${(thrown as Error)?.name || typeof thrown} — ${(thrown as Error)?.message ?? thrown}`);
    continue;
  }
  if (thrown.kind !== tc.expectedKind) {
    bad(`drift fixture "${tc.label}": kind=${thrown.kind}, expected ${tc.expectedKind}`);
    continue;
  }
  ok(`drift fixture "${tc.label}" → ParserDriftError(kind="${thrown.kind}")`);
}

if (failed > 0) {
  console.error(`\n[parser-test] FAILED (${failed} assertion(s))`);
  process.exit(1);
}
console.log("\n[parser-test] ALL ASSERTIONS PASSED ✅");
process.exit(0);
