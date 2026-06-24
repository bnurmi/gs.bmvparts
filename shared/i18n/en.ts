// English (default) locale pack. Mirrors the original strings that used to
// live inline in server/seo/content.ts so /part/* output is byte-identical
// for the no-locale-prefix case.

import {
  type LocalePack,
  type SeoBuildInput,
  type ChassisFitmentGroupView,
  type HubChassisBuildInput,
  type HubSeriesBuildInput,
  type ModelsHubBuildInput,
  type CarPageBuildInput,
  formatList,
  defaultYearRange,
  makeCategoryNoun,
} from "./types";

const conjAnd = "and";

function sentenceCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const categoryNoun = makeCategoryNoun({
  engine: "engine system component",
  cooling: "cooling system component",
  brake: "brake system component",
  suspension: "chassis / suspension component",
  fuel: "fuel system component",
  exhaust: "exhaust system component",
  electrical: "electrical component",
  drivetrain: "drivetrain component",
  body: "body / interior component",
  climate: "climate system component",
  fallback: "BMW component",
  wrap: c => `${c} component`,
});

function buildIntro(input: SeoBuildInput, groups: ChassisFitmentGroupView[]): string {
  const desc = input.description || "BMW part";
  const chassisCodes = groups.map(g => g.chassis).slice(0, 6);
  const partNum = input.partNumber || input.partNumberClean;
  const noun = categoryNoun(input.vehicles[0]?.categoryName);

  let s = `Genuine BMW ${desc} (part number ${partNum}) is an OEM ${noun}`;
  if (chassisCodes.length > 0) {
    s += ` used across the ${formatList(chassisCodes, conjAnd)} chassis`;
    if (chassisCodes.length > 1) s += " families";
  }
  s += ".";

  const sampleModels = input.vehicles
    .slice(0, 4)
    .map(v => `${v.carName}${v.engine ? ` (${v.engine})` : ""}`);
  if (sampleModels.length > 0) {
    s += ` Confirmed fitment includes the ${formatList(sampleModels, conjAnd)}`;
    const minYear = Math.min(...input.vehicles.map(v => v.yearStart).filter(Boolean));
    const maxYear = Math.max(...input.vehicles.map(v => v.yearEnd ?? v.yearStart).filter(Boolean));
    if (isFinite(minYear) && isFinite(maxYear) && minYear > 0) {
      s += ` covering model years ${defaultYearRange(minYear, maxYear)}`;
    }
    s += ".";
  }

  if (input.supersededBy && input.supersededBy !== input.partNumberClean) {
    s += ` This part has been superseded by ${input.supersededBy}; ordering ${partNum} will normally ship the latest revision.`;
  }
  return s;
}

function buildFitmentSummary(groups: ChassisFitmentGroupView[]): string {
  if (groups.length === 0) return "No verified fitment data is available for this part yet.";
  const parts: string[] = [];
  for (const g of groups) {
    if (g.models.length === 0) {
      parts.push(`also referenced for the ${g.chassis} chassis`);
      continue;
    }
    const yr = defaultYearRange(g.yearStart, g.yearEnd);
    const top = g.models.slice(0, 3).map(m => m.displayName);
    let s = `${g.chassis}: ${formatList(top, conjAnd)}`;
    if (g.models.length > 3) s += ` and ${g.models.length - 3} more`;
    if (yr) s += ` (${yr})`;
    parts.push(s);
  }
  return sentenceCase(parts.join("; ")) + ".";
}

function buildSpecs(input: SeoBuildInput): { label: string; value: string }[] {
  const specs: { label: string; value: string }[] = [];
  specs.push({ label: "OEM part number", value: input.partNumber || input.partNumberClean });
  if (input.partNumberClean && input.partNumberClean !== input.partNumber) {
    specs.push({ label: "Search number", value: input.partNumberClean });
  }
  if (input.weight != null) specs.push({ label: "Weight", value: `${input.weight.toFixed(3)} kg` });
  if (input.vehicles[0]?.quantity) specs.push({ label: "Typical quantity per vehicle", value: input.vehicles[0].quantity });
  if (input.position) specs.push({ label: "Position", value: input.position });
  if (input.vehicles[0]?.categoryName) {
    const path = [input.vehicles[0].categoryName, input.vehicles[0].subcategoryName].filter(Boolean).join(" › ");
    specs.push({ label: "Catalog category", value: path });
  }
  if (input.hierarchyPath) specs.push({ label: "Catalog path", value: input.hierarchyPath });
  if (input.supersededBy && input.supersededBy !== input.partNumberClean) {
    specs.push({ label: "Superseded by", value: input.supersededBy });
  }
  if (input.supersedes) specs.push({ label: "Replaces", value: input.supersedes });
  if (input.additionalInfo) specs.push({ label: "Notes", value: input.additionalInfo });
  return specs;
}

