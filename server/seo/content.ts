// Deterministic, server-side SEO content generator.
// Multilingual: locale strings live in shared/i18n/<locale>.ts. The English
// pack mirrors the original strings so /api/parts/seo without a locale
// is byte-identical to the previous behavior.

import { getPack, type LocaleCode } from "../../shared/i18n";

export interface FitmentVehicle {
  carId: number;
  carName: string;
  carSlug: string | null;
  chassis: string;
  engine: string;
  bodyType: string;
  yearStart: number;
  yearEnd: number | null;
  categoryName: string;
  subcategoryName: string;
  quantity: string | null;
}

export interface RelatedPart {
  partNumber: string;
  partNumberClean: string;
  description: string;
}

export interface SeoContentInput {
  partNumber: string;
  partNumberClean: string;
  description: string;
  additionalInfo: string | null;
  weight: number | null;
  vehicles: FitmentVehicle[];
  externalChassis?: string[];
  supersededBy?: string | null;
  supersedes?: string | null;
  position?: string | null;
  hierarchyPath?: string | null;
  related?: RelatedPart[];
  categoryBlurb?: string | null;
  editorNote?: string | null;
  // Locale (BCP-47) the copy should be generated in. Defaults to "en".
  locale?: LocaleCode | string | null;
}

export interface ChassisFitmentGroup {
  chassis: string;
  yearStart: number | null;
  yearEnd: number | null;
  models: { displayName: string; engine: string; bodyType: string; yearStart: number; yearEnd: number | null }[];
}

export interface SeoContent {
  intro: string;
  fitmentSummary: string;
  fitmentByChassis: ChassisFitmentGroup[];
  specs: { label: string; value: string }[];
  faq: { question: string; answer: string }[];
  categoryGuide: string | null;
  editorNote: string | null;
  related: RelatedPart[];
  metaTitle: string;
  metaDescription: string;
  // Locale metadata (BCP-47) to populate JSON-LD inLanguage and <html lang>.
  locale: string;
  inLanguage: string;
  regionHint: string | null;
  currency: string;
}

