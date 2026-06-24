// =============================================================================
// BMV.VIN feature registry (Task #96)
// =============================================================================
//
// Single source of truth for *what* renders inside the bmv.vin vanity-host
// surface. Both the per-VIN landing page (`/{VIN}` on bmv.vin = `/vin/:VIN`
// internally) and the brand-decoder hubs render their content modules from
// this list. The intent is so that, when a new feature ships on `bmv.parts`
// (a new enrichment field, a new related-rail, a new schema), the author
// makes one change here and the matching SSR template/JSON-LD producer
// picks it up — instead of growing a parallel system on bmv.vin.
//
// === The registry rule ===
// Every per-VIN module that ships on bmv.parts must add an entry here with
// either:
//
//   • `vanityHost: "render"` — the module is also rendered on bmv.vin.
//                              The matching SSR template is required.
//
//   • `vanityHost: "skip"`   — the module is intentionally absent on
//                              bmv.vin (e.g. authenticated UI, bmv.parts-
//                              specific affiliate placements). Must include
//                              a `skipReason` so the drift guard can prove
//                              the omission was deliberate.
//
// The pre-deploy drift guard (`scripts/drift-guard-bmv-vin.ts`) walks this
// list and asserts:
//   1. every "render" entry is referenced by at least one SSR handler;
//   2. every projected `projectVinForLanding` field is referenced by at
//      least one SSR template or JSON-LD producer;
//   3. every new `vin_cache` enrichment field either appears here or carries
//      the explicit `vanityHost: "skip"` annotation.
//
// Don't reference UI component imports from this file — it lives in
// `shared/` so both the server SSR and the client SPA can read the same
// list without dragging React/Vite into the server bundle.
// =============================================================================

export type VanityHostMode = "render" | "skip";

export interface VinModuleEntry {
  /** Stable ID used by SSR templates + drift guard cross-reference. */
  id: string;
  /** Surface this module belongs to. `vin-landing` is the per-VIN page. */
  surface: "vin-landing" | "decoder-home" | "brand-decoder";
  /** Short human label (admin coverage dashboard). */
  label: string;
  /** Render on bmv.vin? */
  vanityHost: VanityHostMode;
  /** Required when vanityHost = "skip". */
  skipReason?: string;
  /** vin_cache enrichment field paths this module reads, if any. Drift
   *  guard uses this to validate that new enrichment fields are wired. */
  cacheFields?: string[];
  /** projectVinForLanding fields this module reads. */
  projectionFields?: string[];
  /** Schema.org @type emitted by this module's JSON-LD producer (if any). */
  schemaTypes?: string[];
}

