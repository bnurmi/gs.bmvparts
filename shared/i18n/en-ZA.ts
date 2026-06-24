// South African English (en-ZA). Mostly identical to default English but
// uses regional vocabulary ("boot"/"spares") and a Rand-aware region hint.
// Phrasing left close to en-US so we don't fragment the index unnecessarily.

import { makePack } from "./builder";
import { defaultYearRange } from "./types";

export const enZAPack = makePack({
  meta: {
    code: "en-ZA",
    prefix: "en-za",
    bcp47: "en-ZA",
    nativeLabel: "English (South Africa)",
    currency: "EUR",
    regionHint: "South Africa availability — Plant Rosslyn produces the BMW X3 locally; pricing shown is indicative.",
  },
  conjAnd: "and",
  conjOr: "or",
  nouns: {
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
    fallback: "BMW spare",
    wrap: c => `${c} component`,
  },
  intro: {
    leadSentence: ({ desc, partNum, noun }) =>
      `Genuine BMW ${desc} (part number ${partNum}) is an OEM ${noun}.`,
    chassisClause: ({ chassisList, multiple }) =>
      `Used across the ${chassisList} chassis${multiple ? " families" : ""}.`,
    fitmentClause: ({ models }) => `Confirmed fitment includes the ${models}`,
    yearsClause: ({ years }) => ` covering model years ${years}.`,
    supersededClause: ({ partNum, supersededBy }) =>
      `This part has been superseded by ${supersededBy}; ordering ${partNum} will normally ship the latest revision.`,
  },
  fitment: {
    none: "No verified fitment data is available for this part yet.",
    alsoReferenced: ch => `also referenced for the ${ch} chassis`,
    chassisLine: ({ chassis, topModels, extraCount, years }) => {
      let s = `${chassis}: ${topModels}`;
      if (extraCount > 0) s += ` and ${extraCount} more`;
      if (years) s += ` (${years})`;
      return s;
    },
    join: "; ",
    terminator: ".",
  },
  specs: {
    oemPartNumber: "OEM part number",
    searchNumber: "Search number",
    weight: kg => ({ label: "Weight", value: `${kg} kg` }),
    quantity: "Typical quantity per vehicle",
    position: "Position",
    catalogCategory: "Catalogue category",
    catalogPath: "Catalogue path",
    supersededBy: "Superseded by",
    replaces: "Replaces",
    notes: "Notes",
  },
  faq: {
    whichModels: {
      q: pn => `Which BMW models use part ${pn}?`,
      aWithModels: ({ partNum, models, chassisText, multiChassis, extra }) =>
        `Part ${partNum} fits the ${models}${extra > 0 ? `, plus ${extra} other variant${extra > 1 ? "s" : ""}` : ""}, spanning the ${chassisText} chassis ${multiChassis ? "families" : "family"}.`,
      aChassisOnly: ({ partNum, chassisText }) =>
        `Part ${partNum} appears in BMW catalogues for the ${chassisText} chassis.`,
      andMore: n => `(and ${n} more)`,
    },
    superseded: {
      q: pn => `Has BMW part ${pn} been superseded?`,
      aSuperseded: ({ partNum, supersededBy }) =>
        `Yes — BMW supersedes ${partNum} with ${supersededBy}. Ordering the original number normally ships the current revision automatically.`,
      aActive: pn =>
        `BMW currently lists ${pn} as an active OEM number. If a supersession is issued by BMW, ${pn} will be replaced by the latest revision automatically when ordered through dealers.`,
    },
    weight: {
      q: pn => `How much does part ${pn} weigh?`,
      a: ({ partNum, desc, kg }) =>
        `BMW catalogue data lists a shipping weight of approximately ${kg} kg for ${desc} (${partNum}).`,
    },
    location: {
      q: ({ desc, partNum }) => `Where is ${desc} (${partNum}) located on the vehicle?`,
      a: ({ desc, category, subcategory }) =>
        `${desc} is catalogued under "${category} › ${subcategory}" in BMW's parts diagrams. Refer to the exploded diagram for the exact mounting location and adjacent components.`,
    },
    oemEquivalent: {
      q: pn => `What is the OEM equivalent of ${pn}?`,
      a: ({ partNum, partNumberClean }) =>
        `${partNum} is itself the BMW OEM (genuine) part number. Aftermarket equivalents from suppliers such as Mahle, Bosch, Pierburg or Hella are commonly available; cross-reference using ${partNumberClean} when shopping non-OEM brands.`,
    },
    quantity: {
      q: pn => `How many of part ${pn} are fitted per car?`,
      a: ({ quantity }) =>
        `BMW's catalogue lists a typical quantity of ${quantity} per vehicle for this part across the listed fitments.`,
    },
  },
  metaPart: {
    title: ({ partNum, desc, chassisCodes, years }) => {
      let t = `BMW ${partNum} ${desc}`;
      if (chassisCodes) t += ` — Fits ${chassisCodes}`;
      if (years) t += ` (${years})`;
      return t;
    },
    description: ({ partNum, desc, chassisCodes, fitCount }) => {
      let s = `Genuine BMW OEM ${desc} (${partNum})`;
      if (chassisCodes) s += ` for ${chassisCodes}`;
      s += `. ${fitCount > 0 ? `Confirmed across ${fitCount} BMW model variant${fitCount !== 1 ? "s" : ""}` : "BMW OEM part"}, with diagrams, supersession data and pricing.`;
      return s;
    },
    titleMaxChars: 70,
    descMaxChars: 160,
  },
  hubChassis: {
    intro: ({ label, carCount, series, years, totalPartsFmt, topCategoryNames }) => {
      let s = `The BMW ${label} chassis covers ${carCount} factory variant${carCount === 1 ? "" : "s"}`;
      if (series) s += ` in the ${series} family`;
      if (years) s += ` (${years})`;
      s += `, with ${totalPartsFmt} OEM parts catalogued across exploded diagrams.`;
      if (topCategoryNames.length > 0) {
        s += ` The catalogue is strongest in ${topCategoryNames.slice(0, 4).join(", ").toLowerCase()} parts.`;
      }
      return s;
    },
    metaTitle: ({ label, years }) => {
      let t = `BMW ${label} Parts — OEM Catalogue`;
      if (years) t += ` (${years})`;
      if (t.length > 70) t = t.slice(0, 67) + "…";
      return t;
    },
    metaDescription: ({ label, carCount, totalPartsFmt }) => {
      let s = `Browse ${totalPartsFmt} OEM parts for the BMW ${label} chassis across ${carCount} model variant${carCount === 1 ? "" : "s"}. Genuine BMW part numbers, diagrams, supersession data and cross-references.`;
      if (s.length > 160) s = s.slice(0, 157) + "…";
      return s;
    },
    faq: {
      sharedModelsQ: label => `Which BMW models share the ${label} chassis?`,
      sharedModelsA: ({ label, carCount, series, years }) =>
        `The BMW ${label} chassis covers ${carCount} factory variant${carCount === 1 ? "" : "s"}${series ? ` within the ${series} family` : ""}${years ? `, produced ${years}` : ""}. Browse the model list below for engine, body type and production years for each variant.`,
      partsCountQ: label => `How many BMW ${label} parts are catalogued?`,
      partsCountA: ({ label, totalPartsFmt }) =>
        `BMV.parts indexes ${totalPartsFmt} OEM part numbers for the ${label} chassis, sourced from BMW's official ETK catalogue and cross-referenced against PartsLink24.`,
      topCategoriesQ: label => `Which ${label} parts categories have the deepest coverage?`,
      topCategoriesA: ({ label, topList }) =>
        `The largest categories for the ${label} chassis by indexed part count are: ${topList}.`,
      relatedQ: label => `Which other BMW chassis are related to the ${label}?`,
      relatedA: ({ siblings }) =>
        `Closely related BMW chassis you may also want to browse: ${siblings}.`,
      findRightPartQ: label => `How do I find the right BMW ${label} part for my car?`,
      findRightPartA: () =>
        `Pick your exact model below to drill into its catalogue, or use the VIN decoder to match parts to your specific build. Every part page lists fitment, supersession data, and cross-references to OEM-equivalent suppliers.`,
    },
  },
  car: {
    metaTitle: ({ displayName }) => `${displayName} Parts Catalogue — OEM Parts & Diagrams`,
    metaDescription: ({ displayName, chassis, modelName, engine, totalParts, totalPartsFmt }) =>
      `Browse ${totalParts > 0 ? `${totalPartsFmt} ` : ""}OEM parts for the BMW ${displayName} (${chassis}). Exploded diagrams, part numbers, and cross-references for ${modelName}${engine ? ` ${engine}` : ""}.`.trim(),
  },
  formatYearRange: defaultYearRange,
  hubSeries: {
      intro: ({ label, carCount, chassisCodes, years, totalPartsFmt, topCategoryNames }) => {
        let s = `The BMW ${label} parts catalogue spans ${carCount} factory variant${carCount === 1 ? "" : "s"}`;
        if (chassisCodes.length > 0) {
          s += ` across ${chassisCodes.length} chassis generation${chassisCodes.length === 1 ? "" : "s"} (${chassisCodes.slice(0, 8).join(", ")}${chassisCodes.length > 8 ? `, +${chassisCodes.length - 8}` : ""})`;
        }
        if (years) s += `, ${years}`;
        s += `, with ${totalPartsFmt} genuine BMW part numbers available by VIN, diagram or part number.`;
        if (topCategoryNames.length > 0) {
          s += ` Most-browsed sections: ${topCategoryNames.slice(0, 4).join(", ").toLowerCase()}.`;
        }
        return s;
      },
      metaTitle: ({ label, years }) => {
        let t = `BMW ${label} Parts Catalogue — All Generations`;
        if (years) t += ` (${years})`;
        if (t.length > 70) t = t.slice(0, 67) + "…";
        return t;
      },
      metaDescription: ({ label, carCount, totalPartsFmt, chassisCodes }) => {
        let s = `Browse the complete BMW ${label} parts catalogue — ${totalPartsFmt} OEM parts across ${carCount} model variant${carCount === 1 ? "" : "s"}`;
        if (chassisCodes.length > 0) {
          s += ` and ${chassisCodes.length} chassis generation${chassisCodes.length === 1 ? "" : "s"}`;
        }
        s += `. Genuine BMW part numbers, diagrams, supersession data and cross-references.`;
        if (s.length > 160) s = s.slice(0, 157) + "…";
        return s;
      },
      faq: {
        chassisInSeriesQ: label => `Which chassis generations belong to the BMW ${label}?`,
        chassisInSeriesA: ({ label, count, list }) => `The BMW ${label} spans ${count} chassis generation${count === 1 ? "" : "s"}: ${list}.`,
        partsCountQ: label => `How many ${label} parts are catalogued on BMV.parts?`,
        partsCountA: ({ label, totalPartsFmt }) => `${totalPartsFmt} unique OEM part numbers are catalogued across the BMW ${label} lineup, with diagrams, fitment data, weight, and supersession tracking.`,
        topCategoriesQ: label => `Which ${label} categories have the most parts?`,
        topCategoriesA: ({ topList }) => `By indexed part count the largest BMW categories are: ${topList}.`,
        findRightPartQ: label => `How do I find the right BMW ${label} part for my car?`,
        findRightPartA: () => `Pick your exact model below to drill into its catalogue, or use the VIN decoder. Every part page lists fitment, supersession data, and cross-references to OEM-equivalent suppliers.`,
      },
    },
    models: {
      intro: ({ totalModelsFmt }) => `Complete database of BMW model variants — ${totalModelsFmt} models across all chassis codes, with engine, body type and production-year detail for every entry.`,
      metaTitle: () => `BMW Model Database — All Chassis Codes & Generations`,
      metaDescription: ({ totalModelsFmt }) => `Complete BMW model reference database — ${totalModelsFmt} variants across every chassis code, engine and generation. Browse technical specs for all BMW models from classic to current.`,
    },
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
    hubLabels: {
      breadcrumbs: { home: "Home", series: "Series", chassis: "Chassis", models: "Models" },
      stats: {
        models: "Models",
        generations: "Generations",
        totalParts: "Total Spares",
        bodyTypes: "Body Types",
        withPartsData: "With Spares Data",
        parts: "Spares",
      },
      sections: {
        mostStockedCategories: (label) => `Most-stocked ${label} categories`,
        chassisInThisSeries: "Chassis in this series",
        relatedChassis: "Related BMW chassis",
        frequentlyAskedQuestions: "Frequently asked questions",
        allModelsHeading: ({ label, count }) => `All ${label} Models (${count})`,
        bodyTypesLabel: "Body types:",
        enginesLabel: "Engines:",
        moreEngines: (n) => `+${n} more`,
        productionYears: (years) => `Production years: ${years}`,
        modelsCount: (n) => `${n} model${n === 1 ? "" : "s"}`,
        partsLowercase: "spares",
        relatedChassisCaption: ({ carCount, totalParts }) =>
          `${carCount} model${carCount === 1 ? "" : "s"} · ${totalParts} spares`,
        browse: "Browse",
      },
      notFound: {
        seriesHeading: "Series Not Found",
        seriesMessage: (slug) => `The series "${slug}" could not be found.`,
        seriesMetaTitle: "BMW Series Not Found",
        backToHome: "Back to Home",
        chassisHeading: "Chassis Not Found",
        chassisMessage: (label) => `No BMW models found with chassis code "${label}".`,
        chassisMetaTitle: (label) => `BMW ${label} Spares`,
        chassisMetaDescription: (label) => `Browse BMW ${label} OEM spares catalog.`,
        back: "Back",
      },
    },
    vinLanding: {
      breadcrumbHome: "Home",
      breadcrumbVinDecoder: "VIN Decoder",
      vehicleSummary: "Vehicle summary",
      vehiclePhotos: "Vehicle photos",
      ownersManuals: n => `Owner's manuals (${n})`,
      factoryOptions: n => `Factory options (${n})`,
      bmwOemPartsCatalog: "BMW OEM spares catalog",
      factVin: "VIN",
      factChassis: "Chassis",
      factModelYear: "Model year",
      factEngine: "Engine",
      factDrivetrain: "Drivetrain",
      factTransmission: "Gearbox",
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
      catalogIntro: "Browse OEM spares for this BMW. Diagrams, part numbers, fitment and cross-references are organised by system group.",
      chassisLink: chassis => `Browse OEM spares for the BMW ${chassis} chassis`,
      seriesLink: series => `Explore the BMW ${series} range`,
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
  });