function buildFaq(input: SeoBuildInput, groups: ChassisFitmentGroupView[]): { question: string; answer: string }[] {
  const faq: { question: string; answer: string }[] = [];
  const partNum = input.partNumber || input.partNumberClean;
  const desc = input.description || "this part";
  const chassisCodes = groups.map(g => g.chassis);

  if (chassisCodes.length > 0) {
    const sampleModels = Array.from(new Set(input.vehicles.map(v => v.carName))).slice(0, 5);
    const chassisShown = chassisCodes.slice(0, 8);
    const chassisExtra = chassisCodes.length - chassisShown.length;
    const chassisText = `${formatList(chassisShown, conjAnd)}${chassisExtra > 0 ? ` (and ${chassisExtra} more)` : ""}`;
    faq.push({
      question: `What BMW models use part ${partNum}?`,
      answer: sampleModels.length > 0
        ? `Part ${partNum} fits the ${formatList(sampleModels, conjAnd)}${input.vehicles.length > sampleModels.length ? `, plus ${input.vehicles.length - sampleModels.length} other variant${input.vehicles.length - sampleModels.length > 1 ? "s" : ""}` : ""}, spanning the ${chassisText} chassis ${chassisCodes.length > 1 ? "families" : "family"}.`
        : `Part ${partNum} appears in BMW catalogs for the ${chassisText} chassis.`,
    });
  }

  if (input.supersededBy && input.supersededBy !== input.partNumberClean) {
    faq.push({
      question: `Has BMW part ${partNum} been superseded?`,
      answer: `Yes — BMW supersedes ${partNum} with ${input.supersededBy}. Ordering the original number normally ships the current revision automatically.`,
    });
  } else {
    faq.push({
      question: `Has BMW part ${partNum} been superseded?`,
      answer: `BMW currently lists ${partNum} as an active OEM number. If a supersession is issued by BMW, ${partNum} will be replaced by the latest revision automatically when ordered through dealers.`,
    });
  }

  if (input.weight != null) {
    faq.push({
      question: `How much does part ${partNum} weigh?`,
      answer: `BMW catalog data lists a shipping weight of approximately ${input.weight.toFixed(3)} kg for ${desc} (${partNum}).`,
    });
  }

  if (input.vehicles[0]?.subcategoryName) {
    faq.push({
      question: `Where is ${desc} (${partNum}) located on the car?`,
      answer: `${desc} is catalogued under "${input.vehicles[0].categoryName} › ${input.vehicles[0].subcategoryName}" in BMW's parts diagrams. Refer to the exploded diagram for the exact mounting location and adjacent components.`,
    });
  }

  faq.push({
    question: `What is the OEM equivalent of ${partNum}?`,
    answer: `${partNum} is itself the BMW OEM (genuine) part number. Aftermarket equivalents from suppliers such as Mahle, Bosch, Pierburg or Hella are commonly available; cross-reference using ${input.partNumberClean} when shopping non-OEM brands.`,
  });

  if (input.vehicles[0]?.quantity) {
    faq.push({
      question: `How many of part ${partNum} are fitted per car?`,
      answer: `BMW's catalog lists a typical quantity of ${input.vehicles[0].quantity} per vehicle for this part across the listed fitments.`,
    });
  }

  return faq.slice(0, 6);
}

