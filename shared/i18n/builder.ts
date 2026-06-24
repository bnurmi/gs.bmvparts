// Shared builder used by every non-English locale. Each locale supplies a
// LocaleStrings bundle (translated phrases + a few small functions) and the
// builder assembles a LocalePack that follows the exact same structure as
// the English original. This keeps phrasing centralized while letting every
// locale look like a short, easily-reviewable strings file.

import {
  type LocalePack,
  type SeoBuildInput,
  type ChassisFitmentGroupView,
  type LocaleMeta,
  type HubChassisBuildInput,
  type HubSeriesBuildInput,
  type ModelsHubBuildInput,
  type ModelsHubUiStrings,
  type CarPageBuildInput,
  type HubLabels,
  type VinLandingStrings,
  formatList,
  defaultYearRange,
  makeCategoryNoun,
} from "./types";

export interface LocaleStrings {
  meta: LocaleMeta;
  conjAnd: string;
  conjOr: string;
  formatYearRange?: (start: number | null, end: number | null) => string;

  // Friendly category nouns. All required.
  nouns: {
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
  };

  // Intro section helpers. All accept already-resolved data so the locale
  // string functions only worry about phrasing/punctuation.
  intro: {
    leadSentence: (a: { desc: string; partNum: string; noun: string }) => string;
    chassisClause: (a: { chassisList: string; multiple: boolean }) => string;
    fitmentClause: (a: { models: string }) => string;
    yearsClause: (a: { years: string }) => string;
    supersededClause: (a: { partNum: string; supersededBy: string }) => string;
  };

  fitment: {
    none: string;
    alsoReferenced: (chassis: string) => string;
    chassisLine: (a: { chassis: string; topModels: string; extraCount: number; years: string }) => string;
    join: string; // separator between chassis lines, normally "; "
    terminator: string; // sentence-final punctuation, normally "."
  };

  // Spec table labels. All required even if some never display.
  specs: {
    oemPartNumber: string;
    searchNumber: string;
    weight: (kg: string) => { label: string; value: string };
    quantity: string;
    position: string;
    catalogCategory: string;
    catalogPath: string;
    supersededBy: string;
    replaces: string;
    notes: string;
  };

  faq: {
    whichModels: {
      q: (partNum: string) => string;
      aWithModels: (a: { partNum: string; models: string; chassisText: string; multiChassis: boolean; extra: number }) => string;
      aChassisOnly: (a: { partNum: string; chassisText: string }) => string;
      andMore: (n: number) => string; // wraps "(and N more)" when chassis truncated
    };
    superseded: {
      q: (partNum: string) => string;
      aSuperseded: (a: { partNum: string; supersededBy: string }) => string;
      aActive: (partNum: string) => string;
    };
    weight: {
      q: (partNum: string) => string;
      a: (a: { partNum: string; desc: string; kg: string }) => string;
    };
    location: {
      q: (a: { desc: string; partNum: string }) => string;
      a: (a: { desc: string; category: string; subcategory: string }) => string;
    };
    oemEquivalent: {
      q: (partNum: string) => string;
      a: (a: { partNum: string; partNumberClean: string }) => string;
    };
    quantity: {
      q: (partNum: string) => string;
      a: (a: { quantity: string }) => string;
    };
  };

  metaPart: {
    title: (a: { partNum: string; desc: string; chassisCodes: string; years: string }) => string;
    description: (a: { partNum: string; desc: string; chassisCodes: string; fitCount: number }) => string;
    titleMaxChars: number;
    descMaxChars: number;
  };

  // Chassis hub-page strings (Task #36). All fields required; the builder
  // assembles them into the LocalePack `buildHubChassis*` methods.
  hubChassis: {
    intro: (a: HubChassisBuildInput) => string;
    metaTitle: (a: HubChassisBuildInput) => string;
    metaDescription: (a: HubChassisBuildInput) => string;
    faq: {
      sharedModelsQ: (label: string) => string;
      sharedModelsA: (a: { label: string; carCount: number; series: string | null; years: string }) => string;
      partsCountQ: (label: string) => string;
      partsCountA: (a: { label: string; totalPartsFmt: string }) => string;
      topCategoriesQ: (label: string) => string;
      topCategoriesA: (a: { label: string; topList: string }) => string;
      relatedQ: (label: string) => string;
      relatedA: (a: { label: string; siblings: string }) => string;
      findRightPartQ: (label: string) => string;
      findRightPartA: (label: string) => string;
    };
  };

  // Car-detail page meta strings (Task #36).
  car: {
    metaTitle: (a: CarPageBuildInput) => string;
    metaDescription: (a: CarPageBuildInput) => string;
  };

