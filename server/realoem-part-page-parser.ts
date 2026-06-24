// Task #105 — Parser for the RealOEM per-part detail page.
//
// Source URL shape:
//   https://www.realoem.com/bmw/enUS/part?id={CAR_ID}&q={PART_NUMBER}
//   (mg / sg / diagId may also be present; they're optional context for
//   the page render but not required to extract the cross-ref block.)
//
// What we extract:
//   - The "Part X was found on the following vehicles:" cross-reference
//     block, with each `(chassis label, production from, production to)`
//     entry parsed out.
//   - The supersession lineage if present (current / replaced numbers).
//
// What we DO NOT extract here (intentional non-goal for Task #105):
//   - Quantity / position / footnote info (those are diagram-scoped, not
//     part-scoped).
//   - Variant-level fitment (cross-ref is chassis-level only).
//
// The parser is regex-based to stay forgiving of small markup drift
// across RealOEM's per-era page templates (E-series vs F-series vs
// G-series). When the cross-ref block is present but no entries can be
// parsed, we throw a `PartPageDriftError` so the harvester can flag the
// fixture for human review instead of silently inserting nothing.
//
// `PartPageDriftError.kind` taxonomy:
//   - "missing-block"      → expected heading not found
//   - "block-empty"        → heading found but zero parseable entries
//   - "no-part-number"     → could not find any part number anywhere
//
// All other anomalies (e.g. one entry parse failure inside an otherwise
// healthy block) are tolerated and reported per-entry via `warnings`.

import { normalizeChassisLabel, type NormalizedChassisLabel } from "./realoem-chassis-normalizer";

export class PartPageDriftError extends Error {
  constructor(message: string, public kind: "missing-block" | "block-empty" | "no-part-number") {
    super(message);
    this.name = "PartPageDriftError";
  }
}

export interface PartPageAppearance {
  chassisLabelRaw: string;
  chassis: string;          // normalized token, never null when emitted
  chassisBase: string;      // base without LCI/N suffix
  isLci: boolean;
  productionFrom: string | null;  // "MM/YYYY" or null when open-ended / missing
  productionTo: string | null;    // "MM/YYYY" or null when ongoing
}

export interface PartPageExtraction {
  partNumberClean: string;
  appearances: PartPageAppearance[];
  supersessions: string[];
  warnings: string[];
}

const BLOCK_HEADING_RE = /was\s+found\s+on\s+the\s+following\s+vehicles\s*:?/i;