export function buildChassisGroups(vehicles: FitmentVehicle[], externalChassis?: string[]): ChassisFitmentGroup[] {
  const map = new Map<string, ChassisFitmentGroup>();
  for (const v of vehicles) {
    const code = (v.chassis || "").toUpperCase();
    if (!code) continue;
    let g = map.get(code);
    if (!g) {
      g = { chassis: code, yearStart: null, yearEnd: null, models: [] };
      map.set(code, g);
    }
    if (!g.models.find(m => m.displayName === v.carName)) {
      g.models.push({
        displayName: v.carName,
        engine: v.engine,
        bodyType: v.bodyType,
        yearStart: v.yearStart,
        yearEnd: v.yearEnd,
      });
    }
    if (v.yearStart && (g.yearStart === null || v.yearStart < g.yearStart)) g.yearStart = v.yearStart;
    if (v.yearEnd && (g.yearEnd === null || v.yearEnd > g.yearEnd)) g.yearEnd = v.yearEnd;
  }
  for (const ch of externalChassis || []) {
    const code = ch.toUpperCase();
    if (!map.has(code)) {
      map.set(code, { chassis: code, yearStart: null, yearEnd: null, models: [] });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.chassis.localeCompare(b.chassis));
}

export function generateSeoContent(input: SeoContentInput): SeoContent {
  const pack = getPack(input.locale ?? "en");
  const groups = buildChassisGroups(input.vehicles, input.externalChassis);
  const buildInput = {
    partNumber: input.partNumber,
    partNumberClean: input.partNumberClean,
    description: input.description,
    additionalInfo: input.additionalInfo,
    weight: input.weight,
    vehicles: input.vehicles.map(v => ({
      carName: v.carName,
      engine: v.engine,
      bodyType: v.bodyType,
      yearStart: v.yearStart,
      yearEnd: v.yearEnd,
      categoryName: v.categoryName,
      subcategoryName: v.subcategoryName,
      quantity: v.quantity,
    })),
    externalChassis: input.externalChassis,
    supersededBy: input.supersededBy,
    supersedes: input.supersedes,
    position: input.position,
    hierarchyPath: input.hierarchyPath,
    related: input.related,
    categoryBlurb: input.categoryBlurb,
    editorNote: input.editorNote,
  };

  return {
    intro: pack.buildIntro(buildInput, groups),
    fitmentSummary: pack.buildFitmentSummary(groups),
    fitmentByChassis: groups,
    specs: pack.buildSpecs(buildInput),
    faq: pack.buildFaq(buildInput, groups),
    categoryGuide: input.categoryBlurb || null,
    editorNote: input.editorNote || null,
    related: input.related || [],
    metaTitle: pack.buildMetaTitle(buildInput, groups),
    metaDescription: pack.buildMetaDescription(buildInput, groups),
    locale: pack.meta.code,
    inLanguage: pack.meta.bcp47,
    regionHint: pack.meta.regionHint || null,
    currency: pack.meta.currency,
  };
}

// ---------------------------------------------------------------------------
// Hub-page (chassis / series) SEO content
// ---------------------------------------------------------------------------

export interface HubTopCategory {
  name: string;
  partCount: number;
}

export interface HubRelatedChassis {
  chassis: string;
  series: string | null;
  carCount: number;
  totalParts: number;
  yearStart: number | null;
  yearEnd: number | null;
}

export interface HubSeoInput {
  hubType: "chassis" | "series";
  // Display label, e.g. "G87" or "3 Series".
  hubLabel: string;
  // Storage key, e.g. "G87" or "3-series".
  hubKey: string;
  // Canonical path on the site (without origin).
  path: string;
  carCount: number;
  totalParts: number;
  yearStart: number | null;
  yearEnd: number | null;
  // For series hubs: the chassis codes that make up the series.
  chassisCodes?: string[];
  // For chassis hubs: which series the chassis belongs to (e.g. "3 Series").
  series?: string | null;
  topCategories: HubTopCategory[];
  relatedChassis: HubRelatedChassis[];
  editorialBlurb?: string | null;
  // Locale (BCP-47) the hub copy should be generated in. Defaults to "en".
  locale?: LocaleCode | string | null;
}

export interface HubSeoContent {
  intro: string;
  metaTitle: string;
  metaDescription: string;
  topCategories: HubTopCategory[];
  relatedChassis: HubRelatedChassis[];
  faq: { question: string; answer: string }[];
  editorialBlurb: string | null;
  jsonLd: Record<string, any>;
}

function formatList(items: string[], conj: string = "and"): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conj} ${items[items.length - 1]}`;
}

function yearRange(start: number | null, end: number | null): string {
  if (!start) return "";
  if (!end) return `${start}+`;
  if (start === end) return `${start}`;
  return `${start}–${end}`;
}

function hubYearRange(start: number | null, end: number | null): string {
  if (!start && !end) return "";
  return yearRange(start, end);
}

function buildHubIntro(input: HubSeoInput): string {
  const yr = hubYearRange(input.yearStart, input.yearEnd);
  if (input.hubType === "chassis") {
    let s = `The BMW ${input.hubLabel} chassis covers ${input.carCount} factory variant${input.carCount === 1 ? "" : "s"}`;
    if (input.series) s += ` in the ${input.series} family`;
    if (yr) s += ` (${yr})`;
    s += `, with ${input.totalParts.toLocaleString()} OEM parts catalogued across exploded diagrams.`;
    if (input.topCategories.length > 0) {
      const names = input.topCategories.slice(0, 4).map(c => c.name.toLowerCase());
      s += ` The catalogue is strongest in ${formatList(names)} parts.`;
    }
    return s;
  }
  // Series hub.
  let s = `The BMW ${input.hubLabel} parts catalogue spans ${input.carCount} factory variant${input.carCount === 1 ? "" : "s"}`;
  if (input.chassisCodes && input.chassisCodes.length > 0) {
    s += ` across ${input.chassisCodes.length} chassis generation${input.chassisCodes.length === 1 ? "" : "s"} (${input.chassisCodes.slice(0, 8).join(", ")}${input.chassisCodes.length > 8 ? `, +${input.chassisCodes.length - 8}` : ""})`;
  }
  if (yr) s += `, ${yr}`;
  s += `, with ${input.totalParts.toLocaleString()} genuine BMW part numbers ready to cross-reference by VIN, diagram, or part number.`;
  if (input.topCategories.length > 0) {
    const names = input.topCategories.slice(0, 4).map(c => c.name.toLowerCase());
    s += ` Most-browsed sections: ${formatList(names)}.`;
  }
  return s;
}

function buildHubFaq(input: HubSeoInput): { question: string; answer: string }[] {
  const faq: { question: string; answer: string }[] = [];
  const yr = hubYearRange(input.yearStart, input.yearEnd);

  if (input.hubType === "chassis") {
    faq.push({
      question: `What BMW models share the ${input.hubLabel} chassis?`,
      answer: `The BMW ${input.hubLabel} chassis covers ${input.carCount} factory variant${input.carCount === 1 ? "" : "s"}${input.series ? ` within the ${input.series} family` : ""}${yr ? `, produced ${yr}` : ""}. Browse the model list below for engine, body type and production years for each variant.`,
    });
    if (input.totalParts > 0) {
      faq.push({
        question: `How many BMW ${input.hubLabel} parts are catalogued?`,
        answer: `BMV.parts indexes ${input.totalParts.toLocaleString()} OEM part numbers for the ${input.hubLabel} chassis, sourced from BMW's official ETK catalogue and cross-referenced against PartsLink24.`,
      });
    }
    if (input.topCategories.length > 0) {
      const top = input.topCategories.slice(0, 5).map(c => `${c.name} (${c.partCount.toLocaleString()})`);
      faq.push({
        question: `Which ${input.hubLabel} parts categories have the deepest coverage?`,
        answer: `The largest categories for the ${input.hubLabel} chassis by indexed part count are: ${formatList(top)}.`,
      });
    }
    if (input.relatedChassis.length > 0) {
      const sib = input.relatedChassis.slice(0, 6).map(c => c.chassis);
      faq.push({
        question: `What other BMW chassis are related to the ${input.hubLabel}?`,
        answer: `Closely related BMW chassis you may also want to browse: ${formatList(sib)}.`,
      });
    }
  } else {
    if (input.chassisCodes && input.chassisCodes.length > 0) {
      faq.push({
        question: `Which chassis generations belong to the BMW ${input.hubLabel}?`,
        answer: `The BMW ${input.hubLabel} spans ${input.chassisCodes.length} chassis generation${input.chassisCodes.length === 1 ? "" : "s"}: ${formatList(input.chassisCodes)}.`,
      });
    }
    if (input.totalParts > 0) {
      faq.push({
        question: `How many ${input.hubLabel} parts are catalogued on BMV.parts?`,
        answer: `${input.totalParts.toLocaleString()} unique OEM part numbers are catalogued across the BMW ${input.hubLabel} lineup, with diagrams, fitment data, weight, and supersession tracking.`,
      });
    }
    if (input.topCategories.length > 0) {
      const top = input.topCategories.slice(0, 5).map(c => `${c.name} (${c.partCount.toLocaleString()})`);
      faq.push({
        question: `Which ${input.hubLabel} categories have the most parts?`,
        answer: `By indexed part count the largest BMW ${input.hubLabel} categories are: ${formatList(top)}.`,
      });
    }
  }

  faq.push({
    question: `How do I find the right BMW ${input.hubLabel} part for my car?`,
    answer: `Pick your exact model below to drill into its catalogue, or use the VIN decoder to match parts to your specific build. Every part page lists fitment, supersession data, and cross-references to OEM-equivalent suppliers.`,
  });

  return faq.slice(0, 6);
}