// -----------------------------------------------------------------------------
// Per-VIN landing modules
// -----------------------------------------------------------------------------
export const VIN_LANDING_MODULES: VinModuleEntry[] = [
  {
    id: "vehicle-summary",
    surface: "vin-landing",
    label: "Vehicle summary fact-table",
    vanityHost: "render",
    cacheFields: ["enrichedData.vehicle", "decodedData"],
    projectionFields: [
      "decodedChassis", "decodedSeries", "decodedModelYear",
      "decodedModelName", "decodedEngine", "decodedPlantCity",
      "decodedPlantCountry", "vehicle",
    ],
    schemaTypes: ["Vehicle"],
  },
  {
    id: "factory-options",
    surface: "vin-landing",
    label: "Factory options list (SA codes)",
    vanityHost: "render",
    cacheFields: ["enrichedData.options"],
    projectionFields: ["options"],
  },
  {
    id: "vehicle-photos",
    surface: "vin-landing",
    label: "Exterior/interior images + 360° viewer",
    vanityHost: "render",
    cacheFields: ["enrichedData.images"],
    projectionFields: ["images"],
  },
  {
    id: "owners-manuals",
    surface: "vin-landing",
    label: "Owner's manual table",
    vanityHost: "render",
    cacheFields: ["enrichedData.manuals"],
    projectionFields: ["manuals"],
  },
  {
    id: "what-this-vin-means",
    surface: "vin-landing",
    label: "Inline glossary block (WMI/VDS/VIS/check-digit/MY letter)",
    vanityHost: "render",
    projectionFields: ["vin", "decodedModelYear", "decodedPlantCity"],
    schemaTypes: ["DefinedTerm"],
  },
  {
    id: "provenance-line",
    surface: "vin-landing",
    label: "Source provenance disclosure",
    vanityHost: "render",
    cacheFields: ["enrichmentSource"],
    projectionFields: ["enrichmentSource"],
  },
  {
    id: "rail-same-chassis-other-years",
    surface: "vin-landing",
    label: "Related rail: same chassis, other years",
    vanityHost: "render",
    projectionFields: ["sameChassisOtherYears"],
  },
  {
    id: "rail-same-plant-same-year",
    surface: "vin-landing",
    label: "Related rail: same plant + year",
    vanityHost: "render",
    projectionFields: ["samePlantSameYear"],
  },
  {
    id: "rail-similar-builds",
    surface: "vin-landing",
    label: "Related rail: similar builds (paint/option overlap)",
    vanityHost: "render",
    projectionFields: ["similarBuilds"],
  },
  {
    id: "top-paint-callout",
    surface: "vin-landing",
    label: "Top paint callout linking to the paint hub",
    vanityHost: "render",
    projectionFields: ["topPaint"],
  },
  {
    id: "top-option-callouts",
    surface: "vin-landing",
    label: "Top option callouts linking to option hubs",
    vanityHost: "render",
    projectionFields: ["topOptions"],
  },
  {
    id: "shop-oem-parts-cta",
    surface: "vin-landing",
    label: "Shop OEM parts CTA → bmv.parts catalog",
    vanityHost: "render",
    projectionFields: ["decodedChassis", "decodedSeries"],
  },
  {
    id: "save-to-garage",
    surface: "vin-landing",
    label: "Save-to-garage / saved-cars bmv.parts UI",
    vanityHost: "skip",
    skipReason: "Authenticated user feature on bmv.parts; bmv.vin is public-only.",
  },
];

// -----------------------------------------------------------------------------
// Brand decoder hub modules (rendered on /decoder/{brand})
// -----------------------------------------------------------------------------
export const BRAND_DECODER_MODULES: VinModuleEntry[] = [
  { id: "brand-decoder-intro",            surface: "brand-decoder", label: "Brand decoder intro copy",      vanityHost: "render", schemaTypes: ["Article"] },
  { id: "brand-decoder-input",            surface: "brand-decoder", label: "Brand-aware VIN input form",    vanityHost: "render" },
  { id: "brand-decoder-wmi-table",        surface: "brand-decoder", label: "WMI allowlist table",           vanityHost: "render" },
  { id: "brand-decoder-faq",              surface: "brand-decoder", label: "FAQ block",                      vanityHost: "render", schemaTypes: ["FAQPage"] },
  { id: "brand-decoder-related",          surface: "brand-decoder", label: "Related chassis cross-links",   vanityHost: "render" },
  { id: "brand-decoder-recently-decoded", surface: "brand-decoder", label: "Brand-filtered recently decoded VINs", vanityHost: "render", cacheFields: ["decodedData"], schemaTypes: ["ItemList"] },
  { id: "brand-decoder-top-chassis",      surface: "brand-decoder", label: "Top chassis rail for this brand", vanityHost: "render", cacheFields: ["decodedData"] },
];

