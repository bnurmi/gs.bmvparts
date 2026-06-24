// Types shared by every locale pack used to render multilingual SEO copy
// for part pages. The English pack mirrors the previous hardcoded strings
// in server/seo/content.ts so behavior is unchanged for the default locale.

export type LocaleCode =
  | "en"
  | "de-DE"
  | "fr-FR"
  | "es-ES"
  | "it-IT"
  | "zh-CN"
  | "ko-KR"
  | "es-MX"
  | "en-ZA"
  | "pt-BR"
  | "ru-RU";

export interface LocaleMeta {
  code: LocaleCode;
  // URL prefix segment (no slashes). Empty for default English.
  prefix: string;
  // BCP-47 lang attribute (used by <html lang> and JSON-LD inLanguage).
  bcp47: string;
  // Human-readable native label, used by language-switcher / admin selector.
  nativeLabel: string;
  // Default currency hint shown on the part page.
  currency: string;
  // Optional region note shown above the buy box.
  regionHint?: string;
  // True for CJK locales; PartDetail uses this to avoid hyphenating long
  // part numbers and to widen meta-description char budget.
  isCJK?: boolean;
}

export interface ChassisFitmentGroupView {
  chassis: string;
  yearStart: number | null;
  yearEnd: number | null;
  models: { displayName: string; engine: string; bodyType: string; yearStart: number; yearEnd: number | null }[];
}

export interface VehicleView {
  carName: string;
  engine: string;
  bodyType: string;
  yearStart: number;
  yearEnd: number | null;
  categoryName: string;
  subcategoryName: string;
  quantity: string | null;
}

export interface SeoBuildInput {
  partNumber: string;
  partNumberClean: string;
  description: string;
  additionalInfo: string | null;
  weight: number | null;
  vehicles: VehicleView[];
  externalChassis?: string[];
  supersededBy?: string | null;
  supersedes?: string | null;
  position?: string | null;
  hierarchyPath?: string | null;
  related?: { partNumber: string; partNumberClean: string; description: string }[];
  categoryBlurb?: string | null;
  editorNote?: string | null;
}

// Inputs for the chassis hub-page locale builders (Task #36). Mirrors the
// fields produced by /api/chassis/seo so each locale only worries about
// phrasing. Numeric counts are pre-formatted via toLocaleString upstream.
export interface HubChassisBuildInput {
  label: string;            // chassis code, e.g. "G87"
  carCount: number;
  series: string | null;
  years: string;            // pre-formatted, "" when unknown
  totalParts: number;
  totalPartsFmt: string;    // pre-formatted with toLocaleString
  topCategoryNames: string[];
  topCategoriesWithCounts: string[]; // each "Engine (1,234)"
  relatedChassisCodes: string[];
}

// Inputs for the car-detail locale builders (Task #36). Only the fields
// strictly used by meta title/description are passed.
export interface CarPageBuildInput {
  displayName: string;
  chassis: string;
  modelName: string;
  engine: string;
  totalParts: number;
  totalPartsFmt: string;    // pre-formatted with toLocaleString
}

// Inputs for the series hub-page locale builders (Task #44). Mirrors the
// fields produced by /api/series/seo so each locale only worries about
// phrasing.
export interface HubSeriesBuildInput {
  label: string;            // series display name, e.g. "3 Series"
  carCount: number;
  chassisCodes: string[];   // chassis generations that make up the series
  years: string;            // pre-formatted, "" when unknown
  totalParts: number;
  totalPartsFmt: string;
  topCategoryNames: string[];
  topCategoriesWithCounts: string[]; // each "Engine (1,234)"
}

// Inputs for the BMW Models hub locale builders (Task #44). Just a count
// of catalogued model variants, pre-formatted upstream.
export interface ModelsHubBuildInput {
  totalModels: number;
  totalModelsFmt: string;   // pre-formatted with toLocaleString
}

