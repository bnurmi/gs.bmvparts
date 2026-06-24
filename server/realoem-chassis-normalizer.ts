// Task #105 — Normalize the chassis labels rendered in the
// "Part X was found on the following vehicles:" block on RealOEM
// `/bmw/enUS/part?id=…&q=…` pages.
//
// RealOEM renders display-style labels:
//   "1' E81"                  → E81
//   "1' E87 LCI"              → E87LCI
//   "3' E36"                  → E36
//   "3' E46"                  → E46
//   "3' E90 LCI"              → E90LCI
//   "5' F10 LCI"              → F10LCI
//   "6' F06 Gran Coupé LCI"   → F06LCI       (body-style words ignored)
//   "6' F12"                  → F12
//   "7' E38"                  → E38
//   "X1 E84"                  → E84
//   "X3 E83 LCI"              → E83LCI
//   "X5 E53"                  → E53
//   "Z3 E36"                  → E36
//   "Z4 E85"                  → E85
//   "Z4 E86"                  → E86
//   "M2 G87"                  → G87          (M-prefix series)
//   "M3 G80 LCI"              → G80LCI
//   "M2 F87 Competition LCI"  → F87LCI
//
// Two LCI conventions BMW uses:
//   - the explicit " LCI" suffix on the chassis token, and
//   - the "N" suffix on the chassis token itself ("F87N" == "F87 LCI",
//     "G80N" == "G80 LCI"). When the page renders the N-suffix form we
//     preserve it as-is because that's how it appears in our cars-table
//     `chassis` column today; when it renders " LCI" we collapse to the
//     LCI-suffix form. Both forms refer to the same physical chassis;
//     the eventual reconciliation belongs in a follow-up.
//
// Returns `chassis: null` when the label cannot be parsed (so the
// caller can record a parser-drift signal and refuse to insert garbage
// into `part_chassis_appearances`).

export interface NormalizedChassisLabel {
  /** Normalized chassis token, e.g. "E90LCI", "F87N", "G87". */
  chassis: string | null;
  /** The canonical 2-3 digit chassis core, no LCI suffix, e.g. "E90", "F87", "G87". */
  chassisBase: string | null;
  /** True when the label carried " LCI" or the chassis token ended in "N". */
  isLci: boolean;
  /** The verbatim trimmed label as rendered by RealOEM. */
  raw: string;
}

const CHASSIS_TOKEN_RE = /\b([A-Z]\d{2,3}N?)\b/;

export function normalizeChassisLabel(rawLabel: string): NormalizedChassisLabel {
  const raw = (rawLabel ?? "").trim();
  if (!raw) {
    return { chassis: null, chassisBase: null, isLci: false, raw };
  }

  // Split off the LCI suffix once so we can match the chassis token in
  // isolation. The label may legitimately contain other words like
  // "Gran Coupé" or "Competition"; we ignore them — only the chassis
  // token and the LCI marker matter for normalization.
  const hasLciSuffix = /\bLCI\b/i.test(raw);

  const tokenMatch = raw.match(CHASSIS_TOKEN_RE);
  if (!tokenMatch) {
    return { chassis: null, chassisBase: null, isLci: hasLciSuffix, raw };
  }

  const token = tokenMatch[1].toUpperCase();
  // "F87N" already encodes LCI in the token; treat as LCI but preserve
  // the N-form so we line up with our existing cars.chassis values.
  const tokenIsNForm = /N$/.test(token);
  const isLci = hasLciSuffix || tokenIsNForm;

  const chassisBase = tokenIsNForm ? token.slice(0, -1) : token;

  let chassis: string;
  if (tokenIsNForm) {
    chassis = token;
  } else if (hasLciSuffix) {
    chassis = `${chassisBase}LCI`;
  } else {
    chassis = chassisBase;
  }

  return { chassis, chassisBase, isLci, raw };
}

// Convenience for tests / call sites that just want the token.
export function chassisFromLabel(rawLabel: string): string | null {
  return normalizeChassisLabel(rawLabel).chassis;
}