function buildHubMetaTitle(input: HubSeoInput): string {
  const yr = hubYearRange(input.yearStart, input.yearEnd);
  let t = input.hubType === "chassis"
    ? `BMW ${input.hubLabel} Parts — OEM Catalog`
    : `BMW ${input.hubLabel} Parts Catalog — All Generations`;
  if (yr) t += ` (${yr})`;
  if (t.length > 70) t = t.slice(0, 67) + "…";
  return t;
}

function buildHubMetaDescription(input: HubSeoInput): string {
  let s = input.hubType === "chassis"
    ? `Browse ${input.totalParts.toLocaleString()} OEM parts for the BMW ${input.hubLabel} chassis across ${input.carCount} model variant${input.carCount === 1 ? "" : "s"}`
    : `Browse the complete BMW ${input.hubLabel} parts catalog — ${input.totalParts.toLocaleString()} OEM parts across ${input.carCount} model variant${input.carCount === 1 ? "" : "s"}`;
  if (input.chassisCodes && input.chassisCodes.length > 0 && input.hubType === "series") {
    s += ` and ${input.chassisCodes.length} chassis generation${input.chassisCodes.length === 1 ? "" : "s"}`;
  }
  s += `. Genuine BMW part numbers, diagrams, supersession data and cross-references.`;
  if (s.length > 160) s = s.slice(0, 157) + "…";
  return s;
}