// In-page UI labels for the BMW Models browser (/models). Distinct from
// the SEO copy because these strings render in the visible client UI.
// Numeric counts are passed pre-formatted (toLocaleString) so each locale
// only has to worry about the surrounding phrase. (Task #46)
export interface ModelsHubUiStrings {
  pageTitle: string;
  databaseLabel: string;
  status: { ready: string; syncing: string; complete: string; error: string };
  discoveryProgress: (a: { completed: number; discovered: number; current: string | null }) => string;
  modelsProgress: (a: { scraped: number; total: number }) => string;
  errorsCount: (n: number) => string;
  buttons: {
    cancel: string;
    refresh: string;
    syncModels: string;
    importing: string;
    importLegacy: string;
  };
  importLegacyTooltip: string;
  searchPlaceholder: string;
  resultsBadge: (n: string) => string;
  filterAll: string;
  showLess: string;
  showMore: (n: number) => string;
  failedToLoad: string;
  emptyTitle: string;
  emptyHintWithSearch: string;
  emptyHintNoSearch: string;
  variantsCount: (n: number) => string;
}

// On-page UI chrome strings for the chassis/series hub pages (Task #47).
// Kept as plain phrasing so the React components can render them without
// any runtime SEO call. All fields required so locale fallbacks behave
// predictably when a translator forgets a key.
export interface HubLabels {
  breadcrumbs: {
    home: string;
    series: string;
    chassis: string;
    models: string;
  };
  stats: {
    models: string;          // "Models"
    generations: string;     // "Generations"
    totalParts: string;      // "Total Parts"
    bodyTypes: string;       // "Body Types"
    withPartsData: string;   // "With Parts Data"
    parts: string;           // "Parts" (capitalised, used as a stat caption)
  };
  sections: {
    mostStockedCategories: (label: string) => string;   // "Most-stocked {label} categories"
    chassisInThisSeries: string;                        // "Chassis in this series"
    relatedChassis: string;                             // "Related BMW chassis"
    frequentlyAskedQuestions: string;                   // "Frequently asked questions"
    allModelsHeading: (a: { label: string; count: number }) => string;
    bodyTypesLabel: string;                             // "Body types:"
    enginesLabel: string;                               // "Engines:"
    moreEngines: (n: number) => string;                 // "+N more"
    productionYears: (years: string) => string;         // "Production years: 2007–2013"
    modelsCount: (n: number) => string;                 // "1 model" / "5 models"
    partsLowercase: string;                             // "parts" (lowercase)
    relatedChassisCaption: (a: { carCount: number; totalParts: string }) => string;
    browse: string;                                     // "Browse"
  };
  notFound: {
    seriesHeading: string;                              // "Series Not Found"
    seriesMessage: (slug: string) => string;            // "The series '{slug}' could not be found."
    seriesMetaTitle: string;                            // "BMW Series Not Found"
    backToHome: string;                                 // "Back to Home"
    chassisHeading: string;                             // "Chassis Not Found"
    chassisMessage: (label: string) => string;          // "No BMW models found with chassis code '{label}'."
    chassisMetaTitle: (label: string) => string;        // "BMW {label} Parts"
    chassisMetaDescription: (label: string) => string;  // "Browse BMW {label} OEM parts catalog."
    back: string;                                       // "Back"
  };
}

// On-page strings for the per-VIN SSR landing page (`/vin/:VIN`) and its
// "preparing this VIN" + "VIN not found" sibling pages (Task #80).
// Brand/product nouns (BMW, bimmer.work, mdecoder, vindecoderz, ETK)
// stay untranslated — only descriptive text translates.
export interface VinLandingStrings {
  // Crumb labels.
  breadcrumbHome: string;
  breadcrumbVinDecoder: string;

  // Section headings.
  vehicleSummary: string;
  vehiclePhotos: string;
  ownersManuals: (n: number) => string;
  factoryOptions: (n: number) => string;
  bmwOemPartsCatalog: string;

  // Vehicle-summary fact-table row labels.
  factVin: string;
  factChassis: string;
  factModelYear: string;
  factEngine: string;
  factDrivetrain: string;
  factTransmission: string;
  factMarket: string;
  factPaint: string;
  factUpholstery: string;
  factBuildDate: string;
  factPlant: string;

  // Image alt/captions.
  exteriorCaption: string;
  interiorCaption: string;
  exteriorAlt: (a: { headline: string; vin: string }) => string;
  interiorAlt: (a: { headline: string; vin: string }) => string;
  viewer360Alt: (a: { headline: string; vin: string }) => string;
  viewer360NoscriptCaption: (n: number) => string;
  viewer360HydrationHint: (n: number) => string;

