// BMV cross-domain link helpers (Task #96).
// `bmvVinLinks` → bmv.vin URLs; `partsCatalogLinks` → bmv.parts URLs.
// All URL building MUST go through this module — the drift guard rejects
// hard-coded `bmv.vin` / `bmv.parts` literals elsewhere.

import type { BmvVinBrand, BmvVinFacetKind } from "./feature-registry";

export const BMV_VIN_HOST = "bmv.vin";
export const BMV_PARTS_HOST = "bmv.parts";
export const BMV_VIN_BASE = `https://${BMV_VIN_HOST}`;
export const BMV_PARTS_BASE = `https://${BMV_PARTS_HOST}`;

export interface LinkBuilderOptions {
  /** "absolute" → "https://bmv.vin/foo"; "relative" → "/foo". */
  mode?: "absolute" | "relative";
  /** Catalog locale prefix (e.g. "de" → /de/...). Empty/undef = English. */
  localePrefix?: string;
}

function _join(base: string, path: string, mode: "absolute" | "relative"): string {
  const clean = path.startsWith("/") ? path : "/" + path;
  return mode === "relative" ? clean : `${base}${clean}`;
}

// Compose `/<prefix>/<path>` when prefix is non-empty, else `/<path>`.
function _withLocale(path: string, prefix: string | undefined): string {
  if (!prefix) return path.startsWith("/") ? path : "/" + path;
  const clean = path.startsWith("/") ? path : "/" + path;
  return `/${prefix}${clean}`;
}

// -----------------------------------------------------------------------------
// bmv.vin (vanity host)
// -----------------------------------------------------------------------------
export const bmvVinLinks = {
  /** Decoder home: bmv.vin/ */
  home(opts: LinkBuilderOptions = {}): string {
    return _join(BMV_VIN_BASE, "/", opts.mode ?? "absolute");
  },
  /** Per-VIN landing: bmv.vin/{VIN} */
  vinLanding(vin: string, opts: LinkBuilderOptions = {}): string {
    return _join(BMV_VIN_BASE, `/${encodeURIComponent(vin.toUpperCase())}`, opts.mode ?? "absolute");
  },
  /** Per-brand decoder hub: bmv.vin/decoder/{brand} */
  brandDecoder(brand: BmvVinBrand, opts: LinkBuilderOptions = {}): string {
    return _join(BMV_VIN_BASE, `/decoder/${brand}`, opts.mode ?? "absolute");
  },
  /** Faceted hub index: bmv.vin/{kind} */
  facetIndex(kind: BmvVinFacetKind, opts: LinkBuilderOptions = {}): string {
    return _join(BMV_VIN_BASE, `/${kind}`, opts.mode ?? "absolute");
  },
  /** Specific facet hub: bmv.vin/{kind}/{value} */
  facetHub(kind: BmvVinFacetKind, value: string, opts: LinkBuilderOptions = {}): string {
    return _join(BMV_VIN_BASE, `/${kind}/${encodeURIComponent(value.toLowerCase())}`, opts.mode ?? "absolute");
  },
  /** Paginated facet hub: bmv.vin/{kind}/{value}?page={n}. Page=1 omits the
   *  query so the canonical URL is identical to the unpaginated form. */
  facetHubPage(kind: BmvVinFacetKind, value: string, page: number, opts: LinkBuilderOptions = {}): string {
    const base = `/${kind}/${encodeURIComponent(value.toLowerCase())}`;
    const url = page > 1 ? `${base}?page=${page}` : base;
    return _join(BMV_VIN_BASE, url, opts.mode ?? "absolute");
  },
  /** Guide library index: bmv.vin/guide */
  guideIndex(opts: LinkBuilderOptions = {}): string {
    return _join(BMV_VIN_BASE, `/guide`, opts.mode ?? "absolute");
  },
  /** Guide article: bmv.vin/guide/{slug} */
  guide(slug: string, opts: LinkBuilderOptions = {}): string {
    return _join(BMV_VIN_BASE, `/guide/${encodeURIComponent(slug)}`, opts.mode ?? "absolute");
  },
  /** Glossary index: bmv.vin/glossary */
  glossaryIndex(opts: LinkBuilderOptions = {}): string {
    return _join(BMV_VIN_BASE, `/glossary`, opts.mode ?? "absolute");
  },
  /** Glossary term: bmv.vin/glossary/{term} */
  glossary(term: string, opts: LinkBuilderOptions = {}): string {
    return _join(BMV_VIN_BASE, `/glossary/${encodeURIComponent(term)}`, opts.mode ?? "absolute");
  },
};

