// Catalog identifier alias map.
//
// Some chassis identifiers used by realoem / our `cars` catalog do not match
// the chassis identifier the VIN decoder produces (or there is no VIN that
// decodes directly to them). For those cases we record an explicit alias
// from the decoder-side chassis to the catalog-side chassis so the matcher
// can find the right rows without leaning on fuzzy fallback.
//
// Each alias entry must refer to the SAME vehicle (same body, same engine
// family, same generation). LCI handling (`E60` ↔ `E60N`) is intentionally
// kept separate in `lciVariants()` because it is year-driven; this map is
// for catalog-rename and legacy-identifier cases that are not LCI siblings.
//
// Aliases are bidirectional: when looking up `chassis = X`, the matcher will
// also try every value listed in `CATALOG_ALIASES[X]`.
export const CATALOG_ALIASES: Record<string, string[]> = {
  // No bidirectional renames identified between the current decoder output
  // and `cars.chassis` values. Add entries here when a new mismatch is
  // discovered (e.g. legacy identifier rename, realoem reissuing a chassis
  // code), accompanied by the realoem evidence in
  // `scripts/fixtures/realoem-vin-truth.json`.
};

// Catalog-only chassis that the current decoder cannot reach via either the
// `bmw_models` table OR `BMW_VDS_PATTERNS`. These need either new VDS
// patterns or new bmw_models rows; aliasing alone cannot fix them because
// no VIN currently decodes to a "near" chassis we could redirect from.
//
// Surfacing them in code (rather than only in the audit JSON) keeps the gap
// visible to anyone editing the decoder.
export const CATALOG_ONLY_CHASSIS_NEEDING_DECODER_SUPPORT: ReadonlyArray<{
  chassis: string;
  series: string;
  notes: string;
}> = [
  {
    chassis: "G70",
    series: "7 Series",
    notes:
      "Current G7x 7 Series (2023+). Cars exist in catalog but no VDS pattern or bmw_models entry resolves to G70 yet — VINs land on the closest sibling via fuzzy fallback or return 'no chassis carried'.",
  },
  {
    chassis: "G09",
    series: "XM",
    notes:
      "BMW XM PHEV SUV (2023+). Cars exist in catalog; no VDS pattern entry. Same gap as G70.",
  },
];

export function getCatalogAliases(chassis: string | null | undefined): string[] {
  if (!chassis) return [];
  const upper = chassis.toUpperCase();
  return CATALOG_ALIASES[upper] ?? [];
}