  // Manual table headers.
  manualHeaderManual: string;
  manualHeaderNumber: string;
  manualHeaderLanguage: string;
  manualHeaderDate: string;

  // Catalog cross-link section.
  catalogIntro: string;
  chassisLink: (chassis: string) => string;
  seriesLink: (series: string) => string;
  decodeAnotherLink: string;

  // Optional rail headings — only rendered on bmv.vin where the SSR
  // builder receives a `VinForLanding` (Task #96, T006). When absent the
  // template falls back to English defaults so canonical bmv.parts SSR
  // (which never passes rails) is unaffected.
  railSameChassisHeading?: string;
  railSamePlantHeading?: string;
  railSimilarBuildsHeading?: string;

  // Provenance badges. Source identifiers are the EnrichmentTabSource
  // strings from shared/schema.ts. Returns null when the source is
  // "none" / unknown so the badge is suppressed.
  sourceLabel: (source: string | null | undefined) => string | null;

  // "Preparing this VIN…" placeholder page.
  preparingTitle: (vin: string) => string;
  preparingMetaDescription: (vin: string) => string;
  preparingHeading: (vin: string) => string;
  preparingBody: string;
  preparingFooterLinkText: (vin: string) => string;

  // "VIN not found" reasons.
  notFoundTitle: (vin: string) => string;
  notFoundReasonInvalid: string;
  notFoundReasonNotBmw: string;
  notFoundReasonUncached: string;
}

// A locale pack returns the localized text fragments needed to assemble a
// SeoContent object. Helper functions receive already-grouped fitment data
// so each locale only worries about phrasing.
export interface LocalePack {
  meta: LocaleMeta;

  // Conjunctions used by formatList(); kept short.
  conjAnd: string;
  conjOr: string;

  // Render a localized year range "2007–2013" / "2007+". Most locales use
  // an en-dash but this is overridable for CJK locales.
  formatYearRange: (start: number | null, end: number | null) => string;

  // Friendly noun phrase derived from the BMW catalog category (e.g.
  // "engine system component"). Falls back to a generic phrase.
  categoryNoun: (category: string | null | undefined) => string;

  // Long-form sections of the SEO content payload.
  buildIntro: (input: SeoBuildInput, groups: ChassisFitmentGroupView[]) => string;
  buildFitmentSummary: (groups: ChassisFitmentGroupView[]) => string;
  buildSpecs: (input: SeoBuildInput) => { label: string; value: string }[];
  buildFaq: (input: SeoBuildInput, groups: ChassisFitmentGroupView[]) => { question: string; answer: string }[];
  buildMetaTitle: (input: SeoBuildInput, groups: ChassisFitmentGroupView[]) => string;
  buildMetaDescription: (input: SeoBuildInput, groups: ChassisFitmentGroupView[]) => string;

  // Chassis hub-page content (Task #36).
  buildHubChassisIntro: (input: HubChassisBuildInput) => string;
  buildHubChassisMetaTitle: (input: HubChassisBuildInput) => string;
  buildHubChassisMetaDescription: (input: HubChassisBuildInput) => string;
  buildHubChassisFaq: (input: HubChassisBuildInput) => { question: string; answer: string }[];

  // Car-detail page meta (Task #36).
  buildCarMetaTitle: (input: CarPageBuildInput) => string;
  buildCarMetaDescription: (input: CarPageBuildInput) => string;

  // Series hub-page content (Task #44).
  buildHubSeriesIntro: (input: HubSeriesBuildInput) => string;
  buildHubSeriesMetaTitle: (input: HubSeriesBuildInput) => string;
  buildHubSeriesMetaDescription: (input: HubSeriesBuildInput) => string;
  buildHubSeriesFaq: (input: HubSeriesBuildInput) => { question: string; answer: string }[];

  // /models hub meta + intro (Task #44).
  buildModelsMetaTitle: (input: ModelsHubBuildInput) => string;
  buildModelsMetaDescription: (input: ModelsHubBuildInput) => string;
  buildModelsIntro: (input: ModelsHubBuildInput) => string;

  // /models hub in-page UI labels (Task #46).
  modelsHubUi: ModelsHubUiStrings;