function buildMetaTitle(input: SeoBuildInput, groups: ChassisFitmentGroupView[]): string {
  const partNum = input.partNumber || input.partNumberClean;
  const desc = input.description || "BMW Part";
  const chassisCodes = groups.map(g => g.chassis).slice(0, 3).join(", ");

  let title = `BMW ${partNum} ${desc}`;
  if (chassisCodes) title += ` — Fits ${chassisCodes}`;
  const minYear = Math.min(...input.vehicles.map(v => v.yearStart).filter(Boolean));
  const maxYear = Math.max(...input.vehicles.map(v => v.yearEnd ?? v.yearStart).filter(Boolean));
  if (isFinite(minYear) && minYear > 0) {
    title += ` (${defaultYearRange(minYear, isFinite(maxYear) ? maxYear : null)})`;
  }
  if (title.length > 70) title = title.slice(0, 67) + "…";
  return title;
}

function buildMetaDescription(input: SeoBuildInput, groups: ChassisFitmentGroupView[]): string {
  const partNum = input.partNumber || input.partNumberClean;
  const desc = input.description || "BMW part";
  const chassisCodes = groups.map(g => g.chassis).slice(0, 4).join(", ");
  const fitCount = input.vehicles.length;
  let s = `Genuine BMW OEM ${desc} (${partNum})`;
  if (chassisCodes) s += ` for ${chassisCodes}`;
  s += `. ${fitCount > 0 ? `Confirmed across ${fitCount} BMW model variant${fitCount !== 1 ? "s" : ""}` : "BMW OEM part"}, with diagrams, supersession data, and pricing.`;
  if (s.length > 160) s = s.slice(0, 157) + "…";
  return s;
}

function buildHubChassisIntro(input: HubChassisBuildInput): string {
  let s = `The BMW ${input.label} chassis covers ${input.carCount} factory variant${input.carCount === 1 ? "" : "s"}`;
  if (input.series) s += ` in the ${input.series} family`;
  if (input.years) s += ` (${input.years})`;
  s += `, with ${input.totalPartsFmt} OEM parts catalogued across exploded diagrams.`;
  if (input.topCategoryNames.length > 0) {
    s += ` The catalogue is strongest in ${formatList(input.topCategoryNames.slice(0, 4).map(n => n.toLowerCase()), conjAnd)} parts.`;
  }
  return s;
}

function buildHubChassisMetaTitle(input: HubChassisBuildInput): string {
  let t = `BMW ${input.label} Parts — OEM Catalog`;
  if (input.years) t += ` (${input.years})`;
  if (t.length > 70) t = t.slice(0, 67) + "…";
  return t;
}

function buildHubChassisMetaDescription(input: HubChassisBuildInput): string {
  let s = `Browse ${input.totalPartsFmt} OEM parts for the BMW ${input.label} chassis across ${input.carCount} model variant${input.carCount === 1 ? "" : "s"}.`;
  s += ` Genuine BMW part numbers, diagrams, supersession data and cross-references.`;
  if (s.length > 160) s = s.slice(0, 157) + "…";
  return s;
}

function buildHubChassisFaq(input: HubChassisBuildInput): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  out.push({
    question: `What BMW models share the ${input.label} chassis?`,
    answer: `The BMW ${input.label} chassis covers ${input.carCount} factory variant${input.carCount === 1 ? "" : "s"}${input.series ? ` within the ${input.series} family` : ""}${input.years ? `, produced ${input.years}` : ""}. Browse the model list below for engine, body type and production years for each variant.`,
  });
  if (input.totalParts > 0) {
    out.push({
      question: `How many BMW ${input.label} parts are catalogued?`,
      answer: `BMV.parts indexes ${input.totalPartsFmt} OEM part numbers for the ${input.label} chassis, sourced from BMW's official ETK catalogue and cross-referenced against PartsLink24.`,
    });
  }
  if (input.topCategoriesWithCounts.length > 0) {
    out.push({
      question: `Which ${input.label} parts categories have the deepest coverage?`,
      answer: `The largest categories for the ${input.label} chassis by indexed part count are: ${formatList(input.topCategoriesWithCounts.slice(0, 5), conjAnd)}.`,
    });
  }
  if (input.relatedChassisCodes.length > 0) {
    out.push({
      question: `What other BMW chassis are related to the ${input.label}?`,
      answer: `Closely related BMW chassis you may also want to browse: ${formatList(input.relatedChassisCodes.slice(0, 6), conjAnd)}.`,
    });
  }
  out.push({
    question: `How do I find the right BMW ${input.label} part for my car?`,
    answer: `Pick your exact model below to drill into its catalogue, or use the VIN decoder to match parts to your specific build. Every part page lists fitment, supersession data, and cross-references to OEM-equivalent suppliers.`,
  });
  return out.slice(0, 6);
}