// Strip HTML tags & decode the few entities RealOEM actually emits.
function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(li|tr|p|div|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Pull an 11-digit BMW part number from arbitrary text. RealOEM shows
// it both as the URL `q=` and inside an `<h1>`/heading near the top.
function findPartNumber(html: string, fallbackFromUrl?: string | null): string | null {
  // Prefer an explicit clean 11-digit run that's near the top of the
  // doc — but accept the URL hint when the page renders with spacing.
  const explicit = html.match(/\b(\d{11})\b/);
  if (explicit) return explicit[1];

  // Spaced format like "83 22 2 339 219" → strip whitespace.
  const spaced = html.match(/\b(\d{2})\s(\d{2})\s(\d)\s(\d{3})\s(\d{3})\b/);
  if (spaced) return `${spaced[1]}${spaced[2]}${spaced[3]}${spaced[4]}${spaced[5]}`;

  if (fallbackFromUrl && /^\d{11}$/.test(fallbackFromUrl)) return fallbackFromUrl;
  return null;
}

// Parse a single "label (MM/YYYY — MM/YYYY)" entry. Tolerant of em-dash
// (—), en-dash (–), hyphen (-), and "ongoing" / "current" sentinels.
function parseEntryLine(line: string): { labelRaw: string; from: string | null; to: string | null } | null {
  const cleaned = line.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  // Capture trailing "(MM/YYYY — MM/YYYY)" optionally; some very old
  // chassis entries omit the date range entirely.
  const withDates = cleaned.match(
    /^(.+?)\s*\(\s*(\d{2}\/\d{4})\s*[—\-–]\s*(\d{2}\/\d{4}|present|current|ongoing|—)\s*\)\s*$/i,
  );
  if (withDates) {
    const labelRaw = withDates[1].trim();
    const from = withDates[2];
    const toRaw = withDates[3];
    const to = /^\d{2}\/\d{4}$/.test(toRaw) ? toRaw : null;
    return { labelRaw, from, to };
  }

  // No date range — just a chassis label. Only accept it if it parses
  // to a real chassis token; otherwise it's likely body text.
  const probe = normalizeChassisLabel(cleaned);
  if (probe.chassis) {
    return { labelRaw: cleaned, from: null, to: null };
  }
  return null;
}

// Best-effort scrape of "supersession: X replaces Y" markers. RealOEM
// sometimes renders these as "Replaced by 11428507683" or as a small
// table; we capture any 11-digit numbers near a "replaces" / "replaced"
// keyword as candidates without trying to disambiguate direction.
function findSupersessions(html: string, partNumber: string): string[] {
  const text = htmlToText(html);
  const out = new Set<string>();
  const re = /(replac\w+|supersedes?|superseded\s+by)[^\n]*?\b(\d{11}|\d{2}\s\d{2}\s\d\s\d{3}\s\d{3})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const num = m[2].replace(/\s+/g, "");
    if (num && num !== partNumber) out.add(num);
  }
  return [...out];
}

export function extractPartPageAppearances(
  html: string,
  opts: { sourceUrl: string; partNumberHint?: string | null },
): PartPageExtraction {
  const partNumberClean = findPartNumber(html, opts.partNumberHint ?? null);
  if (!partNumberClean) {
    throw new PartPageDriftError(
      `extractPartPageAppearances: no part number could be located in HTML for ${opts.sourceUrl}`,
      "no-part-number",
    );
  }

  const text = htmlToText(html);

  const headingMatch = text.match(BLOCK_HEADING_RE);
  if (!headingMatch || headingMatch.index === undefined) {
    throw new PartPageDriftError(
      `extractPartPageAppearances: cross-ref heading "was found on the following vehicles" missing for ${partNumberClean} (${opts.sourceUrl})`,
      "missing-block",
    );
  }

  // Take everything from the heading onwards, then cut at the next
  // obvious section boundary so we don't consume footer text.
  const tail = text.slice(headingMatch.index + headingMatch[0].length);
  const cutoffMatch = tail.match(/\n\s*(quantity|illustration|search|copyright|catalog|category|©)\b/i);
  const block = cutoffMatch ? tail.slice(0, cutoffMatch.index) : tail;

  const appearances: PartPageAppearance[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of block.split(/\n+/)) {
    const parsed = parseEntryLine(rawLine);
    if (!parsed) continue;

    const norm: NormalizedChassisLabel = normalizeChassisLabel(parsed.labelRaw);
    if (!norm.chassis) {
      warnings.push(`unparseable chassis label: ${JSON.stringify(parsed.labelRaw)}`);
      continue;
    }

    const dedupKey = `${norm.chassis}|${parsed.from ?? ""}|${parsed.to ?? ""}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    appearances.push({
      chassisLabelRaw: parsed.labelRaw,
      chassis: norm.chassis,
      chassisBase: norm.chassisBase!,
      isLci: norm.isLci,
      productionFrom: parsed.from,
      productionTo: parsed.to,
    });
  }

  if (appearances.length === 0) {
    throw new PartPageDriftError(
      `extractPartPageAppearances: cross-ref block found but zero entries parsed for ${partNumberClean} (${opts.sourceUrl})`,
      "block-empty",
    );
  }

  const supersessions = findSupersessions(html, partNumberClean);

  return { partNumberClean, appearances, supersessions, warnings };
}