// -----------------------------------------------------------------------------
// Decoder home modules
// -----------------------------------------------------------------------------
export const DECODER_HOME_MODULES: VinModuleEntry[] = [
  { id: "decoder-home-intro",             surface: "decoder-home",  label: "Decoder home hero + intro",     vanityHost: "render", schemaTypes: ["WebApplication"] },
  { id: "decoder-home-input",             surface: "decoder-home",  label: "VIN input form",                vanityHost: "render" },
  { id: "decoder-home-brand-grid",        surface: "decoder-home",  label: "Brand grid (BMW / MINI / …)",   vanityHost: "render" },
  { id: "decoder-home-facet-grid",        surface: "decoder-home",  label: "Facet grid (chassis/year/…)",   vanityHost: "render" },
  { id: "decoder-home-guides",            surface: "decoder-home",  label: "Guide library teaser",          vanityHost: "render" },
  { id: "decoder-home-glossary",          surface: "decoder-home",  label: "Glossary teaser",               vanityHost: "render" },
  { id: "decoder-home-faq",               surface: "decoder-home",  label: "Decoder home FAQ",              vanityHost: "render", schemaTypes: ["FAQPage"] },
  { id: "decoder-home-recently-decoded",  surface: "decoder-home",  label: "Recently decoded VIN strip",    vanityHost: "render", cacheFields: ["decodedData"], schemaTypes: ["ItemList"] },
  { id: "decoder-home-howto",             surface: "decoder-home",  label: "How to decode a BMW VIN HowTo", vanityHost: "render", schemaTypes: ["HowTo"] },
];

export const ALL_REGISTRY_ENTRIES: VinModuleEntry[] = [
  ...VIN_LANDING_MODULES,
  ...BRAND_DECODER_MODULES,
  ...DECODER_HOME_MODULES,
];

// -----------------------------------------------------------------------------
// vin_cache enrichment-field annotations.
// -----------------------------------------------------------------------------
// New fields on vin_cache must be listed here so the drift guard can prove
// they're either (a) read by a registered module or (b) explicitly skipped.
// The key is a dotted path under the JSON column.
export interface CacheFieldAnnotation {
  path: string;
  vanityHost: VanityHostMode;
  skipReason?: string;
  consumedBy?: string[]; // module IDs from ALL_REGISTRY_ENTRIES
}

export const VIN_CACHE_FIELD_ANNOTATIONS: CacheFieldAnnotation[] = [
  { path: "enrichedData.vehicle",  vanityHost: "render", consumedBy: ["vehicle-summary"] },
  { path: "enrichedData.options",  vanityHost: "render", consumedBy: ["factory-options", "top-option-callouts"] },
  { path: "enrichedData.images",   vanityHost: "render", consumedBy: ["vehicle-photos"] },
  { path: "enrichedData.manuals",  vanityHost: "render", consumedBy: ["owners-manuals"] },
  { path: "decodedData",           vanityHost: "render", consumedBy: ["vehicle-summary", "shop-oem-parts-cta"] },
  { path: "enrichmentSource",      vanityHost: "render", consumedBy: ["provenance-line"] },
];

// Brand identifiers used by both the decoder hubs and the link helpers.
export const BMV_VIN_BRANDS = ["bmw", "mini", "alpina", "rolls-royce", "motorrad"] as const;
export type BmvVinBrand = typeof BMV_VIN_BRANDS[number];

export const BMV_VIN_FACET_KINDS = ["chassis", "year", "plant", "market", "paint", "option"] as const;
export type BmvVinFacetKind = typeof BMV_VIN_FACET_KINDS[number];

// Pretty labels rendered in breadcrumbs / hub headings. Localized variants
// live in the i18n packs; this is the English fallback.
export const FACET_KIND_LABEL: Record<BmvVinFacetKind, string> = {
  chassis: "Chassis",
  year:    "Model year",
  plant:   "Plant",
  market:  "Market",
  paint:   "Paint",
  option:  "Option",
};

export const BRAND_LABEL: Record<BmvVinBrand, string> = {
  bmw:           "BMW",
  mini:          "MINI",
  alpina:        "ALPINA",
  "rolls-royce": "Rolls-Royce",
  motorrad:      "BMW Motorrad",
};

// WMI allowlists per brand. Used by the brand-decoder hubs and the
// runtime VIN classifier so a /decoder/mini hub never publishes BMW VIN
// landing pages, etc.
export const BRAND_WMIS: Record<BmvVinBrand, string[]> = {
  bmw:           ["WBA", "WBS", "WBY", "WBX", "5UX", "5UM", "5YM", "4US", "4USB"],
  mini:          ["WMW"],
  alpina:        ["WAP"],
  "rolls-royce": ["SBM"],
  motorrad:      ["WBW", "WUF"],
};