  // On-page UI chrome strings for the chassis/series hub pages (Task #47).
  hubLabels: HubLabels;

  // Per-VIN SSR landing page strings (Task #80).
  vinLanding: VinLandingStrings;

  // BMV.VIN vanity-host content strings (Task #96). Optional per-pack —
  // when omitted the runtime helper falls back to the English copy so
  // every locale renders something even before translations are
  // authored. Each surface (decoder home, brand decoder, facet hub,
  // guide, glossary) defines its own keys; pages that need formatting
  // pass already-formatted numbers in.
  vinHost?: VinHostStrings;
}

// Locale-aware copy for the bmv.vin SSR layer. Pages that need richer
// editorial content load it from the bmv_vin_* DB tables (per-locale
// JSONB); these strings are the page chrome (headings, labels, FAQ
// fallbacks, breadcrumb labels) that always render.
export interface VinHostStrings {
  brand: { bmw: string; mini: string; alpina: string; rollsRoyce: string; motorrad: string };
  facetKind: {
    chassis: string; year: string; plant: string; market: string; paint: string; option: string;
  };
  // Decoder home.
  homeMetaTitle: string;
  homeMetaDescription: string;
  homeH1: string;
  homeIntro: string;
  homeBrandsHeading: string;
  homeFacetsHeading: string;
  homeGuidesHeading: string;
  homeGlossaryHeading: string;
  // Brand decoder.
  brandHubMetaTitle: (brand: string) => string;
  brandHubMetaDescription: (brand: string) => string;
  brandHubH1: (brand: string) => string;
  brandHubIntro: (brand: string) => string;
  brandHubWmiHeading: string;
  brandHubRelatedHeading: string;
  // Facet index/hub.
  facetIndexMetaTitle: (kind: string) => string;
  facetIndexMetaDescription: (kind: string) => string;
  facetIndexH1: (kind: string) => string;
  facetHubMetaTitle: (a: { kind: string; value: string }) => string;
  facetHubMetaDescription: (a: { kind: string; value: string; cohort: number }) => string;
  facetHubH1: (a: { kind: string; value: string }) => string;
  facetHubExamplesHeading: (n: number) => string;
  facetHubEmpty: string;
  // Guides.
  guideIndexMetaTitle: string;
  guideIndexMetaDescription: string;
  guideIndexH1: string;
  guideMetaTitle: (title: string) => string;
  guideRelatedHeading: string;
  // Glossary.
  glossaryIndexMetaTitle: string;
  glossaryIndexMetaDescription: string;
  glossaryIndexH1: string;
  glossaryMetaTitle: (term: string) => string;
  glossaryRelatedHeading: string;
  // Common.
  breadcrumbHome: string;
  decodeAnotherCta: string;
  shopOemPartsCta: string;
  vinInputLabel: string;
  vinInputPlaceholder: string;
  vinInputSubmit: string;
  faqHeading: string;
  notFoundH1: string;
  notFoundBody: string;
  // Recently-decoded strip (home + brand).
  homeRecentlyDecodedHeading: string;
  brandRecentlyDecodedHeading: (brand: string) => string;
  // Brand top-chassis rail.
  brandTopChassisHeading: (brand: string) => string;
  // HowTo JSON-LD on home.
  homeHowToTitle: string;
  homeHowToDescription: string;
  homeHowToSteps: { name: string; text: string }[];
  // Facet hub: pagination + cross-rail + threshold-based labels.
  facetPaginationLabel: (a: { page: number; total: number }) => string;
  facetPaginationPrev: string;
  facetPaginationNext: string;
  facetCrossRailHeading: (kind: string) => string;
  facetThinCohortNote: (cohort: number) => string;
  // Per-VIN inline tokenization block.
  vinTokenHeading: string;
  vinTokenIntro: string;
  vinTokenWmiLabel: string;
  vinTokenWmiHint: string;
  vinTokenVdsLabel: string;
  vinTokenVdsHint: string;
  vinTokenCheckLabel: string;
  vinTokenCheckHint: string;
  vinTokenMyLetterLabel: string;
  vinTokenMyLetterHint: (year: number | null) => string;
  vinTokenPlantLabel: string;
  vinTokenPlantHint: (city: string | null) => string;
  vinTokenSerialLabel: string;
  vinTokenSerialHint: string;
}