function buildHubJsonLd(input: HubSeoInput, intro: string): Record<string, any> {
  const url = `https://bmv.parts${input.path}`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.hubType === "chassis"
      ? `BMW ${input.hubLabel} Parts`
      : `BMW ${input.hubLabel} Parts Catalog`,
    url,
    description: intro,
    isPartOf: {
      "@type": "WebSite",
      name: "BMV.parts",
      url: "https://bmv.parts",
    },
    about: {
      "@type": "Thing",
      name: input.hubType === "chassis"
        ? `BMW ${input.hubLabel} chassis`
        : `BMW ${input.hubLabel}`,
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.carCount,
    },
  };
}

export function generateHubSeoContent(input: HubSeoInput): HubSeoContent {
  // Chassis hubs delegate to per-locale packs (Task #36). Series hubs still
  // use the English helpers above; series-locale support is a separate task.
  if (input.hubType === "chassis") {
    const pack = getPack(input.locale ?? "en");
    const yr = hubYearRange(input.yearStart, input.yearEnd);
    const buildIn = {
      label: input.hubLabel,
      carCount: input.carCount,
      series: input.series ?? null,
      years: yr,
      totalParts: input.totalParts,
      totalPartsFmt: input.totalParts.toLocaleString(),
      topCategoryNames: input.topCategories.map(c => c.name),
      topCategoriesWithCounts: input.topCategories.map(c => `${c.name} (${c.partCount.toLocaleString()})`),
      relatedChassisCodes: input.relatedChassis.map(c => c.chassis),
    };
    const intro = pack.buildHubChassisIntro(buildIn);
    return {
      intro,
      metaTitle: pack.buildHubChassisMetaTitle(buildIn),
      metaDescription: pack.buildHubChassisMetaDescription(buildIn),
      topCategories: input.topCategories,
      relatedChassis: input.relatedChassis,
      faq: pack.buildHubChassisFaq(buildIn),
      editorialBlurb: input.editorialBlurb || null,
      jsonLd: buildHubJsonLd(input, intro),
    };
  }
  // Series hubs (Task #44): delegate to per-locale packs.
  if (input.hubType === "series") {
    const pack = getPack(input.locale ?? "en");
    const yr = hubYearRange(input.yearStart, input.yearEnd);
    const buildIn = {
      label: input.hubLabel,
      carCount: input.carCount,
      chassisCodes: input.chassisCodes ?? [],
      years: yr,
      totalParts: input.totalParts,
      totalPartsFmt: input.totalParts.toLocaleString(),
      topCategoryNames: input.topCategories.map(c => c.name),
      topCategoriesWithCounts: input.topCategories.map(c => `${c.name} (${c.partCount.toLocaleString()})`),
    };
    const intro = pack.buildHubSeriesIntro(buildIn);
    return {
      intro,
      metaTitle: pack.buildHubSeriesMetaTitle(buildIn),
      metaDescription: pack.buildHubSeriesMetaDescription(buildIn),
      topCategories: input.topCategories,
      relatedChassis: input.relatedChassis,
      faq: pack.buildHubSeriesFaq(buildIn),
      editorialBlurb: input.editorialBlurb || null,
      jsonLd: buildHubJsonLd(input, intro),
    };
  }
  const intro = buildHubIntro(input);
  return {
    intro,
    metaTitle: buildHubMetaTitle(input),
    metaDescription: buildHubMetaDescription(input),
    topCategories: input.topCategories,
    relatedChassis: input.relatedChassis,
    faq: buildHubFaq(input),
    editorialBlurb: input.editorialBlurb || null,
    jsonLd: buildHubJsonLd(input, intro),
  };
}

// Health classification: how rich is the content for a given part?
// Used by the admin SEO health view to surface thin pages.
export type ContentHealth = "thin" | "standard" | "enriched";

export function classifyHealth(input: SeoContentInput): ContentHealth {
  let score = 0;
  if (input.vehicles.length > 0) score += 2;
  if (input.vehicles.length >= 5) score += 1;
  if (input.weight != null) score += 1;
  if (input.additionalInfo) score += 1;
  if (input.editorNote) score += 3;
  if (input.related && input.related.length > 0) score += 1;
  if (input.supersededBy) score += 1;
  if (score <= 2) return "thin";
  if (score >= 6) return "enriched";
  return "standard";
}