function buildHubSeriesIntro(input: HubSeriesBuildInput): string {
  let s = `The BMW ${input.label} parts catalogue spans ${input.carCount} factory variant${input.carCount === 1 ? "" : "s"}`;
  if (input.chassisCodes.length > 0) {
    s += ` across ${input.chassisCodes.length} chassis generation${input.chassisCodes.length === 1 ? "" : "s"} (${input.chassisCodes.slice(0, 8).join(", ")}${input.chassisCodes.length > 8 ? `, +${input.chassisCodes.length - 8}` : ""})`;
  }
  if (input.years) s += `, ${input.years}`;
  s += `, with ${input.totalPartsFmt} genuine BMW part numbers ready to cross-reference by VIN, diagram, or part number.`;
  if (input.topCategoryNames.length > 0) {
    s += ` Most-browsed sections: ${formatList(input.topCategoryNames.slice(0, 4).map(n => n.toLowerCase()), conjAnd)}.`;
  }
  return s;
}

function buildHubSeriesMetaTitle(input: HubSeriesBuildInput): string {
  let t = `BMW ${input.label} Parts Catalog — All Generations`;
  if (input.years) t += ` (${input.years})`;
  if (t.length > 70) t = t.slice(0, 67) + "…";
  return t;
}

function buildHubSeriesMetaDescription(input: HubSeriesBuildInput): string {
  let s = `Browse the complete BMW ${input.label} parts catalog — ${input.totalPartsFmt} OEM parts across ${input.carCount} model variant${input.carCount === 1 ? "" : "s"}`;
  if (input.chassisCodes.length > 0) {
    s += ` and ${input.chassisCodes.length} chassis generation${input.chassisCodes.length === 1 ? "" : "s"}`;
  }
  s += `. Genuine BMW part numbers, diagrams, supersession data and cross-references.`;
  if (s.length > 160) s = s.slice(0, 157) + "…";
  return s;
}

function buildHubSeriesFaq(input: HubSeriesBuildInput): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  if (input.chassisCodes.length > 0) {
    out.push({
      question: `Which chassis generations belong to the BMW ${input.label}?`,
      answer: `The BMW ${input.label} spans ${input.chassisCodes.length} chassis generation${input.chassisCodes.length === 1 ? "" : "s"}: ${formatList(input.chassisCodes, conjAnd)}.`,
    });
  }
  if (input.totalParts > 0) {
    out.push({
      question: `How many ${input.label} parts are catalogued on BMV.parts?`,
      answer: `${input.totalPartsFmt} unique OEM part numbers are catalogued across the BMW ${input.label} lineup, with diagrams, fitment data, weight, and supersession tracking.`,
    });
  }
  if (input.topCategoriesWithCounts.length > 0) {
    out.push({
      question: `Which ${input.label} categories have the most parts?`,
      answer: `By indexed part count the largest BMW ${input.label} categories are: ${formatList(input.topCategoriesWithCounts.slice(0, 5), conjAnd)}.`,
    });
  }
  out.push({
    question: `How do I find the right BMW ${input.label} part for my car?`,
    answer: `Pick your exact model below to drill into its catalogue, or use the VIN decoder to match parts to your specific build. Every part page lists fitment, supersession data, and cross-references to OEM-equivalent suppliers.`,
  });
  return out.slice(0, 6);
}

function buildModelsIntro(input: ModelsHubBuildInput): string {
  return `Complete database of BMW model variants — ${input.totalModelsFmt} models across all chassis codes, with engine, body type, and production-year detail for every entry.`;
}
function buildModelsMetaTitle(_input: ModelsHubBuildInput): string {
  return `BMW Model Database — All Chassis Codes & Generations`;
}
function buildModelsMetaDescription(input: ModelsHubBuildInput): string {
  return `Complete BMW model reference database — ${input.totalModelsFmt} variants across every chassis code, engine and generation. Browse technical specs for all BMW models from classic to current.`;
}