export const SUPPORTED_LOCALES: LocaleCode[] = [
  "en",
  "de-DE",
  "fr-FR",
  "es-ES",
  "it-IT",
  "zh-CN",
  "ko-KR",
  "es-MX",
  "en-ZA",
  "pt-BR",
  "ru-RU",
];

// Locale prefix table (URL segment → BCP-47 code). Lower-case throughout.
export const LOCALE_PREFIXES: Record<string, LocaleCode> = {
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES",
  it: "it-IT",
  zh: "zh-CN",
  ko: "ko-KR",
  "es-mx": "es-MX",
  "en-za": "en-ZA",
  "pt-br": "pt-BR",
  ru: "ru-RU",
};

// Inverse of LOCALE_PREFIXES (code → URL prefix). "" for English default.
export const LOCALE_TO_PREFIX: Record<LocaleCode, string> = {
  en: "",
  "de-DE": "de",
  "fr-FR": "fr",
  "es-ES": "es",
  "it-IT": "it",
  "zh-CN": "zh",
  "ko-KR": "ko",
  "es-MX": "es-mx",
  "en-ZA": "en-za",
  "pt-BR": "pt-br",
  "ru-RU": "ru",
};

// Format a localized list using the supplied conjunction. Mirrors the
// English helper in server/seo/content.ts so all locale packs agree.
export function formatList(items: string[], conj: string): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conj} ${items[items.length - 1]}`;
}

export function defaultYearRange(start: number | null, end: number | null): string {
  if (!start) return "";
  if (!end) return `${start}+`;
  if (start === end) return `${start}`;
  return `${start}–${end}`;
}

// Helper: build a regex-driven friendly noun map. Each locale supplies its
// own translated nouns; the regex set itself is locale-independent because
// catalog category names are stored in English.
export function makeCategoryNoun(map: {
  engine: string;
  cooling: string;
  brake: string;
  suspension: string;
  fuel: string;
  exhaust: string;
  electrical: string;
  drivetrain: string;
  body: string;
  climate: string;
  fallback: string;
  wrap: (category: string) => string;
}) {
  return (category: string | null | undefined): string => {
    if (!category) return map.fallback;
    const c = category.toLowerCase();
    if (/engine/.test(c)) return map.engine;
    if (/cooling|radiator|thermost|water/.test(c)) return map.cooling;
    if (/brake/.test(c)) return map.brake;
    if (/suspens|axle|wheel|steer/.test(c)) return map.suspension;
    if (/fuel/.test(c)) return map.fuel;
    if (/exhaust/.test(c)) return map.exhaust;
    if (/electr|wiring|lamp|light|battery/.test(c)) return map.electrical;
    if (/transmiss|gearbox|clutch|drive|differ/.test(c)) return map.drivetrain;
    if (/body|trim|interior|seat|door|window/.test(c)) return map.body;
    if (/heat|air condition|hvac|climate/.test(c)) return map.climate;
    return map.wrap(category);
  };
}

export function isSupportedLocale(value: string | null | undefined): value is LocaleCode {
  if (!value) return false;
  return (SUPPORTED_LOCALES as string[]).includes(value);
}

// Best-effort Accept-Language → LocaleCode resolver. Honors q-values loosely;
// returns "en" for any unknown match so callers can default safely.
export function resolveLocale(
  explicit: string | null | undefined,
  acceptLanguage?: string | null,
): LocaleCode {
  if (isSupportedLocale(explicit)) return explicit;
  if (explicit) {
    // Allow plain language ("de", "zh") to fall through to a region.
    const lc = explicit.toLowerCase();
    for (const code of SUPPORTED_LOCALES) {
      if (code.toLowerCase().split("-")[0] === lc) return code;
    }
  }
  if (acceptLanguage) {
    const tags = acceptLanguage.split(",").map(s => s.trim().split(";")[0]);
    for (const tag of tags) {
      const norm = tag.replace(/_/g, "-");
      if (isSupportedLocale(norm)) return norm;
      const lc = norm.toLowerCase().split("-")[0];
      for (const code of SUPPORTED_LOCALES) {
        if (code.toLowerCase().split("-")[0] === lc) return code;
      }
    }
  }
  return "en";
}