// -----------------------------------------------------------------------------
// bmv.parts (catalog host) — every helper takes an optional `localePrefix`.
// -----------------------------------------------------------------------------
export const partsCatalogLinks = {
  /** Catalog home: bmv.parts/ */
  home(opts: LinkBuilderOptions = {}): string {
    return _join(BMV_PARTS_BASE, _withLocale("/", opts.localePrefix), opts.mode ?? "absolute");
  },
  /** Part detail: bmv.parts/[locale/]part/{cleaned_part_number} */
  partDetail(partNumberClean: string, opts: LinkBuilderOptions = {}): string {
    return _join(BMV_PARTS_BASE, _withLocale(`/part/${encodeURIComponent(partNumberClean)}`, opts.localePrefix), opts.mode ?? "absolute");
  },
  /** Chassis hub: bmv.parts/[locale/]chassis/{code} */
  chassisHub(code: string, opts: LinkBuilderOptions = {}): string {
    return _join(BMV_PARTS_BASE, _withLocale(`/chassis/${encodeURIComponent(code.toLowerCase())}`, opts.localePrefix), opts.mode ?? "absolute");
  },
  /** Series hub: bmv.parts/[locale/]series/{slug} */
  seriesHub(seriesSlug: string, opts: LinkBuilderOptions = {}): string {
    return _join(BMV_PARTS_BASE, _withLocale(`/series/${encodeURIComponent(seriesSlug.toLowerCase())}`, opts.localePrefix), opts.mode ?? "absolute");
  },
  /** Car detail: bmv.parts/[locale/]car/{slug} */
  carDetail(slug: string, opts: LinkBuilderOptions = {}): string {
    return _join(BMV_PARTS_BASE, _withLocale(`/car/${encodeURIComponent(slug)}`, opts.localePrefix), opts.mode ?? "absolute");
  },
  /** Models hub: bmv.parts/[locale/]models */
  modelsHub(opts: LinkBuilderOptions = {}): string {
    return _join(BMV_PARTS_BASE, _withLocale(`/models`, opts.localePrefix), opts.mode ?? "absolute");
  },
  /** Search: bmv.parts/[locale/]search?q=… */
  search(q: string, opts: LinkBuilderOptions = {}): string {
    return _join(BMV_PARTS_BASE, _withLocale(`/search?q=${encodeURIComponent(q)}`, opts.localePrefix), opts.mode ?? "absolute");
  },
  /** Part finder: bmv.parts/[locale/]part-finder */
  partFinder(opts: LinkBuilderOptions = {}): string {
    return _join(BMV_PARTS_BASE, _withLocale(`/part-finder`, opts.localePrefix), opts.mode ?? "absolute");
  },
};

/** BCP-47 → bmv.parts URL prefix ("de-DE" → "de"). "" for English/unknown. */
export function partsLocalePrefix(locale: string | null | undefined): string {
  if (!locale) return "";
  const exact: Record<string, string> = {
    "en":      "",
    "en-US":   "",
    "en-GB":   "",
    "en-ZA":   "en-za",
    "de-DE":   "de",
    "fr-FR":   "fr",
    "es-ES":   "es",
    "es-MX":   "es-mx",
    "it-IT":   "it",
    "pt-BR":   "pt-br",
    "ko-KR":   "ko",
    "ru-RU":   "ru",
    "zh-CN":   "zh",
  };
  if (locale in exact) return exact[locale];
  const lang = locale.split("-")[0].toLowerCase();
  return lang === "en" ? "" : lang;
}