function buildCarMetaTitle(input: CarPageBuildInput): string {
  return `${input.displayName} Parts Catalog — OEM Parts & Diagrams`;
}

function buildCarMetaDescription(input: CarPageBuildInput): string {
  const partsCount = input.totalParts > 0 ? `${input.totalPartsFmt} ` : "";
  return `Browse ${partsCount}OEM parts for the BMW ${input.displayName} (${input.chassis}). Exploded diagrams, part numbers, and cross-references for ${input.modelName}${input.engine ? ` ${input.engine}` : ""}.`.trim();
}

const hubLabels = {
  breadcrumbs: {
    home: "Home",
    series: "Series",
    chassis: "Chassis",
    models: "Models",
  },
  stats: {
    models: "Models",
    generations: "Generations",
    totalParts: "Total Parts",
    bodyTypes: "Body Types",
    withPartsData: "With Parts Data",
    parts: "Parts",
  },
  sections: {
    mostStockedCategories: (label: string) => `Most-stocked ${label} categories`,
    chassisInThisSeries: "Chassis in this series",
    relatedChassis: "Related BMW chassis",
    frequentlyAskedQuestions: "Frequently asked questions",
    allModelsHeading: ({ label, count }: { label: string; count: number }) =>
      `All ${label} Models (${count})`,
    bodyTypesLabel: "Body types:",
    enginesLabel: "Engines:",
    moreEngines: (n: number) => `+${n} more`,
    productionYears: (years: string) => `Production years: ${years}`,
    modelsCount: (n: number) => `${n} model${n === 1 ? "" : "s"}`,
    partsLowercase: "parts",
    relatedChassisCaption: ({ carCount, totalParts }: { carCount: number; totalParts: string }) =>
      `${carCount} model${carCount === 1 ? "" : "s"} · ${totalParts} parts`,
    browse: "Browse",
  },
  notFound: {
    seriesHeading: "Series Not Found",
    seriesMessage: (slug: string) => `The series "${slug}" could not be found.`,
    seriesMetaTitle: "BMW Series Not Found",
    backToHome: "Back to Home",
    chassisHeading: "Chassis Not Found",
    chassisMessage: (label: string) => `No BMW models found with chassis code "${label}".`,
    chassisMetaTitle: (label: string) => `BMW ${label} Parts`,
    chassisMetaDescription: (label: string) => `Browse BMW ${label} OEM parts catalog.`,
    back: "Back",
  },
};