  // Series hub-page strings (Task #44).
  hubSeries: {
    intro: (a: HubSeriesBuildInput) => string;
    metaTitle: (a: HubSeriesBuildInput) => string;
    metaDescription: (a: HubSeriesBuildInput) => string;
    faq: {
      chassisInSeriesQ: (label: string) => string;
      chassisInSeriesA: (a: { label: string; count: number; list: string }) => string;
      partsCountQ: (label: string) => string;
      partsCountA: (a: { label: string; totalPartsFmt: string }) => string;
      topCategoriesQ: (label: string) => string;
      topCategoriesA: (a: { label: string; topList: string }) => string;
      findRightPartQ: (label: string) => string;
      findRightPartA: (label: string) => string;
    };
  };

  // /models hub strings (Task #44).
  models: {
    intro: (a: ModelsHubBuildInput) => string;
    metaTitle: (a: ModelsHubBuildInput) => string;
    metaDescription: (a: ModelsHubBuildInput) => string;
  };

  // /models hub in-page UI labels (Task #46).
  modelsHubUi: ModelsHubUiStrings;

  // On-page UI chrome strings for series/chassis hub pages (Task #47).
  hubLabels: HubLabels;

  // Per-VIN SSR landing page strings (Task #80).
  vinLanding: VinLandingStrings;
}

function sentenceCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function makePack(strings: LocaleStrings): LocalePack {
  const formatYearRange = strings.formatYearRange ?? defaultYearRange;
  const conj = strings.conjAnd;
  const categoryNoun = makeCategoryNoun(strings.nouns);

  function buildIntro(input: SeoBuildInput, groups: ChassisFitmentGroupView[]): string {
    const desc = input.description || "BMW";
    const partNum = input.partNumber || input.partNumberClean;
    const noun = categoryNoun(input.vehicles[0]?.categoryName);

    let s = strings.intro.leadSentence({ desc, partNum, noun });
    const chassisCodes = groups.map(g => g.chassis).slice(0, 6);
    if (chassisCodes.length > 0) {
      s += " " + strings.intro.chassisClause({
        chassisList: formatList(chassisCodes, conj),
        multiple: chassisCodes.length > 1,
      });
    }

    const sampleModels = input.vehicles
      .slice(0, 4)
      .map(v => `${v.carName}${v.engine ? ` (${v.engine})` : ""}`);
    if (sampleModels.length > 0) {
      s += " " + strings.intro.fitmentClause({ models: formatList(sampleModels, conj) });
      const minYear = Math.min(...input.vehicles.map(v => v.yearStart).filter(Boolean));
      const maxYear = Math.max(...input.vehicles.map(v => v.yearEnd ?? v.yearStart).filter(Boolean));
      if (isFinite(minYear) && isFinite(maxYear) && minYear > 0) {
        s += " " + strings.intro.yearsClause({ years: formatYearRange(minYear, maxYear) });
      }
    }

    if (input.supersededBy && input.supersededBy !== input.partNumberClean) {
      s += " " + strings.intro.supersededClause({ partNum, supersededBy: input.supersededBy });
    }
    return s;
  }

  function buildFitmentSummary(groups: ChassisFitmentGroupView[]): string {
    if (groups.length === 0) return strings.fitment.none;
    const parts: string[] = [];
    for (const g of groups) {
      if (g.models.length === 0) {
        parts.push(strings.fitment.alsoReferenced(g.chassis));
        continue;
      }
      const yr = formatYearRange(g.yearStart, g.yearEnd);
      const top = g.models.slice(0, 3).map(m => m.displayName);
      parts.push(strings.fitment.chassisLine({
        chassis: g.chassis,
        topModels: formatList(top, conj),
        extraCount: Math.max(0, g.models.length - 3),
        years: yr,
      }));
    }
    return sentenceCase(parts.join(strings.fitment.join)) + strings.fitment.terminator;
  }

  function buildSpecs(input: SeoBuildInput): { label: string; value: string }[] {
    const specs: { label: string; value: string }[] = [];
    specs.push({ label: strings.specs.oemPartNumber, value: input.partNumber || input.partNumberClean });
    if (input.partNumberClean && input.partNumberClean !== input.partNumber) {
      specs.push({ label: strings.specs.searchNumber, value: input.partNumberClean });
    }
    if (input.weight != null) specs.push(strings.specs.weight(input.weight.toFixed(3)));
    if (input.vehicles[0]?.quantity) specs.push({ label: strings.specs.quantity, value: input.vehicles[0].quantity });
    if (input.position) specs.push({ label: strings.specs.position, value: input.position });
    if (input.vehicles[0]?.categoryName) {
      const path = [input.vehicles[0].categoryName, input.vehicles[0].subcategoryName].filter(Boolean).join(" › ");
      specs.push({ label: strings.specs.catalogCategory, value: path });
    }
    if (input.hierarchyPath) specs.push({ label: strings.specs.catalogPath, value: input.hierarchyPath });
    if (input.supersededBy && input.supersededBy !== input.partNumberClean) {
      specs.push({ label: strings.specs.supersededBy, value: input.supersededBy });
    }
    if (input.supersedes) specs.push({ label: strings.specs.replaces, value: input.supersedes });
    if (input.additionalInfo) specs.push({ label: strings.specs.notes, value: input.additionalInfo });
    return specs;
  }

  function buildFaq(input: SeoBuildInput, groups: ChassisFitmentGroupView[]): { question: string; answer: string }[] {
    const faq: { question: string; answer: string }[] = [];
    const partNum = input.partNumber || input.partNumberClean;
    const desc = input.description || "BMW";
    const chassisCodes = groups.map(g => g.chassis);

    if (chassisCodes.length > 0) {
      const sampleModels = Array.from(new Set(input.vehicles.map(v => v.carName))).slice(0, 5);
      const chassisShown = chassisCodes.slice(0, 8);
      const extra = chassisCodes.length - chassisShown.length;
      const chassisText = `${formatList(chassisShown, conj)}${extra > 0 ? ` ${strings.faq.whichModels.andMore(extra)}` : ""}`;
      const otherCount = input.vehicles.length - sampleModels.length;
      faq.push({
        question: strings.faq.whichModels.q(partNum),
        answer: sampleModels.length > 0
          ? strings.faq.whichModels.aWithModels({
              partNum,
              models: formatList(sampleModels, conj),
              chassisText,
              multiChassis: chassisCodes.length > 1,
              extra: Math.max(0, otherCount),
            })
          : strings.faq.whichModels.aChassisOnly({ partNum, chassisText }),
      });
    }

    if (input.supersededBy && input.supersededBy !== input.partNumberClean) {
      faq.push({
        question: strings.faq.superseded.q(partNum),
        answer: strings.faq.superseded.aSuperseded({ partNum, supersededBy: input.supersededBy }),
      });
    } else {
      faq.push({
        question: strings.faq.superseded.q(partNum),
        answer: strings.faq.superseded.aActive(partNum),
      });
    }

    if (input.weight != null) {
      faq.push({
        question: strings.faq.weight.q(partNum),
        answer: strings.faq.weight.a({ partNum, desc, kg: input.weight.toFixed(3) }),
      });
    }

    if (input.vehicles[0]?.subcategoryName) {
      faq.push({
        question: strings.faq.location.q({ desc, partNum }),
        answer: strings.faq.location.a({
          desc,
          category: input.vehicles[0].categoryName,
          subcategory: input.vehicles[0].subcategoryName,
        }),
      });
    }

    faq.push({
      question: strings.faq.oemEquivalent.q(partNum),
      answer: strings.faq.oemEquivalent.a({ partNum, partNumberClean: input.partNumberClean }),
    });

    if (input.vehicles[0]?.quantity) {
      faq.push({
        question: strings.faq.quantity.q(partNum),
        answer: strings.faq.quantity.a({ quantity: input.vehicles[0].quantity }),
      });
    }

    return faq.slice(0, 6);
  }

  function buildMetaTitle(input: SeoBuildInput, groups: ChassisFitmentGroupView[]): string {
    const partNum = input.partNumber || input.partNumberClean;
    const desc = input.description || "BMW";
    const chassisCodes = groups.map(g => g.chassis).slice(0, 3).join(", ");
    const minYear = Math.min(...input.vehicles.map(v => v.yearStart).filter(Boolean));
    const maxYear = Math.max(...input.vehicles.map(v => v.yearEnd ?? v.yearStart).filter(Boolean));
    const years = isFinite(minYear) && minYear > 0
      ? formatYearRange(minYear, isFinite(maxYear) ? maxYear : null)
      : "";
    let title = strings.metaPart.title({ partNum, desc, chassisCodes, years });
    if (title.length > strings.metaPart.titleMaxChars) {
      title = title.slice(0, strings.metaPart.titleMaxChars - 1) + "…";
    }
    return title;
  }

  function buildMetaDescription(input: SeoBuildInput, groups: ChassisFitmentGroupView[]): string {
    const partNum = input.partNumber || input.partNumberClean;
    const desc = input.description || "BMW";
    const chassisCodes = groups.map(g => g.chassis).slice(0, 4).join(", ");
    const fitCount = input.vehicles.length;
    let s = strings.metaPart.description({ partNum, desc, chassisCodes, fitCount });
    if (s.length > strings.metaPart.descMaxChars) {
      s = s.slice(0, strings.metaPart.descMaxChars - 1) + "…";
    }
    return s;
  }

  function buildHubChassisIntro(input: HubChassisBuildInput): string {
    return strings.hubChassis.intro(input);
  }
  function buildHubChassisMetaTitle(input: HubChassisBuildInput): string {
    return strings.hubChassis.metaTitle(input);
  }
  function buildHubChassisMetaDescription(input: HubChassisBuildInput): string {
    return strings.hubChassis.metaDescription(input);
  }
  function buildHubChassisFaq(input: HubChassisBuildInput): { question: string; answer: string }[] {
    const f = strings.hubChassis.faq;
    const out: { question: string; answer: string }[] = [];
    out.push({
      question: f.sharedModelsQ(input.label),
      answer: f.sharedModelsA({
        label: input.label,
        carCount: input.carCount,
        series: input.series,
        years: input.years,
      }),
    });
    if (input.totalParts > 0) {
      out.push({
        question: f.partsCountQ(input.label),
        answer: f.partsCountA({ label: input.label, totalPartsFmt: input.totalPartsFmt }),
      });
    }
    if (input.topCategoriesWithCounts.length > 0) {
      out.push({
        question: f.topCategoriesQ(input.label),
        answer: f.topCategoriesA({
          label: input.label,
          topList: formatList(input.topCategoriesWithCounts.slice(0, 5), conj),
        }),
      });
    }
    if (input.relatedChassisCodes.length > 0) {
      out.push({
        question: f.relatedQ(input.label),
        answer: f.relatedA({
          label: input.label,
          siblings: formatList(input.relatedChassisCodes.slice(0, 6), conj),
        }),
      });
    }
    out.push({
      question: f.findRightPartQ(input.label),
      answer: f.findRightPartA(input.label),
    });
    return out.slice(0, 6);
  }

  function buildCarMetaTitle(input: CarPageBuildInput): string {
    return strings.car.metaTitle(input);
  }
  function buildCarMetaDescription(input: CarPageBuildInput): string {
    return strings.car.metaDescription(input);
  }

  function buildHubSeriesIntro(input: HubSeriesBuildInput): string {
    return strings.hubSeries.intro(input);
  }
  function buildHubSeriesMetaTitle(input: HubSeriesBuildInput): string {
    return strings.hubSeries.metaTitle(input);
  }
  function buildHubSeriesMetaDescription(input: HubSeriesBuildInput): string {
    return strings.hubSeries.metaDescription(input);
  }
  function buildHubSeriesFaq(input: HubSeriesBuildInput): { question: string; answer: string }[] {
    const f = strings.hubSeries.faq;
    const out: { question: string; answer: string }[] = [];
    if (input.chassisCodes.length > 0) {
      out.push({
        question: f.chassisInSeriesQ(input.label),
        answer: f.chassisInSeriesA({
          label: input.label,
          count: input.chassisCodes.length,
          list: formatList(input.chassisCodes, conj),
        }),
      });
    }
    if (input.totalParts > 0) {
      out.push({
        question: f.partsCountQ(input.label),
        answer: f.partsCountA({ label: input.label, totalPartsFmt: input.totalPartsFmt }),
      });
    }
    if (input.topCategoriesWithCounts.length > 0) {
      out.push({
        question: f.topCategoriesQ(input.label),
        answer: f.topCategoriesA({
          label: input.label,
          topList: formatList(input.topCategoriesWithCounts.slice(0, 5), conj),
        }),
      });
    }
    out.push({
      question: f.findRightPartQ(input.label),
      answer: f.findRightPartA(input.label),
    });
    return out.slice(0, 6);
  }

  function buildModelsIntro(input: ModelsHubBuildInput): string {
    return strings.models.intro(input);
  }
  function buildModelsMetaTitle(input: ModelsHubBuildInput): string {
    return strings.models.metaTitle(input);
  }
  function buildModelsMetaDescription(input: ModelsHubBuildInput): string {
    return strings.models.metaDescription(input);
  }

  return {
    meta: strings.meta,
    conjAnd: strings.conjAnd,
    conjOr: strings.conjOr,
    formatYearRange,
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
    modelsHubUi: strings.modelsHubUi,
    hubLabels: strings.hubLabels,
    vinLanding: strings.vinLanding,
  };
}