export const enPack: LocalePack = {
  meta: {
    code: "en",
    prefix: "",
    bcp47: "en",
    nativeLabel: "English",
    currency: "USD",
  },
  conjAnd,
  conjOr: "or",
  formatYearRange: defaultYearRange,
  categoryNoun,
  buildIntro,
  buildFitmentSummary,
  buildSpecs,
  buildFaq,
  buildMetaTitle,
  buildMetaDescription,
  buildHubChassisIntro,
  buildHubChassisMetaTitle,
  buildHubChassisMetaDescription,
  buildHubChassisFaq,
  buildCarMetaTitle,
  buildCarMetaDescription,
  buildHubSeriesIntro,
  buildHubSeriesMetaTitle,
  buildHubSeriesMetaDescription,
  buildHubSeriesFaq,
  buildModelsMetaTitle,
  buildModelsMetaDescription,
  buildModelsIntro,
  hubLabels,
  modelsHubUi: {
    pageTitle: "BMW Model Reference",
    databaseLabel: "Model Database",
    status: { ready: "Ready", syncing: "Syncing...", complete: "Complete", error: "Error" },
    discoveryProgress: ({ completed, discovered, current }) =>
      `Discovering chassis ${completed} / ${discovered}${current ? ` — ${current}` : ""}`,
    modelsProgress: ({ scraped, total }) => `${scraped} / ${total} models`,
    errorsCount: n => `${n} errors`,
    buttons: {
      cancel: "Cancel",
      refresh: "Refresh",
      syncModels: "Sync Models",
      importing: "Importing...",
      importLegacy: "Import Legacy",
    },
    importLegacyTooltip: "Import curated legacy chassis (E36/E39/E46/E60/E83/E87/E90/F15) that bimmer.work doesn't host",
    searchPlaceholder: "Search models, chassis codes, engines...",
    resultsBadge: n => `${n} results`,
    filterAll: "All",
    showLess: "Less",
    showMore: n => `+${n} more`,
    failedToLoad: "Failed to load models.",
    emptyTitle: "No models in database",
    emptyHintWithSearch: "No models match your search. Try a different query.",
    emptyHintNoSearch: 'Click "Sync Models" above to import all 1,350+ BMW model variants.',
    variantsCount: n => `${n} variants`,
  },

  vinLanding: {
    breadcrumbHome: "Home",
    breadcrumbVinDecoder: "VIN Decoder",
    vehicleSummary: "Vehicle summary",
    vehiclePhotos: "Vehicle photos",
    ownersManuals: n => `Owner's manuals (${n})`,
    factoryOptions: n => `Factory options (${n})`,
    bmwOemPartsCatalog: "BMW OEM parts catalog",
    factVin: "VIN",
    factChassis: "Chassis",
    factModelYear: "Model year",
    factEngine: "Engine",
    factDrivetrain: "Drivetrain",
    factTransmission: "Transmission",
    factMarket: "Market",
    factPaint: "Paint",
    factUpholstery: "Upholstery",
    factBuildDate: "Build date",
    factPlant: "Plant",
    exteriorCaption: "Exterior",
    interiorCaption: "Interior",
    exteriorAlt: ({ headline, vin }) => `Exterior of ${headline}, VIN ${vin}`,
    interiorAlt: ({ headline, vin }) => `Interior of ${headline}, VIN ${vin}`,
    viewer360Alt: ({ headline, vin }) => `360° exterior view of ${headline}, VIN ${vin}`,
    viewer360NoscriptCaption: n => `360° exterior view (${n} frames available with JavaScript enabled)`,
    viewer360HydrationHint: n => `360° spin viewer (${n} frames) loads after JavaScript hydrates.`,
    manualHeaderManual: "Manual",
    manualHeaderNumber: "Number",
    manualHeaderLanguage: "Language",
    manualHeaderDate: "Date",
    catalogIntro: "Browse OEM parts for this BMW. Diagrams, part numbers, fitment and cross-references are organised by system group.",
    chassisLink: chassis => `Browse OEM parts for the BMW ${chassis} chassis`,
    seriesLink: series => `Explore the BMW ${series} series`,
    decodeAnotherLink: "Decode another BMW VIN",
    sourceLabel: source => {
      switch (source) {
        case "etk": return "First-party catalog";
        case "bmw_configurator": return "BMW Configurator";
        case "bmw_manuals": return "BMW Owner's Manuals";
        case "bimmerwork": return "bimmer.work (fallback)";
        case "mdecoder": return "mdecoder (fallback)";
        case "vindecoderz": return "vindecoderz (fallback)";
        default: return null;
      }
    },
    preparingTitle: vin => `Preparing VIN ${vin}… | BMV.parts`,
    preparingMetaDescription: vin =>
      `BMV.parts is fetching the BMW factory record for VIN ${vin}: vehicle data, photos, factory options and owner's manuals. Refresh in a moment to view the full landing page.`,
    preparingHeading: vin => `Preparing VIN ${vin}…`,
    preparingBody:
      "We're decoding this BMW VIN against our first-party sources. Vehicle photos, factory options and owner's manuals will appear here as soon as the lookup completes — usually within a minute.",
    preparingFooterLinkText: vin => `Open the VIN decoder for ${vin}`,
    notFoundTitle: vin => `VIN ${vin} not found | BMV.parts`,
    notFoundReasonInvalid: "This VIN is not structurally valid (wrong length or invalid check digit).",
    notFoundReasonNotBmw: "This VIN is not a BMW (the WMI prefix doesn't match BMW's manufacturer codes).",
    notFoundReasonUncached: "We don't have a decoded record for this VIN yet.",
  },
};

// Attach the bmv.vin (Task #96) string set to the English pack so callers
// reading `pack.vinHost` get real content out of the box. Other locale
// packs can opt into translation by setting their own `vinHost` field;
// `getVinHostStrings(locale)` falls back to this when they don't.
import { enVinHost } from "./vin-host";
(enPack as any).vinHost = enVinHost;
